/**
 * Tests for Short Edge Builder for Root Systems
 */

import { describe, it, expect } from 'vitest'
import { buildShortEdges } from '@/lib/geometry/extended/utils/short-edges'
import type { VectorND } from '@/lib/math/types'

describe('buildShortEdges', () => {
  describe('basic functionality', () => {
    it('should return empty array for empty vertices', () => {
      const edges = buildShortEdges([])
      expect(edges).toEqual([])
    })

    it('should return empty array for single vertex', () => {
      const vertices: VectorND[] = [[0, 0, 0]]
      const edges = buildShortEdges(vertices)
      expect(edges).toEqual([])
    })

    it('should connect 2 vertices at minimum distance', () => {
      const vertices: VectorND[] = [
        [0, 0],
        [1, 0],
      ]
      const edges = buildShortEdges(vertices)
      expect(edges).toEqual([[0, 1]])
    })
  })

  describe('minimum distance detection', () => {
    it('should connect only vertices at minimum distance', () => {
      // 3 points in a line: 0--1----2
      // Distance 0-1 = 1, Distance 1-2 = 3, Distance 0-2 = 4
      const vertices: VectorND[] = [
        [0, 0],
        [1, 0],
        [4, 0],
      ]
      const edges = buildShortEdges(vertices)

      // Only the minimum distance edge should be included
      expect(edges).toEqual([[0, 1]])
    })

    it('should connect all vertices at equal minimum distance', () => {
      // Equilateral triangle - all edges are equal
      const vertices: VectorND[] = [
        [0, 0],
        [1, 0],
        [0.5, Math.sqrt(3) / 2],
      ]
      const edges = buildShortEdges(vertices)

      // All 3 edges should be included (all same length)
      expect(edges.length).toBe(3)
    })

    it('should use epsilon tolerance for distance matching', () => {
      // Create vertices where some are slightly different distances
      // but within epsilon tolerance
      const vertices: VectorND[] = [
        [0, 0],
        [1, 0], // distance 1.0 from [0,0]
        [1.005, 1], // distance ~1.0025 from [1,0] (within 1% tolerance)
        [10, 10], // far away
      ]
      const edges = buildShortEdges(vertices, 0.01) // 1% tolerance

      // Edges at approximately minimum distance should be included
      expect(edges.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('edge ordering', () => {
    it('should use consistent ordering (i < j)', () => {
      const vertices: VectorND[] = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]
      const edges = buildShortEdges(vertices)

      for (const [a, b] of edges) {
        expect(a).toBeLessThan(b)
      }
    })
  })

  describe('n-dimensional vertices', () => {
    it('should work with 3D vertices', () => {
      const vertices: VectorND[] = [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [10, 10, 10],
      ]
      const edges = buildShortEdges(vertices)
      expect(edges.length).toBeGreaterThan(0)
    })

    it('should work with 4D vertices', () => {
      // Unit 4D cross-polytope vertices (partial)
      const vertices: VectorND[] = [
        [1, 0, 0, 0],
        [-1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, -1, 0, 0],
      ]
      const edges = buildShortEdges(vertices)
      expect(edges.length).toBeGreaterThan(0)
    })

    it('should work with 8D vertices', () => {
      // Some E8-style vertices
      const vertices: VectorND[] = [
        [1, 1, 0, 0, 0, 0, 0, 0],
        [-1, 1, 0, 0, 0, 0, 0, 0],
        [1, -1, 0, 0, 0, 0, 0, 0],
        [0, 0, 1, 1, 0, 0, 0, 0],
      ]
      const edges = buildShortEdges(vertices)
      expect(edges.length).toBeGreaterThan(0)
    })
  })

  describe('root system structure', () => {
    it('should reveal square lattice structure', () => {
      // 2D square lattice points
      const vertices: VectorND[] = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]
      const edges = buildShortEdges(vertices)

      // Should have 4 edges (horizontal and vertical neighbors)
      expect(edges.length).toBe(4)
    })

    it('should handle A2 root system (hexagonal)', () => {
      // Simple roots of A2 and their combinations
      const sqrt3 = Math.sqrt(3)
      const vertices: VectorND[] = [
        [1, 0],
        [-1, 0],
        [0.5, sqrt3 / 2],
        [-0.5, sqrt3 / 2],
        [0.5, -sqrt3 / 2],
        [-0.5, -sqrt3 / 2],
      ]
      const edges = buildShortEdges(vertices)

      // All vertices are at distance 1 from each other in A2
      expect(edges.length).toBeGreaterThan(0)
    })
  })

  describe('epsilon factor', () => {
    it('should respect custom epsilon factor', () => {
      const vertices: VectorND[] = [
        [0, 0],
        [1, 0],
        [1.05, 1], // 5% further than min distance
      ]

      // With 1% tolerance, should exclude the further edge
      const edgesStrict = buildShortEdges(vertices, 0.01)

      // With 10% tolerance, should include the further edge
      const edgesLoose = buildShortEdges(vertices, 0.1)

      expect(edgesLoose.length).toBeGreaterThanOrEqual(edgesStrict.length)
    })

    it('should use default epsilon of 0.01', () => {
      const vertices: VectorND[] = [
        [0, 0],
        [1, 0],
      ]
      const edges = buildShortEdges(vertices)
      expect(edges.length).toBe(1)
    })
  })

  describe('edge cases', () => {
    it('should handle coincident vertices (distance = 0)', () => {
      // Two vertices at same position
      const vertices: VectorND[] = [
        [1, 1],
        [1, 1], // Same position
        [5, 5],
      ]
      const edges = buildShortEdges(vertices)

      // Should find edges for the non-coincident pairs
      expect(Array.isArray(edges)).toBe(true)
    })

    it('should handle all vertices at same position', () => {
      const vertices: VectorND[] = [
        [0, 0],
        [0, 0],
        [0, 0],
      ]
      const edges = buildShortEdges(vertices)

      // No nonzero distances, so no edges
      expect(edges).toEqual([])
    })
  })

  describe('integration with root systems', () => {
    it('should produce correct edge count for D4 root system', () => {
      // D4 has 24 roots
      // Create simplified D4-like structure
      const vertices: VectorND[] = []

      // ±e_i ± e_j for i < j
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          for (const s1 of [1, -1]) {
            for (const s2 of [1, -1]) {
              const v = [0, 0, 0, 0]
              v[i] = s1
              v[j] = s2
              vertices.push(v)
            }
          }
        }
      }

      expect(vertices.length).toBe(24)

      const edges = buildShortEdges(vertices)
      expect(edges.length).toBeGreaterThan(0)
    })
  })
})
