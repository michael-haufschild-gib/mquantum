/**
 * Tests for gizmoTransforms quaternion rotation and vertex transform helpers.
 */

import { describe, expect, it } from 'vitest'

import {
  rotateByQuaternion,
  transformAndAppend,
  transformBillboardAndAppend,
} from '@/rendering/webgpu/passes/gizmoTransforms'

// STRIDE = 7: x, y, z, r, g, b, a
const STRIDE = 7

/** Build a minimal Float32Array with one vertex at (x,y,z) and color (r,g,b,a). */
function makeVertex(x: number, y: number, z: number, r = 1, g = 0, b = 0, a = 1): Float32Array {
  return new Float32Array([x, y, z, r, g, b, a])
}

/** Identity quaternion: (qx=0, qy=0, qz=0, qw=1). */
const Q_IDENTITY = { qx: 0, qy: 0, qz: 0, qw: 1 }

/** 90° rotation around Z axis: (0, 0, sin45, cos45). */
const Q_ROT90_Z = {
  qx: 0,
  qy: 0,
  qz: Math.sin(Math.PI / 4),
  qw: Math.cos(Math.PI / 4),
}

describe('rotateByQuaternion', () => {
  it('identity quaternion leaves point unchanged', () => {
    const [x, y, z] = rotateByQuaternion(1, 2, 3, 0, 0, 0, 1)
    expect(x).toBeCloseTo(1, 5)
    expect(y).toBeCloseTo(2, 5)
    expect(z).toBeCloseTo(3, 5)
  })

  it('90° rotation around Z maps +X to +Y', () => {
    const { qx, qy, qz, qw } = Q_ROT90_Z
    const [x, y, z] = rotateByQuaternion(1, 0, 0, qx, qy, qz, qw)
    expect(x).toBeCloseTo(0, 5)
    expect(y).toBeCloseTo(1, 5)
    expect(z).toBeCloseTo(0, 5)
  })

  it('90° rotation around Z maps +Y to -X', () => {
    const { qx, qy, qz, qw } = Q_ROT90_Z
    const [x, y, z] = rotateByQuaternion(0, 1, 0, qx, qy, qz, qw)
    expect(x).toBeCloseTo(-1, 5)
    expect(y).toBeCloseTo(0, 5)
    expect(z).toBeCloseTo(0, 5)
  })

  it('rotation preserves vector magnitude', () => {
    const { qx, qy, qz, qw } = Q_ROT90_Z
    const [x, y, z] = rotateByQuaternion(3, 4, 0, qx, qy, qz, qw)
    const mag = Math.sqrt(x * x + y * y + z * z)
    expect(mag).toBeCloseTo(5, 5)
  })

  it('180° rotation around Y maps +X to -X', () => {
    // 180° around Y: qy = sin(90°) = 1, qw = cos(90°) = 0
    const [x, y, z] = rotateByQuaternion(1, 0, 0, 0, 1, 0, 0)
    expect(x).toBeCloseTo(-1, 5)
    expect(y).toBeCloseTo(0, 5)
    expect(z).toBeCloseTo(0, 5)
  })
})

describe('transformAndAppend', () => {
  it('identity transform appends position unchanged', () => {
    const src = makeVertex(1, 2, 3)
    const dst: number[] = []
    const { qx, qy, qz, qw } = Q_IDENTITY
    transformAndAppend(src, dst, 1, qx, qy, qz, qw, 0, 0, 0)
    expect(dst[0]).toBeCloseTo(1)
    expect(dst[1]).toBeCloseTo(2)
    expect(dst[2]).toBeCloseTo(3)
  })

  it('uniform scale multiplies position', () => {
    const src = makeVertex(1, 0, 0)
    const dst: number[] = []
    const { qx, qy, qz, qw } = Q_IDENTITY
    transformAndAppend(src, dst, 3, qx, qy, qz, qw, 0, 0, 0)
    expect(dst[0]).toBeCloseTo(3)
    expect(dst[1]).toBeCloseTo(0)
    expect(dst[2]).toBeCloseTo(0)
  })

  it('translation shifts position', () => {
    const src = makeVertex(0, 0, 0)
    const dst: number[] = []
    const { qx, qy, qz, qw } = Q_IDENTITY
    transformAndAppend(src, dst, 1, qx, qy, qz, qw, 5, 6, 7)
    expect(dst[0]).toBeCloseTo(5)
    expect(dst[1]).toBeCloseTo(6)
    expect(dst[2]).toBeCloseTo(7)
  })

  it('preserves color components from source', () => {
    const src = makeVertex(0, 0, 0, 0.2, 0.4, 0.6, 0.8)
    const dst: number[] = []
    const { qx, qy, qz, qw } = Q_IDENTITY
    transformAndAppend(src, dst, 1, qx, qy, qz, qw, 0, 0, 0)
    expect(dst[3]).toBeCloseTo(0.2)
    expect(dst[4]).toBeCloseTo(0.4)
    expect(dst[5]).toBeCloseTo(0.6)
    expect(dst[6]).toBeCloseTo(0.8)
  })

  it('skips rotation for identity quaternion (no rotation branch)', () => {
    // qw=1 means rotation branch is skipped; same result as explicit rotation
    const src = makeVertex(1, 0, 0)
    const dst1: number[] = []
    const dst2: number[] = []
    const { qx, qy, qz, qw } = Q_IDENTITY
    transformAndAppend(src, dst1, 2, qx, qy, qz, qw, 1, 0, 0)
    // Manually: scale(1,0,0) → (2,0,0), translate → (3,0,0)
    expect(dst1[0]).toBeCloseTo(3)
    expect(dst1[1]).toBeCloseTo(0)
    // Any value of qw=1 → matches identity rotation
    transformAndAppend(src, dst2, 2, 0, 0, 0, 1, 1, 0, 0)
    expect(dst2[0]).toBeCloseTo(dst1[0]!, 5)
  })

  it('applies rotation when quaternion is non-identity', () => {
    // 90° around Z: +X → +Y
    const src = makeVertex(1, 0, 0)
    const dst: number[] = []
    const { qx, qy, qz, qw } = Q_ROT90_Z
    transformAndAppend(src, dst, 1, qx, qy, qz, qw, 0, 0, 0)
    expect(dst[0]).toBeCloseTo(0, 4)
    expect(dst[1]).toBeCloseTo(1, 4)
    expect(dst[2]).toBeCloseTo(0, 4)
  })

  it('handles multiple vertices in source', () => {
    // Two vertices
    const src = new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1])
    const dst: number[] = []
    const { qx, qy, qz, qw } = Q_IDENTITY
    transformAndAppend(src, dst, 1, qx, qy, qz, qw, 0, 0, 0)
    expect(dst.length).toBe(2 * STRIDE)
    expect(dst[0]).toBeCloseTo(1) // first vertex x
    expect(dst[STRIDE]).toBeCloseTo(0) // second vertex x
    expect(dst[STRIDE + 1]).toBeCloseTo(1) // second vertex y
  })
})

describe('transformBillboardAndAppend', () => {
  const RIGHT: [number, number, number] = [1, 0, 0]
  const UP: [number, number, number] = [0, 1, 0]

  it('maps local X to camera right and local Y to camera up', () => {
    // local (1, 0) → world: 1*right + 0*up = (1,0,0)
    const src = makeVertex(1, 0, 0)
    const dst: number[] = []
    transformBillboardAndAppend(src, dst, 1, RIGHT, UP, 0, 0, 0)
    expect(dst[0]).toBeCloseTo(1) // wx
    expect(dst[1]).toBeCloseTo(0) // wy
    expect(dst[2]).toBeCloseTo(0) // wz
  })

  it('maps local Y to camera up', () => {
    const src = makeVertex(0, 1, 0)
    const dst: number[] = []
    transformBillboardAndAppend(src, dst, 1, RIGHT, UP, 0, 0, 0)
    expect(dst[0]).toBeCloseTo(0)
    expect(dst[1]).toBeCloseTo(1)
    expect(dst[2]).toBeCloseTo(0)
  })

  it('translation shifts output world position', () => {
    const src = makeVertex(0, 0, 0)
    const dst: number[] = []
    transformBillboardAndAppend(src, dst, 1, RIGHT, UP, 3, 4, 5)
    expect(dst[0]).toBeCloseTo(3)
    expect(dst[1]).toBeCloseTo(4)
    expect(dst[2]).toBeCloseTo(5)
  })

  it('scale multiplies local coordinates before billboard transform', () => {
    const src = makeVertex(1, 0, 0)
    const dst: number[] = []
    transformBillboardAndAppend(src, dst, 2, RIGHT, UP, 0, 0, 0)
    expect(dst[0]).toBeCloseTo(2)
    expect(dst[1]).toBeCloseTo(0)
  })

  it('non-axis-aligned camera vectors rotate the billboard', () => {
    // Camera right = (0,1,0), up = (-1,0,0): 90° rotated camera
    const camRight: [number, number, number] = [0, 1, 0]
    const camUp: [number, number, number] = [-1, 0, 0]
    const src = makeVertex(1, 0, 0)
    const dst: number[] = []
    transformBillboardAndAppend(src, dst, 1, camRight, camUp, 0, 0, 0)
    expect(dst[0]).toBeCloseTo(0)
    expect(dst[1]).toBeCloseTo(1)
    expect(dst[2]).toBeCloseTo(0)
  })

  it('preserves color components', () => {
    const src = makeVertex(0, 0, 0, 0.1, 0.2, 0.3, 0.4)
    const dst: number[] = []
    transformBillboardAndAppend(src, dst, 1, RIGHT, UP, 0, 0, 0)
    expect(dst[3]).toBeCloseTo(0.1)
    expect(dst[4]).toBeCloseTo(0.2)
    expect(dst[5]).toBeCloseTo(0.3)
    expect(dst[6]).toBeCloseTo(0.4)
  })

  it('ignores source z component (billboard is XY plane)', () => {
    // src z != 0 should NOT affect output position
    const src = makeVertex(1, 0, 5) // z=5, ignored
    const dst: number[] = []
    transformBillboardAndAppend(src, dst, 1, RIGHT, UP, 0, 0, 0)
    // Output should only reflect lx=1, ly=0
    expect(dst[0]).toBeCloseTo(1)
    expect(dst[1]).toBeCloseTo(0)
    expect(dst[2]).toBeCloseTo(0)
  })
})
