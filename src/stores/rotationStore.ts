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

/**
 * Threshold for lazy angle normalization (radians).
 * Angles are only normalized when they exceed this value to prevent
 * floating-point precision loss from frequent modulo operations.
 * 10000 radians ≈ 1592 full rotations ≈ 11 hours at default speed.
 */
const LAZY_NORMALIZE_THRESHOLD = 10000

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
 * Lazily normalizes an angle - only when it exceeds the threshold.
 * This prevents floating-point precision loss from frequent modulo operations
 * that cause visible "jump cuts" in animated textures (e.g., black hole disk).
 *
 * The angle is allowed to accumulate continuously (0 → 2π → 4π → ...)
 * and only normalized when it gets very large (|angle| > 10000 radians).
 *
 * @param angle - Angle in radians
 * @returns Angle (possibly normalized if threshold exceeded)
 */
function normalizeAngle(angle: number): number {
  // Only normalize when angle exceeds threshold to prevent precision loss
  if (Math.abs(angle) > LAZY_NORMALIZE_THRESHOLD) {
    let normalized = angle % (2 * Math.PI)
    if (normalized < 0) {
      normalized += 2 * Math.PI
    }
    return normalized
  }
  return angle
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

      // OPT-MAP-1: First pass - check if any values actually changed
      // Avoids creating a new Map when all updates are no-ops (same values)
      let hasChanges = false
      for (const [plane, angle] of updates.entries()) {
        if (validPlanes.has(plane)) {
          const normalizedAngle = normalizeAngle(angle)
          const currentAngle = state.rotations.get(plane)
          // Check if value is different (with tolerance for floating point)
          if (currentAngle === undefined || Math.abs(currentAngle - normalizedAngle) > 1e-10) {
            hasChanges = true
            break
          }
        }
      }

      // Early exit if no actual changes - avoid Map allocation and version bump
      if (!hasChanges) {
        return state
      }

      // Second pass - create new Map only when we have actual changes
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
