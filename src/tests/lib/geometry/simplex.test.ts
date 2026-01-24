/**
 * Tests for simplex generation
 */

import { describe, it, expect } from 'vitest'
import { generateSimplex } from '@/lib/geometry/simplex'

describe('generateSimplex', () => {
  describe('dimension validation', () => {
    it('should throw error for dimension < 2', () => {
      expect(() => generateSimplex(1)).toThrow('Simplex dimension must be at least 2')
      expect(() => generateSimplex(0)).toThrow('Simplex dimension must be at least 2')
    })

    it('should accept dimension >= 3', () => {
      expect(() => generateSimplex(3)).not.toThrow()
      expect(() => generateSimplex(4)).not.toThrow()
      expect(() => generateSimplex(5)).not.toThrow()
      expect(() => generateSimplex(6)).not.toThrow()
    })
  })

  describe('3D simplex (tetrahedron)', () => {
    it('should have 4 vertices', () => {
      const tetrahedron = generateSimplex(3)
      expect(tetrahedron.vertices).toHaveLength(4)
    })

    it('should have 6 edges', () => {
      const tetrahedron = generateSimplex(3)
      expect(tetrahedron.edges).toHaveLength(6)
    })

    it('should have correct type and dimension', () => {
      const tetrahedron = generateSimplex(3)
      expect(tetrahedron.type).toBe('simplex')
      expect(tetrahedron.dimension).toBe(3)
    })

    it('should have all vertices with 3 coordinates', () => {
      const tetrahedron = generateSimplex(3)
      tetrahedron.vertices.forEach((vertex) => {
        expect(vertex).toHaveLength(3)
      })
    })
  })

  describe('4D simplex (pentachoron)', () => {
    it('should have 5 vertices', () => {
      const pentachoron = generateSimplex(4)
      expect(pentachoron.vertices).toHaveLength(5)
    })

    it('should have 10 edges', () => {
      const pentachoron = generateSimplex(4)
      expect(pentachoron.edges).toHaveLength(10)
    })

    it('should have correct type and dimension', () => {
      const pentachoron = generateSimplex(4)
      expect(pentachoron.type).toBe('simplex')
      expect(pentachoron.dimension).toBe(4)
    })

    it('should have all vertices with 4 coordinates', () => {
      const pentachoron = generateSimplex(4)
      pentachoron.vertices.forEach((vertex) => {
        expect(vertex).toHaveLength(4)
      })
    })
  })

  describe('5D simplex (hexateron)', () => {
    it('should have 6 vertices (n+1)', () => {
      const hexateron = generateSimplex(5)
      expect(hexateron.vertices).toHaveLength(6)
    })

    it('should have 15 edges ((n+1)*n/2)', () => {
      const hexateron = generateSimplex(5)
      expect(hexateron.edges).toHaveLength(15)
    })

    it('should have correct type and dimension', () => {
      const hexateron = generateSimplex(5)
      expect(hexateron.type).toBe('simplex')
      expect(hexateron.dimension).toBe(5)
    })
  })

  describe('6D simplex (heptapeton)', () => {
    it('should have 7 vertices (n+1)', () => {
      const simplex = generateSimplex(6)
      expect(simplex.vertices).toHaveLength(7)
    })

    it('should have 21 edges ((n+1)*n/2)', () => {
      const simplex = generateSimplex(6)
      expect(simplex.edges).toHaveLength(21)
    })

    it('should have correct type and dimension', () => {
      const simplex = generateSimplex(6)
      expect(simplex.type).toBe('simplex')
      expect(simplex.dimension).toBe(6)
    })
  })

  describe('edge connectivity', () => {
    it('should connect all pairs of vertices (complete graph)', () => {
      const tetrahedron = generateSimplex(3)
      const n = tetrahedron.vertices.length

      // Should have n*(n-1)/2 edges
      expect(tetrahedron.edges).toHaveLength((n * (n - 1)) / 2)

      // Check that all pairs exist
      const edgeSet = new Set<string>()
      tetrahedron.edges.forEach(([i, j]) => {
        edgeSet.add(`${i},${j}`)
      })

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          expect(edgeSet.has(`${i},${j}`)).toBe(true)
        }
      }
    })

    it('should have no duplicate edges', () => {
      const pentachoron = generateSimplex(4)
      const edgeSet = new Set<string>()

      pentachoron.edges.forEach(([i, j]) => {
        const key = `${i},${j}`
        expect(edgeSet.has(key)).toBe(false)
        edgeSet.add(key)
      })
    })

    it('should have no self-loops', () => {
      const pentachoron = generateSimplex(4)

      pentachoron.edges.forEach(([i, j]) => {
        expect(i).not.toBe(j)
      })
    })

    it('should have i < j for all edges', () => {
      const pentachoron = generateSimplex(4)

      pentachoron.edges.forEach(([i, j]) => {
        expect(i).toBeLessThan(j)
      })
    })
  })

  describe('vertex normalization', () => {
    it('should have all coordinates within [-1, 1]', () => {
      const pentachoron = generateSimplex(4)

      pentachoron.vertices.forEach((vertex) => {
        vertex.forEach((coord) => {
          expect(coord).toBeGreaterThanOrEqual(-1)
          expect(coord).toBeLessThanOrEqual(1)
        })
      })
    })

    it('should be centered near origin', () => {
      const pentachoron = generateSimplex(4)
      const dim = pentachoron.dimension

      // Calculate centroid
      const centroid = new Array(dim).fill(0)
      pentachoron.vertices.forEach((vertex) => {
        vertex.forEach((coord, i) => {
          centroid[i] += coord
        })
      })
      centroid.forEach((_, i) => {
        centroid[i] /= pentachoron.vertices.length
      })

      // Centroid should be very close to origin
      centroid.forEach((coord) => {
        expect(Math.abs(coord)).toBeLessThan(1e-10)
      })
    })
  })

  describe('mathematical formulas', () => {
    it('should match vertex count formula n+1', () => {
      for (let n = 3; n <= 6; n++) {
        const simplex = generateSimplex(n)
        expect(simplex.vertices.length).toBe(n + 1)
      }
    })

    it('should match edge count formula (n+1)*n/2', () => {
      for (let n = 3; n <= 6; n++) {
        const simplex = generateSimplex(n)
        expect(simplex.edges.length).toBe(((n + 1) * n) / 2)
      }
    })
  })
})
