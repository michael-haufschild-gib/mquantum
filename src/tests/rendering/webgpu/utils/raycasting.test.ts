/**
 * Tests for canvas-to-world raycasting — pure math, no GPU needed.
 *
 * Covers NDC unprojection, ray direction, bounding-cube AABB intersection,
 * and graceful handling of singular matrices. Uses both identity matrices
 * (for pure NDC mapping checks) and a simple perspective (for realistic
 * behavioral checks).
 */

import { describe, expect, it } from 'vitest'

import { raycastCanvas } from '@/rendering/webgpu/utils/raycasting'

function identityMat4(): Float32Array {
  // prettier-ignore
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ])
}

/** Camera at (0,0,5) looking at origin — column-major view translates world by (0,0,-5). */
function simpleViewMatrix(): Float32Array {
  const m = identityMat4()
  m[14] = -5
  return m
}

/** Symmetric perspective, fov≈90°, aspect 1:1, near=0.1, far=100 (column-major). */
function simplePerspective(): Float32Array {
  const m = new Float32Array(16)
  const f = 1.0 // 1/tan(fov/2) with fov=90°
  m[0] = f
  m[5] = f
  m[10] = -100.1 / 99.9
  m[11] = -1
  m[14] = (-2 * 100 * 0.1) / 99.9
  return m
}

function expectFiniteMiss(result: ReturnType<typeof raycastCanvas>): void {
  expect(result.hit).toBe(false)
  for (const value of [...result.worldPosition, ...result.rayOrigin, ...result.rayDirection]) {
    expect(Number.isFinite(value)).toBe(true)
  }
}

describe('raycastCanvas — identity matrices (pure NDC mapping)', () => {
  it('hits the bounding cube when clicking the center with identity matrices', () => {
    const result = raycastCanvas(50, 50, 100, 100, identityMat4(), identityMat4(), 1.0)
    expect(result.hit).toBe(true)
  })

  it('returns a world position within the bounding radius on hit', () => {
    const br = 2.0
    const result = raycastCanvas(50, 50, 100, 100, identityMat4(), identityMat4(), br)
    expect(result.hit).toBe(true)
    const [x, y, z] = result.worldPosition
    expect(Math.abs(x)).toBeLessThanOrEqual(br + 0.01)
    expect(Math.abs(y)).toBeLessThanOrEqual(br + 0.01)
    expect(Math.abs(z)).toBeLessThanOrEqual(br + 0.01)
  })

  it('returns a normalized ray direction', () => {
    const result = raycastCanvas(50, 50, 100, 100, identityMat4(), identityMat4(), 1.0)
    const [dx, dy, dz] = result.rayDirection
    expect(Math.sqrt(dx * dx + dy * dy + dz * dz)).toBeCloseTo(1.0, 5)
  })

  it('top-left corner click maps to NDC (-1, +1)', () => {
    const result = raycastCanvas(0, 0, 100, 100, identityMat4(), identityMat4(), 10.0)
    expect(result.rayOrigin[0]).toBeCloseTo(-1, 1)
    expect(result.rayOrigin[1]).toBeCloseTo(1, 1)
  })

  it('bottom-right corner maps to NDC (+1, -1)', () => {
    const result = raycastCanvas(100, 100, 100, 100, identityMat4(), identityMat4(), 10.0)
    expect(result.rayOrigin[0]).toBeCloseTo(1, 1)
    expect(result.rayOrigin[1]).toBeCloseTo(-1, 1)
  })

  it('tiny bounding radius causes a corner click to miss; large radius hits', () => {
    const small = raycastCanvas(0, 0, 100, 100, identityMat4(), identityMat4(), 0.01)
    const large = raycastCanvas(0, 0, 100, 100, identityMat4(), identityMat4(), 10.0)
    expect(large.hit).toBe(true)
    expect(small.hit).toBe(false)
  })
})

describe('raycastCanvas — realistic view+perspective matrices', () => {
  it('center click hits a bounding cube in front of the camera', () => {
    const result = raycastCanvas(50, 50, 100, 100, simpleViewMatrix(), simplePerspective(), 2.0)
    expect(result.hit).toBe(true)
    expect(Math.abs(result.worldPosition[0])).toBeLessThan(1)
    expect(Math.abs(result.worldPosition[1])).toBeLessThan(1)
  })

  it('ray direction points into the scene (-Z) for a center click', () => {
    const result = raycastCanvas(50, 50, 100, 100, simpleViewMatrix(), simplePerspective(), 2.0)
    expect(result.rayDirection[2]).toBeLessThan(0)
    const len = Math.sqrt(
      result.rayDirection[0] ** 2 + result.rayDirection[1] ** 2 + result.rayDirection[2] ** 2
    )
    expect(len).toBeCloseTo(1, 3)
  })

  it('click outside the bounding volume reports miss', () => {
    // Tiny bounding radius with corner click guarantees miss under perspective
    const result = raycastCanvas(0, 0, 100, 100, simpleViewMatrix(), simplePerspective(), 0.001)
    expect(result.hit).toBe(false)
  })

  it('ray origin is near the camera position (near-plane unprojection)', () => {
    const result = raycastCanvas(50, 50, 100, 100, simpleViewMatrix(), simplePerspective(), 2.0)
    // Camera is at (0,0,5) — ray origin should be on the positive-Z side
    expect(result.rayOrigin[2]).toBeGreaterThan(0)
  })

  it('off-center click produces an angled ray direction', () => {
    // Top-right quadrant → +X, +Y direction components relative to center
    const result = raycastCanvas(75, 25, 100, 100, simpleViewMatrix(), simplePerspective(), 2.0)
    expect(result.rayDirection[0]).toBeGreaterThan(0)
    expect(result.rayDirection[1]).toBeGreaterThan(0)
  })
})

describe('raycastCanvas — degenerate inputs', () => {
  it('returns hit=false for a singular (all-zero) view-projection matrix', () => {
    const zeroMat = new Float32Array(16)
    const result = raycastCanvas(50, 50, 100, 100, zeroMat, zeroMat, 1.0)
    expect(result.hit).toBe(false)
  })

  it('returns hit=false when view is singular even with a valid projection', () => {
    const zeroView = new Float32Array(16)
    const result = raycastCanvas(50, 50, 100, 100, zeroView, simplePerspective(), 2.0)
    expect(result.hit).toBe(false)
  })

  it('returns a finite miss for invalid canvas dimensions or click coordinates', () => {
    expectFiniteMiss(raycastCanvas(50, 50, 0, 100, identityMat4(), identityMat4(), 1.0))
    expectFiniteMiss(raycastCanvas(Number.NaN, 50, 100, 100, identityMat4(), identityMat4(), 1.0))
  })

  it('returns a finite miss for invalid bounding radii', () => {
    expectFiniteMiss(
      raycastCanvas(50, 50, 100, 100, identityMat4(), identityMat4(), Number.POSITIVE_INFINITY)
    )
    expectFiniteMiss(raycastCanvas(50, 50, 100, 100, identityMat4(), identityMat4(), 0))
    expectFiniteMiss(raycastCanvas(50, 50, 100, 100, identityMat4(), identityMat4(), -1))
  })

  it('returns a finite miss for non-finite matrices', () => {
    const badProjection = identityMat4()
    badProjection[0] = Number.NaN

    expectFiniteMiss(raycastCanvas(50, 50, 100, 100, identityMat4(), badProjection, 1.0))
  })
})
