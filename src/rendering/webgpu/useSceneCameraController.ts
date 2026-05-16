/**
 * Camera controller hook for the WebGPU scene.
 *
 * Manages camera initialization, aspect-ratio sync, and 2D mode resets.
 *
 * @module rendering/webgpu/useSceneCameraController
 */

import type { RefObject } from 'react'
import { useEffect, useRef } from 'react'

import { useCameraStore } from '@/stores/scene/cameraStore'

import { WebGPUCamera } from './core/WebGPUCamera'

/** Dependencies injected from the parent scene component. */
export interface SceneCameraControllerDeps {
  /** Current canvas size from the WebGPU context. */
  size: { width: number; height: number }
  /** Current dimension prop (2 = 2D top-down, 3+ = 3D orbit). */
  dimension: number
}

/** Return value of the camera controller hook. */
export interface SceneCameraController {
  /** Ref to the managed WebGPUCamera instance. */
  cameraRef: RefObject<WebGPUCamera | null>
  /** Ref that tracks the current dimension (avoids stale closures). */
  dimensionRef: RefObject<number>
}

/**
 * Hook that manages the WebGPU camera lifecycle.
 *
 * Responsibilities:
 * - Creates and registers the WebGPUCamera with the camera store.
 * - Updates aspect ratio on canvas resize.
 * - Resets to top-down view when entering 2D mode.
 *
 * Does NOT handle mouse/wheel events directly — those are composed
 * by the scene component using the returned refs.
 */
export function useSceneCameraController(deps: SceneCameraControllerDeps): SceneCameraController {
  const { size, dimension } = deps

  // ── Camera instance ──
  const cameraRef = useRef<WebGPUCamera | null>(null)
  if (!cameraRef.current) {
    // Guard against a transient degenerate canvas size during initial layout.
    // The `||` shortcut fallback used previously did not catch `width / 0 =
    // Infinity` (Infinity is truthy), which baked an aspect = Infinity into
    // the projection matrix (`out[0] = f / aspect = 0`, collapsing the x
    // component to zero) and persisted there until a *valid* resize fired
    // — the aspect-update effect below is itself gated on `width > 0 &&
    // height > 0`, so a width-only / height-zero seed had no auto-recovery.
    const initialAspect = size.width > 0 && size.height > 0 ? size.width / size.height : 1
    cameraRef.current = new WebGPUCamera({
      position: [0, 3.125, 7.5],
      target: [0, 0, 0],
      fov: 60,
      near: 0.1,
      far: 10000,
      aspect: initialAspect,
    })
  }

  // Register camera with Zustand store so presets/shortcuts can read/write camera state
  useEffect(() => {
    if (cameraRef.current) {
      useCameraStore.getState().registerCamera(cameraRef.current)
    }
    return () => {
      useCameraStore.getState().registerCamera(null)
    }
  }, [])

  // Update camera aspect ratio when canvas size changes
  useEffect(() => {
    if (cameraRef.current && size.width > 0 && size.height > 0) {
      cameraRef.current.setAspect(size.width / size.height)
    }
  }, [size.width, size.height])

  // Reset camera to top-down view when switching to 2D mode
  useEffect(() => {
    if (dimension === 2 && cameraRef.current) {
      cameraRef.current.setPosition(0, 0, 8)
      cameraRef.current.setTarget(0, 0, 0)
    }
  }, [dimension])

  // ── Dimension ref for mouse handlers (avoids stale closure over prop) ──
  const dimensionRef = useRef(dimension)
  dimensionRef.current = dimension

  return {
    cameraRef,
    dimensionRef,
  }
}
