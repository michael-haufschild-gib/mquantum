/**
 * Tests for MsgBox dismissible functionality
 *
 * Tests the "Don't show again" checkbox feature of MsgBox.
 *
 * Following Roy Osherove's "Art of Unit Testing" principles:
 * - Readable: Clear test names describing behavior
 * - Maintainable: Isolated tests with proper setup/teardown
 * - Trustworthy: Deterministic results
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MsgBox } from '@/components/overlays/MsgBox'
import { useMsgBoxStore } from '@/stores/msgBoxStore'
import { useDismissedDialogsStore } from '@/stores/dismissedDialogsStore'

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

// Mock HTMLDialogElement methods not available in happy-dom
// We need to set the 'open' attribute for the dialog to be accessible
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '')
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open')
  })
})

describe('MsgBox dismissible functionality', () => {
  beforeEach(() => {
    cleanup()
    // Reset stores before each test
    useMsgBoxStore.setState({
      isOpen: false,
      title: '',
      message: '',
      type: 'info',
      actions: [],
      dismissible: false,
      dismissId: null,
    })
    useDismissedDialogsStore.setState({
      dismissedIds: new Set<string>(),
    })
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('checkbox visibility', () => {
    it('render_dismissibleTrue_showsCheckbox', () => {
      useMsgBoxStore.setState({
        isOpen: true,
        title: 'Test',
        message: 'Message',
        type: 'info',
        actions: [{ label: 'OK', onClick: vi.fn() }],
        dismissible: true,
        dismissId: 'test-dialog',
      })

      render(<MsgBox />)

      expect(screen.getByRole('switch')).toBeInTheDocument()
      expect(screen.getByText("Don't show again")).toBeInTheDocument()
    })

    it('render_dismissibleFalse_hidesCheckbox', () => {
      useMsgBoxStore.setState({
        isOpen: true,
        title: 'Test',
        message: 'Message',
        type: 'info',
        actions: [{ label: 'OK', onClick: vi.fn() }],
        dismissible: false,
        dismissId: null,
      })

      render(<MsgBox />)

      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
      expect(screen.queryByText("Don't show again")).not.toBeInTheDocument()
    })

    it('render_dismissibleTrueButNoDismissId_hidesCheckbox', () => {
      useMsgBoxStore.setState({
        isOpen: true,
        title: 'Test',
        message: 'Message',
        type: 'info',
        actions: [{ label: 'OK', onClick: vi.fn() }],
        dismissible: true,
        dismissId: null, // No dismissId means checkbox shouldn't show
      })

      render(<MsgBox />)

      expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    })
  })

  describe('checkbox behavior', () => {
    it('checkbox_defaultState_unchecked', () => {
      useMsgBoxStore.setState({
        isOpen: true,
        title: 'Test',
        message: 'Message',
        type: 'info',
        actions: [{ label: 'OK', onClick: vi.fn() }],
        dismissible: true,
        dismissId: 'test-dialog',
      })

      render(<MsgBox />)

      const checkbox = screen.getByRole('switch')
      expect(checkbox).not.toBeChecked()
    })

    it('checkbox_userClicks_becomesChecked', async () => {
      const user = userEvent.setup()

      useMsgBoxStore.setState({
        isOpen: true,
        title: 'Test',
        message: 'Message',
        type: 'info',
        actions: [{ label: 'OK', onClick: vi.fn() }],
        dismissible: true,
        dismissId: 'test-dialog',
      })

      render(<MsgBox />)

      const checkbox = screen.getByRole('switch')
      await user.click(checkbox)

      expect(checkbox).toBeChecked()
    })

    it('checkbox_clickTwice_becomesUnchecked', async () => {
      const user = userEvent.setup()

      useMsgBoxStore.setState({
        isOpen: true,
        title: 'Test',
        message: 'Message',
        type: 'info',
        actions: [{ label: 'OK', onClick: vi.fn() }],
        dismissible: true,
        dismissId: 'test-dialog',
      })

      render(<MsgBox />)

      const checkbox = screen.getByRole('switch')
      await user.click(checkbox)
      expect(checkbox).toBeChecked()

      await user.click(checkbox)
      expect(checkbox).not.toBeChecked()
    })
  })

  describe('dismiss persistence', () => {
    it('actionClick_checkboxChecked_persistsDismiss', async () => {
      const user = userEvent.setup()
      const onClickAction = vi.fn()

      useMsgBoxStore.setState({
        isOpen: true,
        title: 'Test',
        message: 'Message',
        type: 'info',
        actions: [{ label: 'OK', onClick: onClickAction }],
        dismissible: true,
        dismissId: 'persist-test-dialog',
      })

      render(<MsgBox />)

      // Check the checkbox
      const checkbox = screen.getByRole('switch')
      await user.click(checkbox)
      expect(checkbox).toBeChecked()

      // Click the action button
      const button = screen.getByRole('button', { name: 'OK' })
      await user.click(button)

      // Verify action was called
      expect(onClickAction).toHaveBeenCalledTimes(1)

      // Verify dialog was dismissed in store
      const { isDismissed } = useDismissedDialogsStore.getState()
      expect(isDismissed('persist-test-dialog')).toBe(true)
    })

    it('actionClick_checkboxUnchecked_doesNotPersistDismiss', async () => {
      const user = userEvent.setup()
      const onClickAction = vi.fn()

      useMsgBoxStore.setState({
        isOpen: true,
        title: 'Test',
        message: 'Message',
        type: 'info',
        actions: [{ label: 'OK', onClick: onClickAction }],
        dismissible: true,
        dismissId: 'no-persist-dialog',
      })

      render(<MsgBox />)

      // Don't check the checkbox, just click OK
      const button = screen.getByRole('button', { name: 'OK' })
      await user.click(button)

      // Verify action was called
      expect(onClickAction).toHaveBeenCalledTimes(1)

      // Verify dialog was NOT dismissed
      const { isDismissed } = useDismissedDialogsStore.getState()
      expect(isDismissed('no-persist-dialog')).toBe(false)
    })

    it('actionClick_multipleActions_eachCanPersistDismiss', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn()
      const onCancel = vi.fn()

      useMsgBoxStore.setState({
        isOpen: true,
        title: 'Confirm',
        message: 'Are you sure?',
        type: 'warning',
        actions: [
          { label: 'Confirm', onClick: onConfirm, variant: 'primary' },
          { label: 'Cancel', onClick: onCancel, variant: 'secondary' },
        ],
        dismissible: true,
        dismissId: 'multi-action-dialog',
      })

      render(<MsgBox />)

      // Check the checkbox
      const checkbox = screen.getByRole('switch')
      await user.click(checkbox)

      // Click Cancel (either button should persist)
      const cancelButton = screen.getByRole('button', { name: 'Cancel' })
      await user.click(cancelButton)

      expect(onCancel).toHaveBeenCalledTimes(1)
      expect(useDismissedDialogsStore.getState().isDismissed('multi-action-dialog')).toBe(true)
    })
  })

  describe('accessibility', () => {
    it('switch_hasLabel_andMessageHasId', () => {
      useMsgBoxStore.setState({
        isOpen: true,
        title: 'Accessible Dialog',
        message: 'This is the message content',
        type: 'info',
        actions: [{ label: 'OK', onClick: vi.fn() }],
        dismissible: true,
        dismissId: 'accessible-dialog',
      })

      render(<MsgBox />)

      // Verify the switch is rendered with correct aria state
      const switchEl = screen.getByRole('switch')
      expect(switchEl).toHaveAttribute('aria-checked', 'false')

      // Verify the message element has the correct id for accessibility linking
      const message = screen.getByText('This is the message content')
      expect(message).toHaveAttribute('id', 'msgbox-message')
    })
  })
})

describe('msgBoxStore dismissible options', () => {
  beforeEach(() => {
    useMsgBoxStore.setState({
      isOpen: false,
      title: '',
      message: '',
      type: 'info',
      actions: [],
      dismissible: false,
      dismissId: null,
    })
  })

  it('showMsgBox_withDismissibleOptions_setsCorrectState', () => {
    const { showMsgBox } = useMsgBoxStore.getState()

    showMsgBox('Title', 'Message', 'info', [], {
      dismissible: true,
      dismissId: 'options-test',
    })

    const state = useMsgBoxStore.getState()
    expect(state.dismissible).toBe(true)
    expect(state.dismissId).toBe('options-test')
  })

  it('showMsgBox_withoutOptions_defaultsToNonDismissible', () => {
    const { showMsgBox } = useMsgBoxStore.getState()

    showMsgBox('Title', 'Message')

    const state = useMsgBoxStore.getState()
    expect(state.dismissible).toBe(false)
    expect(state.dismissId).toBeNull()
  })

  it('closeMsgBox_resetsDissmissibleState', () => {
    const { showMsgBox, closeMsgBox } = useMsgBoxStore.getState()

    showMsgBox('Title', 'Message', 'info', [], {
      dismissible: true,
      dismissId: 'reset-test',
    })

    closeMsgBox()

    const state = useMsgBoxStore.getState()
    expect(state.dismissible).toBe(false)
    expect(state.dismissId).toBeNull()
  })
})
