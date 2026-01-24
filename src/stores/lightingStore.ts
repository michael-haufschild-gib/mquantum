import { create } from 'zustand'
import { createLightingSlice, LightingSlice } from './slices/lightingSlice'

export type { LightingSlice }

export const useLightingStore = create<LightingSlice>((...a) => ({
  ...createLightingSlice(...a),
}))
