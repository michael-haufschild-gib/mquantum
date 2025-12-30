/**
 * Rotation state management using Zustand
 * Manages n-dimensional rotation angles
 */

import { getRotationPlanes } from '@/lib/math/rotation'
import { create } from 'zustand'
import { MAX_DIMENSION, MIN_DIMENSION } from './geometryStore'

/**
 * Cache for valid plane names by dimension.
 * Avoids recreating Set on every setRotation/updateRotations call.
 */
const validPlanesCache = new Map<number, Set<string>>()

/**
 * Get cached Set of valid plane names for a dimension.
 * Creates and caches if not yet present.
 * @param dimension - The dimension to get valid planes for
 * @returns Set of valid plane names
 */
function getValidPlanesSet(dimension: number): Set<string> {
  let cached = validPlanesCache.get(dimension)
  if (!cached) {
    cached = new Set(getRotationPlanes(dimension).map((p) => p.name))
    validPlanesCache.set(dimension, cached)
  }
  return cached
}

/** Minimum rotation angle in radians (0 degrees) */
export const MIN_ROTATION = 0

/** Maximum rotation angle in radians (360 degrees) */
export const MAX_ROTATION = 2 * Math.PI

export interface RotationState {
  /** Map of plane name (e.g. "XY") to rotation angle in radians */
  rotations: Map<string, number>

  /** Current dimension */
  dimension: number

  /** Version counter to track updates without deep comparison */
  version: number

  /** Set rotation for a specific plane */
  setRotation: (plane: string, angle: number) => void

  /** Update multiple rotations at once (optimized for animation) */
  updateRotations: (updates: Map<string, number>) => void

  /** Reset all rotations to 0 */
  resetAllRotations: () => void

  /** Reset store to initial state (alias for resetAllRotations for API consistency) */
  reset: () => void

  /** Update state when dimension changes */
  setDimension: (dimension: number) => void

  /** Manually bump version counter (used after direct setState calls) */
  bumpVersion: () => void
}

/**
 * Normalizes an angle to [0, 2π)
 * @param angle - Angle in radians
 * @returns Normalized angle in [0, 2π)
 */
function normalizeAngle(angle: number): number {
  let normalized = angle % (2 * Math.PI)
  if (normalized < 0) {
    normalized += 2 * Math.PI
  }
  return normalized
}

export const useRotationStore = create<RotationState>((set) => ({
  rotations: new Map(),
  dimension: 4,
  version: 0,

  setRotation: (plane: string, angle: number) => {
    set((state) => {
      // Only set rotation if plane is valid for current dimension
      // Use cached Set to avoid recreation on every call
      const validPlanes = getValidPlanesSet(state.dimension)
      if (!validPlanes.has(plane)) {
        return state // Ignore invalid plane
      }
      const newRotations = new Map(state.rotations)
      newRotations.set(plane, normalizeAngle(angle))
      return { rotations: newRotations, version: state.version + 1 }
    })
  },

  updateRotations: (updates: Map<string, number>) => {
    // Early exit if no updates - avoid unnecessary state change and version bump
    if (updates.size === 0) return

    set((state) => {
      // Filter updates to only include valid planes for current dimension
      // Use cached Set to avoid recreation on every call
      const validPlanes = getValidPlanesSet(state.dimension)
      const newRotations = new Map(state.rotations)
      for (const [plane, angle] of updates.entries()) {
        if (validPlanes.has(plane)) {
          newRotations.set(plane, normalizeAngle(angle))
        }
      }
      return { rotations: newRotations, version: state.version + 1 }
    })
  },

  resetAllRotations: () => {
    set((state) => ({ rotations: new Map(), version: state.version + 1 }))
  },

  reset: () => {
    set((state) => ({ rotations: new Map(), version: state.version + 1 }))
  },

  setDimension: (dimension: number) => {
    if (dimension < MIN_DIMENSION || dimension > MAX_DIMENSION) {
      return
    }

    set((state) => {
      // Reset all rotations when dimension changes to prevent accumulated angles
      // from causing erratic behavior in the new dimension space
      if (state.dimension !== dimension) {
        return {
          dimension,
          rotations: new Map(),
          version: state.version + 1,
        }
      }
      return state
    })
  },

  bumpVersion: () => {
    set((state) => ({ version: state.version + 1 }))
  },
}))
