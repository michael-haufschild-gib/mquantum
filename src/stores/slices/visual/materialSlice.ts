/**
 * Material Slice
 *
 * Manages emission settings.
 * NOTE: PBR properties (roughness, metallic, specularIntensity, specularColor)
 * have been moved to the dedicated pbrStore for better organization.
 *
 * @module stores/slices/visual/materialSlice
 */

import { StateCreator } from 'zustand'
import { AppearanceSlice, MaterialSlice, MaterialSliceState } from './types'

export const MATERIAL_INITIAL_STATE: MaterialSliceState = {
  // Emission
  faceEmission: 0.3,
  faceEmissionThreshold: 0.0,
  faceEmissionColorShift: 0.0,
}

export const createMaterialSlice: StateCreator<AppearanceSlice, [], [], MaterialSlice> = (set) => ({
  ...MATERIAL_INITIAL_STATE,

  setFaceEmission: (emission) => set({ faceEmission: Math.max(0, Math.min(5, emission)) }),
  setFaceEmissionThreshold: (threshold) =>
    set({ faceEmissionThreshold: Math.max(0, Math.min(1, threshold)) }),
  setFaceEmissionColorShift: (shift) =>
    set({ faceEmissionColorShift: Math.max(-1, Math.min(1, shift)) }),
})
