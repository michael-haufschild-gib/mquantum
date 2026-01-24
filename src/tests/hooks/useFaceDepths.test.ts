/**
 * Tests for useFaceDepths hook
 *
 * Tests per-face depth calculation for palette color variation.
 *
 * @see src/hooks/useFaceDepths.ts
 */

import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useFaceDepths } from '@/hooks/useFaceDepths'
import type { Face } from '@/lib/geometry'

describe('useFaceDepths', () => {
  // Test vertices for a simple 4D hypercube-like structure
  // Each vertex has [x, y, z, w] coordinates
  const vertices4D: number[][] = [
    [-1, -1, -1, -1], // v0 - w=-1
    [1, -1, -1, -1], // v1 - w=-1
    [1, 1, -1, -1], // v2 - w=-1
    [-1, 1, -1, -1], // v3 - w=-1
    [-1, -1, 1, 1], // v4 - w=1
    [1, -1, 1, 1], // v5 - w=1
    [1, 1, 1, 1], // v6 - w=1
    [-1, 1, 1, 1], // v7 - w=1
  ]

  // Simple 3D vertices
  const vertices3D: number[][] = [
    [-1, -1, -1], // v0 - y=-1
    [1, -1, -1], // v1 - y=-1
    [1, 1, -1], // v2 - y=1
    [-1, 1, -1], // v3 - y=1
    [-1, -1, 1], // v4 - y=-1
    [1, -1, 1], // v5 - y=-1
    [1, 1, 1], // v6 - y=1
    [-1, 1, 1], // v7 - y=1
  ]

  // Simple faces (quads)
  const faces: Face[] = [
    { vertices: [0, 1, 2, 3] }, // face with w=-1 vertices (for 4D) / y-varied (for 3D)
    { vertices: [4, 5, 6, 7] }, // face with w=1 vertices (for 4D) / y-varied (for 3D)
  ]

  // Faces grouped by y-coordinate for 3D testing
  const faces3DByY: Face[] = [
    { vertices: [0, 1, 4, 5] }, // face with y=-1 vertices
    { vertices: [2, 3, 6, 7] }, // face with y=1 vertices
  ]

  describe('basic functionality', () => {
    it('should return empty array for empty faces', () => {
      const { result } = renderHook(() => useFaceDepths(vertices4D, [], 4))
      expect(result.current).toEqual([])
    })

    it('should return empty array for empty vertices', () => {
      const { result } = renderHook(() => useFaceDepths([], faces, 4))
      expect(result.current).toEqual([])
    })

    it('should return array with same length as faces', () => {
      const { result } = renderHook(() => useFaceDepths(vertices4D, faces, 4))
      expect(result.current).toHaveLength(faces.length)
    })
  })

  describe('4D depth calculation (W coordinate)', () => {
    it('should calculate depth based on W coordinates', () => {
      const { result } = renderHook(() => useFaceDepths(vertices4D, faces, 4))

      // Face 0 has vertices with w=-1, face 1 has vertices with w=1
      // After normalization to [0,1], face with lower w should have lower depth
      expect(result.current).toHaveLength(2)
      // Depths should be normalized to [0,1] range
      const depth0 = result.current[0]!
      const depth1 = result.current[1]!
      expect(depth0).toBeGreaterThanOrEqual(0)
      expect(depth0).toBeLessThanOrEqual(1)
      expect(depth1).toBeGreaterThanOrEqual(0)
      expect(depth1).toBeLessThanOrEqual(1)
      // Face 0 (w=-1) should have lower depth than face 1 (w=1)
      expect(depth0).toBeLessThan(depth1)
    })

    it('should return 0 and 1 for two opposite faces', () => {
      const { result } = renderHook(() => useFaceDepths(vertices4D, faces, 4))

      // With normalization, one face should be 0 and one should be 1
      expect(result.current[0] ?? -1).toBe(0)
      expect(result.current[1] ?? -1).toBe(1)
    })
  })

  describe('3D depth calculation (Y coordinate)', () => {
    it('should calculate depth based on Y coordinate centroid', () => {
      const { result } = renderHook(() => useFaceDepths(vertices3D, faces3DByY, 3))

      expect(result.current).toHaveLength(2)
      // Face with y=-1 vertices should have lower depth than face with y=1 vertices
      expect(result.current[0]!).toBeLessThan(result.current[1]!)
    })

    it('should return normalized values [0,1]', () => {
      const { result } = renderHook(() => useFaceDepths(vertices3D, faces3DByY, 3))

      expect(result.current[0]).toBeGreaterThanOrEqual(0)
      expect(result.current[0]).toBeLessThanOrEqual(1)
      expect(result.current[1]).toBeGreaterThanOrEqual(0)
      expect(result.current[1]).toBeLessThanOrEqual(1)
    })
  })

  describe('edge cases', () => {
    it('should handle faces with all same depth', () => {
      // All vertices at same W coordinate
      const sameWVertices: number[][] = [
        [-1, -1, -1, 0],
        [1, -1, -1, 0],
        [1, 1, -1, 0],
        [-1, 1, -1, 0],
      ]
      const singleFace: Face[] = [{ vertices: [0, 1, 2, 3] }]

      const { result } = renderHook(() => useFaceDepths(sameWVertices, singleFace, 4))

      // With single face, depth should be 0.5 (fallback for no range)
      expect(result.current).toHaveLength(1)
      expect(result.current[0]).toBe(0.5)
    })

    it('should handle 5D vertices', () => {
      const vertices5D: number[][] = [
        [-1, -1, -1, -1, -1], // w=-1, v=-1
        [1, -1, -1, -1, -1],
        [1, 1, -1, -1, -1],
        [-1, 1, -1, -1, -1],
        [-1, -1, 1, 1, 1], // w=1, v=1
        [1, -1, 1, 1, 1],
        [1, 1, 1, 1, 1],
        [-1, 1, 1, 1, 1],
      ]

      const { result } = renderHook(() => useFaceDepths(vertices5D, faces, 5))

      // Should average both W and V coordinates (indices 3 and 4)
      expect(result.current).toHaveLength(2)
      expect(result.current[0] ?? -1).toBe(0) // Lower depth
      expect(result.current[1] ?? -1).toBe(1) // Higher depth
    })

    it('should handle faces with empty vertices array', () => {
      const emptyFace: Face[] = [{ vertices: [] }]
      const { result } = renderHook(() => useFaceDepths(vertices4D, emptyFace, 4))

      expect(result.current).toHaveLength(1)
      // Empty face should still return a value (0.5 fallback)
      expect(result.current[0]).toBe(0.5)
    })
  })

  describe('memoization', () => {
    it('should memoize results based on inputs', () => {
      const { result, rerender } = renderHook(
        ({ vertices, faces, dimension }) => useFaceDepths(vertices, faces, dimension),
        { initialProps: { vertices: vertices4D, faces, dimension: 4 } }
      )

      const firstResult = result.current

      // Rerender with same props
      rerender({ vertices: vertices4D, faces, dimension: 4 })

      // Should return same reference (memoized)
      expect(result.current).toBe(firstResult)
    })
  })
})
