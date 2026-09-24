import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { useExportStore } from '@/stores/runtime/exportStore'
import { type SavedStyle, usePresetManagerStore } from '@/stores/runtime/presetManagerStore'
import { useDismissedDialogsStore } from '@/stores/ui/dismissedDialogsStore'
import { useLayoutStore } from '@/stores/ui/layoutStore'
import { useThemeStore } from '@/stores/ui/themeStore'
import { createBestEffortJSONStorage } from '@/stores/utils/persistStorage'

const storedStyle: SavedStyle = {
  id: 'style-1',
  name: 'Stored Style',
  timestamp: 1,
  data: {
    appearance: {},
    lighting: {},
    postProcessing: {},
    environment: {},
    pbr: {},
  },
}

describe('createBestEffortJSONStorage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('turns localStorage operation failures into best-effort no-ops', () => {
    const storage = createBestEffortJSONStorage<{ value: number }>('testStore')
    if (!storage) throw new Error('Expected localStorage-backed persist storage')

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage denied', 'SecurityError')
    })
    expect(storage.getItem('test-key')).toBeNull()

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    expect(() => storage.setItem('test-key', { state: { value: 1 }, version: 0 })).not.toThrow()

    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage denied', 'SecurityError')
    })
    expect(() => storage.removeItem('test-key')).not.toThrow()
  })
})

describe('persisted stores with blocked localStorage writes', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    useThemeStore.setState({ mode: 'dark', accent: 'cyan' })
    useLayoutStore.getState().reset()
    useDismissedDialogsStore.setState({ dismissedIds: new Set<string>() })
    useExportStore.getState().reset()
    usePresetManagerStore.setState({ savedStyles: [storedStyle], savedScenes: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('keeps in-memory UI state usable when persistence writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    expect(() => useThemeStore.getState().setMode('light')).not.toThrow()
    expect(() => useLayoutStore.getState().toggleLeftPanel()).not.toThrow()
    expect(() =>
      useDismissedDialogsStore.getState().dismiss('blocked-storage-dialog')
    ).not.toThrow()

    expect(useThemeStore.getState().mode).toBe('light')
    expect(useLayoutStore.getState().showLeftPanel).toBe(false)
    expect(useDismissedDialogsStore.getState().isDismissed('blocked-storage-dialog')).toBe(true)
  })

  it('keeps in-memory runtime state usable when persistence writes fail', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })

    expect(() => useExportStore.getState().updateSettings({ fps: 30 })).not.toThrow()
    expect(() => usePresetManagerStore.getState().deleteStyle('style-1')).not.toThrow()

    expect(useExportStore.getState().settings.fps).toBe(30)
    expect(usePresetManagerStore.getState().savedStyles).toEqual([])
  })
})

// Regression: when the `window.localStorage` accessor itself throws (site data
// blocked, sandboxed iframe), zustand's createJSONStorage returned undefined and
// the persist middleware then skipped attaching `store.persist`, so
// `persist.hasHydrated()` in useUrlState / showConditionalMsgBox threw a
// TypeError. The storage now falls back to an in-memory Map.
describe('createBestEffortJSONStorage with an inaccessible localStorage', () => {
  let original: PropertyDescriptor | undefined

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Access is denied for this document.', 'SecurityError')
      },
    })
  })

  afterEach(() => {
    if (original) Object.defineProperty(window, 'localStorage', original)
    else Reflect.deleteProperty(window, 'localStorage')
  })

  it('still returns a working (in-memory) storage', () => {
    // Guard: the override must really make the accessor throw.
    expect(() => window.localStorage).toThrow('Access is denied')
    const storage = createBestEffortJSONStorage<{ value: number }>('blockedStore')
    if (!storage) throw new Error('Expected an in-memory fallback storage')
    storage.setItem('k', { state: { value: 7 }, version: 0 })
    expect(storage.getItem('k')).toEqual({ state: { value: 7 }, version: 0 })
    storage.removeItem('k')
    expect(storage.getItem('k')).toBeNull()
  })

  it('keeps the persist API on stores so hydration checks do not throw', () => {
    const useBlocked = create<{ n: number }>()(
      persist(() => ({ n: 1 }), {
        name: 'blocked-persist-test',
        storage: createBestEffortJSONStorage<{ n: number }>('blockedPersistTest'),
      })
    )
    expect(useBlocked.persist.hasHydrated()).toBe(true)
    useBlocked.setState({ n: 2 })
    expect(useBlocked.getState().n).toBe(2)
  })
})
