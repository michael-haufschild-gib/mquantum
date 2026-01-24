/**
 * Dismissed Dialogs Store
 *
 * Manages persistence of "do not show again" dialog dismissals.
 * Uses localStorage via Zustand persist middleware to remember
 * which dialogs the user has chosen to permanently dismiss.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface DismissedDialogsState {
  /** Set of dialog IDs that have been dismissed */
  dismissedIds: Set<string>

  /** Check if a dialog has been dismissed */
  isDismissed: (dialogId: string) => boolean

  /** Mark a dialog as dismissed */
  dismiss: (dialogId: string) => void

  /** Restore a previously dismissed dialog */
  restore: (dialogId: string) => void

  /** Reset all dismissed dialogs (restore all) */
  resetAll: () => void

  /** Get count of dismissed dialogs */
  getDismissedCount: () => number
}

export const useDismissedDialogsStore = create<DismissedDialogsState>()(
  persist(
    (set, get) => ({
      dismissedIds: new Set<string>(),

      isDismissed: (dialogId) => get().dismissedIds.has(dialogId),

      dismiss: (dialogId) =>
        set((state) => ({
          dismissedIds: new Set([...state.dismissedIds, dialogId]),
        })),

      restore: (dialogId) =>
        set((state) => {
          const next = new Set(state.dismissedIds)
          next.delete(dialogId)
          return { dismissedIds: next }
        }),

      resetAll: () => set({ dismissedIds: new Set() }),

      getDismissedCount: () => get().dismissedIds.size,
    }),
    {
      name: 'mdimension-dismissed-dialogs',
      partialize: (state) => ({
        // Convert Set to Array for JSON serialization
        dismissedIds: [...state.dismissedIds],
      }),
      merge: (persisted, current) => ({
        ...current,
        // Convert Array back to Set on hydration
        dismissedIds: new Set((persisted as { dismissedIds?: string[] })?.dismissedIds ?? []),
      }),
    }
  )
)

/**
 * Well-known dialog IDs used throughout the application.
 * Use these constants to ensure consistency.
 */
export const DIALOG_IDS = {
  /** Shown when saving a style preset */
  PRESET_SAVE_STYLE_WARNING: 'preset.save.style.localStorage-warning',
  /** Shown when saving a scene preset */
  PRESET_SAVE_SCENE_WARNING: 'preset.save.scene.localStorage-warning',
} as const
