/**
 * Canonical 4x4 column-major matrix operations for WebGPU.
 *
 * All functions write into caller-provided output buffers (zero allocation).
 * This is the single source of truth for mat4 inversion and multiplication —
 * other modules delegate here via thin wrappers.
 *
 * @module rendering/webgpu/utils/mat4
 */

/** Scratch space for cofactor computation — avoids per-call allocation. */
const _invertCofactors = new Float32Array(16)

/**
 * Invert a column-major 4x4 matrix via Cramer's rule cofactor expansion.
 *
 * @param out - Pre-allocated 16-element output buffer (written on success only)
 * @param m - Input 16-element column-major matrix
 * @returns true if inversion succeeded, false if matrix is singular
 */
export function writeInvertMat4(out: Float32Array, m: Float32Array): boolean {
  const inv = _invertCofactors

  const m0 = m[0] ?? 0,
    m1 = m[1] ?? 0,
    m2 = m[2] ?? 0,
    m3 = m[3] ?? 0
  const m4 = m[4] ?? 0,
    m5 = m[5] ?? 0,
    m6 = m[6] ?? 0,
    m7 = m[7] ?? 0
  const m8 = m[8] ?? 0,
    m9 = m[9] ?? 0,
    m10 = m[10] ?? 0,
    m11 = m[11] ?? 0
  const m12 = m[12] ?? 0,
    m13 = m[13] ?? 0,
    m14 = m[14] ?? 0,
    m15 = m[15] ?? 0

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

  if (Math.abs(det) < 1e-10) return false

  const invDet = 1.0 / det
  for (let i = 0; i < 16; i++) {
    out[i] = inv[i]! * invDet
  }
  return true
}

/**
 * Multiply two column-major 4x4 matrices: out = a * b.
 *
 * @param out - Pre-allocated 16-element output buffer
 * @param a - Left matrix
 * @param b - Right matrix
 */
export function writeMultiplyMat4(out: Float32Array, a: Float32Array, b: Float32Array): void {
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) {
        sum += (a[row + k * 4] ?? 0) * (b[k + col * 4] ?? 0)
      }
      out[row + col * 4] = sum
    }
  }
}
