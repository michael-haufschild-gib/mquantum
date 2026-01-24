/**
 * Tests for convex hull face extraction
 */

import { describe, it, expect } from 'vitest'
import {
  computeConvexHullFaces,
  hasValidConvexHull,
  getConvexHullStats,
} from '@/lib/geometry/extended/utils/convex-hull-faces'
import { generateARoots, generateDRoots } from '@/lib/geometry/extended/root-system'
import { generateE8Roots } from '@/lib/geometry/extended/e8-roots'

describe('computeConvexHullFaces', () => {
  describe('basic validation', () => {
    it('should return empty array for less than 4 points', () => {
      expect(computeConvexHullFaces([])).toEqual([])
      expect(computeConvexHullFaces([[0, 0, 0]])).toEqual([])
      expect(
        computeConvexHullFaces([
          [0, 0, 0],
          [1, 0, 0],
        ])
      ).toEqual([])
      expect(
        computeConvexHullFaces([
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ])
      ).toEqual([])
    })

    it('should return empty array for less than 3 dimensions', () => {
      expect(
        computeConvexHullFaces([
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ])
      ).toEqual([])
    })
  })

  describe('3D tetrahedron', () => {
    it('should compute 4 triangular faces for a tetrahedron', () => {
      // Regular tetrahedron vertices
      const tetrahedron = [
        [1, 1, 1],
        [1, -1, -1],
        [-1, 1, -1],
        [-1, -1, 1],
      ]

      const faces = computeConvexHullFaces(tetrahedron)

      // Tetrahedron has 4 triangular faces
      expect(faces).toHaveLength(4)

      // Each face should have exactly 3 vertices
      faces.forEach((face) => {
        expect(face).toHaveLength(3)
      })

      // All face indices should be valid (0-3)
      faces.forEach((face) => {
        face.forEach((idx) => {
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(4)
        })
      })
    })
  })

  describe('3D cube', () => {
    it('should compute 12 triangular faces for a cube', () => {
      // Cube vertices
      const cube = [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
        [0, 0, 1],
        [1, 0, 1],
        [0, 1, 1],
        [1, 1, 1],
      ]

      const faces = computeConvexHullFaces(cube)

      // Cube has 6 square faces, each triangulated into 2 triangles = 12 triangles
      expect(faces).toHaveLength(12)
    })
  })

  describe('A_n root system faces', () => {
    it('should compute faces for A_3 (4D, 12 roots)', () => {
      const vertices = generateARoots(4, 1.0)
      expect(vertices).toHaveLength(12)

      const faces = computeConvexHullFaces(vertices)

      // A_3 root polytope (cuboctahedron in projected 3D) has many faces
      expect(faces.length).toBeGreaterThan(0)

      // All faces should be triangles
      faces.forEach((face) => {
        expect(face).toHaveLength(3)
      })

      // All indices should be valid
      faces.forEach((face) => {
        face.forEach((idx) => {
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(vertices.length)
        })
      })
    })

    it('should compute faces for A_4 (5D, 20 roots)', () => {
      const vertices = generateARoots(5, 1.0)
      expect(vertices).toHaveLength(20)

      const faces = computeConvexHullFaces(vertices)
      expect(faces.length).toBeGreaterThan(0)
    })
  })

  describe('D_n root system faces', () => {
    it('should compute faces for D_4 (4D, 24 roots / 24-cell)', () => {
      const vertices = generateDRoots(4, 1.0)
      expect(vertices).toHaveLength(24)

      const faces = computeConvexHullFaces(vertices)

      // D_4 / 24-cell has 96 triangular faces
      expect(faces.length).toBeGreaterThan(0)

      // All faces should be triangles
      faces.forEach((face) => {
        expect(face).toHaveLength(3)
      })
    })

    it('should compute faces for D_5 (5D, 40 roots)', () => {
      const vertices = generateDRoots(5, 1.0)
      expect(vertices).toHaveLength(40)

      const faces = computeConvexHullFaces(vertices)
      expect(faces.length).toBeGreaterThan(0)
    })
  })

  describe('E_8 root system faces', () => {
    it('should compute faces for E_8 (8D, 240 roots)', () => {
      const vertices = generateE8Roots(1.0)
      expect(vertices).toHaveLength(240)

      const faces = computeConvexHullFaces(vertices)

      // E_8 polytope has many triangular faces
      expect(faces.length).toBeGreaterThan(0)

      // All faces should be triangles
      faces.forEach((face) => {
        expect(face).toHaveLength(3)
      })

      // All indices should be valid
      faces.forEach((face) => {
        face.forEach((idx) => {
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(240)
        })
      })
    })
  })
})

describe('hasValidConvexHull', () => {
  it('should return false for degenerate cases', () => {
    expect(hasValidConvexHull([])).toBe(false)
    expect(hasValidConvexHull([[0, 0, 0]])).toBe(false)
    expect(
      hasValidConvexHull([
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ])
    ).toBe(false)
  })

  it('should return true for valid polytopes', () => {
    const tetrahedron = [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ]
    expect(hasValidConvexHull(tetrahedron)).toBe(true)
  })

  it('should return true for root systems', () => {
    const aRoots = generateARoots(4, 1.0)
    expect(hasValidConvexHull(aRoots)).toBe(true)

    const dRoots = generateDRoots(4, 1.0)
    expect(hasValidConvexHull(dRoots)).toBe(true)

    const e8Roots = generateE8Roots(1.0)
    expect(hasValidConvexHull(e8Roots)).toBe(true)
  })
})

describe('ridge-based face extraction', () => {
  /**
   * Helper to generate 4D simplex vertices
   * A 4D simplex has 5 vertices in 4D space
   * @returns 4D simplex vertex coordinates
   */
  function generate4DSimplex(): number[][] {
    // Regular 4-simplex vertices (5 equidistant points in 4D)
    const phi = (1 + Math.sqrt(5)) / 2
    return [
      [1, 1, 1, -1 / phi],
      [1, -1, -1, -1 / phi],
      [-1, 1, -1, -1 / phi],
      [-1, -1, 1, -1 / phi],
      [0, 0, 0, phi],
    ]
  }

  /**
   * Helper to generate 4D cross-polytope (16-cell) vertices
   * Has 8 vertices: ±1 on each of 4 axes
   * @returns 4D cross-polytope vertex coordinates
   */
  function generate4DCrossPolytope(): number[][] {
    const vertices: number[][] = []
    for (let axis = 0; axis < 4; axis++) {
      for (const sign of [1, -1]) {
        const v = [0, 0, 0, 0]
        v[axis] = sign
        vertices.push(v)
      }
    }
    return vertices
  }

  /**
   * Helper to generate 4D hypercube (tesseract) vertices
   * Has 16 vertices: all ±1 combinations
   * @returns 4D hypercube vertex coordinates
   */
  function generate4DHypercube(): number[][] {
    const vertices: number[][] = []
    for (let i = 0; i < 16; i++) {
      vertices.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1])
    }
    return vertices
  }

  it('should extract correct number of faces for 4D simplex', () => {
    const vertices = generate4DSimplex()
    const faces = computeConvexHullFaces(vertices)

    // 4D simplex has C(5,3) = 10 triangular 2-faces
    expect(faces.length).toBe(10)

    // Verify no duplicates
    const keys = new Set(faces.map((f) => [...f].sort((a, b) => a - b).join(',')))
    expect(keys.size).toBe(10)
  })

  it('should extract correct number of faces for 4D cross-polytope', () => {
    const vertices = generate4DCrossPolytope()
    const faces = computeConvexHullFaces(vertices)

    // 4D cross-polytope (16-cell) has 32 triangular 2-faces
    // Formula: C(4,3) * 8 = 4 * 8 = 32
    expect(faces.length).toBe(32)

    // All indices should be valid (0-7)
    faces.forEach((face) => {
      face.forEach((idx) => {
        expect(idx).toBeGreaterThanOrEqual(0)
        expect(idx).toBeLessThan(8)
      })
    })
  })

  it('should not include interior triangles', () => {
    // For a 4D simplex, ALL triangles should be on the boundary
    // since it has only 5 vertices and C(5,3) = 10 faces
    const vertices = generate4DSimplex()
    const faces = computeConvexHullFaces(vertices)

    // Count unique triangles
    const uniqueKeys = new Set(faces.map((f) => [...f].sort((a, b) => a - b).join(',')))

    // All faces should be unique (no interior duplicates)
    expect(uniqueKeys.size).toBe(faces.length)
  })

  it('should have consistent winding order (all normals pointing outward)', () => {
    // For a centered polytope, all face normals should point outward
    // This means dot(normal, centroid) > 0 for each face
    const vertices = generate4DCrossPolytope()
    const faces = computeConvexHullFaces(vertices)

    let outwardCount = 0
    let inwardCount = 0

    for (const [i0, i1, i2] of faces) {
      const v0 = vertices[i0]!
      const v1 = vertices[i1]!
      const v2 = vertices[i2]!

      // Compute edges in 3D (first 3 coords)
      const e1 = [v1[0]! - v0[0]!, v1[1]! - v0[1]!, v1[2]! - v0[2]!]
      const e2 = [v2[0]! - v0[0]!, v2[1]! - v0[1]!, v2[2]! - v0[2]!]

      // Cross product for normal
      const normal = [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      ]

      // Face centroid
      const center = [
        (v0[0]! + v1[0]! + v2[0]!) / 3,
        (v0[1]! + v1[1]! + v2[1]!) / 3,
        (v0[2]! + v1[2]! + v2[2]!) / 3,
      ]

      // Dot product
      const dot = normal[0]! * center[0]! + normal[1]! * center[1]! + normal[2]! * center[2]!

      if (dot > 0.0001) outwardCount++
      else if (dot < -0.0001) inwardCount++
    }

    // All faces should have consistent outward-facing normals
    // (some may be zero if degenerate in 3D projection)
    expect(outwardCount).toBeGreaterThan(0)
    expect(inwardCount).toBe(0)
  })

  it('should handle 4D hypercube projection correctly', () => {
    const vertices = generate4DHypercube()
    const faces = computeConvexHullFaces(vertices)

    // 4D hypercube boundary when projected has triangulated square faces
    // The exact count depends on the projection, but should be non-zero
    expect(faces.length).toBeGreaterThan(0)

    // All faces should be valid triangles
    faces.forEach((face) => {
      expect(face).toHaveLength(3)
      const [a, b, c] = face
      // All different vertices
      expect(a).not.toBe(b)
      expect(b).not.toBe(c)
      expect(a).not.toBe(c)
    })
  })
})

describe('getConvexHullStats', () => {
  it('should return null for degenerate cases', () => {
    expect(getConvexHullStats([])).toBeNull()
    expect(getConvexHullStats([[0, 0, 0]])).toBeNull()
  })

  it('should return stats for valid polytopes', () => {
    const tetrahedron = [
      [1, 1, 1],
      [1, -1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
    ]

    const stats = getConvexHullStats(tetrahedron)
    expect(stats).not.toBeNull()
    expect(stats!.dimension).toBe(3)
    expect(stats!.actualDimension).toBe(3)
    expect(stats!.vertexCount).toBe(4)
    expect(stats!.facetCount).toBe(4)
    expect(stats!.triangleCount).toBe(4)
  })

  it('should return stats for D_4 root system', () => {
    const vertices = generateDRoots(4, 1.0)
    const stats = getConvexHullStats(vertices)

    expect(stats).not.toBeNull()
    expect(stats!.dimension).toBe(4)
    expect(stats!.actualDimension).toBe(4) // D_4 roots are full 4D
    expect(stats!.vertexCount).toBe(24)
    expect(stats!.facetCount).toBeGreaterThan(0)
    expect(stats!.triangleCount).toBeGreaterThan(0)
  })

  it('should detect reduced dimension for A_n root system', () => {
    const vertices = generateARoots(4, 1.0)
    const stats = getConvexHullStats(vertices)

    expect(stats).not.toBeNull()
    expect(stats!.dimension).toBe(4)
    expect(stats!.actualDimension).toBe(3) // A_3 roots lie in 3D hyperplane
    expect(stats!.triangleCount).toBeGreaterThan(0)
  })
})
