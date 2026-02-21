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

function isFiniteMaterialInput(value: number): boolean {
  return Number.isFinite(value)
}

export const MATERIAL_INITIAL_STATE: MaterialSliceState = {
  // Emission
  faceEmission: 0.3,
  faceEmissionThreshold: 0.0,
  faceEmissionColorShift: 0.0,
}

export const createMaterialSlice: StateCreator<AppearanceSlice, [], [], MaterialSlice> = (set) => ({
  ...MATERIAL_INITIAL_STATE,

  setFaceEmission: (emission) => {
    if (!isFiniteMaterialInput(emission)) {
      if (import.meta.env.DEV) {
        console.warn('[materialSlice] Ignoring non-finite face emission:', emission)
      }
      return
    }
    set({ faceEmission: Math.max(0, Math.min(5, emission)) })
  },
  setFaceEmissionThreshold: (threshold) => {
    if (!isFiniteMaterialInput(threshold)) {
      if (import.meta.env.DEV) {
        console.warn('[materialSlice] Ignoring non-finite face emission threshold:', threshold)
      }
      return
    }
    set({ faceEmissionThreshold: Math.max(0, Math.min(1, threshold)) })
  },
  setFaceEmissionColorShift: (shift) => {
    if (!isFiniteMaterialInput(shift)) {
      if (import.meta.env.DEV) {
        console.warn('[materialSlice] Ignoring non-finite face emission color shift:', shift)
      }
      return
    }
    set({ faceEmissionColorShift: Math.max(-1, Math.min(1, shift)) })
  },
})
