/**
 * useConditionalMsgBox Hook
 *
 * Provides a convenient API for showing message boxes that can be
 * permanently dismissed by users. Wraps the MsgBox system with
 * automatic checking of the dismissed dialogs store.
 */

import { useDismissedDialogsStore } from '@/stores/dismissedDialogsStore'
import { useMsgBoxStore, type MsgBoxAction, type MsgBoxType } from '@/stores/msgBoxStore'
import { useCallback } from 'react'

/**
 *
 */
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
 * Handles hydration timing to prevent race conditions with localStorage persistence.
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
  const showMsgBox = useMsgBoxStore((state) => state.showMsgBox)

  const showOnce = useCallback(
    (
      dialogId: string,
      title: string,
      message: string,
      type: MsgBoxType = 'info',
      actions?: MsgBoxAction[]
    ): boolean => {
      // Helper to perform the actual show logic
      const doShow = (): boolean => {
        const { isDismissed } = useDismissedDialogsStore.getState()
        if (isDismissed(dialogId)) {
          return false
        }
        showMsgBox(title, message, type, actions, {
          dismissible: true,
          dismissId: dialogId,
        })
        return true
      }

      // Check if store has hydrated from localStorage
      // If not hydrated, dismissed state may not be loaded yet
      if (!useDismissedDialogsStore.persist.hasHydrated()) {
        // Wait for hydration, then check and show if needed
        useDismissedDialogsStore.persist.onFinishHydration(() => {
          doShow()
        })
        return true // Optimistic return
      }

      return doShow()
    },
    [showMsgBox]
  )

  const isDismissed = useCallback((dialogId: string): boolean => {
    // For immediate checks, always get fresh state and respect hydration
    if (!useDismissedDialogsStore.persist.hasHydrated()) {
      // Not hydrated - can't reliably know if dismissed
      // Return false (not dismissed) to be safe, but this is a race condition
      // Callers should prefer showOnce which handles this properly
      return false
    }
    return useDismissedDialogsStore.getState().isDismissed(dialogId)
  }, [])

  return { showOnce, isDismissed }
}

/**
 * Internal helper to perform the actual conditional message box show.
 * Assumes hydration has already been verified.
 * @param dialogId
 * @param title
 * @param message
 * @param type
 * @param actions
 */
function doShowConditionalMsgBox(
  dialogId: string,
  title: string,
  message: string,
  type: MsgBoxType,
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

/**
 * Utility function for showing a conditional message box from outside React components.
 * Useful for store actions and other non-component code.
 *
 * Handles hydration timing: if the dismissedDialogsStore hasn't hydrated from
 * localStorage yet, waits for hydration before checking dismissed state.
 * This prevents the popup from incorrectly showing when user had previously
 * checked "Don't show again".
 *
 * @param dialogId - Unique identifier for this dialog type
 * @param title - Dialog title
 * @param message - Dialog message content
 * @param type - Message type (info, success, warning, error)
 * @param actions - Custom action buttons (defaults to "OK" if not provided)
 * @returns true if the dialog was shown (or will be shown after hydration),
 *          false if it was previously dismissed (only reliable after hydration)
 */
export function showConditionalMsgBox(
  dialogId: string,
  title: string,
  message: string,
  type: MsgBoxType = 'info',
  actions?: MsgBoxAction[]
): boolean {
  // Check if store has hydrated from localStorage
  // If not hydrated, dismissed state may not be loaded yet, leading to
  // incorrect "not dismissed" checks (race condition)
  if (!useDismissedDialogsStore.persist.hasHydrated()) {
    // Wait for hydration to complete, then check and show if needed
    useDismissedDialogsStore.persist.onFinishHydration(() => {
      doShowConditionalMsgBox(dialogId, title, message, type, actions)
    })
    // Return true optimistically - actual show depends on hydrated state
    return true
  }

  return doShowConditionalMsgBox(dialogId, title, message, type, actions)
}
