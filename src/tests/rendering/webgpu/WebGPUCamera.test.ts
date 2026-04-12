/**
 * Tests for WebGPUCamera — matrix computation, orbit, zoom, pan.
 */

import { describe, expect, it } from 'vitest'

import { WebGPUCamera } from '@/rendering/webgpu/core/WebGPUCamera'

/** Helper: multiply 4x4 column-major matrices */
function mulMat4(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row]! * b[col * 4 + k]!
      }
      out[col * 4 + row] = sum
    }
  }
  return out
}

/** Check if column-major 4x4 matrix is approximately identity */
function expectIdentity(m: Float32Array, tolerance = 1e-4) {
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      const expected = row === col ? 1 : 0
      expect(m[col * 4 + row]).toBeCloseTo(expected, -Math.log10(tolerance))
    }
  }
}

/** Euclidean distance between two 3D points */
function dist3(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

describe('WebGPUCamera', () => {
  describe('matrix computation', () => {
    it('view * inverseView = identity', () => {
      const cam = new WebGPUCamera({
        position: [3, 5, 8],
        target: [0, 0, 0],
      })
      const m = cam.getMatrices()
      const product = mulMat4(m.viewMatrix, m.inverseViewMatrix)
      expectIdentity(product)
    })

    it('projection * inverseProjection = identity', () => {
      const cam = new WebGPUCamera({
        fov: 60,
        aspect: 16 / 9,
        near: 0.1,
        far: 100,
      })
      const m = cam.getMatrices()
      const product = mulMat4(m.projectionMatrix, m.inverseProjectionMatrix)
      expectIdentity(product)
    })

    it('viewProjection = projection * view', () => {
      const cam = new WebGPUCamera({
        position: [2, 3, 5],
        target: [0, 0, 0],
        fov: 45,
        aspect: 1.5,
      })
      const m = cam.getMatrices()
      const expected = mulMat4(m.projectionMatrix, m.viewMatrix)

      for (let i = 0; i < 16; i++) {
        expect(m.viewProjectionMatrix[i]).toBeCloseTo(expected[i]!, 4)
      }
    })

    it('cameraPosition matches state position', () => {
      const cam = new WebGPUCamera({ position: [1, 2, 3] })
      const m = cam.getMatrices()
      expect(m.cameraPosition.x).toBe(1)
      expect(m.cameraPosition.y).toBe(2)
      expect(m.cameraPosition.z).toBe(3)
    })

    it('matrices are recomputed lazily (dirty flag)', () => {
      const cam = new WebGPUCamera({ position: [0, 0, 5] })
      const m1 = cam.getMatrices()
      const pos1 = m1.cameraPosition.z

      cam.setPosition(0, 0, 10)
      const m2 = cam.getMatrices()

      expect(m2.cameraPosition.z).toBe(10)
      expect(pos1).toBe(5)
    })

    it('near and far values are reflected in matrices', () => {
      const cam = new WebGPUCamera({ near: 0.5, far: 500 })
      const m = cam.getMatrices()
      expect(m.cameraNear).toBe(0.5)
      expect(m.cameraFar).toBe(500)
    })
  })

  describe('orbit', () => {
    it('preserves distance to target', () => {
      const cam = new WebGPUCamera({
        position: [0, 0, 8],
        target: [0, 0, 0],
      })
      const distBefore = dist3(cam.getState().position, cam.getState().target)

      cam.orbit(Math.PI / 4, Math.PI / 8)

      const distAfter = dist3(cam.getState().position, cam.getState().target)
      expect(distAfter).toBeCloseTo(distBefore, 4)
    })

    it('changes position but not target', () => {
      const cam = new WebGPUCamera({
        position: [0, 0, 8],
        target: [1, 2, 3],
      })

      cam.orbit(0.5, 0.3)

      const state = cam.getState()
      expect(state.target).toEqual([1, 2, 3])
      // Position should have changed
      expect(state.position[0]).not.toBeCloseTo(0, 2)
    })

    it('clamps elevation to avoid gimbal lock', () => {
      const cam = new WebGPUCamera({
        position: [0, 0, 5],
        target: [0, 0, 0],
      })

      // Try to orbit to extreme elevation
      cam.orbit(0, 100)

      const state = cam.getState()
      const [px, py, pz] = state.position
      const dist = Math.sqrt(px * px + py * py + pz * pz)
      const elevation = Math.asin(py / dist)

      // Elevation should be clamped below π/2
      expect(elevation).toBeLessThan(Math.PI / 2)
      expect(elevation).toBeGreaterThan(-Math.PI / 2)
    })
  })

  describe('zoom', () => {
    it('zooming in reduces distance to target', () => {
      const cam = new WebGPUCamera({
        position: [0, 0, 8],
        target: [0, 0, 0],
      })

      cam.zoom(0.5) // zoom in

      const state = cam.getState()
      const dist = dist3(state.position, state.target)
      expect(dist).toBeCloseTo(4, 4) // half of 8
    })

    it('zooming out increases distance to target', () => {
      const cam = new WebGPUCamera({
        position: [0, 0, 8],
        target: [0, 0, 0],
      })

      cam.zoom(2) // zoom out

      const state = cam.getState()
      const dist = dist3(state.position, state.target)
      expect(dist).toBeCloseTo(16, 4) // double 8
    })

    it('clamps zoom factor to [0.1, 10]', () => {
      const cam = new WebGPUCamera({
        position: [0, 0, 10],
        target: [0, 0, 0],
      })

      cam.zoom(0.001) // should clamp to 0.1
      const distAfterSmall = dist3(cam.getState().position, cam.getState().target)
      expect(distAfterSmall).toBeCloseTo(1, 4) // 10 * 0.1

      cam.setPosition(0, 0, 10)
      cam.zoom(100) // should clamp to 10
      const distAfterLarge = dist3(cam.getState().position, cam.getState().target)
      expect(distAfterLarge).toBeCloseTo(100, 4) // 10 * 10
    })
  })

  describe('pan', () => {
    it('moves both position and target by the same vector', () => {
      const cam = new WebGPUCamera({
        position: [0, 0, 5],
        target: [0, 0, 0],
      })
      const distBefore = dist3(cam.getState().position, cam.getState().target)

      cam.pan(1, 0)

      const distAfter = dist3(cam.getState().position, cam.getState().target)
      // Distance should be preserved (pan moves both equally)
      expect(distAfter).toBeCloseTo(distBefore, 4)
    })

    it('pan(0, 0) is a no-op', () => {
      const cam = new WebGPUCamera({
        position: [2, 3, 5],
        target: [0, 0, 0],
      })
      const posBefore = [...cam.getState().position]
      const targetBefore = [...cam.getState().target]

      cam.pan(0, 0)

      expect(cam.getState().position).toEqual(posBefore)
      expect(cam.getState().target).toEqual(targetBefore)
    })
  })

  describe('setAspect', () => {
    it('changing the aspect ratio updates the projection matrix', () => {
      // The reverse-Z perspective matrix stores `f/aspect` at index 0, so
      // the first element is a direct function of aspect. A regression that
      // broke `dirty = true` in `setAspect` (or the lazy recompute in
      // `getMatrices`) would silently leave `projectionMatrix[0]` stale,
      // and this assertion would catch it. Snapshot-before ensures we're
      // comparing matrices from the SAME Float32Array across both calls —
      // WebGPUCamera reuses the pre-allocated buffer.
      const cam = new WebGPUCamera({ aspect: 1.5, fov: 60 })
      const projInitial0 = cam.getMatrices().projectionMatrix[0]

      cam.setAspect(2.0)
      const projAfter0 = cam.getMatrices().projectionMatrix[0]

      expect(projAfter0).not.toBeCloseTo(projInitial0!, 4)
      // Explicit invariant: `f / aspect` with f = 1/tan(fovY/2).
      const f = 1 / Math.tan((60 * Math.PI) / 180 / 2)
      expect(projAfter0).toBeCloseTo(f / 2.0, 4)
    })

    it('setAspect with the same value is a no-op (early-return optimization)', () => {
      // Proves the `if (this.state.aspect === aspect) return` guard does
      // what it claims. We clear the dirty flag by calling getMatrices()
      // once, then pass the exact same aspect — the dirty flag must stay
      // false, proving no recomputation was triggered.
      const cam = new WebGPUCamera({ aspect: 1.5 })
      cam.getMatrices() // clear dirty flag

      cam.setAspect(1.5)
      // Access the private dirty flag to assert the early-return guard works.
      // Matrix comparison alone is insufficient — identical inputs produce
      // identical results even after a full recompute.
      const internal = cam as unknown as { dirty: boolean }
      expect(internal.dirty).toBe(false)

      // A fresh aspect change still takes effect after the no-op —
      // guards against the early-return leaking into subsequent calls.
      cam.setAspect(2.0)
      expect(internal.dirty).toBe(true)
      expect(cam.getState().aspect).toBe(2.0)
    })
  })
})
