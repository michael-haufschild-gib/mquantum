/**
 * Rotation state management using Zustand
 * Manages n-dimensional rotation angles
 */

import { create } from 'zustand'

import { MAX_DIMENSION, MIN_DIMENSION } from '@/constants/dimension'
import { logger } from '@/lib/logger'
import { getRotationPlanes } from '@/lib/math/rotation'

/**
 * Cache for valid plane names by dimension.
 * Avoids recreating Set on every setRotation/updateRotations call.
 */
const validPlanesCache = new Map<number, Set<string>>()
const DEFAULT_ROTATION_DIMENSION = 4

function isValidRotationDimension(dimension: number): boolean {
  return Number.isInteger(dimension) && dimension >= MIN_DIMENSION && dimension <= MAX_DIMENSION
}

function sanitizeRotationDimension(dimension: number): number {
  return isValidRotationDimension(dimension) ? dimension : DEFAULT_ROTATION_DIMENSION
}

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

/**
 * Threshold for lazy angle normalization (radians).
 * Angles are only normalized when they exceed this value to prevent
 * floating-point precision loss from frequent modulo operations.
 * 10000 radians ≈ 1592 full rotations ≈ 11 hours at default speed.
 */
const LAZY_NORMALIZE_THRESHOLD = 10000
const ROTATION_CHANGE_EPSILON = 1e-10

/**
 * Rotation store state and actions.
 */
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

/**
 * Checks whether a rotation angle is finite.
 * @param angle - Angle in radians
 * @returns True when angle is finite
 */
function isValidRotationAngle(angle: number): boolean {
  return Number.isFinite(angle)
}

function isApplicableRotationUpdate(
  plane: string,
  angle: number,
  validPlanes: Set<string>
): boolean {
  return validPlanes.has(plane) && isValidRotationAngle(angle)
}

function rotationUpdatesChangeState(
  updates: Map<string, number>,
  currentRotations: Map<string, number>,
  validPlanes: Set<string>,
  repairingDimension: boolean
): boolean {
  if (repairingDimension) return true

  for (const [plane, angle] of updates.entries()) {
    if (!isApplicableRotationUpdate(plane, angle, validPlanes)) continue
    const normalizedAngle = normalizeAngle(angle)
    const currentAngle = currentRotations.get(plane)
    if (
      currentAngle === undefined ||
      Math.abs(currentAngle - normalizedAngle) > ROTATION_CHANGE_EPSILON
    ) {
      return true
    }
  }

  return false
}

function applyRotationUpdates(
  baseRotations: Map<string, number>,
  updates: Map<string, number>,
  validPlanes: Set<string>
): Map<string, number> {
  const nextRotations = new Map(baseRotations)
  for (const [plane, angle] of updates.entries()) {
    if (isApplicableRotationUpdate(plane, angle, validPlanes)) {
      nextRotations.set(plane, normalizeAngle(angle))
    }
  }
  return nextRotations
}

export const useRotationStore = create<RotationState>((set) => ({
  rotations: new Map(),
  dimension: 4,
  version: 0,

  setRotation: (plane: string, angle: number) => {
    if (!isValidRotationAngle(angle)) {
      logger.warn(`[rotationStore] Ignoring non-finite angle for ${plane}: ${angle}`)
      return
    }

    set((state) => {
      const dimension = sanitizeRotationDimension(state.dimension)
      const repairingDimension = dimension !== state.dimension
      // Only set rotation if plane is valid for current dimension
      // Use cached Set to avoid recreation on every call
      const validPlanes = getValidPlanesSet(dimension)
      if (!validPlanes.has(plane)) {
        if (repairingDimension) {
          return { dimension, rotations: new Map(), version: state.version + 1 }
        }
        return state // Ignore invalid plane
      }
      const newRotations = repairingDimension ? new Map<string, number>() : new Map(state.rotations)
      newRotations.set(plane, normalizeAngle(angle))
      return { dimension, rotations: newRotations, version: state.version + 1 }
    })
  },

  updateRotations: (updates: Map<string, number>) => {
    // Early exit if no updates - avoid unnecessary state change and version bump
    if (updates.size === 0) return

    set((state) => {
      const dimension = sanitizeRotationDimension(state.dimension)
      const repairingDimension = dimension !== state.dimension
      // Filter updates to only include valid planes for current dimension
      // Use cached Set to avoid recreation on every call
      const validPlanes = getValidPlanesSet(dimension)

      // Early exit if no actual changes - avoid Map allocation and version bump
      if (!rotationUpdatesChangeState(updates, state.rotations, validPlanes, repairingDimension)) {
        return state
      }

      // Second pass - create new Map only when we have actual changes
      const baseRotations = repairingDimension ? new Map<string, number>() : state.rotations
      const newRotations = applyRotationUpdates(baseRotations, updates, validPlanes)
      return { dimension, rotations: newRotations, version: state.version + 1 }
    })
  },

  resetAllRotations: () => {
    set((state) => ({ rotations: new Map(), version: state.version + 1 }))
  },

  reset: () => {
    set((state) => ({ rotations: new Map(), version: state.version + 1 }))
  },

  setDimension: (dimension: number) => {
    if (!isValidRotationDimension(dimension)) {
      logger.warn(`[rotationStore] Ignoring invalid dimension: ${dimension}`)
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
