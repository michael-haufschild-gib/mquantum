/**
 * Shared types and utilities for N-dimensional rotation application.
 *
 * Constants and types used by the Schroedinger renderer and its N-dimensional
 * rotation/basis-vector computations.
 *
 * @module lib/math/rotationApply
 */

import { MAX_DIMENSION } from '@/constants/dimension'
import type { MatrixND } from '@/lib/math/types'

/**
 * Pre-allocated working arrays to avoid per-frame allocations.
 * All arrays are sized to MAX_DIMENSION to handle any dimension without reallocation.
 */
export interface WorkingArrays {
  /** Unit vector along X axis (input) */
  unitX: number[]
  /** Unit vector along Y axis (input) */
  unitY: number[]
  /** Unit vector along Z axis (input) */
  unitZ: number[]
  /** Origin point in N-dimensional space (input) */
  origin: number[]
  /** Rotated X basis vector (output) */
  rotatedX: Float32Array
  /** Rotated Y basis vector (output) */
  rotatedY: Float32Array
  /** Rotated Z basis vector (output) */
  rotatedZ: Float32Array
  /** Rotated origin (output) */
  rotatedOrigin: Float32Array
}

/**
 * Create pre-allocated working arrays for rotation calculations.
 * All arrays sized to MAX_DIMENSION to handle any dimension without reallocation.
 * @returns Pre-allocated working arrays for basis vector computations
 */
export function createWorkingArrays(): WorkingArrays {
  return {
    unitX: new Array(MAX_DIMENSION).fill(0),
    unitY: new Array(MAX_DIMENSION).fill(0),
    unitZ: new Array(MAX_DIMENSION).fill(0),
    origin: new Array(MAX_DIMENSION).fill(0),
    rotatedX: new Float32Array(MAX_DIMENSION),
    rotatedY: new Float32Array(MAX_DIMENSION),
    rotatedZ: new Float32Array(MAX_DIMENSION),
    rotatedOrigin: new Float32Array(MAX_DIMENSION),
  }
}

/**
 * Apply D-dimensional rotation matrix to a vector, writing result into pre-allocated output.
 * Matrix is row-major: result[i] = sum(matrix[i * dimension + j] * vec[j])
 *
 * @param matrix - D×D rotation matrix (flat array, row-major)
 * @param vec - Input vector (length D)
 * @param out - Pre-allocated output Float32Array (length MAX_DIMENSION)
 * @param dimension - Current dimension (optimization: only loop up to this)
 */
export function applyRotationInPlace(
  matrix: MatrixND,
  vec: number[] | Float32Array,
  out: Float32Array,
  dimension: number
): void {
  // Clear output first (only needed if we assume clean buffer beyond D)
  out.fill(0)

  for (let i = 0; i < dimension; i++) {
    let sum = 0
    const rowOffset = i * dimension
    for (let j = 0; j < dimension; j++) {
      sum += (matrix[rowOffset + j] ?? 0) * (vec[j] ?? 0)
    }
    out[i] = sum
  }
}
