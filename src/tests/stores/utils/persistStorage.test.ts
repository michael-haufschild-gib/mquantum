import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
