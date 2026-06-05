/**
 * Shared fast-check arbitraries for math property tests.
 *
 * Provides reusable arbitrary generators for vectors, matrices, angles,
 * and dimensions used across multiple property-based test suites.
 */

import fc from 'fast-check'

import type { MatrixND } from '@/lib/math/types'

/**
 * Arbitrary vector as `number[]` with finite, non-extreme components.
 * @param dim - Vector dimensionality
 * @param range - Symmetric component range [-range, range] (default 50)
 */
export function arbVector(dim: number, range = 50) {
  return fc.array(fc.double({ min: -range, max: range, noNaN: true, noDefaultInfinity: true }), {
    minLength: dim,
    maxLength: dim,
  })
}

/**
 * Non-zero vector (magnitude > `minMag`).
 * @param dim - Vector dimensionality
 * @param range - Symmetric component range (default 50)
 * @param minMag - Minimum magnitude threshold (default 0.01)
 */
export function arbNonZeroVector(dim: number, range = 50, minMag = 0.01) {
  return arbVector(dim, range).filter((v) => {
    let sum = 0
    for (const x of v) sum += x * x
    return sum > minMag * minMag
  })
}

/**
 * Arbitrary square matrix as `Float32Array` with finite components.
 * @param dim - Matrix dimension (produces dim×dim)
 * @param range - Symmetric component range [-range, range] (default 10)
 */
export function arbMatrix(dim: number, range = 10): fc.Arbitrary<MatrixND> {
  return fc
    .array(fc.double({ min: -range, max: range, noNaN: true, noDefaultInfinity: true }), {
      minLength: dim * dim,
      maxLength: dim * dim,
    })
    .map((arr) => Float32Array.from(arr))
}

/** Arbitrary angle in radians [-10π, 10π]. */
export const arbAngle = fc.double({
  min: -10 * Math.PI,
  max: 10 * Math.PI,
  noNaN: true,
  noDefaultInfinity: true,
})

/** Arbitrary dimension in the project's full supported range (2–11). */
export const arbDim = fc.integer({ min: 2, max: 11 })

/** Arbitrary scalar with finite, non-extreme values. */
export const arbScalar = fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true })
