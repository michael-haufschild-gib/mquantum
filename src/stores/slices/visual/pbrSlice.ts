/**
 * PBR (Physically Based Rendering) Material Slice
 *
 * Provides PBR settings for face rendering (schroedinger wavefunctions).
 *
 * Properties:
 * - roughness (0.04-1.0)
 * - metallic (0.0-1.0)
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

export interface PBRSliceState {
  /** PBR settings for main objects (faces) */
  face: PBRConfig
  /** Version counter - incremented on ANY PBR change for efficient uniform updates */
  pbrVersion: number
}

export interface PBRSliceActions {
  // Face setters
  setFaceRoughness: (roughness: number) => void
  setFaceMetallic: (metallic: number) => void
  setFaceSpecularIntensity: (intensity: number) => void
  setFaceSpecularColor: (color: string) => void
  setFacePBR: (config: Partial<PBRConfig>) => void

  // Version bump (for preset loading)
  /** Manually bump version counter (used after direct setState calls) */
  bumpVersion: () => void

  // Reset
  resetPBR: () => void
}

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
  setFaceRoughness: (roughness) =>
    set((state) => ({
      face: { ...state.face, roughness: clampRoughness(roughness) },
      pbrVersion: state.pbrVersion + 1,
    })),

  setFaceMetallic: (metallic) =>
    set((state) => ({
      face: { ...state.face, metallic: clampMetallic(metallic) },
      pbrVersion: state.pbrVersion + 1,
    })),

  setFaceSpecularIntensity: (intensity) =>
    set((state) => ({
      face: { ...state.face, specularIntensity: clampSpecularIntensity(intensity) },
      pbrVersion: state.pbrVersion + 1,
    })),

  setFaceSpecularColor: (color) =>
    set((state) => ({
      face: { ...state.face, specularColor: color },
      pbrVersion: state.pbrVersion + 1,
    })),

  setFacePBR: (config) =>
    set((state) => ({
      face: {
        ...state.face,
        ...(config.roughness !== undefined && { roughness: clampRoughness(config.roughness) }),
        ...(config.metallic !== undefined && { metallic: clampMetallic(config.metallic) }),
        ...(config.specularIntensity !== undefined && {
          specularIntensity: clampSpecularIntensity(config.specularIntensity),
        }),
        ...(config.specularColor !== undefined && { specularColor: config.specularColor }),
      },
      pbrVersion: state.pbrVersion + 1,
    })),

  // --- Version Bump ---
  bumpVersion: () => set((state) => ({ pbrVersion: state.pbrVersion + 1 })),

  // --- Reset ---
  resetPBR: () =>
    set({
      ...PBR_INITIAL_STATE,
      pbrVersion: 0,
    }),
})
