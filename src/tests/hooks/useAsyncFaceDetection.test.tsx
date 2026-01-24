/**
 * Tests for useAsyncFaceDetection hook
 *
 * These tests run in a non-Worker environment (happy-dom),
 * which triggers the sync fallback code path.
 */

import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { act } from 'react'
import { useAsyncFaceDetection } from '@/hooks/useAsyncFaceDetection'
import { generateGeometry } from '@/lib/geometry'
import type { NdGeometry } from '@/lib/geometry/types'
import { DEFAULT_EXTENDED_OBJECT_PARAMS } from '@/lib/geometry/extended/types'

// Helper to generate edges from vertices (all pairs within distance threshold)
function generateEdgesFromVertices(
  vertices: number[][],
  threshold: number = 2.0
): [number, number][] {
  const edges: [number, number][] = []
  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      let dist = 0
      const vi = vertices[i]!
      const vj = vertices[j]!
      for (let k = 0; k < vi.length; k++) {
        const diff = vi[k]! - vj[k]!
        dist += diff * diff
      }
      if (Math.sqrt(dist) <= threshold) {
        edges.push([i, j])
      }
    }
  }
  return edges
}

// Create test geometry helper
function createTestGeometry(
  vertices: number[][],
  dimension: number,
  type: string,
  edges?: [number, number][]
): NdGeometry {
  return {
    vertices,
    edges: edges ?? generateEdgesFromVertices(vertices),
    dimension,
    type,
    metadata: {},
  } as NdGeometry
}

describe('useAsyncFaceDetection', () => {
  describe('empty/null geometry', () => {
    it('should return empty faces for null geometry', () => {
      const { result } = renderHook(() => useAsyncFaceDetection(null, 'hypercube'))

      expect(result.current.faces).toEqual([])
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('should return empty faces for geometry with no vertices', () => {
      const emptyGeometry = createTestGeometry([], 3, 'hypercube', [])

      const { result } = renderHook(() => useAsyncFaceDetection(emptyGeometry, 'hypercube'))

      expect(result.current.faces).toEqual([])
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('object types with no face detection', () => {
    it('should return empty faces for simplex (uses triangles method)', async () => {
      // Use actual simplex geometry
      const simplex = generateGeometry('simplex', 3, DEFAULT_EXTENDED_OBJECT_PARAMS)

      const { result } = renderHook(() => useAsyncFaceDetection(simplex, 'simplex'))

      // Wait for sync detection to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Simplex should detect triangular faces
      expect(result.current.faces.length).toBeGreaterThan(0)
    })
  })

  describe('root-system face detection (metadata method)', () => {
    it('should detect faces for root-system via metadata (pre-computed analyticalFaces)', async () => {
      // Use actual root-system geometry (which includes edges and analyticalFaces in metadata)
      const rootGeometry = generateGeometry('root-system', 4, {
        ...DEFAULT_EXTENDED_OBJECT_PARAMS,
        rootSystem: {
          rootType: 'A',
          scale: 1.0,
        },
      })

      const { result } = renderHook(() => useAsyncFaceDetection(rootGeometry, 'root-system'))

      // Wait for face detection to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should have detected faces from metadata (analyticalFaces)
      expect(result.current.faces.length).toBeGreaterThan(0)
      expect(result.current.error).toBeNull()

      // All faces should be triangular
      result.current.faces.forEach((face) => {
        expect(face.vertices).toHaveLength(3)
      })
    })

    it('should detect faces for D_4 root system (24-cell) via metadata', async () => {
      // D_4 roots in 4D (24 roots = 24-cell)
      const rootGeometry = generateGeometry('root-system', 4, {
        ...DEFAULT_EXTENDED_OBJECT_PARAMS,
        rootSystem: {
          rootType: 'D',
          scale: 1.0,
        },
      })

      const { result } = renderHook(() => useAsyncFaceDetection(rootGeometry, 'root-system'))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // D_4 / 24-cell has many triangular faces
      expect(result.current.faces.length).toBeGreaterThan(0)
      expect(result.current.error).toBeNull()
    })

    it('should cover all vertices with faces for high-D A root system', async () => {
      // A_7 (8D) - the case from the bug where convex-hull failed to cover all vertices
      const rootGeometry = generateGeometry('root-system', 8, {
        ...DEFAULT_EXTENDED_OBJECT_PARAMS,
        rootSystem: {
          rootType: 'A',
          scale: 1.0,
        },
      })

      const { result } = renderHook(() => useAsyncFaceDetection(rootGeometry, 'root-system'))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Collect all vertices covered by faces
      const coveredVertices = new Set<number>()
      result.current.faces.forEach((face) => {
        face.vertices.forEach((idx) => coveredVertices.add(idx))
      })

      // All 56 vertices of A_7 should be covered
      expect(rootGeometry.vertices.length).toBe(56)
      expect(coveredVertices.size).toBe(56)
    })

    it('should update faces when geometry changes', async () => {
      // Start with A-type root system
      const aGeometry = generateGeometry('root-system', 4, {
        ...DEFAULT_EXTENDED_OBJECT_PARAMS,
        rootSystem: {
          rootType: 'A',
          scale: 1.0,
        },
      })

      const { result, rerender } = renderHook(
        ({ geometry }) => useAsyncFaceDetection(geometry, 'root-system'),
        { initialProps: { geometry: aGeometry } }
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const aFaceCount = result.current.faces.length
      expect(aFaceCount).toBeGreaterThan(0)

      // Switch to D-type root system
      const dGeometry = generateGeometry('root-system', 4, {
        ...DEFAULT_EXTENDED_OBJECT_PARAMS,
        rootSystem: {
          rootType: 'D',
          scale: 1.0,
        },
      })

      act(() => {
        rerender({ geometry: dGeometry })
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Face count should be different for D vs A (they have different vertex counts)
      // A_4 has 12 vertices, D_4 has 24 vertices
      expect(result.current.faces.length).not.toBe(aFaceCount)
    })
  })

  describe('wythoff-polytope face detection (metadata method)', () => {
    it('should detect faces from geometry metadata for wythoff-polytope', async () => {
      // Wythoff-polytope uses 'metadata' face detection, not 'convex-hull'
      // The faces are pre-computed during generation and stored in metadata.analyticalFaces
      // Create geometry with pre-computed faces in metadata
      const cubeVertices = [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
        [0, 0, 1],
        [1, 0, 1],
        [0, 1, 1],
        [1, 1, 1],
      ]

      // Pre-computed triangular faces for a cube (6 quads = 12 triangles)
      const analyticalFaces = [
        [0, 1, 3],
        [0, 3, 2], // bottom
        [4, 6, 7],
        [4, 7, 5], // top
        [0, 4, 5],
        [0, 5, 1], // front
        [2, 3, 7],
        [2, 7, 6], // back
        [0, 2, 6],
        [0, 6, 4], // left
        [1, 5, 7],
        [1, 7, 3], // right
      ]

      const wythoffGeometry = {
        vertices: cubeVertices,
        edges: generateEdgesFromVertices(cubeVertices),
        dimension: 3,
        type: 'wythoff-polytope',
        metadata: {
          properties: {
            analyticalFaces,
          },
        },
      } as NdGeometry

      const { result } = renderHook(() =>
        useAsyncFaceDetection(wythoffGeometry, 'wythoff-polytope')
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should use metadata faces (12 triangles)
      expect(result.current.error).toBeNull()
      expect(result.current.faces).toHaveLength(12)
    })
  })

  describe('error handling', () => {
    it('should handle insufficient vertices gracefully', async () => {
      // 3 points in 3D can't form a 3D hull
      const tooFewPoints = createTestGeometry(
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
        3,
        'root-system'
      )

      const { result } = renderHook(() => useAsyncFaceDetection(tooFewPoints, 'root-system'))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should return empty faces (insufficient points)
      expect(result.current.faces).toEqual([])
    })
  })
})
