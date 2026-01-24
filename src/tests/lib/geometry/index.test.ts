/**
 * Integration tests for geometry library
 * Tests the main API and utilities
 */

import { describe, it, expect } from 'vitest'
import {
  generatePolytope,
  getPolytopeProperties,
  getAvailableTypesForDimension,
  generateHypercube,
  generateSimplex,
  generateCrossPolytope,
  type PolytopeType,
} from '@/lib/geometry'

describe('geometry library API', () => {
  describe('generatePolytope', () => {
    it('should generate hypercube when type is "hypercube"', () => {
      const polytope = generatePolytope('hypercube', 4)
      expect(polytope.type).toBe('hypercube')
      expect(polytope.dimension).toBe(4)
      expect(polytope.vertices).toHaveLength(16)
      expect(polytope.edges).toHaveLength(32)
    })

    it('should generate simplex when type is "simplex"', () => {
      const polytope = generatePolytope('simplex', 4)
      expect(polytope.type).toBe('simplex')
      expect(polytope.dimension).toBe(4)
      expect(polytope.vertices).toHaveLength(5)
      expect(polytope.edges).toHaveLength(10)
    })

    it('should generate cross-polytope when type is "cross-polytope"', () => {
      const polytope = generatePolytope('cross-polytope', 4)
      expect(polytope.type).toBe('cross-polytope')
      expect(polytope.dimension).toBe(4)
      expect(polytope.vertices).toHaveLength(8)
      expect(polytope.edges).toHaveLength(24)
    })

    it('should throw error for invalid type', () => {
      expect(() => generatePolytope('invalid' as PolytopeType, 4)).toThrow('Unknown polytope type')
    })
  })

  describe('getPolytopeProperties', () => {
    it('should return correct properties for hypercube', () => {
      const hypercube = generateHypercube(4)
      const props = getPolytopeProperties(hypercube)

      expect(props.vertexCount).toBe(16)
      expect(props.edgeCount).toBe(32)
      expect(props.vertexFormula).toBe('2^n')
      expect(props.edgeFormula).toBe('n·2^(n-1)')
    })

    it('should return correct properties for simplex', () => {
      const simplex = generateSimplex(4)
      const props = getPolytopeProperties(simplex)

      expect(props.vertexCount).toBe(5)
      expect(props.edgeCount).toBe(10)
      expect(props.vertexFormula).toBe('n+1')
      expect(props.edgeFormula).toBe('(n+1)·n/2')
    })

    it('should return correct properties for cross-polytope', () => {
      const cross = generateCrossPolytope(4)
      const props = getPolytopeProperties(cross)

      expect(props.vertexCount).toBe(8)
      expect(props.edgeCount).toBe(24)
      expect(props.vertexFormula).toBe('2n')
      expect(props.edgeFormula).toBe('2n(n-1)')
    })
  })

  describe('getAvailableTypesForDimension', () => {
    it('should return all object types (polytopes and extended)', () => {
      const types = getAvailableTypesForDimension(4)
      expect(types).toHaveLength(11)

      const typeNames = types.map((t) => t.type)
      // Polytopes
      expect(typeNames).toContain('hypercube')
      expect(typeNames).toContain('simplex')
      expect(typeNames).toContain('cross-polytope')
      // Extended objects
      expect(typeNames).toContain('root-system')
      expect(typeNames).toContain('clifford-torus')
      expect(typeNames).toContain('nested-torus')
      expect(typeNames).toContain('mandelbulb')
      expect(typeNames).toContain('quaternion-julia')
      expect(typeNames).toContain('schroedinger')
      expect(typeNames).toContain('blackhole')
    })

    it('should include name, description, and availability for each type', () => {
      const types = getAvailableTypesForDimension(4)

      types.forEach((type) => {
        expect(type.type).toBeDefined()
        expect(type.name).toBeDefined()
        expect(type.description).toBeDefined()
        expect(typeof type.name).toBe('string')
        expect(typeof type.description).toBe('string')
        expect(typeof type.available).toBe('boolean')
      })
    })

    it('should mark Clifford torus as available for dimension 3+', () => {
      const types3D = getAvailableTypesForDimension(3)
      const cliffordTorus3D = types3D.find((t) => t.type === 'clifford-torus')
      expect(cliffordTorus3D?.available).toBe(true)

      const types4D = getAvailableTypesForDimension(4)
      const cliffordTorus4D = types4D.find((t) => t.type === 'clifford-torus')
      expect(cliffordTorus4D?.available).toBe(true)
    })

    it('should mark all types as available for dimension 4', () => {
      const types = getAvailableTypesForDimension(4)
      types.forEach((type) => {
        expect(type.available).toBe(true)
      })
    })

    it('should mark mandelbulb as available for dimensions 3-11', () => {
      // Available for 3-11
      for (const dim of [3, 4, 5, 6, 7, 8, 9, 10, 11]) {
        const types = getAvailableTypesForDimension(dim)
        const mandelbulb = types.find((t) => t.type === 'mandelbulb')
        expect(mandelbulb?.available).toBe(true)
      }
    })

    it('should mark mandelbulb as unavailable for dimension > 11', () => {
      // Currently app only supports up to dimension 6, but test the constraint
      const types = getAvailableTypesForDimension(12)
      const mandelbulb = types.find((t) => t.type === 'mandelbulb')
      expect(mandelbulb?.available).toBe(false)
      expect(mandelbulb?.disabledReason).toContain('11')
    })
  })

  describe('edge validation across all types', () => {
    const types: PolytopeType[] = ['hypercube', 'simplex', 'cross-polytope']

    types.forEach((type) => {
      describe(`${type} edge validation`, () => {
        it('should have no duplicate edges', () => {
          const polytope = generatePolytope(type, 4)
          const edgeSet = new Set<string>()

          polytope.edges.forEach(([i, j]) => {
            const key = `${i},${j}`
            expect(edgeSet.has(key)).toBe(false)
            edgeSet.add(key)
          })
        })

        it('should have no self-loops', () => {
          const polytope = generatePolytope(type, 4)

          polytope.edges.forEach(([i, j]) => {
            expect(i).not.toBe(j)
          })
        })

        it('should have i < j for all edges (canonical ordering)', () => {
          const polytope = generatePolytope(type, 4)

          polytope.edges.forEach(([i, j]) => {
            expect(i).toBeLessThan(j)
          })
        })

        it('should have all vertex indices valid', () => {
          const polytope = generatePolytope(type, 4)
          const vertexCount = polytope.vertices.length

          polytope.edges.forEach(([i, j]) => {
            expect(i).toBeGreaterThanOrEqual(0)
            expect(i).toBeLessThan(vertexCount)
            expect(j).toBeGreaterThanOrEqual(0)
            expect(j).toBeLessThan(vertexCount)
          })
        })
      })
    })
  })

  describe('vertex normalization across all types', () => {
    const types: PolytopeType[] = ['hypercube', 'simplex', 'cross-polytope']

    types.forEach((type) => {
      describe(`${type} vertex normalization`, () => {
        it('should have all coordinates within [-1, 1]', () => {
          const polytope = generatePolytope(type, 4)

          polytope.vertices.forEach((vertex) => {
            vertex.forEach((coord) => {
              expect(coord).toBeGreaterThanOrEqual(-1)
              expect(coord).toBeLessThanOrEqual(1)
            })
          })
        })

        it('should have correct dimensionality for all vertices', () => {
          const polytope = generatePolytope(type, 5)

          polytope.vertices.forEach((vertex) => {
            expect(vertex).toHaveLength(5)
          })
        })

        it('should have numeric coordinates only', () => {
          const polytope = generatePolytope(type, 4)

          polytope.vertices.forEach((vertex) => {
            vertex.forEach((coord) => {
              expect(typeof coord).toBe('number')
              expect(Number.isFinite(coord)).toBe(true)
              expect(Number.isNaN(coord)).toBe(false)
            })
          })
        })
      })
    })
  })

  describe('deterministic generation', () => {
    it('should generate identical polytopes for same inputs', () => {
      const hypercube1 = generateHypercube(4)
      const hypercube2 = generateHypercube(4)

      expect(hypercube1.vertices.length).toBe(hypercube2.vertices.length)
      expect(hypercube1.edges.length).toBe(hypercube2.edges.length)

      // Vertices should be identical
      hypercube1.vertices.forEach((v1, i) => {
        const v2 = hypercube2.vertices[i]!
        expect(v1.length).toBe(v2.length)
        v1.forEach((coord, j) => {
          expect(coord).toBe(v2[j])
        })
      })

      // Edges should be identical
      hypercube1.edges.forEach((e1, i) => {
        const e2 = hypercube2.edges[i]!
        expect(e1[0]).toBe(e2[0])
        expect(e1[1]).toBe(e2[1])
      })
    })
  })

  describe('dimension scaling', () => {
    it('should have increasing vertex counts with dimension', () => {
      for (let dim = 3; dim <= 6; dim++) {
        const hypercube = generateHypercube(dim)
        expect(hypercube.vertices.length).toBe(Math.pow(2, dim))

        const simplex = generateSimplex(dim)
        expect(simplex.vertices.length).toBe(dim + 1)

        const cross = generateCrossPolytope(dim)
        expect(cross.vertices.length).toBe(2 * dim)
      }
    })

    it('should have increasing edge counts with dimension', () => {
      for (let dim = 3; dim <= 6; dim++) {
        const hypercube = generateHypercube(dim)
        expect(hypercube.edges.length).toBe(dim * Math.pow(2, dim - 1))

        const simplex = generateSimplex(dim)
        expect(simplex.edges.length).toBe(((dim + 1) * dim) / 2)

        const cross = generateCrossPolytope(dim)
        expect(cross.edges.length).toBe(2 * dim * (dim - 1))
      }
    })
  })
})
