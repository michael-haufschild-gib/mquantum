/**
 * Type definitions for n-dimensional geometry library
 */

/**
 * N-dimensional vector represented as an array of numbers
 */
export type VectorND = number[]

/**
 * N-dimensional matrix represented as a flat Float32Array (row-major)
 * access: m[row * dimension + col]
 */
export type MatrixND = Float32Array

/**
 * 3D vector with fixed dimensions [x, y, z]
 */
export type Vector3D = [number, number, number]

/**
 * Rotation plane defined by two axis indices
 */
export interface RotationPlane {
  indices: [number, number]
  name: string
}

/**
 * Error epsilon for floating point comparisons.
 * 1e-7 is appropriate for accumulated errors in matrix operations
 * (determinant checks, orthogonality, etc.)
 */
export const EPSILON = 1e-7
