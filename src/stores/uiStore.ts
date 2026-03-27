/**
 * UI state store.
 *
 * Thin wrapper that composes the UI slice into a standalone store.
 * Panel visibility, cinematic mode, and shortcuts overlay state live in the slice.
 *
 * @module stores/uiStore
 */

import { create } from 'zustand'

import { createUISlice, UISlice } from './slices/uiSlice'

export type { UISlice }

export const useUIStore = create<UISlice>((...a) => ({
  ...createUISlice(...a),
}))
