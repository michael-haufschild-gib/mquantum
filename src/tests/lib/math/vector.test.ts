/**
 * Tests for n-dimensional vector operations
 */

import { describe, it, expect } from 'vitest'
import {
  createVector,
  addVectors,
  subtractVectors,
  scaleVector,
  dotProduct,
  magnitude,
  normalize,
  vectorsEqual,
  copyVector,
  crossProduct3D,
  EPSILON,
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

    it('throws error for mismatched dimensions', () => {
      const a = [1, 2, 3]
      const b = [1, 2]
      expect(() => dotProduct(a, b)).toThrow()
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
