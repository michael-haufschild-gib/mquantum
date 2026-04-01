/**
 * Tests for n-dimensional vector operations
 */

import { describe, expect, it } from 'vitest'

import {
  addVectors,
  copyVector,
  createVector,
  crossProduct3D,
  dotProduct,
  EPSILON,
  magnitude,
  normalize,
  scaleVector,
  subtractVectors,
  vectorsEqual,
} from '@/lib/math'

describe('Vector Operations', () => {
  describe('createVector', () => {
    it('creates a vector of specified dimension with default fill', () => {
      const v = createVector(4)
      expect(v).toEqual([0, 0, 0, 0])
    })

    it('creates a vector with custom fill value', () => {
      const v = createVector(3, 5)
      expect(v).toEqual([5, 5, 5])
    })

    it('throws error for invalid dimension', () => {
      expect(() => createVector(0)).toThrow()
      expect(() => createVector(-1)).toThrow()
      expect(() => createVector(2.5)).toThrow()
    })
  })

  describe('addVectors', () => {
    it('adds two vectors element-wise', () => {
      const a = [1, 2, 3]
      const b = [4, 5, 6]
      const result = addVectors(a, b)
      expect(result).toEqual([5, 7, 9])
    })

    it('works with negative numbers', () => {
      const a = [1, -2, 3]
      const b = [-4, 5, -6]
      const result = addVectors(a, b)
      expect(result).toEqual([-3, 3, -3])
    })

    it('works with higher dimensions', () => {
      const a = [1, 2, 3, 4, 5]
      const b = [5, 4, 3, 2, 1]
      const result = addVectors(a, b)
      expect(result).toEqual([6, 6, 6, 6, 6])
    })

    it('writes into out parameter when provided', () => {
      const a = [1, 2, 3]
      const b = [4, 5, 6]
      const out = [0, 0, 0]
      const result = addVectors(a, b, out)
      expect(result).toBe(out)
      expect(out).toEqual([5, 7, 9])
    })

    it('throws error for mismatched dimensions', () => {
      const a = [1, 2, 3]
      const b = [1, 2]
      expect(() => addVectors(a, b)).toThrow()
    })
  })

  describe('subtractVectors', () => {
    it('subtracts vectors element-wise', () => {
      const a = [5, 7, 9]
      const b = [1, 2, 3]
      const result = subtractVectors(a, b)
      expect(result).toEqual([4, 5, 6])
    })

    it('works with negative numbers', () => {
      const a = [1, -2, 3]
      const b = [-4, 5, -6]
      const result = subtractVectors(a, b)
      expect(result).toEqual([5, -7, 9])
    })

    it('writes into out parameter when provided', () => {
      const a = [10, 20, 30]
      const b = [1, 2, 3]
      const out = [0, 0, 0]
      const result = subtractVectors(a, b, out)
      expect(result).toBe(out)
      expect(out).toEqual([9, 18, 27])
    })

    it('throws error for mismatched dimensions', () => {
      const a = [1, 2, 3]
      const b = [1, 2]
      expect(() => subtractVectors(a, b)).toThrow()
    })
  })

  describe('scaleVector', () => {
    it('scales vector by positive scalar', () => {
      const v = [1, 2, 3]
      const result = scaleVector(v, 2)
      expect(result).toEqual([2, 4, 6])
    })

    it('scales vector by negative scalar', () => {
      const v = [1, 2, 3]
      const result = scaleVector(v, -1)
      expect(result).toEqual([-1, -2, -3])
    })

    it('scales vector by fractional scalar', () => {
      const v = [2, 4, 6]
      const result = scaleVector(v, 0.5)
      expect(result).toEqual([1, 2, 3])
    })

    it('scaling by zero gives zero vector', () => {
      const v = [1, 2, 3]
      const result = scaleVector(v, 0)
      expect(result).toEqual([0, 0, 0])
    })

    it('writes into out parameter when provided', () => {
      const v = [2, 4, 6]
      const out = [0, 0, 0]
      const result = scaleVector(v, 3, out)
      expect(result).toBe(out)
      expect(out).toEqual([6, 12, 18])
    })
  })

  describe('dotProduct', () => {
    it('computes dot product of parallel vectors', () => {
      const a = [1, 0, 0]
      const b = [2, 0, 0]
      expect(dotProduct(a, b)).toBe(2)
    })

    it('computes dot product of perpendicular vectors', () => {
      const a = [1, 0, 0]
      const b = [0, 1, 0]
      expect(dotProduct(a, b)).toBe(0)
    })

    it('computes dot product of arbitrary vectors', () => {
      const a = [1, 2, 3]
      const b = [4, 5, 6]
      // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
      expect(dotProduct(a, b)).toBe(32)
    })

    it('works with higher dimensions', () => {
      const a = [1, 2, 3, 4]
      const b = [5, 6, 7, 8]
      // 1*5 + 2*6 + 3*7 + 4*8 = 5 + 12 + 21 + 32 = 70
      expect(dotProduct(a, b)).toBe(70)
    })

    it('dot product of orthogonal 11D vectors is zero', () => {
      const a = new Array(11).fill(0)
      const b = new Array(11).fill(0)
      a[0] = 1
      b[1] = 1
      expect(dotProduct(a, b)).toBe(0)
    })

    it('dot product with self equals magnitude squared', () => {
      const v = [1, 2, 3, 4, 5]
      const magSq = dotProduct(v, v)
      expect(magSq).toBeCloseTo(magnitude(v) ** 2, 10)
    })

    it('Cauchy-Schwarz inequality: |a·b| ≤ |a|·|b|', () => {
      const testCases = [
        { a: [1, 2, 3], b: [4, 5, 6] },
        { a: [1, 0, 0], b: [0, 1, 0] },
        { a: [3, -2, 7, 1], b: [-1, 4, 2, -3] },
        { a: [1, 1, 1, 1, 1], b: [2, 2, 2, 2, 2] },
      ]
      for (const { a, b } of testCases) {
        expect(Math.abs(dotProduct(a, b))).toBeLessThanOrEqual(magnitude(a) * magnitude(b) + 1e-10)
      }
    })

    it('is commutative: a·b = b·a', () => {
      const a = [1.5, -2.3, 4.7]
      const b = [3.1, 0.8, -1.2]
      expect(dotProduct(a, b)).toBeCloseTo(dotProduct(b, a), 10)
    })

    it('is distributive: a·(b+c) = a·b + a·c', () => {
      const a = [1, 2, 3]
      const b = [4, 5, 6]
      const c = [7, -1, 2]
      const bPlusC = addVectors(b, c)
      expect(dotProduct(a, bPlusC)).toBeCloseTo(dotProduct(a, b) + dotProduct(a, c), 8)
    })

    it('throws error for mismatched dimensions', () => {
      const a = [1, 2, 3]
      const b = [1, 2]
      expect(() => dotProduct(a, b)).toThrow()
    })
  })

  describe('algebraic identities', () => {
    it('triangle inequality: |a+b| ≤ |a| + |b|', () => {
      const testCases = [
        { a: [1, 2, 3], b: [4, 5, 6] },
        { a: [1, 0, 0], b: [-1, 0, 0] },
        { a: [3, -2, 7, 1], b: [-1, 4, 2, -3] },
      ]
      for (const { a, b } of testCases) {
        const sum = addVectors(a, b)
        expect(magnitude(sum)).toBeLessThanOrEqual(magnitude(a) + magnitude(b) + 1e-10)
      }
    })

    it('scaling preserves direction: normalize(k*v) = ±normalize(v) for k≠0', () => {
      const v = [3, -1, 4, 2]
      const n1 = normalize(v)
      const n2 = normalize(scaleVector(v, 7.5))
      const n3 = normalize(scaleVector(v, -3))
      for (let i = 0; i < 4; i++) {
        expect(n2[i]).toBeCloseTo(n1[i]!, 10)
        expect(n3[i]).toBeCloseTo(-n1[i]!, 10)
      }
    })

    it('|a - b|² = |a|² + |b|² - 2(a·b) (polarization identity)', () => {
      const a = [2, 3, -1, 5]
      const b = [1, -2, 4, 0]
      const diff = subtractVectors(a, b)
      const lhs = dotProduct(diff, diff)
      const rhs = dotProduct(a, a) + dotProduct(b, b) - 2 * dotProduct(a, b)
      expect(lhs).toBeCloseTo(rhs, 8)
    })
  })

  describe('magnitude', () => {
    it('computes magnitude of unit vectors', () => {
      expect(magnitude([1, 0, 0])).toBe(1)
      expect(magnitude([0, 1, 0])).toBe(1)
      expect(magnitude([0, 0, 1])).toBe(1)
    })

    it('computes magnitude of zero vector', () => {
      expect(magnitude([0, 0, 0])).toBe(0)
    })

    it('computes magnitude of arbitrary vector', () => {
      const v = [3, 4, 0]
      // √(9 + 16) = √25 = 5
      expect(magnitude(v)).toBe(5)
    })

    it('computes magnitude in higher dimensions', () => {
      const v = [1, 2, 2]
      // √(1 + 4 + 4) = √9 = 3
      expect(magnitude(v)).toBe(3)
    })

    it('computes magnitude of 4D vector', () => {
      const v = [2, 3, 6, 0]
      // √(4 + 9 + 36) = √49 = 7
      expect(magnitude(v)).toBe(7)
    })

    it('computes magnitude of 11D unit-like vector', () => {
      // All components = 1/√11 → magnitude should be 1
      const val = 1 / Math.sqrt(11)
      const v = new Array(11).fill(val)
      expect(magnitude(v)).toBeCloseTo(1, 10)
    })
  })

  describe('normalize', () => {
    it('normalizes a vector to unit length', () => {
      const v = [3, 4, 0]
      const normalized = normalize(v)
      expect(normalized[0]).toBeCloseTo(0.6, 10)
      expect(normalized[1]).toBeCloseTo(0.8, 10)
      expect(normalized[2]).toBeCloseTo(0, 10)
      expect(magnitude(normalized)).toBeCloseTo(1, 10)
    })

    it('normalizing unit vector returns unit vector', () => {
      const v = [1, 0, 0]
      const normalized = normalize(v)
      expect(normalized).toEqual([1, 0, 0])
    })

    it('throws error for zero vector', () => {
      const v = [0, 0, 0]
      expect(() => normalize(v)).toThrow()
    })

    it('works with higher dimensions', () => {
      const v = [1, 1, 1, 1]
      const normalized = normalize(v)
      const expected = 1 / Math.sqrt(4)
      expect(normalized[0]).toBeCloseTo(expected, 10)
      expect(normalized[1]).toBeCloseTo(expected, 10)
      expect(normalized[2]).toBeCloseTo(expected, 10)
      expect(normalized[3]).toBeCloseTo(expected, 10)
      expect(magnitude(normalized)).toBeCloseTo(1, 10)
    })

    it('writes into out parameter when provided', () => {
      const v = [0, 3, 4]
      const out = [0, 0, 0]
      const result = normalize(v, out)
      expect(result).toBe(out)
      expect(magnitude(out)).toBeCloseTo(1, 10)
      expect(out[0]).toBeCloseTo(0, 10)
      expect(out[1]).toBeCloseTo(0.6, 10)
      expect(out[2]).toBeCloseTo(0.8, 10)
    })

    it('normalizes 11D vector to unit length', () => {
      const v = Array.from({ length: 11 }, (_, i) => i + 1)
      const normalized = normalize(v)
      expect(magnitude(normalized)).toBeCloseTo(1, 10)
      expect(normalized).toHaveLength(11)
    })
  })

  describe('vectorsEqual', () => {
    it('returns true for equal vectors', () => {
      const a = [1, 2, 3]
      const b = [1, 2, 3]
      expect(vectorsEqual(a, b)).toBe(true)
    })

    it('returns false for different vectors', () => {
      const a = [1, 2, 3]
      const b = [1, 2, 4]
      expect(vectorsEqual(a, b)).toBe(false)
    })

    it('returns false for different dimensions', () => {
      const a = [1, 2, 3]
      const b = [1, 2]
      expect(vectorsEqual(a, b)).toBe(false)
    })

    it('handles floating point comparison with epsilon', () => {
      const a = [1.0, 2.0, 3.0]
      const b = [1.0 + EPSILON / 2, 2.0, 3.0]
      expect(vectorsEqual(a, b)).toBe(true)

      const c = [1.0 + EPSILON * 2, 2.0, 3.0]
      expect(vectorsEqual(a, c)).toBe(false)
    })

    it('uses custom epsilon when provided', () => {
      const a = [1.0, 2.0]
      const b = [1.05, 2.0]
      expect(vectorsEqual(a, b, 0.1)).toBe(true)
      expect(vectorsEqual(a, b, 0.01)).toBe(false)
    })
  })

  describe('copyVector', () => {
    it('creates an independent copy', () => {
      const original = [1, 2, 3]
      const copy = copyVector(original)

      expect(copy).toEqual(original)
      expect(copy).not.toBe(original)

      copy[0] = 999
      expect(original[0]).toBe(1)
    })

    it('writes into out parameter when provided', () => {
      const original = [7, 8, 9]
      const out = [0, 0, 0]
      const result = copyVector(original, out)
      expect(result).toBe(out)
      expect(out).toEqual([7, 8, 9])
    })
  })

  describe('crossProduct3D', () => {
    it('computes cross product of standard basis vectors', () => {
      // i × j = k
      expect(crossProduct3D([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1])
      // j × k = i
      expect(crossProduct3D([0, 1, 0], [0, 0, 1])).toEqual([1, 0, 0])
      // k × i = j
      expect(crossProduct3D([0, 0, 1], [1, 0, 0])).toEqual([0, 1, 0])
    })

    it('is anti-commutative (a × b = -(b × a))', () => {
      const a = [1, 2, 3]
      const b = [4, 5, 6]
      const axb = crossProduct3D(a, b)
      const bxa = crossProduct3D(b, a)

      expect(axb[0]).toBeCloseTo(-bxa[0]!, 10)
      expect(axb[1]).toBeCloseTo(-bxa[1]!, 10)
      expect(axb[2]).toBeCloseTo(-bxa[2]!, 10)
    })

    it('returns zero for parallel vectors', () => {
      const a = [1, 2, 3]
      const b = [2, 4, 6] // 2 * a
      const result = crossProduct3D(a, b)

      expect(result[0]).toBeCloseTo(0, 10)
      expect(result[1]).toBeCloseTo(0, 10)
      expect(result[2]).toBeCloseTo(0, 10)
    })

    it('result is perpendicular to both input vectors', () => {
      const a = [1, 2, 3]
      const b = [4, 5, 6]
      const result = crossProduct3D(a, b)

      // Dot product with either input should be 0
      expect(dotProduct(result, a)).toBeCloseTo(0, 10)
      expect(dotProduct(result, b)).toBeCloseTo(0, 10)
    })

    it('computes correct magnitude (|a × b| = |a||b|sin(θ))', () => {
      // For perpendicular unit vectors, |a × b| = 1
      const a = [1, 0, 0]
      const b = [0, 1, 0]
      const result = crossProduct3D(a, b)
      expect(magnitude(result)).toBeCloseTo(1, 10)
    })

    it('|a × b|² = |a|²|b|² - (a·b)² (Lagrange identity)', () => {
      const a = [1, 2, 3]
      const b = [4, -1, 2]
      const cross = crossProduct3D(a, b)
      const crossMagSq = dotProduct(cross, cross)
      const aMagSq = dotProduct(a, a)
      const bMagSq = dotProduct(b, b)
      const ab = dotProduct(a, b)
      expect(crossMagSq).toBeCloseTo(aMagSq * bMagSq - ab * ab, 8)
    })

    it('throws error for non-3D vectors in DEV mode', () => {
      expect(() => crossProduct3D([1, 2], [3, 4])).toThrow()
      expect(() => crossProduct3D([1, 2, 3, 4], [5, 6, 7, 8])).toThrow()
    })

    it('uses out parameter when provided', () => {
      const a = [1, 0, 0]
      const b = [0, 1, 0]
      const out = [0, 0, 0]
      const result = crossProduct3D(a, b, out)

      expect(result).toBe(out)
      expect(out).toEqual([0, 0, 1])
    })
  })
})
