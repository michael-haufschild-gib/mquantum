/**
 * Tests for n-dimensional projection operations
 */

import {
  calculateDepth,
  calculateProjectionDistance,
  DEFAULT_PROJECTION_DISTANCE,
  projectPerspective,
  projectVertices,
  projectVerticesToPositions,
  sortByDepth,
} from '@/lib/math'
import { describe, expect, it } from 'vitest'

describe('Projection Operations', () => {
  describe('projectPerspective', () => {
    it('applies consistent perspective scaling to 3D vector', () => {
      const v = [1, 2, 3]
      const d = 4
      // For 3D: effectiveDepth = 0, denominator = 4, scale = 1/4
      const projected = projectPerspective(v, d)
      expect(projected[0]).toBeCloseTo(0.25, 10)
      expect(projected[1]).toBeCloseTo(0.5, 10)
      expect(projected[2]).toBeCloseTo(0.75, 10)
    })

    it('projects 4D point with w=0 correctly', () => {
      const v = [1, 2, 3, 0]
      const d = 4
      // denominator = 4 - 0 = 4, scale = 1/4
      const projected = projectPerspective(v, d)
      expect(projected[0]).toBeCloseTo(0.25, 10)
      expect(projected[1]).toBeCloseTo(0.5, 10)
      expect(projected[2]).toBeCloseTo(0.75, 10)
    })

    it('projects 4D point with positive w correctly', () => {
      const v = [2, 4, 6, 1]
      const d = 4
      // denominator = 4 - 1 = 3, scale = 1/3
      const projected = projectPerspective(v, d)
      expect(projected[0]).toBeCloseTo(2 / 3, 10)
      expect(projected[1]).toBeCloseTo(4 / 3, 10)
      expect(projected[2]).toBeCloseTo(2, 10)
    })

    it('projects 4D point with negative w correctly', () => {
      const v = [1, 2, 3, -1]
      const d = 4
      // denominator = 4 - (-1) = 5, scale = 1/5
      const projected = projectPerspective(v, d)
      expect(projected[0]).toBeCloseTo(0.2, 10)
      expect(projected[1]).toBeCloseTo(0.4, 10)
      expect(projected[2]).toBeCloseTo(0.6, 10)
    })

    it('handles point near projection plane without NaN/Infinity', () => {
      const v = [1, 2, 3, 3.999] // w very close to d=4
      const projected = projectPerspective(v, 4)

      // Should not produce NaN or Infinity
      expect(isFinite(projected[0])).toBe(true)
      expect(isFinite(projected[1])).toBe(true)
      expect(isFinite(projected[2])).toBe(true)

      // Should be large but clamped
      expect(Math.abs(projected[0])).toBeGreaterThan(1)
      expect(Math.abs(projected[1])).toBeGreaterThan(1)
      expect(Math.abs(projected[2])).toBeGreaterThan(1)
    })

    it('projects 5D point correctly (single-step projection)', () => {
      const v = [1, 1, 1, 0, 0]
      const d = 4
      // Single-step projection:
      // effectiveDepth = (0 + 0) / sqrt(2) = 0
      // denominator = 4 - 0 = 4
      // scale = 1/4
      const projected = projectPerspective(v, d)
      expect(projected[0]).toBeCloseTo(1 / 4, 10)
      expect(projected[1]).toBeCloseTo(1 / 4, 10)
      expect(projected[2]).toBeCloseTo(1 / 4, 10)
    })

    it('handles 4D cube vertices (8 points in 4D)', () => {
      // 4D cube vertices: all combinations of ±1 in each dimension
      const vertices = [
        [-1, -1, -1, -1],
        [1, -1, -1, -1],
        [-1, 1, -1, -1],
        [1, 1, -1, -1],
        [-1, -1, 1, -1],
        [1, -1, 1, -1],
        [-1, 1, 1, -1],
        [1, 1, 1, -1],
      ]

      const d = 4
      for (const v of vertices) {
        const projected = projectPerspective(v, d)

        // All projections should be finite
        expect(isFinite(projected[0])).toBe(true)
        expect(isFinite(projected[1])).toBe(true)
        expect(isFinite(projected[2])).toBe(true)

        // w = -1, so denominator = 5, scale = 1/5 = 0.2
        expect(Math.abs(projected[0])).toBeCloseTo(0.2, 10)
        expect(Math.abs(projected[1])).toBeCloseTo(0.2, 10)
        expect(Math.abs(projected[2])).toBeCloseTo(0.2, 10)
      }
    })

    it('throws error for vectors with less than 3 dimensions', () => {
      expect(() => projectPerspective([1], 4)).toThrow()
      expect(() => projectPerspective([1, 2], 4)).toThrow()
    })

    it('throws error for non-positive projection distance', () => {
      expect(() => projectPerspective([1, 2, 3, 4], 0)).toThrow()
      expect(() => projectPerspective([1, 2, 3, 4], -1)).toThrow()
    })
  })

  describe('projectVertices', () => {
    it('projects multiple vertices with perspective', () => {
      const vertices = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
      ]

      const projected = projectVertices(vertices, 4)
      expect(projected).toHaveLength(3)

      for (const p of projected) {
        expect(p).toHaveLength(3)
        expect(isFinite(p[0])).toBe(true)
        expect(isFinite(p[1])).toBe(true)
        expect(isFinite(p[2])).toBe(true)
      }
    })

    it('handles empty array', () => {
      const projected = projectVertices([], 4)
      expect(projected).toEqual([])
    })

    it('throws error if vertices have different dimensions', () => {
      const vertices = [
        [1, 2, 3],
        [1, 2, 3, 4],
      ]
      expect(() => projectVertices(vertices, 4)).toThrow()
    })
  })

  describe('calculateDepth', () => {
    it('returns 0 for 3D vectors', () => {
      const v = [1, 2, 3]
      expect(calculateDepth(v)).toBe(0)
    })

    it('calculates depth for 4D vector', () => {
      const v = [1, 2, 3, 4]
      // depth = |w| = 4
      expect(calculateDepth(v)).toBe(4)
    })

    it('calculates depth for 5D vector', () => {
      const v = [1, 2, 3, 4, 3]
      // depth = sqrt(4^2 + 3^2) = sqrt(25) = 5
      expect(calculateDepth(v)).toBe(5)
    })

    it('handles negative higher dimension coordinates', () => {
      const v = [1, 2, 3, -4, 0]
      // depth = sqrt(16) = 4
      expect(calculateDepth(v)).toBe(4)
    })
  })

  describe('sortByDepth', () => {
    it('sorts vertices by depth (furthest first)', () => {
      const vertices = [
        [0, 0, 0, 1], // depth = 1
        [0, 0, 0, 3], // depth = 3
        [0, 0, 0, 2], // depth = 2
      ]

      const indices = sortByDepth(vertices)
      expect(indices).toEqual([1, 2, 0]) // Furthest (3) to nearest (1)
    })

    it('handles 3D vectors (all depth = 0)', () => {
      const vertices = [
        [1, 2, 3],
        [4, 5, 6],
      ]

      const indices = sortByDepth(vertices)
      // Order doesn't matter since all depths are 0
      expect(indices).toHaveLength(2)
    })

    it('sorts 5D vertices correctly', () => {
      const vertices = [
        [0, 0, 0, 3, 4], // depth = 5
        [0, 0, 0, 0, 0], // depth = 0
        [0, 0, 0, 1, 0], // depth = 1
      ]

      const indices = sortByDepth(vertices)
      expect(indices).toEqual([0, 2, 1])
    })
  })

  describe('calculateProjectionDistance', () => {
    it('returns default distance for 3D vertices', () => {
      const vertices = [[1, 2, 3]]
      const distance = calculateProjectionDistance(vertices)
      expect(distance).toBe(DEFAULT_PROJECTION_DISTANCE)
    })

    it('calculates distance based on max higher dimension coordinate', () => {
      const vertices = [
        [0, 0, 0, 2],
        [0, 0, 0, -3],
        [0, 0, 0, 1],
      ]

      // max = 3, default margin = 2.0
      // distance = 3 * 2.0 + 1.0 = 7.0
      const distance = calculateProjectionDistance(vertices)
      expect(distance).toBe(7.0)
    })

    it('uses custom margin', () => {
      const vertices = [[0, 0, 0, 2]]

      // max = 2, margin = 3.0
      // distance = 2 * 3.0 + 1.0 = 7.0
      const distance = calculateProjectionDistance(vertices, 3.0)
      expect(distance).toBe(7.0)
    })

    it('handles empty array', () => {
      const distance = calculateProjectionDistance([])
      expect(distance).toBe(DEFAULT_PROJECTION_DISTANCE)
    })
  })

  describe('Quality Gate Requirements', () => {
    it('perspective projection handles w ≈ d case without NaN/Infinity', () => {
      const testCases = [
        [1, 1, 1, 3.99],
        [1, 1, 1, 3.999],
        [1, 1, 1, 3.9999],
        [1, 1, 1, 4.001], // Slightly beyond
      ]

      for (const v of testCases) {
        const projected = projectPerspective(v, 4)

        expect(isNaN(projected[0])).toBe(false)
        expect(isNaN(projected[1])).toBe(false)
        expect(isNaN(projected[2])).toBe(false)

        expect(isFinite(projected[0])).toBe(true)
        expect(isFinite(projected[1])).toBe(true)
        expect(isFinite(projected[2])).toBe(true)
      }
    })

    it('4D cube projects to valid 3D coordinates', () => {
      // All 16 vertices of a 4D hypercube
      const vertices: number[][] = []
      for (let i = 0; i < 16; i++) {
        const v = [i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]
        vertices.push(v)
      }

      const projectionDistance = 4

      for (const v of vertices) {
        const projected = projectPerspective(v, projectionDistance)

        // All coordinates should be finite
        expect(isFinite(projected[0])).toBe(true)
        expect(isFinite(projected[1])).toBe(true)
        expect(isFinite(projected[2])).toBe(true)

        // All coordinates should be reasonable (not extreme values)
        expect(Math.abs(projected[0])).toBeLessThan(100)
        expect(Math.abs(projected[1])).toBeLessThan(100)
        expect(Math.abs(projected[2])).toBeLessThan(100)

        // Should maintain sign relationships
        expect(Math.sign(projected[0])).toBe(Math.sign(v[0]!))
        expect(Math.sign(projected[1])).toBe(Math.sign(v[1]!))
        expect(Math.sign(projected[2])).toBe(Math.sign(v[2]!))
      }
    })
  })

  describe('projectVerticesToPositions (Buffer API)', () => {
    it('projects 3D vertices to Float32Array with perspective', () => {
      const vertices = [
        [1, 2, 3],
        [4, 5, 6],
      ]
      const positions = new Float32Array(6)

      projectVerticesToPositions(vertices, positions, 4)

      // 3D vertices with perspective have effectiveDepth = 0
      // So they are divided by projectionDistance (4)
      expect(positions[0]).toBeCloseTo(0.25, 10)
      expect(positions[1]).toBeCloseTo(0.5, 10)
      expect(positions[2]).toBeCloseTo(0.75, 10)
      expect(positions[3]).toBeCloseTo(1, 10)
      expect(positions[4]).toBeCloseTo(1.25, 10)
      expect(positions[5]).toBeCloseTo(1.5, 10)
    })

    it('projects 4D vertices to Float32Array with perspective', () => {
      const vertices = [
        [2, 4, 6, 1], // w=1, denominator = 4-1 = 3, scale = 1/3
      ]
      const positions = new Float32Array(3)

      projectVerticesToPositions(vertices, positions, 4)

      expect(positions[0]).toBeCloseTo(2 / 3, 6)
      expect(positions[1]).toBeCloseTo(4 / 3, 6)
      expect(positions[2]).toBeCloseTo(2, 6)
    })

    it('supports offset parameter', () => {
      const vertices = [[1, 2, 3]]
      const positions = new Float32Array(6)
      positions[0] = 99
      positions[1] = 99
      positions[2] = 99

      projectVerticesToPositions(vertices, positions, 4, 3)

      // First 3 elements unchanged, data written at offset 3
      // 3D vertices scaled by 1/4 = 0.25
      expect(positions[0]).toBe(99)
      expect(positions[1]).toBe(99)
      expect(positions[2]).toBe(99)
      expect(positions[3]).toBeCloseTo(0.25, 10)
      expect(positions[4]).toBeCloseTo(0.5, 10)
      expect(positions[5]).toBeCloseTo(0.75, 10)
    })

    it('returns count of projected vertices', () => {
      const vertices = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ]
      const positions = new Float32Array(9)

      const count = projectVerticesToPositions(vertices, positions, 4)

      expect(count).toBe(3)
    })

    it('returns 0 for empty array', () => {
      const positions = new Float32Array(6)

      const count = projectVerticesToPositions([], positions, 4)

      expect(count).toBe(0)
    })

    it('throws error if buffer is too small', () => {
      const vertices = [
        [1, 2, 3],
        [4, 5, 6],
      ]
      const positions = new Float32Array(3) // Too small

      expect(() => projectVerticesToPositions(vertices, positions, 4)).toThrow()
    })

    it('throws error if vertices have < 3 dimensions', () => {
      const vertices = [[1, 2]]
      const positions = new Float32Array(3)

      expect(() => projectVerticesToPositions(vertices, positions, 4)).toThrow()
    })

    it('produces same results as projectPerspective', () => {
      const vertices = [
        [1, 2, 3, 0.5],
        [-1, 0, 1, -0.5],
        [0.5, 0.5, 0.5, 0],
      ]
      const positions = new Float32Array(9)

      projectVerticesToPositions(vertices, positions, 4)

      for (let i = 0; i < vertices.length; i++) {
        const expected = projectPerspective(vertices[i]!, 4)
        // Float32Array has lower precision than Float64 (JavaScript numbers)
        expect(positions[i * 3]).toBeCloseTo(expected[0], 6)
        expect(positions[i * 3 + 1]).toBeCloseTo(expected[1], 6)
        expect(positions[i * 3 + 2]).toBeCloseTo(expected[2], 6)
      }
    })
  })
})
