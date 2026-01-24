/**
 * Tests for face detection algorithm
 */

import { describe, it, expect } from 'vitest'
import { detectFaces } from '@/lib/geometry/faces'
import { generateHypercube } from '@/lib/geometry/hypercube'
import { generateSimplex } from '@/lib/geometry/simplex'
import { generateCrossPolytope } from '@/lib/geometry/cross-polytope'
import { generateRootSystem } from '@/lib/geometry/extended/root-system'

describe('detectFaces', () => {
  describe('input validation', () => {
    it('should throw error for empty vertices array', () => {
      expect(() => detectFaces([], [[0, 1]], 'hypercube')).toThrow('Vertices array cannot be empty')
    })

    it('should throw error for empty edges array', () => {
      expect(() => detectFaces([[0, 0, 0]], [], 'hypercube')).toThrow('Edges array cannot be empty')
    })

    it('should throw error for invalid edge indices', () => {
      const vertices = [
        [0, 0, 0],
        [1, 1, 1],
      ]
      const edges: [number, number][] = [[0, 5]] // Index 5 doesn't exist

      expect(() => detectFaces(vertices, edges, 'hypercube')).toThrow(
        'Edge [0, 5] references non-existent vertex'
      )
    })

    it('should throw error for negative edge indices', () => {
      const vertices = [
        [0, 0, 0],
        [1, 1, 1],
      ]
      const edges: [number, number][] = [[-1, 1]]

      expect(() => detectFaces(vertices, edges, 'hypercube')).toThrow(
        'Edge [-1, 1] references non-existent vertex'
      )
    })
  })

  describe('3D cube (hypercube) faces', () => {
    it('should detect 6 faces for a 3D cube', () => {
      const cube = generateHypercube(3)
      const faces = detectFaces(cube.vertices, cube.edges, 'hypercube')

      expect(faces).toHaveLength(6)
    })

    it('should have all quadrilateral faces (4 vertices each)', () => {
      const cube = generateHypercube(3)
      const faces = detectFaces(cube.vertices, cube.edges, 'hypercube')

      faces.forEach((face) => {
        expect(face.vertices).toHaveLength(4)
      })
    })

    it('should have valid vertex indices within bounds', () => {
      const cube = generateHypercube(3)
      const faces = detectFaces(cube.vertices, cube.edges, 'hypercube')

      faces.forEach((face) => {
        face.vertices.forEach((idx) => {
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(cube.vertices.length)
        })
      })
    })

    it('should have no duplicate vertices in each face', () => {
      const cube = generateHypercube(3)
      const faces = detectFaces(cube.vertices, cube.edges, 'hypercube')

      faces.forEach((face) => {
        const uniqueVertices = new Set(face.vertices)
        expect(uniqueVertices.size).toBe(face.vertices.length)
      })
    })

    it('should have unique faces (no duplicates)', () => {
      const cube = generateHypercube(3)
      const faces = detectFaces(cube.vertices, cube.edges, 'hypercube')

      const faceSet = new Set<string>()
      faces.forEach((face) => {
        const key = [...face.vertices].sort((a, b) => a - b).join(',')
        expect(faceSet.has(key)).toBe(false)
        faceSet.add(key)
      })
    })
  })

  describe('4D hypercube (tesseract) faces', () => {
    it('should detect 24 faces for a 4D hypercube', () => {
      const tesseract = generateHypercube(4)
      const faces = detectFaces(tesseract.vertices, tesseract.edges, 'hypercube')

      // A 4D hypercube has 24 square faces
      // Formula: For n-dimensional hypercube, number of k-faces is 2^(n-k) * C(n,k)
      // For 4D, 2-faces: 2^(4-2) * C(4,2) = 4 * 6 = 24
      expect(faces).toHaveLength(24)
    })

    it('should have all quadrilateral faces', () => {
      const tesseract = generateHypercube(4)
      const faces = detectFaces(tesseract.vertices, tesseract.edges, 'hypercube')

      faces.forEach((face) => {
        expect(face.vertices).toHaveLength(4)
      })
    })

    it('should have valid vertex indices', () => {
      const tesseract = generateHypercube(4)
      const faces = detectFaces(tesseract.vertices, tesseract.edges, 'hypercube')

      faces.forEach((face) => {
        face.vertices.forEach((idx) => {
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(tesseract.vertices.length)
        })
      })
    })

    it('should form valid quads (consecutive vertices connected by edges)', () => {
      const tesseract = generateHypercube(4)
      const faces = detectFaces(tesseract.vertices, tesseract.edges, 'hypercube')

      // Create edge lookup for quick checking
      const edgeSet = new Set<string>()
      tesseract.edges.forEach(([v1, v2]) => {
        edgeSet.add(`${Math.min(v1, v2)},${Math.max(v1, v2)}`)
      })

      faces.forEach((face) => {
        const verts = face.vertices
        // Check that we have at least some edges connecting the quad vertices
        let edgeCount = 0
        for (let i = 0; i < verts.length; i++) {
          for (let j = i + 1; j < verts.length; j++) {
            const v1 = verts[i]!
            const v2 = verts[j]!
            const key = `${Math.min(v1, v2)},${Math.max(v1, v2)}`
            if (edgeSet.has(key)) {
              edgeCount++
            }
          }
        }
        // A proper quad should have exactly 4 edges forming the perimeter
        expect(edgeCount).toBe(4)
      })
    })
  })

  describe('5D hypercube faces', () => {
    it('should detect correct number of faces for a 5D hypercube', () => {
      const penteract = generateHypercube(5)
      const faces = detectFaces(penteract.vertices, penteract.edges, 'hypercube')

      // Formula: 2^(5-2) * C(5,2) = 8 * 10 = 80
      expect(faces).toHaveLength(80)
    })

    it('should have all quadrilateral faces', () => {
      const penteract = generateHypercube(5)
      const faces = detectFaces(penteract.vertices, penteract.edges, 'hypercube')

      faces.forEach((face) => {
        expect(face.vertices).toHaveLength(4)
      })
    })
  })

  describe('6D hypercube faces', () => {
    it('should detect correct number of faces for a 6D hypercube', () => {
      const hexeract = generateHypercube(6)
      const faces = detectFaces(hexeract.vertices, hexeract.edges, 'hypercube')

      // Formula: 2^(6-2) * C(6,2) = 16 * 15 = 240
      expect(faces).toHaveLength(240)
    })

    it('should have all quadrilateral faces', () => {
      const hexeract = generateHypercube(6)
      const faces = detectFaces(hexeract.vertices, hexeract.edges, 'hypercube')

      faces.forEach((face) => {
        expect(face.vertices).toHaveLength(4)
      })
    })
  })

  describe('3D simplex (tetrahedron) faces', () => {
    it('should detect 4 triangular faces for a tetrahedron', () => {
      const tetrahedron = generateSimplex(3)
      const faces = detectFaces(tetrahedron.vertices, tetrahedron.edges, 'simplex')

      // A tetrahedron has 4 triangular faces
      expect(faces).toHaveLength(4)
    })

    it('should have all triangular faces (3 vertices each)', () => {
      const tetrahedron = generateSimplex(3)
      const faces = detectFaces(tetrahedron.vertices, tetrahedron.edges, 'simplex')

      faces.forEach((face) => {
        expect(face.vertices).toHaveLength(3)
      })
    })

    it('should have valid vertex indices', () => {
      const tetrahedron = generateSimplex(3)
      const faces = detectFaces(tetrahedron.vertices, tetrahedron.edges, 'simplex')

      faces.forEach((face) => {
        face.vertices.forEach((idx) => {
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(tetrahedron.vertices.length)
        })
      })
    })

    it('should form valid triangles (all vertices connected)', () => {
      const tetrahedron = generateSimplex(3)
      const faces = detectFaces(tetrahedron.vertices, tetrahedron.edges, 'simplex')

      // Create edge lookup
      const edgeSet = new Set<string>()
      tetrahedron.edges.forEach(([v1, v2]) => {
        edgeSet.add(`${Math.min(v1, v2)},${Math.max(v1, v2)}`)
      })

      faces.forEach((face) => {
        const [v1, v2, v3] = face.vertices
        // All three edges of the triangle must exist
        expect(edgeSet.has(`${Math.min(v1!, v2!)},${Math.max(v1!, v2!)}`)).toBe(true)
        expect(edgeSet.has(`${Math.min(v2!, v3!)},${Math.max(v2!, v3!)}`)).toBe(true)
        expect(edgeSet.has(`${Math.min(v1!, v3!)},${Math.max(v1!, v3!)}`)).toBe(true)
      })
    })
  })

  describe('4D simplex (pentachoron) faces', () => {
    it('should detect 10 triangular faces for a pentachoron', () => {
      const pentachoron = generateSimplex(4)
      const faces = detectFaces(pentachoron.vertices, pentachoron.edges, 'simplex')

      // A pentachoron (4-simplex) has C(5,3) = 10 triangular faces
      expect(faces).toHaveLength(10)
    })

    it('should have all triangular faces', () => {
      const pentachoron = generateSimplex(4)
      const faces = detectFaces(pentachoron.vertices, pentachoron.edges, 'simplex')

      faces.forEach((face) => {
        expect(face.vertices).toHaveLength(3)
      })
    })
  })

  describe('5D simplex faces', () => {
    it('should detect correct number of triangular faces for a 5D simplex', () => {
      const simplex5d = generateSimplex(5)
      const faces = detectFaces(simplex5d.vertices, simplex5d.edges, 'simplex')

      // A 5-simplex has C(6,3) = 20 triangular faces
      expect(faces).toHaveLength(20)
    })

    it('should have all triangular faces', () => {
      const simplex5d = generateSimplex(5)
      const faces = detectFaces(simplex5d.vertices, simplex5d.edges, 'simplex')

      faces.forEach((face) => {
        expect(face.vertices).toHaveLength(3)
      })
    })
  })

  describe('3D cross-polytope (octahedron) faces', () => {
    it('should detect 8 triangular faces for an octahedron', () => {
      const octahedron = generateCrossPolytope(3)
      const faces = detectFaces(octahedron.vertices, octahedron.edges, 'cross-polytope')

      // An octahedron has 8 triangular faces
      expect(faces).toHaveLength(8)
    })

    it('should have all triangular faces', () => {
      const octahedron = generateCrossPolytope(3)
      const faces = detectFaces(octahedron.vertices, octahedron.edges, 'cross-polytope')

      faces.forEach((face) => {
        expect(face.vertices).toHaveLength(3)
      })
    })

    it('should have valid vertex indices', () => {
      const octahedron = generateCrossPolytope(3)
      const faces = detectFaces(octahedron.vertices, octahedron.edges, 'cross-polytope')

      faces.forEach((face) => {
        face.vertices.forEach((idx) => {
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(octahedron.vertices.length)
        })
      })
    })
  })

  describe('4D cross-polytope faces', () => {
    it('should detect 32 triangular faces for a 4D cross-polytope', () => {
      const crossPolytope4d = generateCrossPolytope(4)
      const faces = detectFaces(crossPolytope4d.vertices, crossPolytope4d.edges, 'cross-polytope')

      // A 4D cross-polytope (16-cell) has 32 triangular faces
      expect(faces).toHaveLength(32)
    })

    it('should have all triangular faces', () => {
      const crossPolytope4d = generateCrossPolytope(4)
      const faces = detectFaces(crossPolytope4d.vertices, crossPolytope4d.edges, 'cross-polytope')

      faces.forEach((face) => {
        expect(face.vertices).toHaveLength(3)
      })
    })
  })

  describe('5D cross-polytope faces', () => {
    it('should detect correct number of faces for a 5D cross-polytope', () => {
      const crossPolytope5d = generateCrossPolytope(5)
      const faces = detectFaces(crossPolytope5d.vertices, crossPolytope5d.edges, 'cross-polytope')

      // A 5D cross-polytope has 80 triangular faces
      expect(faces).toHaveLength(80)
    })

    it('should have all triangular faces', () => {
      const crossPolytope5d = generateCrossPolytope(5)
      const faces = detectFaces(crossPolytope5d.vertices, crossPolytope5d.edges, 'cross-polytope')

      faces.forEach((face) => {
        expect(face.vertices).toHaveLength(3)
      })
    })
  })

  describe('face properties', () => {
    it('should return faces with vertices in winding order (consecutive vertices connected)', () => {
      const cube = generateHypercube(3)
      const faces = detectFaces(cube.vertices, cube.edges, 'hypercube')

      // Create edge lookup
      const edgeSet = new Set<string>()
      cube.edges.forEach(([v1, v2]) => {
        edgeSet.add(`${Math.min(v1, v2)},${Math.max(v1, v2)}`)
      })

      faces.forEach((face) => {
        const verts = face.vertices
        // For quads, consecutive vertices (including wrap-around) must be connected by edges
        for (let i = 0; i < verts.length; i++) {
          const v1 = verts[i]!
          const v2 = verts[(i + 1) % verts.length]!
          const edgeKey = `${Math.min(v1, v2)},${Math.max(v1, v2)}`
          expect(edgeSet.has(edgeKey)).toBe(true)
        }
      })
    })

    it('should have optional normal property (undefined by default)', () => {
      const cube = generateHypercube(3)
      const faces = detectFaces(cube.vertices, cube.edges, 'hypercube')

      faces.forEach((face) => {
        expect(face.normal).toBeUndefined()
      })
    })
  })

  describe('edge cases', () => {
    it('should handle small polytope (single triangle)', () => {
      const vertices = [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ]
      const edges: [number, number][] = [
        [0, 1],
        [1, 2],
        [2, 0],
      ]

      const faces = detectFaces(vertices, edges, 'simplex')
      expect(faces).toHaveLength(1)
      expect(faces[0]!.vertices).toHaveLength(3)
    })

    it('should handle disconnected vertices (only process connected components)', () => {
      const vertices = [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [5, 5, 5], // Disconnected vertex
      ]
      const edges: [number, number][] = [
        [0, 1],
        [1, 2],
        [2, 0],
      ]

      // Should still find the triangle formed by connected vertices
      const faces = detectFaces(vertices, edges, 'simplex')
      expect(faces).toHaveLength(1)
    })

    it('should handle polytope with no valid faces', () => {
      // Just a line segment - no faces
      const vertices = [
        [0, 0, 0],
        [1, 0, 0],
      ]
      const edges: [number, number][] = [[0, 1]]

      const faces = detectFaces(vertices, edges, 'simplex')
      expect(faces).toHaveLength(0)
    })
  })

  describe('root system faces (metadata from analyticalFaces)', () => {
    it('should detect faces for A_3 root system (4D) via metadata', () => {
      const rootSystem = generateRootSystem(4, { rootType: 'A', scale: 1.0 })
      // Root systems now use 'metadata' face detection - must pass metadata
      const faces = detectFaces(
        rootSystem.vertices,
        rootSystem.edges,
        'root-system',
        rootSystem.metadata
      )

      // A_3 root polytope should have many triangular faces
      expect(faces.length).toBeGreaterThan(0)

      // All faces should be triangular
      faces.forEach((face) => {
        expect(face.vertices).toHaveLength(3)
      })

      // All vertex indices should be valid
      faces.forEach((face) => {
        face.vertices.forEach((idx) => {
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(rootSystem.vertices.length)
        })
      })
    })

    it('should detect faces for D_4 root system (24-cell) via metadata', () => {
      const rootSystem = generateRootSystem(4, { rootType: 'D', scale: 1.0 })
      const faces = detectFaces(
        rootSystem.vertices,
        rootSystem.edges,
        'root-system',
        rootSystem.metadata
      )

      // D_4 (24-cell) has many triangular faces
      expect(faces.length).toBeGreaterThan(0)

      // All faces should be triangular
      faces.forEach((face) => {
        expect(face.vertices).toHaveLength(3)
      })
    })

    it('should detect faces for A_4 root system (5D) via metadata', () => {
      const rootSystem = generateRootSystem(5, { rootType: 'A', scale: 1.0 })
      const faces = detectFaces(
        rootSystem.vertices,
        rootSystem.edges,
        'root-system',
        rootSystem.metadata
      )

      expect(faces.length).toBeGreaterThan(0)

      faces.forEach((face) => {
        expect(face.vertices).toHaveLength(3)
      })
    })

    it('should detect faces for D_5 root system (5D) via metadata', () => {
      const rootSystem = generateRootSystem(5, { rootType: 'D', scale: 1.0 })
      const faces = detectFaces(
        rootSystem.vertices,
        rootSystem.edges,
        'root-system',
        rootSystem.metadata
      )

      expect(faces.length).toBeGreaterThan(0)

      faces.forEach((face) => {
        expect(face.vertices).toHaveLength(3)
      })
    })

    it('should detect faces for E_8 root system (8D) via metadata', { timeout: 10000 }, () => {
      const rootSystem = generateRootSystem(8, { rootType: 'E8', scale: 1.0 })
      const faces = detectFaces(
        rootSystem.vertices,
        rootSystem.edges,
        'root-system',
        rootSystem.metadata
      )

      // E_8 polytope should have many triangular faces
      expect(faces.length).toBeGreaterThan(0)

      // All faces should be triangular
      faces.forEach((face) => {
        expect(face.vertices).toHaveLength(3)
      })

      // All indices should be valid
      faces.forEach((face) => {
        face.vertices.forEach((idx) => {
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(240)
        })
      })
    })

    it('should have unique faces (no duplicates)', () => {
      const rootSystem = generateRootSystem(4, { rootType: 'A', scale: 1.0 })
      const faces = detectFaces(
        rootSystem.vertices,
        rootSystem.edges,
        'root-system',
        rootSystem.metadata
      )

      const faceSet = new Set<string>()
      faces.forEach((face) => {
        const key = [...face.vertices].sort((a, b) => a - b).join(',')
        expect(faceSet.has(key)).toBe(false)
        faceSet.add(key)
      })
    })

    it('should cover all vertices with faces for high-D A root system', () => {
      // A_7 (8D) - the case from the bug report where convex-hull was failing
      const rootSystem = generateRootSystem(8, { rootType: 'A', scale: 1.0 })
      const faces = detectFaces(
        rootSystem.vertices,
        rootSystem.edges,
        'root-system',
        rootSystem.metadata
      )

      // Collect all vertices covered by faces
      const coveredVertices = new Set<number>()
      faces.forEach((face) => {
        face.vertices.forEach((idx) => coveredVertices.add(idx))
      })

      // All 56 vertices should be covered (this was failing with convex-hull)
      expect(rootSystem.vertices.length).toBe(56)
      expect(coveredVertices.size).toBe(56)
    })
  })

  describe('performance', () => {
    it('should handle 6D hypercube efficiently', () => {
      const hexeract = generateHypercube(6)

      const startTime = performance.now()
      const faces = detectFaces(hexeract.vertices, hexeract.edges, 'hypercube')
      const endTime = performance.now()

      expect(faces).toHaveLength(240)

      // Should complete within reasonable time (< 1 second)
      expect(endTime - startTime).toBeLessThan(1000)
    })

    it('should handle 6D simplex efficiently', () => {
      const simplex6d = generateSimplex(6)

      const startTime = performance.now()
      const faces = detectFaces(simplex6d.vertices, simplex6d.edges, 'simplex')
      const endTime = performance.now()

      // 6-simplex has C(7,3) = 35 triangular faces
      expect(faces).toHaveLength(35)

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(1000)
    })
  })
})
