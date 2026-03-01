/**
 * PBR (Physically Based Rendering) Material Slice
 *
 * Provides PBR settings for face rendering (schroedinger wavefunctions).
 *
 * Properties:
 * - roughness (0.04-1.0)
 * - metallic (0.0-1.0)
 * - reflectance (0.0-1.0, Filament convention: F0 = 0.16 * reflectance^2)
 * - specularIntensity (0.0-2.0)
 * - specularColor (hex string)
 *
 * All changes increment the version counter for efficient uniform updates.
 *
 * @module stores/slices/visual/pbrSlice
 */

import { StateCreator } from 'zustand'
import {
  DEFAULT_FACE_PBR,
  type PBRConfig,
} from '@/stores/defaults/visualDefaults'

// ============================================================================
// Types
// ============================================================================

/**
 * PBR slice state fields.
 */
export interface PBRSliceState {
  /** PBR settings for main objects (faces) */
  face: PBRConfig
  /** Version counter - incremented on ANY PBR change for efficient uniform updates */
  pbrVersion: number
}

/**
 * PBR slice actions.
 */
export interface PBRSliceActions {
  // Face setters
  setFaceRoughness: (roughness: number) => void
  setFaceMetallic: (metallic: number) => void
  setFaceReflectance: (reflectance: number) => void
  setFaceSpecularIntensity: (intensity: number) => void
  setFaceSpecularColor: (color: string) => void
  setFacePBR: (config: Partial<PBRConfig>) => void

  // Version bump (for preset loading)
  /** Manually bump version counter (used after direct setState calls) */
  bumpVersion: () => void

  // Reset
  resetPBR: () => void
}

/**
 * Combined PBR slice type.
 */
export type PBRSlice = PBRSliceState & PBRSliceActions

// ============================================================================
// Clamping Utilities
// ============================================================================

/**
 * Clamp roughness to valid PBR range (0.04 min to avoid GGX divide-by-zero)
 * @param value - Value to clamp
 * @returns Clamped value
 */
const clampRoughness = (value: number): number => Math.max(0.04, Math.min(1.0, value))

/**
 * Clamp metallic to valid range
 * @param value - Value to clamp
 * @returns Clamped value
 */
const clampMetallic = (value: number): number => Math.max(0.0, Math.min(1.0, value))

/**
 * Clamp specular intensity to artistic range
 * @param value - Value to clamp
 * @returns Clamped value
 */
const clampSpecularIntensity = (value: number): number => Math.max(0.0, Math.min(2.0, value))

/**
 * Clamp reflectance to valid range (Filament convention: 0.5 default → F0=0.04)
 * @param value - Value to clamp
 * @returns Clamped value
 */
const clampReflectance = (value: number): number => Math.max(0.0, Math.min(1.0, value))

const isFinitePBRInput = (value: number): boolean => Number.isFinite(value)

// ============================================================================
// Initial State
// ============================================================================

export const PBR_INITIAL_STATE: PBRSliceState = {
  face: { ...DEFAULT_FACE_PBR },
  pbrVersion: 0,
}

// ============================================================================
// Slice Creator
// ============================================================================

export const createPBRSlice: StateCreator<PBRSlice, [], [], PBRSlice> = (set) => ({
  ...PBR_INITIAL_STATE,

  // --- Face Setters ---
  setFaceRoughness: (roughness) => {
    if (!isFinitePBRInput(roughness)) {
      if (import.meta.env.DEV) {
        console.warn('[pbrSlice] Ignoring non-finite roughness:', roughness)
      }
      return
    }
    set((state) => ({
      face: { ...state.face, roughness: clampRoughness(roughness) },
      pbrVersion: state.pbrVersion + 1,
    }))
  },

  setFaceMetallic: (metallic) => {
    if (!isFinitePBRInput(metallic)) {
      if (import.meta.env.DEV) {
        console.warn('[pbrSlice] Ignoring non-finite metallic:', metallic)
      }
      return
    }
    set((state) => ({
      face: { ...state.face, metallic: clampMetallic(metallic) },
      pbrVersion: state.pbrVersion + 1,
    }))
  },

  setFaceReflectance: (reflectance) => {
    if (!isFinitePBRInput(reflectance)) {
      if (import.meta.env.DEV) {
        console.warn('[pbrSlice] Ignoring non-finite reflectance:', reflectance)
      }
      return
    }
    set((state) => ({
      face: { ...state.face, reflectance: clampReflectance(reflectance) },
      pbrVersion: state.pbrVersion + 1,
    }))
  },

  setFaceSpecularIntensity: (intensity) => {
    if (!isFinitePBRInput(intensity)) {
      if (import.meta.env.DEV) {
        console.warn('[pbrSlice] Ignoring non-finite specular intensity:', intensity)
      }
      return
    }
    set((state) => ({
      face: { ...state.face, specularIntensity: clampSpecularIntensity(intensity) },
      pbrVersion: state.pbrVersion + 1,
    }))
  },

  setFaceSpecularColor: (color) =>
    set((state) => ({
      face: { ...state.face, specularColor: color },
      pbrVersion: state.pbrVersion + 1,
    })),

  setFacePBR: (config) =>
    set((state) => {
      const nextFace: Partial<PBRConfig> = {}

      if (config.roughness !== undefined) {
        if (isFinitePBRInput(config.roughness)) {
          nextFace.roughness = clampRoughness(config.roughness)
        } else if (import.meta.env.DEV) {
          console.warn('[pbrSlice] Ignoring non-finite roughness in setFacePBR:', config.roughness)
        }
      }

      if (config.metallic !== undefined) {
        if (isFinitePBRInput(config.metallic)) {
          nextFace.metallic = clampMetallic(config.metallic)
        } else if (import.meta.env.DEV) {
          console.warn('[pbrSlice] Ignoring non-finite metallic in setFacePBR:', config.metallic)
        }
      }

      if (config.reflectance !== undefined) {
        if (isFinitePBRInput(config.reflectance)) {
          nextFace.reflectance = clampReflectance(config.reflectance)
        } else if (import.meta.env.DEV) {
          console.warn('[pbrSlice] Ignoring non-finite reflectance in setFacePBR:', config.reflectance)
        }
      }

      if (config.specularIntensity !== undefined) {
        if (isFinitePBRInput(config.specularIntensity)) {
          nextFace.specularIntensity = clampSpecularIntensity(config.specularIntensity)
        } else if (import.meta.env.DEV) {
          console.warn(
            '[pbrSlice] Ignoring non-finite specular intensity in setFacePBR:',
            config.specularIntensity
          )
        }
      }

      if (config.specularColor !== undefined) {
        nextFace.specularColor = config.specularColor
      }

      if (Object.keys(nextFace).length === 0) {
        return state
      }

      return {
        face: {
          ...state.face,
          ...nextFace,
        },
        pbrVersion: state.pbrVersion + 1,
      }
    }),

  // --- Version Bump ---
  bumpVersion: () => set((state) => ({ pbrVersion: state.pbrVersion + 1 })),

  // --- Reset ---
  resetPBR: () =>
    set({
      ...PBR_INITIAL_STATE,
      pbrVersion: 0,
    }),
})
