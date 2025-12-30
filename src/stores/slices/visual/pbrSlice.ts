/**
 * PBR (Physically Based Rendering) Material Slice
 *
 * Provides independent PBR settings for three object types:
 * - Face: Main objects (polytope faces, mandelbulb, julia, schroedinger, blackhole)
 * - Edge: TubeWireframe (when edgeThickness > 1)
 * - Ground: Walls and ground plane
 *
 * Each object type has its own complete set of PBR properties:
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
  DEFAULT_EDGE_PBR,
  DEFAULT_FACE_PBR,
  DEFAULT_GROUND_PBR,
  type PBRConfig,
} from '@/stores/defaults/visualDefaults'

// ============================================================================
// Types
// ============================================================================

/** PBR target object type */
export type PBRTarget = 'face' | 'edge' | 'ground'

export interface PBRSliceState {
  /** PBR settings for main objects (faces) */
  face: PBRConfig
  /** PBR settings for TubeWireframe (edges) */
  edge: PBRConfig
  /** PBR settings for ground plane and walls */
  ground: PBRConfig
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

  // Edge setters
  setEdgeRoughness: (roughness: number) => void
  setEdgeMetallic: (metallic: number) => void
  setEdgeSpecularIntensity: (intensity: number) => void
  setEdgeSpecularColor: (color: string) => void
  setEdgePBR: (config: Partial<PBRConfig>) => void

  // Ground setters
  setGroundRoughness: (roughness: number) => void
  setGroundMetallic: (metallic: number) => void
  setGroundSpecularIntensity: (intensity: number) => void
  setGroundSpecularColor: (color: string) => void
  setGroundPBR: (config: Partial<PBRConfig>) => void

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
  edge: { ...DEFAULT_EDGE_PBR },
  ground: { ...DEFAULT_GROUND_PBR },
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

  // --- Edge Setters ---
  setEdgeRoughness: (roughness) =>
    set((state) => ({
      edge: { ...state.edge, roughness: clampRoughness(roughness) },
      pbrVersion: state.pbrVersion + 1,
    })),

  setEdgeMetallic: (metallic) =>
    set((state) => ({
      edge: { ...state.edge, metallic: clampMetallic(metallic) },
      pbrVersion: state.pbrVersion + 1,
    })),

  setEdgeSpecularIntensity: (intensity) =>
    set((state) => ({
      edge: { ...state.edge, specularIntensity: clampSpecularIntensity(intensity) },
      pbrVersion: state.pbrVersion + 1,
    })),

  setEdgeSpecularColor: (color) =>
    set((state) => ({
      edge: { ...state.edge, specularColor: color },
      pbrVersion: state.pbrVersion + 1,
    })),

  setEdgePBR: (config) =>
    set((state) => ({
      edge: {
        ...state.edge,
        ...(config.roughness !== undefined && { roughness: clampRoughness(config.roughness) }),
        ...(config.metallic !== undefined && { metallic: clampMetallic(config.metallic) }),
        ...(config.specularIntensity !== undefined && {
          specularIntensity: clampSpecularIntensity(config.specularIntensity),
        }),
        ...(config.specularColor !== undefined && { specularColor: config.specularColor }),
      },
      pbrVersion: state.pbrVersion + 1,
    })),

  // --- Ground Setters ---
  setGroundRoughness: (roughness) =>
    set((state) => ({
      ground: { ...state.ground, roughness: clampRoughness(roughness) },
      pbrVersion: state.pbrVersion + 1,
    })),

  setGroundMetallic: (metallic) =>
    set((state) => ({
      ground: { ...state.ground, metallic: clampMetallic(metallic) },
      pbrVersion: state.pbrVersion + 1,
    })),

  setGroundSpecularIntensity: (intensity) =>
    set((state) => ({
      ground: { ...state.ground, specularIntensity: clampSpecularIntensity(intensity) },
      pbrVersion: state.pbrVersion + 1,
    })),

  setGroundSpecularColor: (color) =>
    set((state) => ({
      ground: { ...state.ground, specularColor: color },
      pbrVersion: state.pbrVersion + 1,
    })),

  setGroundPBR: (config) =>
    set((state) => ({
      ground: {
        ...state.ground,
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
  bumpVersion: () =>
    set((state) => ({ pbrVersion: state.pbrVersion + 1 })),

  // --- Reset ---
  resetPBR: () =>
    set({
      ...PBR_INITIAL_STATE,
      pbrVersion: 0,
    }),
})
