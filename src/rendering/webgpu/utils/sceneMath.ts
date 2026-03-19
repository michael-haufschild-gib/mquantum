/**
 * Scene-level matrix utilities for gizmo hit testing and camera projection.
 *
 * Delegates to {@link @/rendering/webgpu/utils/mat4} for core mat4 operations.
 * No WebGPU dependencies.
 *
 * @module rendering/webgpu/utils/sceneMath
 */

import { writeInvertMat4, writeMultiplyMat4 } from './mat4'

/**
 * Multiply two column-major 4x4 matrices.
 * @param a - Left matrix
 * @param b - Right matrix
 * @returns Result matrix a*b
 */
export function multiplyMat4(a: Float32Array, b: Float32Array): Float32Array {
  const r = new Float32Array(16)
  writeMultiplyMat4(r, a, b)
  return r
}

/**
 * Invert a column-major 4x4 matrix.
 * @param m - Input matrix
 * @returns Inverted matrix, or null if singular
 */
export function invertMat4(m: Float32Array): Float32Array | null {
  const out = new Float32Array(16)
  return writeInvertMat4(out, m) ? out : null
}

/**
 * Transform a 3D point by a column-major 4x4 matrix (perspective divide).
 * @param m - Transformation matrix
 * @param p - 3D point
 * @returns Transformed point
 */
export function transformPoint(
  m: Float32Array,
  p: [number, number, number]
): [number, number, number] {
  const x = m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!
  const y = m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!
  const z = m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!
  const w = m[3]! * p[0] + m[7]! * p[1] + m[11]! * p[2] + m[15]!
  const invW = w !== 0 ? 1 / w : 1
  return [x * invW, y * invW, z * invW]
}
