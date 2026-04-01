/**
 * Tests for n-dimensional matrix operations
 */

import { describe, expect, it } from 'vitest'

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

    it('throws for non-square matrix lengths', () => {
      const a = new Float32Array(6)
      const b = new Float32Array(6)
      const out = new Float32Array(6)

      expect(() => multiplyMatricesInto(out, a, b)).toThrow('square')
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

    it('throws for non-square matrix lengths', () => {
      const nonSquare = new Float32Array(6)
      expect(() => transposeMatrix(nonSquare)).toThrow('square')
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

  describe('multiplyMatrices (5x5)', () => {
    it('multiplies two 5x5 identity matrices', () => {
      const I5 = createIdentityMatrix(5)
      const result = multiplyMatrices(I5, I5)
      expect(matricesEqual(result, I5)).toBe(true)
    })

    it('multiplies 5x5 matrix by identity returns same matrix', () => {
      const I5 = createIdentityMatrix(5)
      const M = new Float32Array(25)
      for (let i = 0; i < 25; i++) M[i] = i + 1
      const result = multiplyMatrices(I5, M)
      expect(matricesEqual(result, M)).toBe(true)
    })

    it('writes into out parameter when provided', () => {
      const a = mat([
        [1, 2],
        [3, 4],
      ])
      const b = mat([
        [5, 6],
        [7, 8],
      ])
      const out = new Float32Array(4)
      const result = multiplyMatrices(a, b, out)
      expect(result).toBe(out)
      expect(result[0]).toBeCloseTo(19, 5)
      expect(result[1]).toBeCloseTo(22, 5)
      expect(result[2]).toBeCloseTo(43, 5)
      expect(result[3]).toBeCloseTo(50, 5)
    })
  })

  describe('multiplyMatricesInto (5x5 generic path)', () => {
    it('multiplies 5x5 matrices via generic loop (not 4x4 unrolled)', () => {
      const I5 = createIdentityMatrix(5)
      const M = new Float32Array(25)
      for (let i = 0; i < 25; i++) M[i] = (i % 5) + 1
      const out = new Float32Array(25)
      multiplyMatricesInto(out, I5, M)
      expect(matricesEqual(out, M)).toBe(true)
    })

    it('handles aliasing for 5x5 (out === a)', () => {
      const a = createIdentityMatrix(5)
      const b = new Float32Array(25)
      for (let i = 0; i < 25; i++) b[i] = i
      multiplyMatricesInto(a, a, b)
      // I * b = b
      expect(matricesEqual(a, b)).toBe(true)
    })
  })

  describe('multiplyMatrixVector with out parameter', () => {
    it('writes into pre-allocated out array', () => {
      const M = mat([
        [1, 0],
        [0, 2],
      ])
      const v = [3, 4]
      const out = [0, 0]
      const result = multiplyMatrixVector(M, v, out)
      expect(result).toBe(out)
      expect(out).toEqual([3, 8])
    })
  })

  describe('algebraic identities', () => {
    it('det(A*B) = det(A) * det(B) for 2x2 matrices', () => {
      const A = mat([
        [1, 2],
        [3, 4],
      ])
      const B = mat([
        [5, 6],
        [7, 8],
      ])
      const AB = multiplyMatrices(A, B)
      expect(determinant(AB)).toBeCloseTo(determinant(A) * determinant(B), 2)
    })

    it('det(A*B) = det(A) * det(B) for 3x3 matrices', () => {
      const A = mat([
        [1, 2, 3],
        [0, 4, 5],
        [1, 0, 6],
      ])
      const B = mat([
        [2, 0, 1],
        [1, 3, 0],
        [0, 1, 2],
      ])
      const AB = multiplyMatrices(A, B)
      expect(determinant(AB)).toBeCloseTo(determinant(A) * determinant(B), 1)
    })

    it('transpose(A*B) = transpose(B) * transpose(A)', () => {
      const A = mat([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ])
      const B = mat([
        [9, 8, 7],
        [6, 5, 4],
        [3, 2, 1],
      ])
      const AB = multiplyMatrices(A, B)
      const lhs = transposeMatrix(AB)
      const rhs = multiplyMatrices(transposeMatrix(B), transposeMatrix(A))
      for (let i = 0; i < 9; i++) {
        expect(lhs[i]).toBeCloseTo(rhs[i]!, 3)
      }
    })

    it('(A*B)*v = A*(B*v) for matrix-vector multiplication', () => {
      const A = mat([
        [1, 2],
        [3, 4],
      ])
      const B = mat([
        [5, 6],
        [7, 8],
      ])
      const v = [1, 2]
      const AB = multiplyMatrices(A, B)
      const lhs = multiplyMatrixVector(AB, v)
      const Bv = multiplyMatrixVector(B, v)
      const rhs = multiplyMatrixVector(A, Bv)
      expect(lhs[0]).toBeCloseTo(rhs[0]!, 3)
      expect(lhs[1]).toBeCloseTo(rhs[1]!, 3)
    })

    it('det(I) = 1 for dimensions 2 through 6', () => {
      for (let dim = 2; dim <= 6; dim++) {
        const I = createIdentityMatrix(dim)
        expect(determinant(I)).toBeCloseTo(1, 10)
      }
    })

    it('4x4 unrolled path and 5x5 generic path match multiplyMatrices on dense inputs', () => {
      for (const dim of [4, 5]) {
        const A = new Float32Array(dim * dim)
        const B = new Float32Array(dim * dim)
        for (let i = 0; i < dim * dim; i++) {
          A[i] = (i % 7) - 3
          B[i] = ((i * 3) % 11) - 5
        }

        const expected = multiplyMatrices(A, B)
        const out = new Float32Array(dim * dim)
        multiplyMatricesInto(out, A, B)
        expect(matricesEqual(out, expected)).toBe(true)
      }
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

    it('throws for non-square matrix lengths', () => {
      expect(() => getMatrixDimensions(new Float32Array(6))).toThrow('square')
    })
  })
})
