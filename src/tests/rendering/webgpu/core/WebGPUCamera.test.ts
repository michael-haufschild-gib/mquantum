import { describe, expect, it } from 'vitest'

import { WebGPUCamera } from '@/rendering/webgpu/core/WebGPUCamera'

/** Helper: Euclidean distance between two 3D points. */
function distance3(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

/** Helper: Euclidean length of a 3D vector. */
function length3(v: [number, number, number]): number {
  return Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
}

describe('WebGPUCamera', () => {
  describe('construction and state', () => {
    it('uses correct defaults', () => {
      const cam = new WebGPUCamera()
      const state = cam.getState()
      expect(state.position).toEqual([0, 3.125, 7.5])
      expect(state.target).toEqual([0, 0, 0])
      expect(state.fov).toBe(60)
      expect(state.near).toBe(0.1)
      expect(state.far).toBe(10000)
      expect(state.aspect).toBe(1)
    })

    it('accepts partial overrides', () => {
      const cam = new WebGPUCamera({ fov: 90, near: 0.5 })
      const state = cam.getState()
      expect(state.fov).toBe(90)
      expect(state.near).toBe(0.5)
      expect(state.position).toEqual([0, 3.125, 7.5]) // default preserved
    })
  })

  describe('setters mark camera dirty', () => {
    it('setPosition updates position', () => {
      const cam = new WebGPUCamera()
      cam.setPosition(1, 2, 3)
      expect(cam.getState().position).toEqual([1, 2, 3])
    })

    it('setTarget updates target', () => {
      const cam = new WebGPUCamera()
      cam.setTarget(4, 5, 6)
      expect(cam.getState().target).toEqual([4, 5, 6])
    })

    it('setFov updates fov', () => {
      const cam = new WebGPUCamera()
      cam.setFov(90)
      expect(cam.getState().fov).toBe(90)
    })

    it('setAspect skips update when value unchanged', () => {
      const cam = new WebGPUCamera({ aspect: 1.5 })
      const matrices1 = cam.getMatrices()
      const proj1 = new Float32Array(matrices1.projectionMatrix)
      cam.setAspect(1.5) // same value
      const matrices2 = cam.getMatrices()
      // Should be the same Float32Array reference (no recomputation)
      expect(matrices2.projectionMatrix).toBe(matrices1.projectionMatrix)
      expect(matrices2.projectionMatrix).toEqual(proj1)
    })
  })

  describe('matrix computation', () => {
    it('produces valid view matrix at default position', () => {
      const cam = new WebGPUCamera()
      const { viewMatrix } = cam.getMatrices()
      // View matrix should be orthonormal (determinant ≈ 1 for rotation part)
      // Column 3 (indices 12-14) contains the translation
      // The matrix should not contain NaN or Infinity
      for (let i = 0; i < 16; i++) {
        expect(Number.isFinite(viewMatrix[i])).toBe(true)
      }
    })

    it('produces reverse-Z projection matrix', () => {
      const cam = new WebGPUCamera({ fov: 60, near: 0.1, far: 1000, aspect: 16 / 9 })
      const { projectionMatrix } = cam.getMatrices()
      // Reverse-Z: [2][2] = near/(far-near) which is small positive, [3][2] = far*near/(far-near)
      // [2][3] = -1 (perspective divide)
      expect(projectionMatrix[11]).toBeCloseTo(-1, 5) // perspective W component
      // Near plane maps to depth 1, far plane to depth 0
      const m22 = projectionMatrix[10]! // near * rangeInv
      const m32 = projectionMatrix[14]! // far * near * rangeInv
      // At z = -near: depth = m22 * (-near) + m32 / (-near) * ... should approach 1
      // At z = -far: depth should approach 0
      expect(m22).toBeGreaterThan(-1) // sanity: small value for reverse-Z
      expect(Number.isFinite(m32)).toBe(true)
    })

    it('viewProjectionMatrix equals projection × view', () => {
      const cam = new WebGPUCamera({ position: [3, 4, 5], aspect: 2 })
      const { viewMatrix, projectionMatrix, viewProjectionMatrix } = cam.getMatrices()

      // Manual column-major multiply: out = proj * view
      const expected = new Float32Array(16)
      for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
          let sum = 0
          for (let k = 0; k < 4; k++) {
            sum += projectionMatrix[row + k * 4]! * viewMatrix[k + col * 4]!
          }
          expected[row + col * 4] = sum
        }
      }

      for (let i = 0; i < 16; i++) {
        expect(viewProjectionMatrix[i]).toBeCloseTo(expected[i]!, 4)
      }
    })

    it('inverseViewMatrix × viewMatrix ≈ identity', () => {
      const cam = new WebGPUCamera({ position: [2, 3, 7], target: [1, 0, 0] })
      const { viewMatrix, inverseViewMatrix } = cam.getMatrices()

      const product = new Float32Array(16)
      for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
          let sum = 0
          for (let k = 0; k < 4; k++) {
            sum += inverseViewMatrix[row + k * 4]! * viewMatrix[k + col * 4]!
          }
          product[row + col * 4] = sum
        }
      }

      // Should be identity
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          const expected = i === j ? 1 : 0
          expect(product[i + j * 4]).toBeCloseTo(expected, 4)
        }
      }
    })

    it('cameraPosition matches state position', () => {
      const cam = new WebGPUCamera({ position: [1.5, 2.5, 3.5] })
      const m = cam.getMatrices()
      expect(m.cameraPosition.x).toBe(1.5)
      expect(m.cameraPosition.y).toBe(2.5)
      expect(m.cameraPosition.z).toBe(3.5)
    })

    it('matrices are recomputed after state change', () => {
      const cam = new WebGPUCamera()
      const m1 = cam.getMatrices()
      const pos1 = m1.cameraPosition.x

      cam.setPosition(99, 0, 0)
      const m2 = cam.getMatrices()
      expect(m2.cameraPosition.x).toBe(99)
      expect(m2.cameraPosition.x).not.toBe(pos1)
    })
  })

  describe('orbit', () => {
    it('preserves distance to target', () => {
      const cam = new WebGPUCamera({ position: [0, 0, 5], target: [0, 0, 0] })
      const d0 = distance3(cam.getState().position, cam.getState().target)

      cam.orbit(0.5, 0.2)
      const d1 = distance3(cam.getState().position, cam.getState().target)
      expect(d1).toBeCloseTo(d0, 8)
    })

    it('rotates camera position around target', () => {
      const cam = new WebGPUCamera({ position: [0, 0, 5], target: [0, 0, 0] })
      cam.orbit(Math.PI / 2, 0) // 90° azimuth

      const state = cam.getState()
      // After 90° azimuth rotation from +Z, camera should be near +X
      expect(state.position[0]).toBeCloseTo(5, 1)
      expect(Math.abs(state.position[2])).toBeLessThan(0.1)
    })

    it('clamps elevation to avoid gimbal lock', () => {
      const cam = new WebGPUCamera({ position: [0, 0, 5], target: [0, 0, 0] })
      // Try to go past 90° elevation
      cam.orbit(0, Math.PI)

      const state = cam.getState()
      const dy = state.position[1] - state.target[1]
      const dist = distance3(state.position, state.target)
      const elevation = Math.asin(dy / dist)

      // Should be clamped to just under π/2
      expect(elevation).toBeLessThan(Math.PI / 2)
      expect(elevation).toBeGreaterThan(0)
    })

    it('handles near-zero distance without NaN', () => {
      const cam = new WebGPUCamera({ position: [0, 0, 0.001], target: [0, 0, 0] })
      cam.orbit(1, 0.5)

      const state = cam.getState()
      expect(Number.isFinite(state.position[0])).toBe(true)
      expect(Number.isFinite(state.position[1])).toBe(true)
      expect(Number.isFinite(state.position[2])).toBe(true)
    })

    it('handles camera exactly at target without NaN', () => {
      const cam = new WebGPUCamera({ position: [0, 0, 0], target: [0, 0, 0] })
      cam.orbit(1, 0.5)

      const state = cam.getState()
      for (const c of state.position) {
        expect(Number.isFinite(c)).toBe(true)
      }
    })
  })

  describe('zoom', () => {
    it('moves camera closer with factor < 1', () => {
      const cam = new WebGPUCamera({ position: [0, 0, 10], target: [0, 0, 0] })
      cam.zoom(0.5)

      const state = cam.getState()
      const dist = distance3(state.position, state.target)
      expect(dist).toBeCloseTo(5, 5)
    })

    it('moves camera farther with factor > 1', () => {
      const cam = new WebGPUCamera({ position: [0, 0, 10], target: [0, 0, 0] })
      cam.zoom(2)

      const state = cam.getState()
      const dist = distance3(state.position, state.target)
      expect(dist).toBeCloseTo(20, 5)
    })

    it('clamps factor to [0.1, 10]', () => {
      const cam = new WebGPUCamera({ position: [0, 0, 10], target: [0, 0, 0] })
      cam.zoom(0.001) // clamped to 0.1

      const dist = distance3(cam.getState().position, cam.getState().target)
      expect(dist).toBeCloseTo(1, 5)
    })

    it('enforces minimum distance to target', () => {
      const cam = new WebGPUCamera({ position: [0, 0, 0.005], target: [0, 0, 0] })
      cam.zoom(0.1) // would make distance 0.0005, below MIN_CAMERA_DISTANCE

      const state = cam.getState()
      // Position should not have changed (zoom rejected)
      expect(state.position[2]).toBeCloseTo(0.005, 8)
    })

    it('preserves direction when zooming', () => {
      const cam = new WebGPUCamera({ position: [3, 4, 0], target: [0, 0, 0] })
      const before = cam.getState().position
      const lenBefore = length3(before)

      cam.zoom(0.5)

      const after = cam.getState().position
      const lenAfter = length3(after)

      // Direction should be preserved: normalized vectors should match
      expect(after[0] / lenAfter).toBeCloseTo(before[0] / lenBefore, 5)
      expect(after[1] / lenAfter).toBeCloseTo(before[1] / lenBefore, 5)
      expect(after[2] / lenAfter).toBeCloseTo(before[2] / lenBefore, 5)
    })
  })

  describe('pan', () => {
    it('moves position and target by same delta', () => {
      const cam = new WebGPUCamera({ position: [0, 0, 5], target: [0, 0, 0] })
      const distBefore = distance3(cam.getState().position, cam.getState().target)

      cam.pan(1, 0)

      const distAfter = distance3(cam.getState().position, cam.getState().target)
      // Distance between position and target should be preserved
      expect(distAfter).toBeCloseTo(distBefore, 5)
    })

    it('uses up-to-date view matrix after orbit', () => {
      const cam = new WebGPUCamera({ position: [0, 0, 5], target: [0, 0, 0] })

      // Orbit 90° azimuth — camera now at +X looking at origin
      cam.orbit(Math.PI / 2, 0)
      // Pan right — should move along camera-local X (which is now world -Z after 90° orbit)
      cam.pan(1, 0)

      const state = cam.getState()
      // After orbit to +X, camera right vector points roughly along -Z
      // So panning deltaX=1 should shift the camera's Z position
      expect(Math.abs(state.target[2])).toBeGreaterThan(0.5)
    })

    it('zero delta is a no-op', () => {
      const cam = new WebGPUCamera({ position: [3, 4, 5], target: [1, 2, 3] })
      const before = { ...cam.getState() }

      cam.pan(0, 0)

      const after = cam.getState()
      expect(after.position).toEqual(before.position)
      expect(after.target).toEqual(before.target)
    })
  })

  describe('dirty flag optimization', () => {
    it('does not recompute matrices when nothing changed', () => {
      const cam = new WebGPUCamera()
      const m1 = cam.getMatrices()
      const m2 = cam.getMatrices()
      // Same Float32Array references (no recomputation)
      expect(m2.viewMatrix).toBe(m1.viewMatrix)
      expect(m2.projectionMatrix).toBe(m1.projectionMatrix)
    })

    it('recomputes after setPosition', () => {
      const cam = new WebGPUCamera()
      const m1 = cam.getMatrices()
      const v1 = new Float32Array(m1.viewMatrix)

      cam.setPosition(10, 10, 10)
      const m2 = cam.getMatrices()
      // Values should differ (same buffer, updated in place)
      let differ = false
      for (let i = 0; i < 16; i++) {
        if (Math.abs((m2.viewMatrix[i] ?? 0) - (v1[i] ?? 0)) > 1e-6) differ = true
      }
      expect(differ).toBe(true)
    })
  })
})
