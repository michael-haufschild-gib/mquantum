/**
 * Camera controller hook for the WebGPU scene.
 *
 * Manages camera initialization, orbit/pan/zoom controls, wheel handling,
 * 2D mode resets, and progressive refinement interaction signaling.
 *
 * @module rendering/webgpu/useSceneCameraController
 */

import type { RefObject } from 'react'
import { useCallback, useEffect, useRef } from 'react'

import { useCameraStore } from '@/stores/cameraStore'
import { INTERACTION_RESTORE_DELAY, usePerformanceStore } from '@/stores/performanceStore'

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
  /** Signal the start of a user interaction (camera drag, zoom). */
  startInteraction: () => void
  /** Schedule the end of a user interaction after a debounce delay. */
  scheduleEndInteraction: () => void
  /** Ref to the interaction debounce timer (for cleanup). */
  interactionTimerRef: RefObject<number | null>
}

/**
 * Hook that manages the WebGPU camera lifecycle and interaction signaling.
 *
 * Responsibilities:
 * - Creates and registers the WebGPUCamera with the camera store.
 * - Updates aspect ratio on canvas resize.
 * - Resets to top-down view when entering 2D mode.
 * - Manages progressive refinement interaction start/end signaling.
 *
 * Does NOT handle mouse/wheel events directly — those are composed
 * by the scene component using the returned refs and callbacks.
 */
export function useSceneCameraController(deps: SceneCameraControllerDeps): SceneCameraController {
  const { size, dimension } = deps

  // ── Camera instance ──
  const cameraRef = useRef<WebGPUCamera | null>(null)
  if (!cameraRef.current) {
    cameraRef.current = new WebGPUCamera({
      position: [0, 3.125, 7.5],
      target: [0, 0, 0],
      fov: 60,
      near: 0.1,
      far: 10000,
      aspect: size.width / size.height || 1,
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

  // ── Interaction state for progressive refinement ──
  const interactionTimerRef = useRef<number | null>(null)

  const startInteraction = useCallback(() => {
    if (interactionTimerRef.current !== null) {
      window.clearTimeout(interactionTimerRef.current)
      interactionTimerRef.current = null
    }
    usePerformanceStore.getState().setIsInteracting(true)
  }, [])

  const scheduleEndInteraction = useCallback(() => {
    if (interactionTimerRef.current !== null) {
      window.clearTimeout(interactionTimerRef.current)
    }
    interactionTimerRef.current = window.setTimeout(() => {
      interactionTimerRef.current = null
      usePerformanceStore.getState().setIsInteracting(false)
    }, INTERACTION_RESTORE_DELAY)
  }, [])

  return {
    cameraRef,
    dimensionRef,
    startInteraction,
    scheduleEndInteraction,
    interactionTimerRef,
  }
}
