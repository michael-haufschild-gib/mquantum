/**
 * Unit tests for classical overlay N-D projection and observables trail packing.
 *
 * Tests the CPU-side logic that projects N-dimensional Lissajous positions
 * and TDSE/BEC Ehrenfest ⟨x⟩(t) histories into 3D model space using
 * basis vectors, for rendering as a glowing trail overlay.
 *
 * @module tests/lib/physics/classicalOverlayProjection
 */

import { describe, expect, it } from 'vitest'

import { projectNDToModelSpace } from '@/rendering/webgpu/renderers/uniformPacking'

describe('projectNDToModelSpace', () => {
  it('returns origin for zero input', () => {
    const bX = new Float32Array([1, 0, 0])
    const bY = new Float32Array([0, 1, 0])
    const bZ = new Float32Array([0, 0, 1])
    const [x, y, z] = projectNDToModelSpace([0, 0, 0], 3, bX, bY, bZ)
    expect(x).toBe(0)
    expect(y).toBe(0)
    expect(z).toBe(0)
  })

  it('identity basis preserves 3D positions', () => {
    const bX = new Float32Array([1, 0, 0])
    const bY = new Float32Array([0, 1, 0])
    const bZ = new Float32Array([0, 0, 1])
    const [x, y, z] = projectNDToModelSpace([2, 3, 5], 3, bX, bY, bZ)
    expect(x).toBeCloseTo(2, 8)
    expect(y).toBeCloseTo(3, 8)
    expect(z).toBeCloseTo(5, 8)
  })

  it('projects 5D position through basis vectors', () => {
    // 5D with identity-like basis (first 3 dims standard, extra dims zero contribution)
    const bX = new Float32Array([1, 0, 0, 0, 0])
    const bY = new Float32Array([0, 1, 0, 0, 0])
    const bZ = new Float32Array([0, 0, 1, 0, 0])
    const [x, y, z] = projectNDToModelSpace([1, 2, 3, 4, 5], 5, bX, bY, bZ)
    // Extra dims 4,5 have zero basis weight so don't contribute
    expect(x).toBeCloseTo(1, 8)
    expect(y).toBeCloseTo(2, 8)
    expect(z).toBeCloseTo(3, 8)
  })

  it('projects 5D with non-trivial extra dimension basis', () => {
    // bX has component in dim 3 (0.5), bY has component in dim 4 (0.3)
    const bX = new Float32Array([1, 0, 0, 0.5, 0])
    const bY = new Float32Array([0, 1, 0, 0, 0.3])
    const bZ = new Float32Array([0, 0, 1, 0, 0])
    // ndPos = [0, 0, 0, 2, 4]
    const [x, y, z] = projectNDToModelSpace([0, 0, 0, 2, 4], 5, bX, bY, bZ)
    // x = 0*1 + 0*0 + 0*0 + 2*0.5 + 4*0 = 1.0
    // y = 0*0 + 0*1 + 0*0 + 2*0 + 4*0.3 = 1.2
    // z = 0
    expect(x).toBeCloseTo(1.0, 8)
    expect(y).toBeCloseTo(1.2, 6)
    expect(z).toBeCloseTo(0, 8)
  })

  it('handles rotation via basis vectors', () => {
    // 45-degree rotation in XY plane
    const s = Math.SQRT1_2
    const bX = new Float32Array([s, s, 0])
    const bY = new Float32Array([-s, s, 0])
    const bZ = new Float32Array([0, 0, 1])
    // ndPos = [1, 0, 0] in HO space
    const [x, y, z] = projectNDToModelSpace([1, 0, 0], 3, bX, bY, bZ)
    // x = 1 * s = 0.707
    // y = 1 * (-s) = -0.707
    expect(x).toBeCloseTo(s, 6)
    expect(y).toBeCloseTo(-s, 6)
    expect(z).toBeCloseTo(0, 8)
  })

  it('handles high-dimensional (11D) projection', () => {
    const dim = 11
    // All basis components equal to 1/sqrt(11) in bX, zero elsewhere
    const inv = 1 / Math.sqrt(dim)
    const bX = new Float32Array(dim).fill(inv)
    const bY = new Float32Array(dim) // all zeros
    const bZ = new Float32Array(dim) // all zeros

    // ndPos = [1, 1, 1, ... 1] (11 ones)
    const ndPos = Array.from({ length: dim }, () => 1.0)
    const [x] = projectNDToModelSpace(ndPos, dim, bX, bY, bZ)
    // x = sum_d (1 * 1/sqrt(11)) = 11 / sqrt(11) = sqrt(11)
    expect(x).toBeCloseTo(Math.sqrt(11), 6)
  })
})
