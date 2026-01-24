/**
 * Tests for K-Nearest Neighbor Edge Builder
 */

import { describe, it, expect } from 'vitest'
import { buildKnnEdges } from '@/lib/geometry/extended/utils/knn-edges'
import type { VectorND } from '@/lib/math/types'

describe('buildKnnEdges', () => {
  describe('basic functionality', () => {
    it('should return empty array for empty points', () => {
      const edges = buildKnnEdges([], 3)
      expect(edges).toEqual([])
    })

    it('should return empty array for k <= 0', () => {
      const points: VectorND[] = [
        [0, 0],
        [1, 0],
        [0, 1],
      ]
      expect(buildKnnEdges(points, 0)).toEqual([])
      expect(buildKnnEdges(points, -1)).toEqual([])
    })

    it('should return empty array for single point', () => {
      const points: VectorND[] = [[0, 0, 0]]
      const edges = buildKnnEdges(points, 3)
      expect(edges).toEqual([])
    })

    it('should connect 2 points when k >= 1', () => {
      const points: VectorND[] = [
        [0, 0],
        [1, 0],
      ]
      const edges = buildKnnEdges(points, 1)
      expect(edges).toEqual([[0, 1]])
    })

    it('should cap k to n-1 points', () => {
      const points: VectorND[] = [
        [0, 0],
        [1, 0],
        [2, 0],
      ]
      // k=10 but only 3 points, so max neighbors is 2
      const edges = buildKnnEdges(points, 10)
      // Each point connects to all others: 3 points, 3 edges
      expect(edges.length).toBe(3)
    })
  })

  describe('nearest neighbor selection', () => {
    it('should connect each point to its nearest neighbor (k=1)', () => {
      // Square arrangement
      const points: VectorND[] = [
        [0, 0], // 0
        [1, 0], // 1
        [1, 1], // 2
        [0, 1], // 3
      ]
      const edges = buildKnnEdges(points, 1)

      // Each point connects to at least one neighbor
      expect(edges.length).toBeGreaterThan(0)

      // Verify edge format: [minIdx, maxIdx]
      for (const [a, b] of edges) {
        expect(a).toBeLessThan(b)
      }
    })

    it('should connect each point to 2 nearest neighbors (k=2)', () => {
      // Triangle
      const points: VectorND[] = [
        [0, 0], // 0
        [1, 0], // 1
        [0.5, 0.866], // 2 (equilateral triangle)
      ]
      const edges = buildKnnEdges(points, 2)

      // In equilateral triangle, all edges are same length
      // Each point connects to both others, so 3 unique edges
      expect(edges.length).toBe(3)
    })
  })

  describe('edge deduplication', () => {
    it('should not create duplicate edges', () => {
      const points: VectorND[] = [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
      ]
      const edges = buildKnnEdges(points, 3)

      // Check no duplicates
      const edgeSet = new Set(edges.map(([a, b]) => `${a},${b}`))
      expect(edgeSet.size).toBe(edges.length)
    })

    it('should use consistent ordering (a < b)', () => {
      const points: VectorND[] = [
        [0, 0],
        [1, 1],
        [2, 0],
      ]
      const edges = buildKnnEdges(points, 2)

      for (const [a, b] of edges) {
        expect(a).toBeLessThan(b)
      }
    })
  })

  describe('n-dimensional points', () => {
    it('should work with 3D points', () => {
      const points: VectorND[] = [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ]
      const edges = buildKnnEdges(points, 2)
      expect(edges.length).toBeGreaterThan(0)
    })

    it('should work with 4D points', () => {
      const points: VectorND[] = [
        [0, 0, 0, 0],
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ]
      const edges = buildKnnEdges(points, 3)
      expect(edges.length).toBeGreaterThan(0)
    })

    it('should work with 8D points (like E8 roots)', () => {
      const points: VectorND[] = [
        [1, 0, 0, 0, 0, 0, 0, 0],
        [0, 1, 0, 0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0, 0, 0, 0],
        [0, 0, 0, 1, 0, 0, 0, 0],
      ]
      const edges = buildKnnEdges(points, 2)
      expect(edges.length).toBeGreaterThan(0)
    })
  })

  describe('distance calculation', () => {
    it('should correctly identify nearest neighbors by distance', () => {
      // Point 1 is closer to point 0 than point 2
      const points: VectorND[] = [
        [0, 0], // 0
        [1, 0], // 1 - distance 1 from 0
        [10, 0], // 2 - distance 10 from 0
      ]
      const edges = buildKnnEdges(points, 1)

      // Point 0's nearest neighbor is point 1
      // Point 1's nearest neighbor could be 0 or 2 (0 is closer)
      // Point 2's nearest neighbor is point 1
      const edgeStrings = edges.map(([a, b]) => `${a}-${b}`)
      expect(edgeStrings).toContain('0-1')
    })
  })

  describe('mixed dimension handling', () => {
    it('should handle points with different dimensions (uses min length)', () => {
      const points: VectorND[] = [
        [0, 0, 0],
        [1, 0], // 2D point
        [0, 1, 0],
      ]
      // Should not throw, uses minimum dimension
      const edges = buildKnnEdges(points, 2)
      expect(Array.isArray(edges)).toBe(true)
    })
  })
})
