/**
 * Tests for Wythoff Polytope Generation
 *
 * Tests the Wythoff construction for generating uniform polytopes
 * in dimensions 3-11.
 */

import {
  DEFAULT_WYTHOFF_POLYTOPE_CONFIG,
  generateWythoffPolytope,
  getWythoffPolytopeInfo,
  getWythoffPresetName,
} from '@/lib/geometry/wythoff'
import { describe, expect, it } from 'vitest'

describe('Wythoff Polytope Generation', () => {
  describe('generateWythoffPolytope', () => {
    it('generates valid polytope in 3D with B symmetry', () => {
      const polytope = generateWythoffPolytope(3, {
        symmetryGroup: 'B',
        preset: 'regular',
        scale: 2.0,
      })

      expect(polytope.dimension).toBe(3)
      expect(polytope.type).toBe('wythoff-polytope')
      expect(polytope.vertices.length).toBeGreaterThan(0)
      expect(polytope.edges.length).toBeGreaterThan(0)

      // Check vertices are properly scaled
      for (const vertex of polytope.vertices) {
        expect(vertex.length).toBe(3)
        for (const coord of vertex) {
          expect(Math.abs(coord)).toBeLessThanOrEqual(2.5) // Within scale tolerance
        }
      }
    })

    it('generates valid polytope in 4D with B symmetry', () => {
      const polytope = generateWythoffPolytope(4, {
        symmetryGroup: 'B',
        preset: 'regular',
        scale: 2.0,
      })

      expect(polytope.dimension).toBe(4)
      expect(polytope.vertices.length).toBeGreaterThan(0)
      expect(polytope.edges.length).toBeGreaterThan(0)

      // 4D vertices should have 4 components
      for (const vertex of polytope.vertices) {
        expect(vertex.length).toBe(4)
      }
    })

    it('generates valid polytope with A symmetry', () => {
      const polytope = generateWythoffPolytope(4, {
        symmetryGroup: 'A',
        preset: 'regular',
        scale: 2.0,
      })

      expect(polytope.dimension).toBe(4)
      expect(polytope.type).toBe('wythoff-polytope')
      expect(polytope.vertices.length).toBeGreaterThan(0)
    })

    it('generates valid polytope with D symmetry (4D+)', () => {
      const polytope = generateWythoffPolytope(4, {
        symmetryGroup: 'D',
        preset: 'regular',
        scale: 2.0,
      })

      expect(polytope.dimension).toBe(4)
      expect(polytope.type).toBe('wythoff-polytope')
      expect(polytope.vertices.length).toBeGreaterThan(0)
    })

    it('throws error for D symmetry in 3D', () => {
      expect(() =>
        generateWythoffPolytope(3, {
          symmetryGroup: 'D',
          preset: 'regular',
        })
      ).toThrow('D_n symmetry requires dimension >= 4')
    })

    it('throws error for dimension < 3', () => {
      expect(() => generateWythoffPolytope(2)).toThrow(
        'Wythoff polytope dimension must be between 3 and 11'
      )
    })

    it('throws error for dimension > 11', () => {
      expect(() => generateWythoffPolytope(12)).toThrow(
        'Wythoff polytope dimension must be between 3 and 11'
      )
    })

    it.each([
      ['regular', 'B', 4],
      ['rectified', 'B', 4],
      ['truncated', 'B', 4],
      ['cantellated', 'B', 4],
      ['runcinated', 'B', 4],
      ['omnitruncated', 'B', 4],
    ] as const)(
      'generates %s preset with %s symmetry in %dD',
      (preset, symmetryGroup, dimension) => {
        const polytope = generateWythoffPolytope(dimension, {
          symmetryGroup,
          preset,
          scale: 2.0,
        })

        expect(polytope.dimension).toBe(dimension)
        expect(polytope.vertices.length).toBeGreaterThan(0)
        expect(polytope.edges.length).toBeGreaterThan(0)
      }
    )

    it('uses default config when no config provided', () => {
      const polytope = generateWythoffPolytope(4)

      expect(polytope.dimension).toBe(4)
      expect(polytope.type).toBe('wythoff-polytope')
      expect(polytope.vertices.length).toBeGreaterThan(0)
    })

    it('generates polytope with snub variant', () => {
      const polytope = generateWythoffPolytope(4, {
        symmetryGroup: 'B',
        preset: 'regular',
        snub: true,
      })

      expect(polytope.dimension).toBe(4)
      expect(polytope.vertices.length).toBeGreaterThan(0)
    })

    it('generates polytope with custom Wythoff symbol', () => {
      const polytope = generateWythoffPolytope(4, {
        symmetryGroup: 'B',
        preset: 'custom',
        customSymbol: [true, false, true, false],
      })

      expect(polytope.dimension).toBe(4)
      expect(polytope.vertices.length).toBeGreaterThan(0)
    })

    it('generates valid edges (no self-loops)', () => {
      const polytope = generateWythoffPolytope(4, {
        symmetryGroup: 'B',
        preset: 'regular',
      })

      for (const [i, j] of polytope.edges) {
        expect(i).not.toBe(j)
        expect(i).toBeGreaterThanOrEqual(0)
        expect(j).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThan(polytope.vertices.length)
        expect(j).toBeLessThan(polytope.vertices.length)
      }
    })

    it('generates polytopes with increasing complexity for higher dimensions', () => {
      const counts3D = generateWythoffPolytope(3, { preset: 'regular' }).vertices.length
      const counts4D = generateWythoffPolytope(4, { preset: 'regular' }).vertices.length
      const counts5D = generateWythoffPolytope(5, { preset: 'regular' }).vertices.length

      // Higher dimensions generally have more vertices
      expect(counts4D).toBeGreaterThanOrEqual(counts3D)
      expect(counts5D).toBeGreaterThanOrEqual(counts4D)
    })
  })

  describe('getWythoffPresetName', () => {
    it('returns correct name for regular B4 polytope', () => {
      const name = getWythoffPresetName('regular', 'B', 4)
      expect(name).toBe('Regular 4D Hypercube')
    })

    it('returns correct name for truncated A5 polytope', () => {
      const name = getWythoffPresetName('truncated', 'A', 5)
      expect(name).toBe('Truncated 5D Simplex')
    })

    it('returns correct name for rectified D6 polytope', () => {
      const name = getWythoffPresetName('rectified', 'D', 6)
      expect(name).toBe('Rectified 6D Demihypercube')
    })
  })

  describe('getWythoffPolytopeInfo', () => {
    it('returns vertex and edge counts', () => {
      const info = getWythoffPolytopeInfo(4, {
        symmetryGroup: 'B',
        preset: 'regular',
      })

      expect(info.vertexCount).toBeGreaterThan(0)
      expect(info.edgeCount).toBeGreaterThan(0)
      expect(info.name).toBe('Regular 4D Hypercube')
    })

    it('uses default config when none provided', () => {
      const info = getWythoffPolytopeInfo(4)

      expect(info.vertexCount).toBeGreaterThan(0)
      expect(info.edgeCount).toBeGreaterThan(0)
    })
  })

  describe('DEFAULT_WYTHOFF_POLYTOPE_CONFIG', () => {
    it('has valid default values', () => {
      expect(DEFAULT_WYTHOFF_POLYTOPE_CONFIG.symmetryGroup).toBe('B')
      expect(DEFAULT_WYTHOFF_POLYTOPE_CONFIG.preset).toBe('regular')
      expect(DEFAULT_WYTHOFF_POLYTOPE_CONFIG.scale).toBe(2.0)
      expect(DEFAULT_WYTHOFF_POLYTOPE_CONFIG.snub).toBe(false)
      expect(Array.isArray(DEFAULT_WYTHOFF_POLYTOPE_CONFIG.customSymbol)).toBe(true)
    })
  })

  describe('dimension support', () => {
    // Lower dimensions (fast)
    it.each([3, 4, 5, 6, 7])('generates valid polytope in %dD', (dimension) => {
      const polytope = generateWythoffPolytope(dimension, {
        symmetryGroup: 'B',
        preset: 'regular',
      })

      expect(polytope.dimension).toBe(dimension)
      expect(polytope.vertices.length).toBeGreaterThan(0)
      expect(polytope.edges.length).toBeGreaterThan(0)

      // All vertices should have correct dimension
      for (const vertex of polytope.vertices) {
        expect(vertex.length).toBe(dimension)
      }
    })

    // Higher dimensions (slower, tested separately)
    it.each([8, 9, 10, 11])('generates valid polytope in %dD (high dimension)', (dimension) => {
      const polytope = generateWythoffPolytope(dimension, {
        symmetryGroup: 'B',
        preset: 'regular',
      })

      expect(polytope.dimension).toBe(dimension)
      expect(polytope.vertices.length).toBeGreaterThan(0)
      expect(polytope.edges.length).toBeGreaterThan(0)

      // Verify vertex dimension
      expect(polytope.vertices[0]?.length).toBe(dimension)
    })
  })

  describe('scale parameter', () => {
    it('generates unit-scale geometry regardless of scale config', () => {
      // Scale refactor: Geometry is always generated at unit scale (±1.0)
      // The scale parameter is stored in metadata for post-projection visual scaling (like camera zoom)
      const smallScaleConfig = generateWythoffPolytope(4, { scale: 1.0 })
      const largeScaleConfig = generateWythoffPolytope(4, { scale: 3.0 })

      // Find maximum coordinate extent
      const getMaxExtent = (vertices: number[][]) => {
        let max = 0
        for (const v of vertices) {
          for (const c of v) {
            max = Math.max(max, Math.abs(c))
          }
        }
        return max
      }

      const smallMax = getMaxExtent(smallScaleConfig.vertices)
      const largeMax = getMaxExtent(largeScaleConfig.vertices)

      // Both should have approximately the same extent (unit-scale ~1.0)
      // because geometry scale is no longer applied at generation time
      expect(smallMax).toBeCloseTo(largeMax, 5)
      expect(smallMax).toBeLessThanOrEqual(1.5) // Unit-scale tolerance
      expect(largeMax).toBeLessThanOrEqual(1.5) // Unit-scale tolerance
    })

    it('stores requested scale in metadata for shader use', () => {
      const polytope = generateWythoffPolytope(4, { scale: 2.5 })

      // Scale is stored in metadata.properties.scale for the shader uniform
      // Note: The geometry itself is normalized to scale=1.0 for caching
      // The renderer reads polytopeConfig.scale from the store for uUniformScale
      expect(polytope.metadata?.properties?.scale).toBe(1.0) // Cached geometry is unit-scale
    })
  })

  describe('metadata and analyticalFaces', () => {
    it('includes metadata in generated polytope', () => {
      const polytope = generateWythoffPolytope(4, {
        symmetryGroup: 'B',
        preset: 'regular',
        scale: 2.0,
      })

      expect(polytope.metadata).toBeDefined()
      expect(polytope.metadata?.name).toBe('Regular 4D Hypercube')
      expect(polytope.metadata?.properties).toBeDefined()
    })

    it('stores analyticalFaces in metadata properties', () => {
      const polytope = generateWythoffPolytope(4, {
        symmetryGroup: 'B',
        preset: 'regular',
      })

      const faces = polytope.metadata?.properties?.analyticalFaces as number[][] | undefined
      expect(faces).toBeDefined()
      expect(Array.isArray(faces)).toBe(true)
      expect(faces!.length).toBeGreaterThan(0)
    })

    it('analyticalFaces contains valid triangle indices', () => {
      const polytope = generateWythoffPolytope(3, {
        symmetryGroup: 'B',
        preset: 'regular',
      })

      const faces = polytope.metadata?.properties?.analyticalFaces as number[][] | undefined
      expect(faces).toBeDefined()

      for (const face of faces!) {
        // Each face should be a triangle (3 vertices)
        expect(face.length).toBe(3)

        // All indices should be valid
        for (const idx of face) {
          expect(idx).toBeGreaterThanOrEqual(0)
          expect(idx).toBeLessThan(polytope.vertices.length)
        }

        // No duplicate indices in a single face
        const uniqueIndices = new Set(face)
        expect(uniqueIndices.size).toBe(3)
      }
    })

    it('generates correct number of faces for 3D hypercube (cube)', () => {
      const polytope = generateWythoffPolytope(3, {
        symmetryGroup: 'B',
        preset: 'regular',
      })

      const faces = polytope.metadata?.properties?.analyticalFaces as number[][] | undefined
      // A 3D cube has 6 quad faces, each triangulated into 2 triangles = 12 triangles
      expect(faces?.length).toBe(12)
    })

    it('generates correct number of faces for 3D simplex (tetrahedron)', () => {
      const polytope = generateWythoffPolytope(3, {
        symmetryGroup: 'A',
        preset: 'regular',
      })

      const faces = polytope.metadata?.properties?.analyticalFaces as number[][] | undefined
      // A tetrahedron has 4 triangular faces
      expect(faces?.length).toBe(4)
    })

    it('generates faces without duplicates', () => {
      const polytope = generateWythoffPolytope(4, {
        symmetryGroup: 'B',
        preset: 'regular',
      })

      const faces = polytope.metadata?.properties?.analyticalFaces as number[][] | undefined
      expect(faces).toBeDefined()

      // Create canonical keys for each face (sorted indices as string)
      const faceKeys = new Set<string>()
      for (const face of faces!) {
        const key = [...face].sort((a, b) => a - b).join(',')
        faceKeys.add(key)
      }

      // All faces should be unique
      expect(faceKeys.size).toBe(faces!.length)
    })

    it('stores config in metadata properties', () => {
      const config = {
        symmetryGroup: 'B' as const,
        preset: 'truncated' as const,
        scale: 2.5,
        snub: false,
      }
      const polytope = generateWythoffPolytope(4, config)

      expect(polytope.metadata?.properties?.symmetryGroup).toBe('B')
      expect(polytope.metadata?.properties?.preset).toBe('truncated')
      // Scale refactor: Geometry is always cached at unit scale (1.0)
      // Visual scale is applied post-projection via shader uniform
      // The renderer reads scale from the store, not from geometry metadata
      expect(polytope.metadata?.properties?.scale).toBe(1.0)
    })
  })
})

describe('High-dimensional omnitruncated memory safety', () => {
  // This test verifies the fix for the memory exhaustion bug in high-dimensional
  // omnitruncated polytopes. Without the fix, 11D omnitruncated would try to
  // generate 11! × 2^11 ≈ 81 billion vertices and crash the browser.
  //
  // The fix has two parts:
  // 1. Lazy permutation generation with early termination (prevents memory exhaustion)
  // 2. O(V × n) combinatorial edge generation (instead of O(V²) distance-based)

  it('generates 11D omnitruncated polytope without memory exhaustion', { timeout: 60000 }, () => {
    // This previously crashed due to generating all 11! permutations upfront
    const polytope = generateWythoffPolytope(11, {
      symmetryGroup: 'B',
      preset: 'omnitruncated',
      scale: 3.0,
    })

    // Should have generated vertices (now allows up to 20,000 with O(V×n) edge generation)
    expect(polytope.dimension).toBe(11)
    expect(polytope.vertices.length).toBeGreaterThan(0)
    expect(polytope.vertices.length).toBeLessThanOrEqual(20000)
    expect(polytope.edges.length).toBeGreaterThan(0)

    // Vertices should have correct dimension
    expect(polytope.vertices[0]?.length).toBe(11)
  })

  it('generates 10D omnitruncated polytope with early termination', { timeout: 60000 }, () => {
    const polytope = generateWythoffPolytope(10, {
      symmetryGroup: 'B',
      preset: 'omnitruncated',
      scale: 3.0,
    })

    expect(polytope.dimension).toBe(10)
    expect(polytope.vertices.length).toBeGreaterThan(0)
    expect(polytope.vertices.length).toBeLessThanOrEqual(20000) // Omnitruncated limit
  })

  it('generates 9D omnitruncated polytope efficiently', { timeout: 30000 }, () => {
    const polytope = generateWythoffPolytope(9, {
      symmetryGroup: 'B',
      preset: 'omnitruncated',
      scale: 3.0,
    })

    expect(polytope.dimension).toBe(9)
    expect(polytope.vertices.length).toBeGreaterThan(0)
    expect(polytope.vertices.length).toBeLessThanOrEqual(20000) // Omnitruncated limit
  })

  it('respects stricter vertex limits for omnitruncated presets', { timeout: 90000 }, () => {
    // Omnitruncated now uses O(V × n) combinatorial edge generation
    // allowing higher limits than before
    const omniLimits: Record<number, number> = {
      7: 14000,
      8: 16000,
      9: 18000,
      10: 20000,
      11: 20000,
    }

    for (const [dim, limit] of Object.entries(omniLimits)) {
      const dimension = parseInt(dim)
      const polytope = generateWythoffPolytope(dimension, {
        symmetryGroup: 'B',
        preset: 'omnitruncated',
        scale: 3.0,
      })

      expect(polytope.vertices.length).toBeLessThanOrEqual(limit)
    }
  })

  it('regular presets still use higher limits', () => {
    // Non-omnitruncated presets use analytical edge generation (fast)
    // so they can have more vertices
    const polytope = generateWythoffPolytope(11, {
      symmetryGroup: 'B',
      preset: 'regular',
      scale: 2.0,
    })

    // Regular 11D hypercube has 2^11 = 2048 vertices
    expect(polytope.vertices.length).toBe(2048)
  })
})

// Integration test: verify faces flow through generateGeometry
import { DEFAULT_EXTENDED_OBJECT_PARAMS, detectFaces, generateGeometry } from '@/lib/geometry'

describe('Wythoff Polytope Integration', () => {
  it('preserves analyticalFaces when generated via generateGeometry', () => {
    const geometry = generateGeometry('wythoff-polytope', 4, {
      ...DEFAULT_EXTENDED_OBJECT_PARAMS,
      wythoffPolytope: {
        symmetryGroup: 'B',
        preset: 'regular',
        scale: 2.0,
        snub: false,
        customSymbol: [],
      },
    })

    // analyticalFaces should be preserved in metadata
    const faces = geometry.metadata?.properties?.analyticalFaces as number[][] | undefined
    expect(faces).toBeDefined()
    expect(Array.isArray(faces)).toBe(true)
    expect(faces!.length).toBeGreaterThan(0)

    // Each face should be valid
    for (const face of faces!) {
      expect(face.length).toBe(3) // triangles
      for (const idx of face) {
        expect(idx).toBeGreaterThanOrEqual(0)
        expect(idx).toBeLessThan(geometry.vertices.length)
      }
    }
  })

  it('analyticalFaces work with detectFaces via metadata method', () => {
    const geometry = generateGeometry('wythoff-polytope', 3, {
      ...DEFAULT_EXTENDED_OBJECT_PARAMS,
      wythoffPolytope: {
        symmetryGroup: 'B',
        preset: 'regular',
        scale: 2.0,
        snub: false,
        customSymbol: [],
      },
    })

    const detectedFaces = detectFaces(
      geometry.vertices,
      geometry.edges,
      'wythoff-polytope',
      geometry.metadata
    )

    // Should detect faces from metadata
    expect(detectedFaces.length).toBeGreaterThan(0)
    // 3D cube has 12 triangular faces (6 quads × 2)
    expect(detectedFaces.length).toBe(12)
  })
})
