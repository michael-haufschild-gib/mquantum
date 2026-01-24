/**
 * Animation Bias Calculation
 *
 * Provides functions to calculate per-plane rotation speed multipliers
 * based on a bias value. Uses the golden ratio to create maximally-spaced,
 * non-repeating patterns across any number of rotation planes.
 *
 * At bias=0: All planes rotate at identical speed (multiplier = 1.0)
 * At bias=1: Planes rotate at "wildly different" speeds (0.2x to 1.8x range)
 */

import { fsin } from '@/lib/math/trig'

/**
 * The golden ratio (phi) creates maximally-spaced, non-repeating patterns.
 * Used to distribute rotation speed variations evenly across planes.
 */
export const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2 // phi ≈ 1.618034

/**
 * Minimum multiplier - plane never completely stops
 */
export const MIN_MULTIPLIER = 0.1

/**
 * Maximum multiplier - prevents excessive rotation speed
 */
export const MAX_MULTIPLIER = 3.0

/**
 * Maximum deviation from base speed (1.0) at full bias
 * At bias=1: multipliers range from (1-0.8) to (1+0.8) = 0.2 to 1.8
 */
export const MAX_DEVIATION = 0.8

/**
 * Phase offset to ensure plane 0 doesn't start at sin(0) = 0.
 * Using π/4 gives plane 0 a non-zero starting spread.
 */
const PHASE_OFFSET = Math.PI / 4

/**
 * Calculates the rotation speed multiplier for a specific plane.
 *
 * Uses golden ratio to create non-repeating spread patterns that work
 * well for any number of planes (3D: 3 planes to 11D: 55 planes).
 *
 * @param planeIndex - Zero-based index of the plane (0 to totalPlanes-1)
 * @param _totalPlanes - Total number of planes (unused, kept for API clarity)
 * @param bias - Bias value from 0 (uniform) to 1 (maximum variation)
 * @returns Rotation speed multiplier in range [MIN_MULTIPLIER, MAX_MULTIPLIER]
 */
export function getPlaneMultiplier(planeIndex: number, _totalPlanes: number, bias: number): number {
  // Fast path: no bias means uniform speed
  if (bias === 0) return 1.0

  // Golden angle spread: each plane gets unique position on unit circle
  // The golden ratio ensures each successive plane is maximally distant
  // from all previous planes on the circle
  // PHASE_OFFSET ensures plane 0 doesn't start at sin(0) = 0
  const goldenAngle = PHASE_OFFSET + planeIndex * GOLDEN_RATIO * 2 * Math.PI
  const spread = fsin(goldenAngle) // Value in [-1, 1] using fast approximation

  // Calculate multiplier:
  // - At bias=0: multiplier = 1.0 (no change)
  // - At bias=1: multiplier ranges from (1 - MAX_DEVIATION) to (1 + MAX_DEVIATION)
  const multiplier = 1 + bias * spread * MAX_DEVIATION

  // Safety clamp: ensure multiplier stays within valid bounds
  return Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, multiplier))
}

/**
 * Gets all plane multipliers for a given configuration.
 * Useful for testing and debugging.
 *
 * @param totalPlanes - Total number of rotation planes
 * @param bias - Bias value from 0 to 1
 * @returns Array of multipliers, one per plane
 */
export function getAllPlaneMultipliers(totalPlanes: number, bias: number): number[] {
  return Array.from({ length: totalPlanes }, (_, i) => getPlaneMultiplier(i, totalPlanes, bias))
}

/**
 * Calculates the average multiplier across all planes.
 * Should be close to 1.0 to preserve overall rotation rate.
 *
 * @param totalPlanes - Total number of rotation planes
 * @param bias - Bias value from 0 to 1
 * @returns Average multiplier value
 */
export function getAverageMultiplier(totalPlanes: number, bias: number): number {
  const multipliers = getAllPlaneMultipliers(totalPlanes, bias)
  return multipliers.reduce((sum, m) => sum + m, 0) / multipliers.length
}
