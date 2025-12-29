/**
 * Interaction State Hook
 * Detects camera movement, canvas resize, and user interaction for performance optimizations
 */

import { FRAME_PRIORITY } from '@/rendering/core/framePriorities'
import { useLayoutStore } from '@/stores/layoutStore'
import { INTERACTION_RESTORE_DELAY, usePerformanceStore } from '@/stores/performanceStore'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import { Euler, Vector3 } from 'three'
import { useShallow } from 'zustand/react/shallow'

/** Threshold for detecting camera movement */
const POSITION_THRESHOLD = 0.005
const ROTATION_THRESHOLD = 0.002
/** Pre-computed squared thresholds to avoid sqrt in hot path */
const POSITION_THRESHOLD_SQ = POSITION_THRESHOLD * POSITION_THRESHOLD
const ROTATION_THRESHOLD_SQ = ROTATION_THRESHOLD * ROTATION_THRESHOLD

/** Threshold for detecting camera teleport (large sudden movement) */
const TELEPORT_POSITION_THRESHOLD = 2.0
const TELEPORT_ROTATION_THRESHOLD = 0.5
/** Pre-computed squared thresholds to avoid sqrt in hot path */
const TELEPORT_POSITION_THRESHOLD_SQ = TELEPORT_POSITION_THRESHOLD * TELEPORT_POSITION_THRESHOLD
const TELEPORT_ROTATION_THRESHOLD_SQ = TELEPORT_ROTATION_THRESHOLD * TELEPORT_ROTATION_THRESHOLD

/** Minimum size change to trigger interaction (pixels) */
const SIZE_CHANGE_THRESHOLD = 1

/** Duration to keep interaction active during layout transitions (ms) */
const TRANSITION_DURATION = 600

export interface UseInteractionStateOptions {
  /** Enable interaction detection (default: true) */
  enabled?: boolean
  /** Delay before interaction is considered stopped (ms) (default: 150) */
  debounceDelay?: number
}

export interface InteractionState {
  /** Whether user is currently interacting */
  isInteracting: boolean
  /** Timestamp of last interaction */
  lastInteractionTime: number
  /** Whether camera has teleported (large sudden movement) */
  cameraTeleported: boolean
}

/**
 * Hook for detecting camera movement, canvas resize, and user interaction.
 * Used by progressive refinement.
 *
 * Detects:
 * - Camera position changes (zoom, pan, orbit)
 * - Camera rotation changes
 * - Canvas resize (sidebar resize, window resize)
 * - Mouse/touch drag events
 * - Camera teleports (for temporal reprojection)
 *
 * Does NOT detect:
 * - N-D rotation changes (handled separately by mesh fastMode)
 * - Parameter changes (fractal settings, colors, etc.)
 *
 * @param options - Configuration options
 * @returns Current interaction state
 */
export function useInteractionState(options: UseInteractionStateOptions = {}): InteractionState {
  const { enabled = true, debounceDelay = INTERACTION_RESTORE_DELAY } = options

  const { camera, gl, size } = useThree()

  // Use refs for all state to avoid re-renders
  const isInteractingRef = useRef(false)
  const lastInteractionTimeRef = useRef(0)

  // Previous camera state for comparison
  const prevPositionRef = useRef(new Vector3())
  const prevRotationRef = useRef(new Euler())

  // Previous canvas size for resize detection
  const prevSizeRef = useRef({ width: 0, height: 0 })

  // Debounce timer
  const debounceTimerRef = useRef<number | null>(null)

  // Transition animation timeouts (for cleanup on unmount)
  const transitionTimersRef = useRef<number[]>([])

  // RAF ID for teleport flag reset (for cleanup on unmount)
  const teleportRafRef = useRef<number | null>(null)

  // Mouse/touch state
  const isPointerDownRef = useRef(false)

  // Get store state (stable references)
  const cameraTeleported = usePerformanceStore((s) => s.cameraTeleported)

  // Start interaction
  const startInteraction = useCallback(() => {
    const now = performance.now()
    lastInteractionTimeRef.current = now

    if (!isInteractingRef.current) {
      isInteractingRef.current = true

      // Update store interaction state
      const state = usePerformanceStore.getState()
      state.setIsInteracting(true)

      // Reset progressive refinement
      if (state.progressiveRefinementEnabled) {
        state.resetRefinement()
      }
    }

    // Clear existing debounce timer
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
  }, [])

  // Stop interaction (with debounce)
  const stopInteraction = useCallback(() => {
    // Don't stop if pointer is still down
    if (isPointerDownRef.current) {
      return
    }

    // Clear existing timer
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current)
    }

    // Set debounce timer
    debounceTimerRef.current = window.setTimeout(() => {
      isInteractingRef.current = false
      debounceTimerRef.current = null

      // Update store interaction state
      usePerformanceStore.getState().setIsInteracting(false)
    }, debounceDelay)
  }, [debounceDelay])

  // Pointer event handlers
  useEffect(() => {
    if (!enabled) return

    const canvas = gl.domElement

    const handlePointerDown = () => {
      isPointerDownRef.current = true
    }

    const handlePointerUp = () => {
      isPointerDownRef.current = false
      stopInteraction()
    }

    const handlePointerMove = (e: PointerEvent) => {
      // Only trigger interaction if pointer is down (dragging)
      if (isPointerDownRef.current || e.buttons > 0) {
        startInteraction()
      }
    }

    const handleWheel = () => {
      startInteraction()
      stopInteraction() // Will debounce
    }

    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('pointerup', handlePointerUp)
    canvas.addEventListener('pointerleave', handlePointerUp)
    canvas.addEventListener('pointermove', handlePointerMove)
    canvas.addEventListener('wheel', handleWheel, { passive: true })

    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('pointerup', handlePointerUp)
      canvas.removeEventListener('pointerleave', handlePointerUp)
      canvas.removeEventListener('pointermove', handlePointerMove)
      canvas.removeEventListener('wheel', handleWheel)

      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current)
      }
    }
  }, [enabled, gl, startInteraction, stopInteraction])

  // Per-frame camera movement detection (optimized with squared distances)
  useFrame(() => {
    if (!enabled) return

    const pos = camera.position
    const rot = camera.rotation
    const prevPos = prevPositionRef.current
    const prevRot = prevRotationRef.current

    // Use squared distances to avoid sqrt (cheaper comparison)
    const posDistSq =
      (pos.x - prevPos.x) ** 2 + (pos.y - prevPos.y) ** 2 + (pos.z - prevPos.z) ** 2

    const rotDistSq =
      (rot.x - prevRot.x) ** 2 + (rot.y - prevRot.y) ** 2 + (rot.z - prevRot.z) ** 2

    // Check for teleport (large sudden movement) using squared thresholds
    const isTeleport =
      posDistSq > TELEPORT_POSITION_THRESHOLD_SQ || rotDistSq > TELEPORT_ROTATION_THRESHOLD_SQ

    if (isTeleport) {
      usePerformanceStore.getState().setCameraTeleported(true)
      // Cancel any pending RAF
      if (teleportRafRef.current !== null) {
        cancelAnimationFrame(teleportRafRef.current)
      }
      // Reset teleport flag after one frame
      teleportRafRef.current = requestAnimationFrame(() => {
        usePerformanceStore.getState().setCameraTeleported(false)
        teleportRafRef.current = null
      })
    }

    // Check for movement using squared thresholds
    const hasMoved = posDistSq > POSITION_THRESHOLD_SQ || rotDistSq > ROTATION_THRESHOLD_SQ

    if (hasMoved) {
      startInteraction()
      stopInteraction() // Will debounce
    }

    // Update previous values
    prevPos.copy(pos)
    prevRot.copy(rot)
  }, FRAME_PRIORITY.ANIMATION)

  // Initialize previous camera values (runs once per camera change)
  useEffect(() => {
    prevPositionRef.current.copy(camera.position)
    prevRotationRef.current.copy(camera.rotation)
  }, [camera])

  // Canvas resize detection - triggers progressive refinement when canvas size changes
  // This handles sidebar resize, window resize, and any other canvas size changes
  useEffect(() => {
    if (!enabled) return

    const prevSize = prevSizeRef.current
    const widthDelta = Math.abs(size.width - prevSize.width)
    const heightDelta = Math.abs(size.height - prevSize.height)

    // Only trigger if size actually changed (not initial mount when prev is 0)
    if (prevSize.width > 0 && prevSize.height > 0) {
      if (widthDelta >= SIZE_CHANGE_THRESHOLD || heightDelta >= SIZE_CHANGE_THRESHOLD) {
        startInteraction()
        stopInteraction() // Will debounce
      }
    }

    // Always update previous size
    prevSizeRef.current = { width: size.width, height: size.height }
  }, [enabled, size.width, size.height, startInteraction, stopInteraction])

  // Helper to keep interaction active during animations
  // Pings startInteraction() to prevent the debounce timer from closing it early
  const triggerTransitionInteraction = useCallback(() => {
    // Clear any pending transition timers
    transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    transitionTimersRef.current = []

    startInteraction()

    // Ping repeatedly to cover the spring animation duration
    const intervals = [100, 200, 300, 400, 500]
    intervals.forEach((delay) => {
      const timer = window.setTimeout(() => startInteraction(), delay)
      transitionTimersRef.current.push(timer)
    })

    // Schedule final stop
    const stopTimer = window.setTimeout(() => stopInteraction(), TRANSITION_DURATION)
    transitionTimersRef.current.push(stopTimer)
  }, [startInteraction, stopInteraction])

  // Listen to layout changes (sidebar toggle, cinematic mode)
  const { isCollapsed, showLeftPanel, isCinematicMode } = useLayoutStore(
    useShallow((state) => ({
      isCollapsed: state.isCollapsed,
      showLeftPanel: state.showLeftPanel,
      isCinematicMode: state.isCinematicMode,
    }))
  )

  useEffect(() => {
    if (!enabled) return
    triggerTransitionInteraction()
  }, [enabled, isCollapsed, showLeftPanel, isCinematicMode, triggerTransitionInteraction])

  // Listen to fullscreen changes
  useEffect(() => {
    if (!enabled) return

    const handleFullscreenChange = () => {
      triggerTransitionInteraction()
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [enabled, triggerTransitionInteraction])

  // Cleanup all transition timers and RAF on unmount
  useEffect(() => {
    return () => {
      transitionTimersRef.current.forEach((timer) => window.clearTimeout(timer))
      transitionTimersRef.current = []
      if (teleportRafRef.current !== null) {
        cancelAnimationFrame(teleportRafRef.current)
        teleportRafRef.current = null
      }
    }
  }, [])

  return {
    isInteracting: isInteractingRef.current,
    lastInteractionTime: lastInteractionTimeRef.current,
    cameraTeleported,
  }
}
