/**
 * Shared types and utilities for raymarched renderers.
 *
 * These constants and types are shared across MandelbulbMesh, SchroedingerMesh,
 * QuaternionJuliaMesh, and other N-dimensional renderers to eliminate duplication.
 *
 * @module rendering/renderers/base/types
 */

import type { MatrixND } from '@/lib/math/types'

/** Maximum supported dimension for N-dimensional objects */
export const MAX_DIMENSION = 11

/** Debounce time in ms before restoring high quality after rotation stops */
export const QUALITY_RESTORE_DELAY_MS = 150

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

/**
 * State for tracking rotation changes and caching rotation matrices.
 * Used by useRotationUpdates hook.
 */
export interface RotationState {
  /** Version number of the rotation store (for change detection) */
  prevVersion: number
  /** Cached rotation matrix (recomputed when rotations change) */
  cachedMatrix: MatrixND | null
  /** Previous dimension (for detecting dimension changes) */
  prevDimension: number | null
  /** Previous parameter values (for detecting parameter changes) */
  prevParamValues: number[] | null
  /** Flag indicating basis vectors need recomputation */
  basisVectorsDirty: boolean
}

/**
 * State for tracking quality mode during user interactions.
 * Used by useQualityTracking hook.
 */
export interface QualityState {
  /** Whether fast mode is currently active */
  fastMode: boolean
  /** Timeout handle for restoring quality after interaction stops */
  restoreTimeout: ReturnType<typeof setTimeout> | null
  /** Previous rotation version for change detection */
  prevVersion: number
}
