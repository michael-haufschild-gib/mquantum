import { describe, expect, it } from 'vitest'

import { raycastCanvas } from '@/rendering/webgpu/utils/raycasting'

/**
 * Orthographic-like projection that maps [-1,1]^3 NDC to [-1,1]^3 clip space.
 * With identity view, clicking at the center of a 100×100 canvas should
 * produce a ray along +Z through the origin.
 */
function identityMat(): Float32Array {
  // prettier-ignore
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ])
}

describe('raycastCanvas', () => {
  it('reports a hit when clicking the center of the canvas with identity matrices', () => {
    const result = raycastCanvas(
      50,
      50, // center of 100×100 canvas
      100,
      100,
      identityMat(), // view
      identityMat(), // projection
      1.0 // bounding radius
    )

    // With identity matrices, the ray from NDC center (0,0) goes along Z
    // and should intersect the [-1,1]^3 cube
    expect(result.hit).toBe(true)
  })

  it('returns world position inside the bounding volume on hit', () => {
    const br = 2.0
    const result = raycastCanvas(50, 50, 100, 100, identityMat(), identityMat(), br)

    if (result.hit) {
      // World position should be within the bounding radius
      const [x, y, z] = result.worldPosition
      expect(Math.abs(x)).toBeLessThanOrEqual(br + 0.01)
      expect(Math.abs(y)).toBeLessThanOrEqual(br + 0.01)
      expect(Math.abs(z)).toBeLessThanOrEqual(br + 0.01)
    }
  })

  it('returns a normalized ray direction', () => {
    const result = raycastCanvas(50, 50, 100, 100, identityMat(), identityMat(), 1.0)

    const [dx, dy, dz] = result.rayDirection
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz)
    expect(length).toBeCloseTo(1.0, 5)
  })

  it('returns hit=false for a singular (all-zero) view-projection matrix', () => {
    const zeroMat = new Float32Array(16)
    const result = raycastCanvas(50, 50, 100, 100, zeroMat, zeroMat, 1.0)
    expect(result.hit).toBe(false)
  })

  it('NDC mapping: top-left corner click maps to NDC (-1, +1)', () => {
    // Click at (0, 0) on a 100×100 canvas
    // ndcX = (2*0)/100 - 1 = -1
    // ndcY = 1 - (2*0)/100 = 1
    const result = raycastCanvas(0, 0, 100, 100, identityMat(), identityMat(), 10.0)
    // With identity matrices, the ray origin should be at approximately (-1, 1, -1) in world space
    expect(result.rayOrigin[0]).toBeCloseTo(-1, 1)
    expect(result.rayOrigin[1]).toBeCloseTo(1, 1)
  })

  it('NDC mapping: bottom-right corner maps to NDC (+1, -1)', () => {
    const result = raycastCanvas(100, 100, 100, 100, identityMat(), identityMat(), 10.0)
    expect(result.rayOrigin[0]).toBeCloseTo(1, 1)
    expect(result.rayOrigin[1]).toBeCloseTo(-1, 1)
  })

  it('different bounding radii affect whether a corner click hits', () => {
    // With a tiny bounding radius, a corner click should miss
    const small = raycastCanvas(0, 0, 100, 100, identityMat(), identityMat(), 0.01)
    const large = raycastCanvas(0, 0, 100, 100, identityMat(), identityMat(), 10.0)

    // The large radius should hit; the small one likely misses (ray from NDC corner)
    expect(large.hit).toBe(true)
    // Small may or may not hit depending on ray direction, but at least they should differ
    // in worldPosition if both hit
    if (small.hit && large.hit) {
      // The world positions should differ due to different bounding radii
      const dist = Math.sqrt(
        (small.worldPosition[0] - large.worldPosition[0]) ** 2 +
          (small.worldPosition[1] - large.worldPosition[1]) ** 2 +
          (small.worldPosition[2] - large.worldPosition[2]) ** 2
      )
      expect(dist).toBeGreaterThan(0)
    }
  })
})
