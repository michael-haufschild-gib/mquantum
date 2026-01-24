/**
 * Tests for cross-polytope generation
 */

import { describe, it, expect } from 'vitest'
import { generateCrossPolytope } from '@/lib/geometry/cross-polytope'

describe('generateCrossPolytope', () => {
  describe('dimension validation', () => {
    it('should throw error for dimension < 2', () => {
      expect(() => generateCrossPolytope(1)).toThrow('Cross-polytope dimension must be at least 2')
      expect(() => generateCrossPolytope(0)).toThrow('Cross-polytope dimension must be at least 2')
    })

    it('should accept dimension >= 3', () => {
      expect(() => generateCrossPolytope(3)).not.toThrow()
      expect(() => generateCrossPolytope(4)).not.toThrow()
      expect(() => generateCrossPolytope(5)).not.toThrow()
      expect(() => generateCrossPolytope(6)).not.toThrow()
    })
  })

  describe('3D cross-polytope (octahedron)', () => {
    it('should have 6 vertices', () => {
      const octahedron = generateCrossPolytope(3)
      expect(octahedron.vertices).toHaveLength(6)
    })

    it('should have 12 edges', () => {
      const octahedron = generateCrossPolytope(3)
      expect(octahedron.edges).toHaveLength(12)
    })

    it('should have correct type and dimension', () => {
      const octahedron = generateCrossPolytope(3)
      expect(octahedron.type).toBe('cross-polytope')
      expect(octahedron.dimension).toBe(3)
    })

    it('should have all vertices with 3 coordinates', () => {
      const octahedron = generateCrossPolytope(3)
      octahedron.vertices.forEach((vertex) => {
        expect(vertex).toHaveLength(3)
      })
    })

    it('should have vertices at ±1 on each axis', () => {
      const octahedron = generateCrossPolytope(3)

      // Should have 2 vertices per axis
      expect(octahedron.vertices).toHaveLength(6)

      // Each vertex should have exactly one non-zero coordinate
      octahedron.vertices.forEach((vertex) => {
        const nonZeroCount = vertex.filter((c) => c !== 0).length
        expect(nonZeroCount).toBe(1)

        const nonZeroCoord = vertex.find((c) => c !== 0)
        expect(Math.abs(nonZeroCoord!)).toBe(1)
      })
    })
  })

  describe('4D cross-polytope (16-cell)', () => {
    it('should have 8 vertices', () => {
      const cross4d = generateCrossPolytope(4)
      expect(cross4d.vertices).toHaveLength(8)
    })

    it('should have 24 edges', () => {
      const cross4d = generateCrossPolytope(4)
      expect(cross4d.edges).toHaveLength(24)
    })

    it('should have correct type and dimension', () => {
      const cross4d = generateCrossPolytope(4)
      expect(cross4d.type).toBe('cross-polytope')
      expect(cross4d.dimension).toBe(4)
    })

    it('should have all vertices with 4 coordinates', () => {
      const cross4d = generateCrossPolytope(4)
      cross4d.vertices.forEach((vertex) => {
        expect(vertex).toHaveLength(4)
      })
    })
  })

  describe('5D cross-polytope', () => {
    it('should have 10 vertices (2n)', () => {
      const cross5d = generateCrossPolytope(5)
      expect(cross5d.vertices).toHaveLength(10)
    })

    it('should have 40 edges (2n(n-1))', () => {
      const cross5d = generateCrossPolytope(5)
      expect(cross5d.edges).toHaveLength(40)
    })

    it('should have correct type and dimension', () => {
      const cross5d = generateCrossPolytope(5)
      expect(cross5d.type).toBe('cross-polytope')
      expect(cross5d.dimension).toBe(5)
    })
  })

  describe('6D cross-polytope', () => {
    it('should have 12 vertices (2n)', () => {
      const cross6d = generateCrossPolytope(6)
      expect(cross6d.vertices).toHaveLength(12)
    })

    it('should have 60 edges (2n(n-1))', () => {
      const cross6d = generateCrossPolytope(6)
      expect(cross6d.edges).toHaveLength(60)
    })

    it('should have correct type and dimension', () => {
      const cross6d = generateCrossPolytope(6)
      expect(cross6d.type).toBe('cross-polytope')
      expect(cross6d.dimension).toBe(6)
    })
  })

  describe('edge connectivity', () => {
    it('should NOT connect vertices on the same axis', () => {
      const octahedron = generateCrossPolytope(3)

      octahedron.edges.forEach(([i, j]) => {
        const axisI = Math.floor(i / 2)
        const axisJ = Math.floor(j / 2)

        // Vertices on same axis should NOT be connected
        expect(axisI).not.toBe(axisJ)
      })
    })

    it('should connect vertices on different axes', () => {
      const octahedron = generateCrossPolytope(3)
      const dim = octahedron.dimension

      // For each pair of different axes, there should be 4 edges (±i to ±j)
      const edgeSet = new Set<string>()
      octahedron.edges.forEach(([i, j]) => {
        edgeSet.add(`${i},${j}`)
      })

      // Count edges between different axes
      for (let axis1 = 0; axis1 < dim; axis1++) {
        for (let axis2 = axis1 + 1; axis2 < dim; axis2++) {
          const v1Pos = axis1 * 2
          const v1Neg = axis1 * 2 + 1
          const v2Pos = axis2 * 2
          const v2Neg = axis2 * 2 + 1

          // All 4 combinations should be connected
          const pairs = [
            [v1Pos, v2Pos],
            [v1Pos, v2Neg],
            [v1Neg, v2Pos],
            [v1Neg, v2Neg],
          ]

          pairs.forEach(([i, j]) => {
            const key = i! < j! ? `${i},${j}` : `${j},${i}`
            expect(edgeSet.has(key)).toBe(true)
          })
        }
      }
    })

    it('should have no duplicate edges', () => {
      const cross4d = generateCrossPolytope(4)
      const edgeSet = new Set<string>()

      cross4d.edges.forEach(([i, j]) => {
        const key = `${i},${j}`
        expect(edgeSet.has(key)).toBe(false)
        edgeSet.add(key)
      })
    })

    it('should have no self-loops', () => {
      const cross4d = generateCrossPolytope(4)

      cross4d.edges.forEach(([i, j]) => {
        expect(i).not.toBe(j)
      })
    })

    it('should have i < j for all edges', () => {
      const cross4d = generateCrossPolytope(4)

      cross4d.edges.forEach(([i, j]) => {
        expect(i).toBeLessThan(j)
      })
    })
  })

  describe('vertex normalization', () => {
    it('should have all coordinates within [-1, 1]', () => {
      const cross4d = generateCrossPolytope(4)

      cross4d.vertices.forEach((vertex) => {
        vertex.forEach((coord) => {
          expect(coord).toBeGreaterThanOrEqual(-1)
          expect(coord).toBeLessThanOrEqual(1)
        })
      })
    })

    it('should have exactly one non-zero coordinate per vertex', () => {
      const cross5d = generateCrossPolytope(5)

      cross5d.vertices.forEach((vertex) => {
        const nonZeroCount = vertex.filter((c) => c !== 0).length
        expect(nonZeroCount).toBe(1)
      })
    })

    it('should have non-zero coordinates be exactly ±1', () => {
      const cross5d = generateCrossPolytope(5)

      cross5d.vertices.forEach((vertex) => {
        const nonZeroCoord = vertex.find((c) => c !== 0)
        expect(Math.abs(nonZeroCoord!)).toBe(1)
      })
    })
  })

  describe('mathematical formulas', () => {
    it('should match vertex count formula 2n', () => {
      for (let n = 3; n <= 6; n++) {
        const cross = generateCrossPolytope(n)
        expect(cross.vertices.length).toBe(2 * n)
      }
    })

    it('should match edge count formula 2n(n-1)', () => {
      for (let n = 3; n <= 6; n++) {
        const cross = generateCrossPolytope(n)
        expect(cross.edges.length).toBe(2 * n * (n - 1))
      }
    })
  })
})
