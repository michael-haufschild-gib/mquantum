/**
 * Tests for canvas-to-world raycasting — pure math, no GPU needed.
 *
 * Uses known camera matrices (identity, simple perspective) to verify
 * NDC unprojection and AABB intersection.
 */

import { describe, expect, it } from 'vitest'

import { raycastCanvas } from '@/rendering/webgpu/utils/raycasting'

/** Identity 4x4 matrix (column-major). */
function identityMat4(): Float32Array {
  const m = new Float32Array(16)
  m[0] = 1
  m[5] = 1
  m[10] = 1
  m[15] = 1
  return m
}

/**
 * Simple look-at matrix: camera at (0,0,5) looking at origin.
 * Column-major. View matrix translates world by (0,0,-5).
 */
function simpleViewMatrix(): Float32Array {
  const m = identityMat4()
  m[14] = -5 // translate z by -5
  return m
}

/**
 * Simple symmetric perspective matrix (column-major).
 * fov ≈ 90°, aspect 1:1, near=0.1, far=100.
 */
function simplePerspective(): Float32Array {
  const m = new Float32Array(16)
  const f = 1.0 // tan(45°) = 1, so f = 1/tan(fov/2) = 1
  m[0] = f
  m[5] = f
  m[10] = -100.1 / 99.9
  m[11] = -1
  m[14] = (-2 * 100 * 0.1) / 99.9
  return m
}

describe('raycastCanvas', () => {
  it('center click hits a bounding cube in front of the camera', () => {
    const view = simpleViewMatrix()
    const proj = simplePerspective()

    // Click center of a 100×100 canvas
    const result = raycastCanvas(50, 50, 100, 100, view, proj, 2.0)

    expect(result.hit).toBe(true)
    // World position should be near the origin (center of the bounding cube)
    expect(Math.abs(result.worldPosition[0])).toBeLessThan(1)
    expect(Math.abs(result.worldPosition[1])).toBeLessThan(1)
  })

  it('ray direction points roughly forward (-Z) for center click', () => {
    const view = simpleViewMatrix()
    const proj = simplePerspective()

    const result = raycastCanvas(50, 50, 100, 100, view, proj, 2.0)

    // Z component should be negative (pointing into the scene)
    expect(result.rayDirection[2]).toBeLessThan(0)
    // Direction should be roughly normalized
    const len = Math.sqrt(
      result.rayDirection[0] ** 2 + result.rayDirection[1] ** 2 + result.rayDirection[2] ** 2
    )
    expect(len).toBeCloseTo(1, 3)
  })

  it('click outside the bounding volume reports miss', () => {
    const view = simpleViewMatrix()
    const proj = simplePerspective()

    // Use a tiny bounding radius so the ray misses
    const result = raycastCanvas(0, 0, 100, 100, view, proj, 0.001)

    expect(result.hit).toBe(false)
  })

  it('ray origin is the camera position (near plane unprojection)', () => {
    const view = simpleViewMatrix()
    const proj = simplePerspective()

    const result = raycastCanvas(50, 50, 100, 100, view, proj, 2.0)

    // Camera is at (0,0,5) — ray origin should be near there
    expect(result.rayOrigin[2]).toBeGreaterThan(0)
  })

  it('off-center click produces angled ray direction', () => {
    const view = simpleViewMatrix()
    const proj = simplePerspective()

    // Click in top-right quadrant
    const result = raycastCanvas(75, 25, 100, 100, view, proj, 2.0)

    // Ray should point right (+X) and up (+Y) relative to center
    expect(result.rayDirection[0]).toBeGreaterThan(0)
    expect(result.rayDirection[1]).toBeGreaterThan(0)
  })

  it('handles singular matrix gracefully (returns miss)', () => {
    const zeroView = new Float32Array(16) // all zeros — singular
    const proj = simplePerspective()

    const result = raycastCanvas(50, 50, 100, 100, zeroView, proj, 2.0)

    expect(result.hit).toBe(false)
  })

  it('ray from inside the bounding volume hits', () => {
    // Identity view + proj = camera at origin, looking down -Z, NDC passthrough
    // This means the near/far unproject to NDC directly
    // Use a large bounding radius to guarantee hit
    const view = identityMat4()
    const proj = identityMat4()

    const result = raycastCanvas(50, 50, 100, 100, view, proj, 10.0)

    expect(result.hit).toBe(true)
  })
})
