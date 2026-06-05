/**
 * Tests for gizmoGround pure geometry functions.
 *
 * Validates ray-ground intersection calculations and sphere-ground
 * intersection geometry for light gizmo rendering.
 */

import { describe, expect, it } from 'vitest'

import {
  calculateGroundIntersection,
  calculateSphereGroundIntersection,
  generateDashedLine,
} from '@/rendering/webgpu/passes/gizmoGround'

describe('calculateGroundIntersection', () => {
  it('computes correct intersection for downward ray', () => {
    // Light at (0, 5, 0) pointing straight down
    const result = calculateGroundIntersection([0, 5, 0], [0, -1, 0])
    expect(result).toEqual([expect.closeTo(0), expect.closeTo(0), expect.closeTo(0)])
  })

  it('computes correct intersection for angled ray', () => {
    // Light at (0, 10, 0) pointing at 45 degrees toward +x
    const dir: [number, number, number] = [Math.SQRT1_2, -Math.SQRT1_2, 0]
    const result = calculateGroundIntersection([0, 10, 0], dir)
    // t = 10/sin(45), x = t*cos(45) = 10
    expect(result).toEqual([expect.closeTo(10), expect.closeTo(0), expect.closeTo(0)])
  })

  it('returns null for upward-pointing ray', () => {
    const result = calculateGroundIntersection([0, 5, 0], [0, 1, 0])
    expect(result).toBeNull()
  })

  it('returns null for horizontal ray', () => {
    const result = calculateGroundIntersection([0, 5, 0], [1, 0, 0])
    expect(result).toBeNull()
  })

  it('returns null when light is below ground', () => {
    const result = calculateGroundIntersection([0, -1, 0], [0, -1, 0])
    expect(result).toBeNull()
  })

  it('returns null when light is at ground level', () => {
    // GROUND_Y = 0, MIN_HEIGHT = 0.1, so py <= 0 + 0.1 returns null
    const result = calculateGroundIntersection([0, 0.05, 0], [0, -1, 0])
    expect(result).toBeNull()
  })
})

describe('calculateSphereGroundIntersection', () => {
  it('computes circle radius from Pythagorean theorem', () => {
    // Light at height 3, range 5 → radius = sqrt(25 - 9) = 4
    const result = calculateSphereGroundIntersection([0, 3, 0], 5)
    expect(result).toEqual({
      center: [expect.closeTo(0), expect.any(Number), expect.closeTo(0)],
      radius: expect.closeTo(4),
    })
  })

  it('returns null for zero range', () => {
    const result = calculateSphereGroundIntersection([0, 5, 0], 0)
    expect(result).toBeNull()
  })

  it('returns null when light is above sphere reach', () => {
    // Height 10, range 5 → light is above sphere
    const result = calculateSphereGroundIntersection([0, 10, 0], 5)
    expect(result).toBeNull()
  })

  it('returns null when light is at ground', () => {
    const result = calculateSphereGroundIntersection([0, 0, 0], 5)
    expect(result).toBeNull()
  })

  it('returns null for negative range', () => {
    const result = calculateSphereGroundIntersection([0, 3, 0], -1)
    expect(result).toBeNull()
  })
})

describe('generateDashedLine', () => {
  it('produces vertex data for a simple horizontal dash', () => {
    const result = generateDashedLine(0, 0, 0, 1, 0, 0, '#ffffff', 1.0, 0.5, 0.5)
    // Total length 1, dash 0.5, gap 0.5 → 1 dash segment
    // Each dash is 2 vertices × 7 floats = 14 floats
    expect(result.length).toBe(14)
  })

  it('returns empty for zero-length line', () => {
    const result = generateDashedLine(0, 0, 0, 0, 0, 0, '#ffffff', 1.0)
    expect(result.length).toBe(0)
  })

  it('produces multiple dash segments for long line', () => {
    // Length 1, default dash 0.3, gap 0.15 → ~2 dashes
    const result = generateDashedLine(0, 0, 0, 1, 0, 0, '#ffffff', 1.0)
    // Expected dashes: 0-0.3, gap 0.3-0.45, dash 0.45-0.75, gap 0.75-0.9, dash 0.9-1.0
    // = 3 dashes × 14 floats = 42
    expect(result.length).toBe(42)
  })

  it('encodes correct color values from hex', () => {
    const result = generateDashedLine(0, 0, 0, 1, 0, 0, '#ff0000', 0.5, 2, 0)
    // Single dash covering full length, 2 vertices × 7 floats
    expect(result.length).toBe(14)
    // First vertex: x, y, z, r, g, b, a
    expect(result[3]).toBeCloseTo(1) // red
    expect(result[4]).toBeCloseTo(0) // green
    expect(result[5]).toBeCloseTo(0) // blue
    expect(result[6]).toBeCloseTo(0.5) // alpha
  })
})
