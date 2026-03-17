/**
 * Pure mat4 math utilities for scene-level calculations.
 *
 * Used by gizmo hit testing and camera projection. No WebGPU dependencies.
 *
 * @module rendering/webgpu/utils/sceneMath
 */

/**
 * Multiply two column-major 4x4 matrices.
 * @param a - Left matrix
 * @param b - Right matrix
 * @returns Result matrix a*b
 */
export function multiplyMat4(a: Float32Array, b: Float32Array): Float32Array {
  const r = new Float32Array(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) {
        sum += (a[row + k * 4] ?? 0) * (b[k + col * 4] ?? 0)
      }
      r[row + col * 4] = sum
    }
  }
  return r
}

/**
 * Invert a column-major 4x4 matrix.
 * @param m - Input matrix
 * @returns Inverted matrix, or null if singular
 */
export function invertMat4(m: Float32Array): Float32Array | null {
  const inv = new Float32Array(16)
  const m0 = m[0]!,
    m1 = m[1]!,
    m2 = m[2]!,
    m3 = m[3]!
  const m4 = m[4]!,
    m5 = m[5]!,
    m6 = m[6]!,
    m7 = m[7]!
  const m8 = m[8]!,
    m9 = m[9]!,
    m10 = m[10]!,
    m11 = m[11]!
  const m12 = m[12]!,
    m13 = m[13]!,
    m14 = m[14]!,
    m15 = m[15]!

  inv[0] =
    m5 * m10 * m15 -
    m5 * m11 * m14 -
    m9 * m6 * m15 +
    m9 * m7 * m14 +
    m13 * m6 * m11 -
    m13 * m7 * m10
  inv[4] =
    -m4 * m10 * m15 +
    m4 * m11 * m14 +
    m8 * m6 * m15 -
    m8 * m7 * m14 -
    m12 * m6 * m11 +
    m12 * m7 * m10
  inv[8] =
    m4 * m9 * m15 - m4 * m11 * m13 - m8 * m5 * m15 + m8 * m7 * m13 + m12 * m5 * m11 - m12 * m7 * m9
  inv[12] =
    -m4 * m9 * m14 + m4 * m10 * m13 + m8 * m5 * m14 - m8 * m6 * m13 - m12 * m5 * m10 + m12 * m6 * m9
  inv[1] =
    -m1 * m10 * m15 +
    m1 * m11 * m14 +
    m9 * m2 * m15 -
    m9 * m3 * m14 -
    m13 * m2 * m11 +
    m13 * m3 * m10
  inv[5] =
    m0 * m10 * m15 -
    m0 * m11 * m14 -
    m8 * m2 * m15 +
    m8 * m3 * m14 +
    m12 * m2 * m11 -
    m12 * m3 * m10
  inv[9] =
    -m0 * m9 * m15 + m0 * m11 * m13 + m8 * m1 * m15 - m8 * m3 * m13 - m12 * m1 * m11 + m12 * m3 * m9
  inv[13] =
    m0 * m9 * m14 - m0 * m10 * m13 - m8 * m1 * m14 + m8 * m2 * m13 + m12 * m1 * m10 - m12 * m2 * m9
  inv[2] =
    m1 * m6 * m15 - m1 * m7 * m14 - m5 * m2 * m15 + m5 * m3 * m14 + m13 * m2 * m7 - m13 * m3 * m6
  inv[6] =
    -m0 * m6 * m15 + m0 * m7 * m14 + m4 * m2 * m15 - m4 * m3 * m14 - m12 * m2 * m7 + m12 * m3 * m6
  inv[10] =
    m0 * m5 * m15 - m0 * m7 * m13 - m4 * m1 * m15 + m4 * m3 * m13 + m12 * m1 * m7 - m12 * m3 * m5
  inv[14] =
    -m0 * m5 * m14 + m0 * m6 * m13 + m4 * m1 * m14 - m4 * m2 * m13 - m12 * m1 * m6 + m12 * m2 * m5
  inv[3] =
    -m1 * m6 * m11 + m1 * m7 * m10 + m5 * m2 * m11 - m5 * m3 * m10 - m9 * m2 * m7 + m9 * m3 * m6
  inv[7] =
    m0 * m6 * m11 - m0 * m7 * m10 - m4 * m2 * m11 + m4 * m3 * m10 + m8 * m2 * m7 - m8 * m3 * m6
  inv[11] =
    -m0 * m5 * m11 + m0 * m7 * m9 + m4 * m1 * m11 - m4 * m3 * m9 - m8 * m1 * m7 + m8 * m3 * m5
  inv[15] =
    m0 * m5 * m10 - m0 * m6 * m9 - m4 * m1 * m10 + m4 * m2 * m9 + m8 * m1 * m6 - m8 * m2 * m5

  const det = m0 * inv[0]! + m1 * inv[4]! + m2 * inv[8]! + m3 * inv[12]!
  if (Math.abs(det) < 1e-10) return null

  const invDet = 1.0 / det
  const result = new Float32Array(16)
  for (let i = 0; i < 16; i++) result[i] = inv[i]! * invDet
  return result
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
