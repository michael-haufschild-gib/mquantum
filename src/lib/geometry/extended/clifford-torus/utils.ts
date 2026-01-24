/**
 * Utility Functions
 *
 * Helpers for Clifford torus calculations.
 */

/**
 * Calculates the maximum torus dimension k for a given ambient dimension n
 *
 * @param n - Ambient dimension
 * @returns Maximum k such that 2k ≤ n
 */
export function getMaxTorusDimension(n: number): number {
  return Math.floor(n / 2)
}

/**
 * Calculates the expected point count for a generalized Clifford torus
 *
 * @param k - Torus dimension
 * @param stepsPerCircle - Resolution per circular parameter
 * @returns Total number of points (stepsPerCircle^k)
 */
export function getGeneralizedCliffordTorusPointCount(k: number, stepsPerCircle: number): number {
  return Math.pow(stepsPerCircle, k)
}
