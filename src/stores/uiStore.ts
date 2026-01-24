import { create } from 'zustand'
import { createUISlice, UISlice } from './slices/uiSlice'

export type { UISlice }

export const useUIStore = create<UISlice>((...a) => ({
  ...createUISlice(...a),
}))
