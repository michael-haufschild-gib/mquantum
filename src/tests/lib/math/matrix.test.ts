/**
 * Tests for n-dimensional matrix operations
 */

import {
  copyMatrix,
  createIdentityMatrix,
  createZeroMatrix,
  determinant,
  EPSILON,
  getMatrixDimensions,
  matricesEqual,
  multiplyMatrices,
  multiplyMatricesInto,
  multiplyMatrixVector,
  transposeMatrix,
} from '@/lib/math'
import { describe, expect, it } from 'vitest'
import { MatrixND } from '@/lib/math/types'

// Helper to create MatrixND from array of arrays
function mat(rows: number[][]): MatrixND {
  const flat = new Float32Array(rows.length * rows.length)
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < rows.length; j++) {
      flat[i * rows.length + j] = rows[i]![j]!
    }
  }
  return flat
}

// Helper to verify matrix against 2D array
function expectMatrix(m: MatrixND, expected: number[][]) {
  const dim = Math.sqrt(m.length)
  expect(dim).toBe(expected.length)
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      expect(m[i * dim + j]!).toBeCloseTo(expected[i]![j]!)
    }
  }
}

describe('Matrix Operations', () => {
  describe('createIdentityMatrix', () => {
    it('creates 3x3 identity matrix', () => {
      const I = createIdentityMatrix(3)
      expectMatrix(I, [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ])
    })

    it('creates 4x4 identity matrix', () => {
      const I = createIdentityMatrix(4)
      expectMatrix(I, [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ])
    })

    it('throws error for invalid dimension', () => {
      expect(() => createIdentityMatrix(0)).toThrow()
      expect(() => createIdentityMatrix(-1)).toThrow()
    })
  })

  describe('createZeroMatrix', () => {
    it('creates square zero matrix', () => {
      const Z = createZeroMatrix(3, 3)
      expectMatrix(Z, [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ])
    })
  })

  describe('multiplyMatrices', () => {
    it('multiplies identity by any matrix returns same matrix', () => {
      const I = createIdentityMatrix(3)
      const A = mat([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ])
      const result = multiplyMatrices(I, A)
      expectMatrix(result, [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ])
    })

    it('multiplies two 2x2 matrices', () => {
      const A = mat([
        [1, 2],
        [3, 4],
      ])
      const B = mat([
        [5, 6],
        [7, 8],
      ])
      const result = multiplyMatrices(A, B)
      // [1*5+2*7, 1*6+2*8]   [19, 22]
      // [3*5+4*7, 3*6+4*8] = [43, 50]
      expectMatrix(result, [
        [19, 22],
        [43, 50],
      ])
    })

    it('throws error for non-square matrices (unsupported in optimized version)', () => {
      // 2x3 matrices would flatten to length 6, which sqrt is 2.44 (not integer)
      const flat = new Float32Array(6)
      const flat2 = new Float32Array(6)
      expect(() => multiplyMatrices(flat, flat2)).toThrow()
    })
  })

  describe('multiplyMatricesInto', () => {
    it('multiplies identity by any matrix and writes to output', () => {
      const I = createIdentityMatrix(3)
      const A = mat([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ])
      const out = createZeroMatrix(3, 3)

      multiplyMatricesInto(out, I, A)

      expectMatrix(out, [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ])
    })

    it('multiplies two 2x2 matrices into output buffer', () => {
      const A = mat([
        [1, 2],
        [3, 4],
      ])
      const B = mat([
        [5, 6],
        [7, 8],
      ])
      const out = createZeroMatrix(2, 2)

      multiplyMatricesInto(out, A, B)

      expectMatrix(out, [
        [19, 22],
        [43, 50],
      ])
    })

    it('reuses output buffer correctly (multiple calls)', () => {
      const I = createIdentityMatrix(2)
      const A = mat([
        [1, 2],
        [3, 4],
      ])
      const B = mat([
        [5, 6],
        [7, 8],
      ])
      const out = createZeroMatrix(2, 2)

      // First multiplication
      multiplyMatricesInto(out, I, A)
      expectMatrix(out, [
        [1, 2],
        [3, 4],
      ])

      // Second multiplication with same buffer
      multiplyMatricesInto(out, A, B)
      expectMatrix(out, [
        [19, 22],
        [43, 50],
      ])
    })

    it('handles aliasing when out === a (first operand)', () => {
      const A = mat([
        [1, 2],
        [3, 4],
      ])
      const B = mat([
        [5, 6],
        [7, 8],
      ])

      // A is both input and output
      multiplyMatricesInto(A, A, B)

      // Should still compute correct result despite aliasing
      expectMatrix(A, [
        [19, 22],
        [43, 50],
      ])
    })

    it('handles aliasing when out === b (second operand)', () => {
      const A = mat([
        [1, 2],
        [3, 4],
      ])
      const B = mat([
        [5, 6],
        [7, 8],
      ])

      // B is both input and output
      multiplyMatricesInto(B, A, B)

      // Should still compute correct result despite aliasing
      expectMatrix(B, [
        [19, 22],
        [43, 50],
      ])
    })

    it('produces same result as multiplyMatrices', () => {
      const A = mat([
        [1, 2],
        [3, 4],
      ])
      const B = mat([
        [5, 6],
        [7, 8],
      ])

      const expectedResult = multiplyMatrices(A, B)
      const out = createZeroMatrix(2, 2)

      multiplyMatricesInto(out, A, B)

      expect(matricesEqual(out, expectedResult)).toBe(true)
    })
  })

  describe('multiplyMatrixVector', () => {
    it('multiplies identity matrix by vector returns same vector', () => {
      const I = createIdentityMatrix(3)
      const v = [1, 2, 3]
      const result = multiplyMatrixVector(I, v)
      // VectorND is number[], not Float32Array
      expect(result).toEqual([1, 2, 3])
    })

    it('multiplies matrix by vector', () => {
      const M = mat([
        [1, 2],
        [4, 5],
      ])
      const v = [7, 8]
      const result = multiplyMatrixVector(M, v)
      // [1*7+2*8, 4*7+5*8] = [23, 68]
      expect(result).toEqual([23, 68])
    })

    it('throws error for incompatible dimensions', () => {
      const M = mat([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ]) // 3x3
      const v = [1, 2] // 2
      expect(() => multiplyMatrixVector(M, v)).toThrow()
    })
  })

  describe('transposeMatrix', () => {
    it('transposes a square matrix', () => {
      const M = mat([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ])
      const T = transposeMatrix(M)
      expectMatrix(T, [
        [1, 4, 7],
        [2, 5, 8],
        [3, 6, 9],
      ])
    })

    it('transpose of transpose is original', () => {
      const M = mat([
        [1, 2],
        [3, 4],
      ])
      const T = transposeMatrix(transposeMatrix(M))
      expectMatrix(T, [
        [1, 2],
        [3, 4],
      ])
    })
  })

  describe('determinant', () => {
    it('computes determinant of 1x1 matrix', () => {
      const M = mat([[5]])
      expect(determinant(M)).toBe(5)
    })

    it('computes determinant of 2x2 matrix', () => {
      const M = mat([
        [1, 2],
        [3, 4],
      ])
      // det = 1*4 - 2*3 = 4 - 6 = -2
      expect(determinant(M)).toBe(-2)
    })

    it('computes determinant of 3x3 identity matrix', () => {
      const I = createIdentityMatrix(3)
      expect(determinant(I)).toBe(1)
    })

    it('computes determinant of 3x3 matrix', () => {
      const M = mat([
        [1, 2, 3],
        [0, 4, 5],
        [1, 0, 6],
      ])
      // det = 1*(4*6-5*0) - 2*(0*6-5*1) + 3*(0*0-4*1)
      //     = 1*24 - 2*(-5) + 3*(-4)
      //     = 24 + 10 - 12 = 22
      expect(determinant(M)).toBe(22)
    })

    it('determinant of singular matrix is zero', () => {
      const M = mat([
        [1, 2, 3],
        [2, 4, 6],
        [3, 6, 9],
      ])
      expect(Math.abs(determinant(M))).toBeLessThan(EPSILON)
    })
  })

  describe('matricesEqual', () => {
    it('returns true for equal matrices', () => {
      const A = mat([
        [1, 2],
        [3, 4],
      ])
      const B = mat([
        [1, 2],
        [3, 4],
      ])
      expect(matricesEqual(A, B)).toBe(true)
    })

    it('returns false for different matrices', () => {
      const A = mat([
        [1, 2],
        [3, 4],
      ])
      const B = mat([
        [1, 2],
        [3, 5],
      ])
      expect(matricesEqual(A, B)).toBe(false)
    })

    it('handles floating point comparison with epsilon', () => {
      const A = mat([
        [1.0, 2.0],
        [0, 1],
      ])
      const B = mat([
        [1.0 + EPSILON / 2, 2.0],
        [0, 1],
      ])
      expect(matricesEqual(A, B)).toBe(true)
    })
  })

  describe('copyMatrix', () => {
    it('creates an independent copy', () => {
      const original = mat([
        [1, 2],
        [3, 4],
      ])
      const copy = copyMatrix(original)

      expect(matricesEqual(copy, original)).toBe(true)
      expect(copy).not.toBe(original)

      copy[0] = 999
      expect(original[0]).toBe(1)
    })
  })

  describe('getMatrixDimensions', () => {
    it('returns dimensions of a matrix', () => {
      const M = mat([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ])
      expect(getMatrixDimensions(M)).toEqual([3, 3])
    })

    it('handles empty matrix', () => {
      expect(getMatrixDimensions(new Float32Array(0))).toEqual([0, 0])
    })
  })
})
