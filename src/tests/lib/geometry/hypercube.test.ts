/**
 * Tests for hypercube generation
 */

import { describe, it, expect } from 'vitest'
import { generateHypercube } from '@/lib/geometry/hypercube'

describe('generateHypercube', () => {
  describe('dimension validation', () => {
    it('should throw error for dimension < 2', () => {
      expect(() => generateHypercube(1)).toThrow('Hypercube dimension must be at least 2')
      expect(() => generateHypercube(0)).toThrow('Hypercube dimension must be at least 2')
    })

    it('should accept dimension >= 3', () => {
      expect(() => generateHypercube(3)).not.toThrow()
      expect(() => generateHypercube(4)).not.toThrow()
      expect(() => generateHypercube(5)).not.toThrow()
      expect(() => generateHypercube(6)).not.toThrow()
    })
  })

  describe('3D hypercube (cube)', () => {
    it('should have 8 vertices', () => {
      const cube = generateHypercube(3)
      expect(cube.vertices).toHaveLength(8)
    })

    it('should have 12 edges', () => {
      const cube = generateHypercube(3)
      expect(cube.edges).toHaveLength(12)
    })

    it('should have correct type and dimension', () => {
      const cube = generateHypercube(3)
      expect(cube.type).toBe('hypercube')
      expect(cube.dimension).toBe(3)
    })

    it('should have all vertices with 3 coordinates', () => {
      const cube = generateHypercube(3)
      cube.vertices.forEach((vertex) => {
        expect(vertex).toHaveLength(3)
      })
    })

    it('should have vertices at corners (all ±1)', () => {
      const cube = generateHypercube(3)
      cube.vertices.forEach((vertex) => {
        vertex.forEach((coord) => {
          expect(Math.abs(coord)).toBe(1)
        })
      })
    })
  })

  describe('4D hypercube (tesseract)', () => {
    it('should have 16 vertices', () => {
      const tesseract = generateHypercube(4)
      expect(tesseract.vertices).toHaveLength(16)
    })

    it('should have 32 edges', () => {
      const tesseract = generateHypercube(4)
      expect(tesseract.edges).toHaveLength(32)
    })

    it('should have correct type and dimension', () => {
      const tesseract = generateHypercube(4)
      expect(tesseract.type).toBe('hypercube')
      expect(tesseract.dimension).toBe(4)
    })

    it('should have all vertices with 4 coordinates', () => {
      const tesseract = generateHypercube(4)
      tesseract.vertices.forEach((vertex) => {
        expect(vertex).toHaveLength(4)
      })
    })
  })

  describe('5D hypercube (penteract)', () => {
    it('should have 32 vertices (2^5)', () => {
      const penteract = generateHypercube(5)
      expect(penteract.vertices).toHaveLength(32)
    })

    it('should have 80 edges (5 * 2^4)', () => {
      const penteract = generateHypercube(5)
      expect(penteract.edges).toHaveLength(80)
    })

    it('should have correct type and dimension', () => {
      const penteract = generateHypercube(5)
      expect(penteract.type).toBe('hypercube')
      expect(penteract.dimension).toBe(5)
    })
  })

  describe('6D hypercube (hexeract)', () => {
    it('should have 64 vertices (2^6)', () => {
      const hexeract = generateHypercube(6)
      expect(hexeract.vertices).toHaveLength(64)
    })

    it('should have 192 edges (6 * 2^5)', () => {
      const hexeract = generateHypercube(6)
      expect(hexeract.edges).toHaveLength(192)
    })

    it('should have correct type and dimension', () => {
      const hexeract = generateHypercube(6)
      expect(hexeract.type).toBe('hypercube')
      expect(hexeract.dimension).toBe(6)
    })
  })

  describe('edge connectivity', () => {
    it('should only connect vertices differing in exactly one coordinate', () => {
      const cube = generateHypercube(3)

      cube.edges.forEach(([i, j]) => {
        const v1 = cube.vertices[i]!
        const v2 = cube.vertices[j]!

        let diffCount = 0
        for (let k = 0; k < v1.length; k++) {
          if (v1[k] !== v2[k]) {
            diffCount++
          }
        }

        expect(diffCount).toBe(1)
      })
    })

    it('should have no duplicate edges', () => {
      const tesseract = generateHypercube(4)
      const edgeSet = new Set<string>()

      tesseract.edges.forEach(([i, j]) => {
        const key = `${i},${j}`
        expect(edgeSet.has(key)).toBe(false)
        edgeSet.add(key)
      })
    })

    it('should have no self-loops', () => {
      const tesseract = generateHypercube(4)

      tesseract.edges.forEach(([i, j]) => {
        expect(i).not.toBe(j)
      })
    })

    it('should have i < j for all edges', () => {
      const tesseract = generateHypercube(4)

      tesseract.edges.forEach(([i, j]) => {
        expect(i).toBeLessThan(j)
      })
    })
  })

  describe('vertex normalization', () => {
    it('should have all coordinates within [-1, 1]', () => {
      const tesseract = generateHypercube(4)

      tesseract.vertices.forEach((vertex) => {
        vertex.forEach((coord) => {
          expect(coord).toBeGreaterThanOrEqual(-1)
          expect(coord).toBeLessThanOrEqual(1)
        })
      })
    })

    it('should have all coordinates exactly ±1 for hypercube', () => {
      const tesseract = generateHypercube(4)

      tesseract.vertices.forEach((vertex) => {
        vertex.forEach((coord) => {
          expect(Math.abs(coord)).toBe(1)
        })
      })
    })
  })

  describe('mathematical formulas', () => {
    it('should match vertex count formula 2^n', () => {
      for (let n = 3; n <= 6; n++) {
        const hypercube = generateHypercube(n)
        expect(hypercube.vertices.length).toBe(Math.pow(2, n))
      }
    })

    it('should match edge count formula n * 2^(n-1)', () => {
      for (let n = 3; n <= 6; n++) {
        const hypercube = generateHypercube(n)
        expect(hypercube.edges.length).toBe(n * Math.pow(2, n - 1))
      }
    })
  })
})
