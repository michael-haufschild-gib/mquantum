/**
 * Tests for dismissedDialogsStore
 * Verifies dismissed dialog persistence and management
 *
 * Following Roy Osherove's "Art of Unit Testing" principles:
 * - Readable: Clear test names describing behavior
 * - Maintainable: Isolated tests with proper setup/teardown
 * - Trustworthy: Deterministic results, no flaky tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDismissedDialogsStore, DIALOG_IDS } from '@/stores/dismissedDialogsStore'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
    get length() {
      return Object.keys(store).length
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('dismissedDialogsStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useDismissedDialogsStore.setState({
      dismissedIds: new Set<string>(),
    })
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('startsWith_emptyDismissedSet', () => {
      const state = useDismissedDialogsStore.getState()
      expect(state.dismissedIds.size).toBe(0)
    })

    it('isDismissed_noDialogsDismissed_returnsFalse', () => {
      const { isDismissed } = useDismissedDialogsStore.getState()
      expect(isDismissed('any-dialog-id')).toBe(false)
    })

    it('getDismissedCount_noDialogsDismissed_returnsZero', () => {
      const { getDismissedCount } = useDismissedDialogsStore.getState()
      expect(getDismissedCount()).toBe(0)
    })
  })

  describe('dismiss', () => {
    it('dismiss_validDialogId_addsToSet', () => {
      const { dismiss, isDismissed } = useDismissedDialogsStore.getState()

      dismiss('test-dialog-1')

      expect(isDismissed('test-dialog-1')).toBe(true)
    })

    it('dismiss_multipleDialogs_allAreDismissed', () => {
      const { dismiss, isDismissed, getDismissedCount } =
        useDismissedDialogsStore.getState()

      dismiss('dialog-1')
      dismiss('dialog-2')
      dismiss('dialog-3')

      expect(isDismissed('dialog-1')).toBe(true)
      expect(isDismissed('dialog-2')).toBe(true)
      expect(isDismissed('dialog-3')).toBe(true)
      expect(getDismissedCount()).toBe(3)
    })

    it('dismiss_sameDialogTwice_onlyAddsOnce', () => {
      const { dismiss, getDismissedCount } = useDismissedDialogsStore.getState()

      dismiss('duplicate-dialog')
      dismiss('duplicate-dialog')

      expect(getDismissedCount()).toBe(1)
    })

    it('dismiss_wellKnownDialogId_worksCorrectly', () => {
      const { dismiss, isDismissed } = useDismissedDialogsStore.getState()

      dismiss(DIALOG_IDS.PRESET_SAVE_STYLE_WARNING)

      expect(isDismissed(DIALOG_IDS.PRESET_SAVE_STYLE_WARNING)).toBe(true)
      expect(isDismissed(DIALOG_IDS.PRESET_SAVE_SCENE_WARNING)).toBe(false)
    })
  })

  describe('isDismissed', () => {
    it('isDismissed_afterDismiss_returnsTrue', () => {
      const { dismiss, isDismissed } = useDismissedDialogsStore.getState()

      dismiss('my-dialog')

      expect(isDismissed('my-dialog')).toBe(true)
    })

    it('isDismissed_differentDialog_returnsFalse', () => {
      const { dismiss, isDismissed } = useDismissedDialogsStore.getState()

      dismiss('dialog-a')

      expect(isDismissed('dialog-b')).toBe(false)
    })

    it('isDismissed_afterRestore_returnsFalse', () => {
      const { dismiss, restore, isDismissed } = useDismissedDialogsStore.getState()

      dismiss('restored-dialog')
      restore('restored-dialog')

      expect(isDismissed('restored-dialog')).toBe(false)
    })
  })

  describe('restore', () => {
    it('restore_dismissedDialog_removesFromSet', () => {
      const { dismiss, restore, isDismissed, getDismissedCount } =
        useDismissedDialogsStore.getState()

      dismiss('dialog-to-restore')
      expect(getDismissedCount()).toBe(1)

      restore('dialog-to-restore')

      expect(isDismissed('dialog-to-restore')).toBe(false)
      expect(getDismissedCount()).toBe(0)
    })

    it('restore_nonExistentDialog_noEffect', () => {
      const { dismiss, restore, getDismissedCount } =
        useDismissedDialogsStore.getState()

      dismiss('existing-dialog')
      restore('non-existent-dialog')

      expect(getDismissedCount()).toBe(1)
    })

    it('restore_oneOfMultiple_onlyRestoresThatOne', () => {
      const { dismiss, restore, isDismissed, getDismissedCount } =
        useDismissedDialogsStore.getState()

      dismiss('dialog-1')
      dismiss('dialog-2')
      dismiss('dialog-3')

      restore('dialog-2')

      expect(isDismissed('dialog-1')).toBe(true)
      expect(isDismissed('dialog-2')).toBe(false)
      expect(isDismissed('dialog-3')).toBe(true)
      expect(getDismissedCount()).toBe(2)
    })
  })

  describe('resetAll', () => {
    it('resetAll_withMultipleDismissed_clearsAll', () => {
      const { dismiss, resetAll, getDismissedCount } =
        useDismissedDialogsStore.getState()

      dismiss('dialog-1')
      dismiss('dialog-2')
      dismiss('dialog-3')
      expect(getDismissedCount()).toBe(3)

      resetAll()

      expect(getDismissedCount()).toBe(0)
    })

    it('resetAll_emptySet_noError', () => {
      const { resetAll, getDismissedCount } = useDismissedDialogsStore.getState()

      // Should not throw
      resetAll()

      expect(getDismissedCount()).toBe(0)
    })

    it('resetAll_allDialogsBecomeDismissable', () => {
      const { dismiss, resetAll, isDismissed } = useDismissedDialogsStore.getState()

      dismiss(DIALOG_IDS.PRESET_SAVE_STYLE_WARNING)
      dismiss(DIALOG_IDS.PRESET_SAVE_SCENE_WARNING)

      resetAll()

      expect(isDismissed(DIALOG_IDS.PRESET_SAVE_STYLE_WARNING)).toBe(false)
      expect(isDismissed(DIALOG_IDS.PRESET_SAVE_SCENE_WARNING)).toBe(false)
    })
  })

  describe('getDismissedCount', () => {
    it('getDismissedCount_afterMultipleDismiss_returnsCorrectCount', () => {
      const { dismiss, getDismissedCount } = useDismissedDialogsStore.getState()

      expect(getDismissedCount()).toBe(0)

      dismiss('d1')
      expect(getDismissedCount()).toBe(1)

      dismiss('d2')
      expect(getDismissedCount()).toBe(2)

      dismiss('d3')
      expect(getDismissedCount()).toBe(3)
    })
  })

  describe('DIALOG_IDS constants', () => {
    it('wellKnownIds_areUnique', () => {
      const ids = Object.values(DIALOG_IDS)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })

    it('wellKnownIds_followNamingConvention', () => {
      // All IDs should follow dot-notation convention
      for (const id of Object.values(DIALOG_IDS)) {
        expect(id).toMatch(/^[\w-]+\.[\w-]+(\.[\w-]+)*$/)
      }
    })
  })
})
