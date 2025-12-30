/**
 * Tests for useConditionalMsgBox hook
 *
 * Tests conditional message box display based on dismiss state.
 *
 * Following Roy Osherove's "Art of Unit Testing" principles:
 * - Readable: Clear test names describing behavior
 * - Maintainable: Isolated tests with proper setup/teardown
 * - Trustworthy: Deterministic results
 */

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useConditionalMsgBox,
  showConditionalMsgBox,
} from '@/hooks/useConditionalMsgBox'
import { useDismissedDialogsStore } from '@/stores/dismissedDialogsStore'
import { useMsgBoxStore } from '@/stores/msgBoxStore'

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

describe('useConditionalMsgBox', () => {
  beforeEach(() => {
    // Reset both stores before each test
    useDismissedDialogsStore.setState({
      dismissedIds: new Set<string>(),
    })
    useMsgBoxStore.setState({
      isOpen: false,
      title: '',
      message: '',
      type: 'info',
      actions: [],
      dismissible: false,
      dismissId: null,
    })
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('showOnce', () => {
    it('showOnce_dialogNotDismissed_showsDialogAndReturnsTrue', () => {
      const { result } = renderHook(() => useConditionalMsgBox())

      let shown: boolean = false
      act(() => {
        shown = result.current.showOnce(
          'test-dialog',
          'Test Title',
          'Test Message',
          'info'
        )
      })

      expect(shown).toBe(true)

      const msgBoxState = useMsgBoxStore.getState()
      expect(msgBoxState.isOpen).toBe(true)
      expect(msgBoxState.title).toBe('Test Title')
      expect(msgBoxState.message).toBe('Test Message')
      expect(msgBoxState.type).toBe('info')
      expect(msgBoxState.dismissible).toBe(true)
      expect(msgBoxState.dismissId).toBe('test-dialog')
    })

    it('showOnce_dialogAlreadyDismissed_doesNotShowAndReturnsFalse', () => {
      // Pre-dismiss the dialog
      useDismissedDialogsStore.getState().dismiss('already-dismissed')

      const { result } = renderHook(() => useConditionalMsgBox())

      let shown: boolean = true
      act(() => {
        shown = result.current.showOnce(
          'already-dismissed',
          'Should Not Show',
          'This message should not appear'
        )
      })

      expect(shown).toBe(false)
      expect(useMsgBoxStore.getState().isOpen).toBe(false)
    })

    it('showOnce_withCustomActions_passesActionsToMsgBox', () => {
      const { result } = renderHook(() => useConditionalMsgBox())
      const customAction = { label: 'Custom', onClick: vi.fn(), variant: 'primary' as const }

      act(() => {
        result.current.showOnce(
          'with-actions',
          'Title',
          'Message',
          'warning',
          [customAction]
        )
      })

      const msgBoxState = useMsgBoxStore.getState()
      expect(msgBoxState.actions).toHaveLength(1)
      expect(msgBoxState.actions[0]?.label).toBe('Custom')
      expect(msgBoxState.type).toBe('warning')
    })

    it('showOnce_differentDialogIds_bothCanBeShown', () => {
      const { result } = renderHook(() => useConditionalMsgBox())

      // Dismiss first dialog
      useDismissedDialogsStore.getState().dismiss('dialog-1')

      let shown1: boolean = true
      let shown2: boolean = false

      act(() => {
        shown1 = result.current.showOnce('dialog-1', 'Dialog 1', 'Message 1')
      })

      // Close the MsgBox before showing another
      useMsgBoxStore.getState().closeMsgBox()

      act(() => {
        shown2 = result.current.showOnce('dialog-2', 'Dialog 2', 'Message 2')
      })

      expect(shown1).toBe(false) // Already dismissed
      expect(shown2).toBe(true) // Not dismissed
    })
  })

  describe('isDismissed', () => {
    it('isDismissed_notDismissed_returnsFalse', () => {
      const { result } = renderHook(() => useConditionalMsgBox())

      expect(result.current.isDismissed('some-dialog')).toBe(false)
    })

    it('isDismissed_afterDismiss_returnsTrue', () => {
      useDismissedDialogsStore.getState().dismiss('dismissed-dialog')

      const { result } = renderHook(() => useConditionalMsgBox())

      expect(result.current.isDismissed('dismissed-dialog')).toBe(true)
    })
  })
})

describe('showConditionalMsgBox (utility function)', () => {
  beforeEach(() => {
    useDismissedDialogsStore.setState({
      dismissedIds: new Set<string>(),
    })
    useMsgBoxStore.setState({
      isOpen: false,
      title: '',
      message: '',
      type: 'info',
      actions: [],
      dismissible: false,
      dismissId: null,
    })
    localStorageMock.clear()
  })

  it('showConditionalMsgBox_notDismissed_showsDialogAndReturnsTrue', () => {
    const shown = showConditionalMsgBox(
      'utility-dialog',
      'Utility Title',
      'Utility Message',
      'success'
    )

    expect(shown).toBe(true)

    const msgBoxState = useMsgBoxStore.getState()
    expect(msgBoxState.isOpen).toBe(true)
    expect(msgBoxState.title).toBe('Utility Title')
    expect(msgBoxState.type).toBe('success')
    expect(msgBoxState.dismissible).toBe(true)
    expect(msgBoxState.dismissId).toBe('utility-dialog')
  })

  it('showConditionalMsgBox_alreadyDismissed_returnsFalse', () => {
    useDismissedDialogsStore.getState().dismiss('utility-dismissed')

    const shown = showConditionalMsgBox(
      'utility-dismissed',
      'Should Not Show',
      'Message'
    )

    expect(shown).toBe(false)
    expect(useMsgBoxStore.getState().isOpen).toBe(false)
  })

  it('showConditionalMsgBox_canBeCalledOutsideReact', () => {
    // This is the main use case - calling from store actions
    // Just verify it works without React context
    const shown = showConditionalMsgBox(
      'store-action-dialog',
      'From Store',
      'Called from non-React code'
    )

    expect(shown).toBe(true)
    expect(useMsgBoxStore.getState().isOpen).toBe(true)
  })

  it('showConditionalMsgBox_withCustomActions_passesActions', () => {
    const onClick = vi.fn()

    showConditionalMsgBox('with-actions', 'Title', 'Message', 'error', [
      { label: 'Retry', onClick, variant: 'danger' },
    ])

    const msgBoxState = useMsgBoxStore.getState()
    expect(msgBoxState.actions).toHaveLength(1)
    expect(msgBoxState.actions[0]?.label).toBe('Retry')
    expect(msgBoxState.actions[0]?.variant).toBe('danger')
  })
})
