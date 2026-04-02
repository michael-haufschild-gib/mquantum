import { describe, expect, it } from 'vitest'

import { writeInvertMat4, writeMultiplyMat4 } from '@/rendering/webgpu/utils/mat4'

/**
 * Identity matrix (column-major): diag(1,1,1,1).
 */
function identity(): Float32Array {
  // prettier-ignore
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ])
}

/**
 * Known invertible matrix (a simple 3D translation + uniform scale of 2).
 *
 * Scale 2 + translate (3, 5, 7):
 *   [2 0 0 3]      column-major: [2,0,0,0, 0,2,0,0, 0,0,2,0, 3,5,7,1]
 *   [0 2 0 5]
 *   [0 0 2 7]
 *   [0 0 0 1]
 *
 * Inverse: scale 0.5 + translate (-1.5, -2.5, -3.5)
 *   [0.5  0   0  -1.5]
 *   [ 0  0.5  0  -2.5]
 *   [ 0   0  0.5 -3.5]
 *   [ 0   0   0    1 ]
 */
function scaleTranslate(): Float32Array {
  // prettier-ignore
  return new Float32Array([
    2, 0, 0, 0,
    0, 2, 0, 0,
    0, 0, 2, 0,
    3, 5, 7, 1,
  ])
}

function scaleTranslateInverse(): Float32Array {
  // prettier-ignore
  return new Float32Array([
    0.5, 0,   0,   0,
    0,   0.5, 0,   0,
    0,   0,   0.5, 0,
    -1.5, -2.5, -3.5, 1,
  ])
}

/** Assert two Float32Arrays are element-wise close within absolute tolerance. */
function expectClose(actual: Float32Array, expected: Float32Array, tolerance = 1e-6): void {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < actual.length; i++) {
    expect(Math.abs(actual[i]! - expected[i]!)).toBeLessThan(tolerance)
  }
}

describe('writeInvertMat4', () => {
  it('inverts the identity matrix to itself', () => {
    const out = new Float32Array(16)
    const ok = writeInvertMat4(out, identity())
    expect(ok).toBe(true)
    expectClose(out, identity())
  })

  it('inverts a known scale+translate matrix correctly', () => {
    const out = new Float32Array(16)
    const ok = writeInvertMat4(out, scaleTranslate())
    expect(ok).toBe(true)
    expectClose(out, scaleTranslateInverse())
  })

  it('inverse × original = identity (round-trip)', () => {
    const m = scaleTranslate()
    const inv = new Float32Array(16)
    const ok = writeInvertMat4(inv, m)
    expect(ok).toBe(true)

    const product = new Float32Array(16)
    writeMultiplyMat4(product, m, inv)
    expectClose(product, identity())
  })

  it('returns false for a singular (all-zero) matrix', () => {
    const out = new Float32Array(16)
    const ok = writeInvertMat4(out, new Float32Array(16))
    expect(ok).toBe(false)
  })

  it('returns false for a rank-deficient matrix', () => {
    // Zero column makes the matrix singular (rank-deficient)
    // prettier-ignore
    const singular = new Float32Array([
      1, 0, 0, 0,
      0, 0, 0, 0,  // zero column
      0, 0, 1, 0,
      0, 0, 0, 1,
    ])
    const out = new Float32Array(16)
    const ok = writeInvertMat4(out, singular)
    expect(ok).toBe(false)
  })

  it('does not write to output when inversion fails', () => {
    const out = new Float32Array(16).fill(42)
    writeInvertMat4(out, new Float32Array(16))
    // Output should be unchanged (still 42s) since inversion failed
    for (let i = 0; i < 16; i++) {
      expect(out[i]).toBe(42)
    }
  })
})

describe('writeMultiplyMat4', () => {
  it('multiplying by identity returns the original', () => {
    const m = scaleTranslate()
    const out = new Float32Array(16)
    writeMultiplyMat4(out, m, identity())
    expectClose(out, m)
  })

  it('identity × matrix = matrix', () => {
    const m = scaleTranslate()
    const out = new Float32Array(16)
    writeMultiplyMat4(out, identity(), m)
    expectClose(out, m)
  })

  it('matrix × inverse = identity', () => {
    const out = new Float32Array(16)
    writeMultiplyMat4(out, scaleTranslate(), scaleTranslateInverse())
    expectClose(out, identity())
  })

  it('multiplication is not commutative for general matrices', () => {
    // Two different non-commutative matrices
    // prettier-ignore
    const a = new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      1, 2, 3, 1,
    ])
    // prettier-ignore
    const b = new Float32Array([
      2, 0, 0, 0,
      0, 3, 0, 0,
      0, 0, 4, 0,
      0, 0, 0, 1,
    ])
    const ab = new Float32Array(16)
    const ba = new Float32Array(16)
    writeMultiplyMat4(ab, a, b)
    writeMultiplyMat4(ba, b, a)

    // At least one element should differ
    let differs = false
    for (let i = 0; i < 16; i++) {
      if (Math.abs(ab[i]! - ba[i]!) > 1e-6) {
        differs = true
        break
      }
    }
    expect(differs).toBe(true)
  })

  it('multiplying by zero matrix gives zero', () => {
    const out = new Float32Array(16)
    writeMultiplyMat4(out, scaleTranslate(), new Float32Array(16))
    for (let i = 0; i < 16; i++) {
      expect(out[i]).toBe(0)
    }
  })
})
