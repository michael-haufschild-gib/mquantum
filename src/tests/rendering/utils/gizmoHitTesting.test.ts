/**
 * Tests for gizmo hit-testing utilities — pure geometry math.
 *
 * Tests gizmoScale, rayAxisClosest (ray-line closest point), and
 * computeMouseRay (screen-to-world unprojection).
 */

import { describe, expect, it } from 'vitest'

import {
  computeMouseRay,
  gizmoScale,
  rayAxisClosest,
} from '@/rendering/webgpu/utils/gizmoHitTesting'

describe('gizmoScale', () => {
  it('returns minimum scale for coincident positions', () => {
    const scale = gizmoScale([0, 0, 0], [0, 0, 0])
    // distance = 0, 0 * 0.1 = 0, clamped to 0.1, * 0.3 = 0.03
    expect(scale).toBeCloseTo(0.1 * 0.3, 4)
  })

  it('scales linearly with distance up to max', () => {
    const s1 = gizmoScale([0, 0, 0], [0, 0, 10])
    const s2 = gizmoScale([0, 0, 0], [0, 0, 20])
    // distance 10 → 1.0, distance 20 → 2.0 (capped at 2.0)
    expect(s2).toBeGreaterThanOrEqual(s1)
  })

  it('caps at maximum scale for far distances', () => {
    const s = gizmoScale([0, 0, 0], [0, 0, 100])
    // 100 * 0.1 = 10, clamped to 2.0, * 0.3 = 0.6
    expect(s).toBeCloseTo(2.0 * 0.3, 4)
  })
})

describe('rayAxisClosest', () => {
  it('returns Infinity for parallel non-coincident rays', () => {
    // Ray parallel to X-axis but offset in Y — denom ≈ 0
    const [_t, dist] = rayAxisClosest(
      [0, 1, 0], // ray origin
      [1, 0, 0], // ray direction (along X)
      [0, 0, 0], // axis origin
      [1, 0, 0] // axis direction (along X)
    )
    expect(dist).toBe(Infinity)
  })

  it('finds intersection point when ray crosses axis', () => {
    // Ray from (0, 2, 0) pointing down (-Y) should cross X-axis at origin
    const [t, dist] = rayAxisClosest(
      [0, 2, 0], // ray origin
      [0, -1, 0], // ray direction (down)
      [0, 0, 0], // axis origin
      [1, 0, 0] // X-axis
    )
    expect(dist).toBeCloseTo(0, 4)
    expect(t).toBeCloseTo(0, 4) // closest point on X-axis is at origin
  })

  it('returns Infinity distance for parallel coincident rays', () => {
    // Same line — denom = 0
    const [_t, dist] = rayAxisClosest([0, 0, 0], [1, 0, 0], [0, 0, 0], [1, 0, 0])
    expect(dist).toBe(Infinity)
  })

  it('computes correct parameter t along the axis', () => {
    // Ray from (0, 1, 0) straight down should find t=3 on axis at (3, 0, 0)
    const [t, dist] = rayAxisClosest(
      [3, 1, 0], // ray origin directly above (3, 0, 0)
      [0, -1, 0], // straight down
      [0, 0, 0], // axis origin
      [1, 0, 0] // X-axis
    )
    expect(t).toBeCloseTo(3, 4)
    expect(dist).toBeCloseTo(0, 4)
  })
})

describe('computeMouseRay', () => {
  /** Identity 4x4 column-major matrix. */
  function identityMat4(): Float32Array {
    const m = new Float32Array(16)
    m[0] = 1
    m[5] = 1
    m[10] = 1
    m[15] = 1
    return m
  }

  const mockRect = { left: 0, top: 0, width: 800, height: 600 } as DOMRect

  it('returns null for singular matrix', () => {
    const result = computeMouseRay(400, 300, mockRect, {
      projectionMatrix: new Float32Array(16), // all zeros — singular
      viewMatrix: identityMat4(),
      cameraPosition: { x: 0, y: 0, z: 0 },
    })
    expect(result).toBe(null)
  })

  it('returns a ray with normalized direction for identity matrices', () => {
    const result = computeMouseRay(400, 300, mockRect, {
      projectionMatrix: identityMat4(),
      viewMatrix: identityMat4(),
      cameraPosition: { x: 0, y: 0, z: 5 },
    })

    expect(result).not.toBe(null)
    if (result) {
      const len = Math.sqrt(result.dir[0] ** 2 + result.dir[1] ** 2 + result.dir[2] ** 2)
      expect(len).toBeCloseTo(1, 3)
      expect(result.origin).toEqual([0, 0, 5])
    }
  })
})
