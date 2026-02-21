/**
 * Tests for animation-wasm.ts helper functions
 *
 * These are pure TypeScript functions that can be tested without WASM.
 */

import { describe, it, expect } from 'vitest'
import {
  matrixToFloat64,
  vectorToFloat64,
  float64ToVector,
  flattenVertices,
} from '@/lib/wasm/animation-wasm'

describe('animation-wasm helpers', () => {
  describe('matrixToFloat64', () => {
    it('converts Float32Array to Float64Array', () => {
      const input = new Float32Array([1, 2, 3, 4])
      const result = matrixToFloat64(input)

      expect(result).toBeInstanceOf(Float64Array)
      expect(result.length).toBe(4)
      expect(Array.from(result)).toEqual([1, 2, 3, 4])
    })

    it('handles empty matrix', () => {
      const input = new Float32Array([])
      const result = matrixToFloat64(input)

      expect(result).toBeInstanceOf(Float64Array)
      expect(result.length).toBe(0)
    })

    it('preserves precision for typical rotation values', () => {
      // cos(45deg) and sin(45deg)
      const cos45 = Math.cos(Math.PI / 4)
      const sin45 = Math.sin(Math.PI / 4)
      const input = new Float32Array([cos45, -sin45, sin45, cos45])
      const result = matrixToFloat64(input)

      // Float32 precision is about 6-7 digits
      expect(result[0]).toBeCloseTo(cos45, 5)
      expect(result[1]).toBeCloseTo(-sin45, 5)
    })
  })

  describe('vectorToFloat64', () => {
    it('converts number array to Float64Array', () => {
      const input = [1.5, 2.5, 3.5]
      const result = vectorToFloat64(input)

      expect(result).toBeInstanceOf(Float64Array)
      expect(result.length).toBe(3)
      expect(Array.from(result)).toEqual([1.5, 2.5, 3.5])
    })

    it('handles empty vector', () => {
      const result = vectorToFloat64([])

      expect(result).toBeInstanceOf(Float64Array)
      expect(result.length).toBe(0)
    })

    it('handles single element', () => {
      const result = vectorToFloat64([42])

      expect(result.length).toBe(1)
      expect(result[0]).toBe(42)
    })
  })

  describe('float64ToVector', () => {
    it('converts Float64Array to number array', () => {
      const input = new Float64Array([1.5, 2.5, 3.5])
      const result = float64ToVector(input)

      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual([1.5, 2.5, 3.5])
    })

    it('handles empty array', () => {
      const input = new Float64Array([])
      const result = float64ToVector(input)

      expect(result).toEqual([])
    })
  })

  describe('vectorToFloat64 / float64ToVector round-trip', () => {
    it('preserves vector values through conversion', () => {
      const original = [1.5, -2.7, 3.14159, 0, -0.001]
      const float64 = vectorToFloat64(original)
      const restored = float64ToVector(float64)

      expect(restored).toEqual(original)
    })

    it('handles high-dimensional vectors', () => {
      const original = Array.from({ length: 10 }, (_, i) => i * 0.1)
      const float64 = vectorToFloat64(original)
      const restored = float64ToVector(float64)

      expect(restored).toEqual(original)
    })
  })

  describe('flattenVertices', () => {
    it('returns empty Float64Array for empty input', () => {
      const result = flattenVertices([])

      expect(result).toBeInstanceOf(Float64Array)
      expect(result.length).toBe(0)
    })

    it('flattens single 3D vertex correctly', () => {
      const result = flattenVertices([[1, 2, 3]])

      expect(Array.from(result)).toEqual([1, 2, 3])
    })

    it('flattens multiple 3D vertices in row-major order', () => {
      const result = flattenVertices([
        [1, 2, 3],
        [4, 5, 6],
      ])

      expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6])
    })

    it('flattens 4D vertices correctly', () => {
      const result = flattenVertices([
        [1, 2, 3, 4],
        [5, 6, 7, 8],
      ])

      expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    })

    it('handles high-dimensional vertices (8D)', () => {
      const v8d = [1, 2, 3, 4, 5, 6, 7, 8]
      const result = flattenVertices([v8d])

      expect(result.length).toBe(8)
      expect(Array.from(result)).toEqual(v8d)
    })

    it('handles single 1D vertex', () => {
      const result = flattenVertices([[42]])

      expect(Array.from(result)).toEqual([42])
    })

    it('throws for ragged vertices with inconsistent dimensions', () => {
      expect(() =>
        flattenVertices([
          [1, 2, 3],
          [4, 5],
        ])
      ).toThrow('Vertex dimension mismatch')
    })

    it('throws for non-finite vertex coordinates', () => {
      expect(() =>
        flattenVertices([
          [1, 2, 3],
          [4, Number.NaN, 6],
        ])
      ).toThrow('Vertex coordinate must be finite')
    })
  })
})
