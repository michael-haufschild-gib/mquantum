/**
 * useConditionalMsgBox Hook
 *
 * Provides a convenient API for showing message boxes that can be
 * permanently dismissed by users. Wraps the MsgBox system with
 * automatic checking of the dismissed dialogs store.
 */

import { useCallback } from 'react'
import { useDismissedDialogsStore } from '@/stores/dismissedDialogsStore'
import { useMsgBoxStore, type MsgBoxAction, type MsgBoxType } from '@/stores/msgBoxStore'

export interface UseConditionalMsgBoxResult {
  /**
   * Shows a message box only if it hasn't been permanently dismissed.
   * Automatically adds the "Don't show again" checkbox.
   *
   * @param dialogId - Unique identifier for this dialog type
   * @param title - Dialog title
   * @param message - Dialog message content
   * @param type - Message type (info, success, warning, error)
   * @param actions - Custom action buttons (defaults to "OK" if not provided)
   * @returns true if the dialog was shown, false if it was previously dismissed
   */
  showOnce: (
    dialogId: string,
    title: string,
    message: string,
    type?: MsgBoxType,
    actions?: MsgBoxAction[]
  ) => boolean

  /**
   * Check if a dialog has been dismissed without showing it.
   */
  isDismissed: (dialogId: string) => boolean
}

/**
 * Hook for showing dismissible message boxes.
 *
 * @example
 * ```tsx
 * const { showOnce } = useConditionalMsgBox()
 *
 * const handleSave = () => {
 *   savePreset()
 *   showOnce(
 *     'preset.save.localStorage-warning',
 *     'Preset Saved Locally',
 *     'Your preset is stored in browser localStorage...',
 *     'info'
 *   )
 * }
 * ```
 */
export function useConditionalMsgBox(): UseConditionalMsgBoxResult {
  const isDismissedFn = useDismissedDialogsStore((state) => state.isDismissed)
  const showMsgBox = useMsgBoxStore((state) => state.showMsgBox)

  const showOnce = useCallback(
    (
      dialogId: string,
      title: string,
      message: string,
      type: MsgBoxType = 'info',
      actions?: MsgBoxAction[]
    ): boolean => {
      // Check if already dismissed
      if (isDismissedFn(dialogId)) {
        return false
      }

      // Show the dialog with dismissible option
      showMsgBox(title, message, type, actions, {
        dismissible: true,
        dismissId: dialogId,
      })

      return true
    },
    [isDismissedFn, showMsgBox]
  )

  const isDismissed = useCallback(
    (dialogId: string): boolean => isDismissedFn(dialogId),
    [isDismissedFn]
  )

  return { showOnce, isDismissed }
}

/**
 * Utility function for showing a conditional message box from outside React components.
 * Useful for store actions and other non-component code.
 *
 * @param dialogId - Unique identifier for this dialog type
 * @param title - Dialog title
 * @param message - Dialog message content
 * @param type - Message type (info, success, warning, error)
 * @param actions - Custom action buttons (defaults to "OK" if not provided)
 * @returns true if the dialog was shown, false if it was previously dismissed
 */
export function showConditionalMsgBox(
  dialogId: string,
  title: string,
  message: string,
  type: MsgBoxType = 'info',
  actions?: MsgBoxAction[]
): boolean {
  const { isDismissed } = useDismissedDialogsStore.getState()

  if (isDismissed(dialogId)) {
    return false
  }

  useMsgBoxStore.getState().showMsgBox(title, message, type, actions, {
    dismissible: true,
    dismissId: dialogId,
  })

  return true
}
