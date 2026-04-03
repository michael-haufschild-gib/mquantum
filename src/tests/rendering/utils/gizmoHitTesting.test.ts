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
  rayPlaneIntersect,
  testGizmoHit,
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

describe('rayPlaneIntersect', () => {
  it('intersects horizontal plane from above', () => {
    // Ray from (0, 5, 0) straight down should hit ground plane at origin
    const hit = rayPlaneIntersect([0, 5, 0], [0, -1, 0], [0, 1, 0], [0, 0, 0])
    expect(hit).not.toBe(null)
    expect(hit![0]).toBeCloseTo(0, 4)
    expect(hit![1]).toBeCloseTo(0, 4)
    expect(hit![2]).toBeCloseTo(0, 4)
  })

  it('returns null for ray parallel to plane', () => {
    // Ray along X-axis, plane is XZ (normal Y)
    const hit = rayPlaneIntersect([0, 5, 0], [1, 0, 0], [0, 1, 0], [0, 0, 0])
    expect(hit).toBe(null)
  })

  it('returns null for ray pointing away from plane', () => {
    // Ray from (0, 5, 0) pointing up, plane at y=0
    const hit = rayPlaneIntersect([0, 5, 0], [0, 1, 0], [0, 1, 0], [0, 0, 0])
    expect(hit).toBe(null)
  })

  it('intersects at an angle with correct position', () => {
    // Ray from (0, 2, 0) at 45 degrees toward (1, 0, 0) direction
    const dir: [number, number, number] = [1 / Math.SQRT2, -1 / Math.SQRT2, 0]
    const hit = rayPlaneIntersect([0, 2, 0], dir, [0, 1, 0], [0, 0, 0])
    expect(hit).not.toBe(null)
    // t = 2 / (1/√2) = 2√2; x = 0 + t * (1/√2) = 2
    expect(hit![0]).toBeCloseTo(2, 4)
    expect(hit![1]).toBeCloseTo(0, 4)
    expect(hit![2]).toBeCloseTo(0, 4)
  })

  it('intersects vertical plane', () => {
    // Ray from (5, 0, 0) toward origin, plane at x=2 (normal [1,0,0])
    const hit = rayPlaneIntersect([5, 0, 0], [-1, 0, 0], [1, 0, 0], [2, 0, 0])
    expect(hit).not.toBe(null)
    expect(hit![0]).toBeCloseTo(2, 4)
    expect(hit![1]).toBeCloseTo(0, 4)
    expect(hit![2]).toBeCloseTo(0, 4)
  })
})

describe('testGizmoHit', () => {
  const lightPos: [number, number, number] = [0, 0, 0]
  const scale = 0.3 // GIZMO_BASE_SIZE default

  describe('translate mode', () => {
    it('hits X axis when ray crosses it within shaft range', () => {
      // Ray from (0.5, 1, 0) straight down crosses X-axis at (0.5, 0, 0)
      const ray = {
        origin: [0.5, 1, 0] as [number, number, number],
        dir: [0, -1, 0] as [number, number, number],
      }
      const hit = testGizmoHit(ray, lightPos, scale, 'translate')
      expect(hit).not.toBe(null)
      expect(hit!.kind).toBe('translate-x')
      expect(hit!.axisT).toBeGreaterThan(0)
    })

    it('hits Y axis when ray crosses it within shaft range', () => {
      // Ray from (1, 0.5, 0) along -X crosses Y-axis at (0, 0.5, 0)
      const ray = {
        origin: [1, 0.5, 0] as [number, number, number],
        dir: [-1, 0, 0] as [number, number, number],
      }
      const hit = testGizmoHit(ray, lightPos, scale, 'translate')
      expect(hit).not.toBe(null)
      expect(hit!.kind).toBe('translate-y')
    })

    it('hits Z axis when ray crosses it within shaft range', () => {
      // Ray from (0, 1, 0.5) along -Y crosses Z-axis at (0, 0, 0.5)
      const ray = {
        origin: [0, 1, 0.5] as [number, number, number],
        dir: [0, -1, 0] as [number, number, number],
      }
      const hit = testGizmoHit(ray, lightPos, scale, 'translate')
      expect(hit).not.toBe(null)
      expect(hit!.kind).toBe('translate-z')
    })

    it('returns null when ray is far from all axes', () => {
      // Ray far from origin
      const ray = {
        origin: [10, 10, 10] as [number, number, number],
        dir: [0, 0, -1] as [number, number, number],
      }
      const hit = testGizmoHit(ray, lightPos, scale, 'translate')
      expect(hit).toBe(null)
    })

    it('returns null when closest point is beyond shaft length', () => {
      // Ray crosses X-axis but at t > TRANSLATE_SHAFT * scale (3.0 * 0.3 = 0.9)
      const ray = {
        origin: [5, 1, 0] as [number, number, number],
        dir: [0, -1, 0] as [number, number, number],
      }
      const hit = testGizmoHit(ray, lightPos, scale, 'translate')
      expect(hit).toBe(null)
    })

    it('returns null when closest point has negative t', () => {
      // Ray crosses X-axis at negative t (behind the axis origin)
      const ray = {
        origin: [-0.5, 1, 0] as [number, number, number],
        dir: [0, -1, 0] as [number, number, number],
      }
      const hit = testGizmoHit(ray, lightPos, scale, 'translate')
      expect(hit).toBe(null)
    })
  })

  describe('rotate mode', () => {
    it('hits Y rotation ring when ray intersects at ring radius', () => {
      // Ring radius = ROTATE_RING_RADIUS (2.5) * scale (0.3) = 0.75
      // Ray from (0.75, 5, 0) along -Y hits the Y-normal plane at (0.75, 0, 0)
      // Distance from light center = 0.75 = ring radius → rotate-y
      const ray = {
        origin: [0.75, 5, 0] as [number, number, number],
        dir: [0, -1, 0] as [number, number, number],
      }
      const hit = testGizmoHit(ray, lightPos, scale, 'rotate')
      expect(hit).not.toBe(null)
      expect(hit!.kind).toBe('rotate-y')
      // atan2(dx=0.75, dz=0) for Y-axis ring
      expect(hit!.angle).toBeCloseTo(Math.atan2(0.75, 0), 2)
    })

    it('returns null when ray misses all ring planes', () => {
      // Ray parallel to all normal planes, doesn't intersect
      const ray = {
        origin: [10, 10, 10] as [number, number, number],
        dir: [1, 1, 1].map((v) => v / Math.sqrt(3)) as [number, number, number],
      }
      const hit = testGizmoHit(ray, lightPos, scale, 'rotate')
      expect(hit).toBe(null)
    })

    it('returns null when intersection is far from ring radius', () => {
      // Ray hits Y-plane at (0, 0, 0) — distance from center is 0, far from ring
      const ray = {
        origin: [0, 0, 5] as [number, number, number],
        dir: [0, 0, -1] as [number, number, number],
      }
      const hit = testGizmoHit(ray, lightPos, scale, 'rotate')
      expect(hit).toBe(null)
    })
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
