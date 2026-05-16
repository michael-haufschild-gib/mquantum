/**
 * Tests for useSceneCameraController.
 *
 * Regression: a transient degenerate canvas size (width > 0, height = 0)
 * during initial layout produced `width / 0 = Infinity` for the seed
 * aspect ratio. The previous `|| 1` fallback did not catch this because
 * Infinity is truthy. The Infinity aspect baked into the projection matrix
 * collapsed the x-component to zero (`out[0] = f / Infinity = 0`), and the
 * subsequent aspect-update effect — itself gated on positive width AND
 * positive height — left the camera stuck until a fully-valid resize
 * fired.
 *
 * @module tests/rendering/webgpu/useSceneCameraController
 */

import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { useSceneCameraController } from '@/rendering/webgpu/useSceneCameraController'
import { useCameraStore } from '@/stores/scene/cameraStore'

function resetCameraStore(): void {
  // Clear any camera registered by a previous test instance so the next
  // renderHook sees a fresh slot.
  useCameraStore.getState().registerCamera(null)
}

describe('useSceneCameraController — initial aspect ratio', () => {
  afterEach(resetCameraStore)

  it('produces a finite aspect for the canonical (width, height) case', () => {
    const { result } = renderHook(() =>
      useSceneCameraController({ size: { width: 1600, height: 900 }, dimension: 3 })
    )
    const aspect = result.current.cameraRef.current?.getState().aspect
    expect(aspect).toBeCloseTo(1600 / 900, 6)
    expect(Number.isFinite(aspect)).toBe(true)
  })

  it('falls back to aspect=1 when canvas height is zero with non-zero width', () => {
    const { result } = renderHook(() =>
      useSceneCameraController({ size: { width: 1600, height: 0 }, dimension: 3 })
    )
    const aspect = result.current.cameraRef.current?.getState().aspect
    expect(aspect).toBe(1)
    expect(Number.isFinite(aspect)).toBe(true)
  })

  it('falls back to aspect=1 when both width and height are zero', () => {
    const { result } = renderHook(() =>
      useSceneCameraController({ size: { width: 0, height: 0 }, dimension: 3 })
    )
    const aspect = result.current.cameraRef.current?.getState().aspect
    expect(aspect).toBe(1)
  })

  it('falls back to aspect=1 when width is zero with non-zero height', () => {
    const { result } = renderHook(() =>
      useSceneCameraController({ size: { width: 0, height: 900 }, dimension: 3 })
    )
    const aspect = result.current.cameraRef.current?.getState().aspect
    // 0 / 900 = 0 — also a degenerate aspect, so the guard normalizes to 1
    // for symmetry with the height=0 path.
    expect(aspect).toBe(1)
  })
})
