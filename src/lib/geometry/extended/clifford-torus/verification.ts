/**
 * Verification Utilities
 *
 * Checks if points lie on the expected spheres and circles.
 */

import type { VectorND } from '@/lib/math/types'

/**
 * Verifies that classic Clifford torus points lie on S³
 *
 * @param points - Array of points to verify
 * @param expectedRadius - Expected radius of the containing 3-sphere
 * @param tolerance - Tolerance for numerical comparison (default 1e-6)
 * @returns Object with verification results
 */
export function verifyCliffordTorusOnSphere(
  points: VectorND[],
  expectedRadius: number,
  tolerance: number = 1e-6
): { valid: boolean; maxDeviation: number; issues: string[] } {
  const issues: string[] = []
  let maxDeviation = 0
  const expectedRadiusSq = expectedRadius * expectedRadius

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    if (p.length < 4) {
      issues.push(`Point ${i} has insufficient dimensions`)
      continue
    }

    // Sum of squares of first 4 coordinates should equal R²
    const radiusSq = p[0]! * p[0]! + p[1]! * p[1]! + p[2]! * p[2]! + p[3]! * p[3]!
    const deviation = Math.abs(radiusSq - expectedRadiusSq)
    maxDeviation = Math.max(maxDeviation, deviation)

    if (deviation > tolerance) {
      if (issues.length < 5) {
        issues.push(
          `Point ${i} deviates from S³: ||x||² = ${radiusSq}, expected ${expectedRadiusSq}`
        )
      }
    }
  }

  if (issues.length >= 5) {
    issues.push('(and more...)')
  }

  return {
    valid: issues.length === 0,
    maxDeviation,
    issues,
  }
}

/**
 * Verifies that generalized Clifford torus points lie on S^(2k-1)
 *
 * @param points - Array of points to verify
 * @param k - Torus dimension
 * @param expectedRadius - Expected radius of the containing sphere
 * @param tolerance - Tolerance for numerical comparison (default 1e-6)
 * @returns Object with verification results
 */
export function verifyGeneralizedCliffordTorusOnSphere(
  points: VectorND[],
  k: number,
  expectedRadius: number,
  tolerance: number = 1e-6
): { valid: boolean; maxDeviation: number; issues: string[] } {
  const issues: string[] = []
  let maxDeviation = 0
  const expectedRadiusSq = expectedRadius * expectedRadius
  const requiredDim = 2 * k

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    if (p.length < requiredDim) {
      issues.push(`Point ${i} has insufficient dimensions (${p.length} < ${requiredDim})`)
      continue
    }

    // Sum of squares of first 2k coordinates should equal R²
    let radiusSq = 0
    for (let j = 0; j < requiredDim; j++) {
      radiusSq += p[j]! * p[j]!
    }

    const deviation = Math.abs(radiusSq - expectedRadiusSq)
    maxDeviation = Math.max(maxDeviation, deviation)

    if (deviation > tolerance) {
      if (issues.length < 5) {
        issues.push(
          `Point ${i} deviates from S^${2 * k - 1}: ||x||² = ${radiusSq.toFixed(6)}, expected ${expectedRadiusSq.toFixed(6)}`
        )
      }
    }
  }

  if (issues.length >= 5) {
    issues.push('(and more...)')
  }

  return {
    valid: issues.length === 0,
    maxDeviation,
    issues,
  }
}

/**
 * Verifies that each circle in a generalized Clifford torus has equal radius
 *
 * For a proper Clifford torus, each |zₘ| = R/√k
 *
 * @param points - Array of points to verify
 * @param k - Torus dimension
 * @param expectedRadius - Overall radius scale
 * @param tolerance - Tolerance for numerical comparison (default 1e-6)
 * @returns Object with verification results
 */
export function verifyGeneralizedCliffordTorusCircleRadii(
  points: VectorND[],
  k: number,
  expectedRadius: number,
  tolerance: number = 1e-6
): { valid: boolean; maxDeviation: number; issues: string[] } {
  const issues: string[] = []
  let maxDeviation = 0
  const expectedCircleRadiusSq = (expectedRadius / Math.sqrt(k)) ** 2

  for (let i = 0; i < points.length; i++) {
    const p = points[i]!
    if (p.length < 2 * k) {
      issues.push(`Point ${i} has insufficient dimensions`)
      continue
    }

    // Check each circle's radius
    for (let m = 0; m < k; m++) {
      const x = p[2 * m]!
      const y = p[2 * m + 1]!
      const circleRadiusSq = x * x + y * y
      const deviation = Math.abs(circleRadiusSq - expectedCircleRadiusSq)
      maxDeviation = Math.max(maxDeviation, deviation)

      if (deviation > tolerance) {
        if (issues.length < 5) {
          issues.push(
            `Point ${i}, circle ${m + 1}: |z|² = ${circleRadiusSq.toFixed(6)}, expected ${expectedCircleRadiusSq.toFixed(6)}`
          )
        }
      }
    }
  }

  if (issues.length >= 5) {
    issues.push('(and more...)')
  }

  return {
    valid: issues.length === 0,
    maxDeviation,
    issues,
  }
}
