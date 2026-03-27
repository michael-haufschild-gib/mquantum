/**
 * Message box store.
 *
 * Global modal dialog state for info, success, warning, and error messages.
 * Supports configurable actions, optional "don't show again" persistence,
 * and auto-dismiss via the dismissed dialogs store.
 *
 * @module stores/msgBoxStore
 */

import { create } from 'zustand'

/** Message box severity level. */
export type MsgBoxType = 'info' | 'success' | 'warning' | 'error'

/** Button action configuration for a message box. */
export interface MsgBoxAction {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

/**
 * Options for showing a message box with optional dismiss functionality.
 */
export interface MsgBoxOptions {
  /** Whether to show "Don't show again" checkbox */
  dismissible?: boolean
  /** Unique ID for persisting dismiss state (required if dismissible is true) */
  dismissId?: string
}

interface MsgBoxState {
  isOpen: boolean
  title: string
  message: string
  type: MsgBoxType
  actions: MsgBoxAction[]
  /** Whether the "Don't show again" checkbox should be shown */
  dismissible: boolean
  /** Unique identifier for this dialog (used for persistence) */
  dismissId: string | null

  showMsgBox: (
    title: string,
    message: string,
    type?: MsgBoxType,
    actions?: MsgBoxAction[],
    options?: MsgBoxOptions
  ) => void
  closeMsgBox: () => void
}

export const useMsgBoxStore = create<MsgBoxState>((set) => ({
  isOpen: false,
  title: '',
  message: '',
  type: 'info',
  actions: [],
  dismissible: false,
  dismissId: null,

  showMsgBox: (title, message, type = 'info', actions = [], options = {}) => {
    const { dismissible = false, dismissId } = options
    set({
      isOpen: true,
      title,
      message,
      type,
      actions:
        actions.length > 0 ? actions : [{ label: 'OK', onClick: () => set({ isOpen: false }) }],
      dismissible,
      dismissId: dismissId ?? null,
    })
  },

  closeMsgBox: () => {
    set({
      isOpen: false,
      dismissible: false,
      dismissId: null,
    })
  },
}))
