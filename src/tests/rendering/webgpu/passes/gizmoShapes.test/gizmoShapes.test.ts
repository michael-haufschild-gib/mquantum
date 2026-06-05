/**
 * Tests for gizmoShapes pure geometry generators.
 *
 * Each shape function returns a Float32Array of line-list vertices
 * with stride 7 (x, y, z, r, g, b, a). Tests verify vertex counts,
 * color encoding, and geometric properties.
 */

import { describe, expect, it } from 'vitest'

import {
  generateArrow,
  generateConeWireframe,
  generateIcosahedronWireframe,
  generateOctahedronWireframe,
  generateSelectionRing,
  generateSphereWireframe,
} from '@/rendering/webgpu/passes/gizmoShapes'

const STRIDE = 7

describe('generateIcosahedronWireframe', () => {
  it('produces correct vertex count for 30 edges', () => {
    const result = generateIcosahedronWireframe('#ffffff', 1.0)
    // 30 edges × 2 vertices × 7 floats
    expect(result.length).toBe(30 * 2 * STRIDE)
  })

  it('encodes red channel correctly from hex color', () => {
    const result = generateIcosahedronWireframe('#ff0000', 1.0)
    expect(result[3]).toBeCloseTo(1, 3) // r
    expect(result[4]).toBeCloseTo(0, 3) // g
    expect(result[5]).toBeCloseTo(0, 3) // b
  })

  it('encodes alpha from parameter', () => {
    const result = generateIcosahedronWireframe('#ffffff', 0.5)
    expect(result[6]).toBeCloseTo(0.5, 3)
  })

  it('all vertices lie on unit sphere (norm ≈ 1)', () => {
    const result = generateIcosahedronWireframe('#ffffff', 1.0)
    const vertCount = result.length / STRIDE
    for (let i = 0; i < vertCount; i++) {
      const x = result[i * STRIDE]!
      const y = result[i * STRIDE + 1]!
      const z = result[i * STRIDE + 2]!
      const norm = Math.sqrt(x * x + y * y + z * z)
      expect(norm).toBeCloseTo(1, 4)
    }
  })
})

describe('generateOctahedronWireframe', () => {
  it('produces correct vertex count for 12 edges', () => {
    const result = generateOctahedronWireframe('#ffffff', 1.0)
    // 12 edges × 2 vertices × 7 floats
    expect(result.length).toBe(12 * 2 * STRIDE)
  })

  it('encodes blue color channel', () => {
    const result = generateOctahedronWireframe('#0000ff', 0.8)
    expect(result[3]).toBeCloseTo(0, 3) // r
    expect(result[4]).toBeCloseTo(0, 3) // g
    expect(result[5]).toBeCloseTo(1, 3) // b
    expect(result[6]).toBeCloseTo(0.8, 3) // a
  })

  it('all vertices are unit axis vectors (norm = 1)', () => {
    const result = generateOctahedronWireframe('#ffffff', 1.0)
    const uniquePositions = new Set<string>()
    const vertCount = result.length / STRIDE
    for (let i = 0; i < vertCount; i++) {
      const x = result[i * STRIDE]!
      const y = result[i * STRIDE + 1]!
      const z = result[i * STRIDE + 2]!
      const norm = Math.sqrt(x * x + y * y + z * z)
      expect(norm).toBeCloseTo(1, 5)
      uniquePositions.add(`${x},${y},${z}`)
    }
    // 6 octahedron vertices appear across all edges
    expect(uniquePositions.size).toBe(6)
  })
})

describe('generateArrow', () => {
  it('produces 5 line segments (shaft + 4 head lines)', () => {
    const result = generateArrow('#ffffff', 1.0)
    // 5 lines × 2 vertices × 7 floats
    expect(result.length).toBe(5 * 2 * STRIDE)
  })

  it('shaft start vertex is at origin', () => {
    const result = generateArrow('#ffffff', 1.0)
    expect(result[0]).toBeCloseTo(0)
    expect(result[1]).toBeCloseTo(0)
    expect(result[2]).toBeCloseTo(0)
  })

  it('shaft end y equals negative length', () => {
    const result = generateArrow('#ff0000', 1.0, 3.0)
    // Second vertex (shaft end): offset STRIDE from start
    expect(result[STRIDE + 1]).toBeCloseTo(-3.0)
  })

  it('uses custom length for arrowhead tip position', () => {
    const result = generateArrow('#ffffff', 1.0, 4.0)
    // Shaft end vertex y = -4.0
    expect(result[STRIDE + 1]).toBeCloseTo(-4.0)
  })

  it('encodes green color', () => {
    const result = generateArrow('#00ff00', 0.7)
    expect(result[3]).toBeCloseTo(0, 3) // r
    expect(result[4]).toBeCloseTo(1, 3) // g
    expect(result[5]).toBeCloseTo(0, 3) // b
    expect(result[6]).toBeCloseTo(0.7, 3) // a
  })
})

describe('generateConeWireframe', () => {
  it('produces segments (base circle) + 4 ribs with default 16 segments', () => {
    const result = generateConeWireframe(30, '#ffffff', 1.0)
    // 16 base segments + 4 ribs = 20 lines × 2 vertices × 7 floats
    expect(result.length).toBe(20 * 2 * STRIDE)
  })

  it('custom segment count changes output size', () => {
    const result = generateConeWireframe(30, '#ffffff', 1.0, 8)
    // 8 base + 4 ribs = 12 lines
    expect(result.length).toBe(12 * 2 * STRIDE)
  })

  it('all rib apex vertices are at origin (0, 0, 0)', () => {
    // The 4 rib lines are appended after the base circle.
    // With 16 segments: rib starts at index 16*2 = 32 vertices.
    const result = generateConeWireframe(45, '#ffffff', 1.0, 16)
    const ribStartVertex = 16 * 2
    for (let i = 0; i < 4; i++) {
      const base = (ribStartVertex + i * 2) * STRIDE
      expect(result[base]).toBeCloseTo(0) // apex x
      expect(result[base + 1]).toBeCloseTo(0) // apex y
      expect(result[base + 2]).toBeCloseTo(0) // apex z
    }
  })

  it('clamps cone angle at 89 degrees', () => {
    // 89° and 91° should produce same radius (clamped to 89)
    const r89 = generateConeWireframe(89, '#ffffff', 1.0)
    const r91 = generateConeWireframe(91, '#ffffff', 1.0)
    expect(r89[0]).toBeCloseTo(r91[0]!, 4)
    expect(r89[2]).toBeCloseTo(r91[2]!, 4)
  })

  it('base circle vertices have y = -height', () => {
    const result = generateConeWireframe(30, '#ffffff', 1.0, 4, 3.0)
    // First vertex of base circle
    expect(result[1]).toBeCloseTo(-3.0) // y = -height
  })
})

describe('generateSphereWireframe', () => {
  it('produces 3 great circles with default 12 segments each', () => {
    const result = generateSphereWireframe('#ffffff', 1.0)
    // 3 circles × 12 segments × 2 vertices × 7 floats
    expect(result.length).toBe(3 * 12 * 2 * STRIDE)
  })

  it('custom radius scales vertex positions', () => {
    const r1 = generateSphereWireframe('#ffffff', 1.0, 1.0, 4)
    const r2 = generateSphereWireframe('#ffffff', 1.0, 2.0, 4)
    // First vertex x of r2 should be 2x r1
    expect(r2[0]).toBeCloseTo(r1[0]! * 2, 4)
  })

  it('custom segment count changes output size', () => {
    const result = generateSphereWireframe('#ffffff', 1.0, 0.3, 8)
    expect(result.length).toBe(3 * 8 * 2 * STRIDE)
  })

  it('encodes white color correctly', () => {
    const result = generateSphereWireframe('#ffffff', 0.9)
    expect(result[3]).toBeCloseTo(1, 3) // r
    expect(result[4]).toBeCloseTo(1, 3) // g
    expect(result[5]).toBeCloseTo(1, 3) // b
    expect(result[6]).toBeCloseTo(0.9, 3) // a
  })
})

describe('generateSelectionRing', () => {
  it('produces inner + outer circles + spokes with defaults', () => {
    // Default: 32 segments. Spokes every 4 = 8 spokes.
    // 32 inner + 32 outer + 8 spokes = 72 lines × 2 × 7
    const result = generateSelectionRing()
    expect(result.length).toBe(72 * 2 * STRIDE)
  })

  it('always encodes green color (r=0, g=1, b=0)', () => {
    const result = generateSelectionRing()
    expect(result[3]).toBeCloseTo(0, 5) // r
    expect(result[4]).toBeCloseTo(1, 5) // g
    expect(result[5]).toBeCloseTo(0, 5) // b
  })

  it('always encodes alpha 0.8', () => {
    const result = generateSelectionRing()
    expect(result[6]).toBeCloseTo(0.8, 5)
  })

  it('inner circle vertices are at innerRadius distance from origin', () => {
    const inner = 1.5
    const result = generateSelectionRing(inner, 2.0, 4)
    // 4 inner segments: first vertex of first inner segment
    const x = result[0]!
    const y = result[1]!
    const dist = Math.sqrt(x * x + y * y)
    expect(dist).toBeCloseTo(inner, 4)
  })

  it('outer circle vertices are at outerRadius distance from origin', () => {
    const outer = 2.5
    const result = generateSelectionRing(1.0, outer, 4)
    // 4 inner segs (8 verts) then outer segs start
    const outerBase = 4 * 2 * STRIDE
    const x = result[outerBase]!
    const y = result[outerBase + 1]!
    const dist = Math.sqrt(x * x + y * y)
    expect(dist).toBeCloseTo(outer, 4)
  })

  it('all z coordinates are zero (XY plane ring)', () => {
    const result = generateSelectionRing()
    const vertCount = result.length / STRIDE
    for (let i = 0; i < vertCount; i++) {
      expect(result[i * STRIDE + 2]).toBeCloseTo(0, 10)
    }
  })
})
