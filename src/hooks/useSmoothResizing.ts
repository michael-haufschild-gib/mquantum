import { FRAME_PRIORITY } from '@/rendering/core/framePriorities'
import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { useSpring } from 'framer-motion'
import { PerspectiveCamera } from 'three'

const SPRING_CONFIG = { damping: 25, stiffness: 200 }

/**
 * Hook to smooth out "hard" resizing events (like entering/exiting fullscreen).
 *
 * Problem:
 * Three.js PerspectiveCamera maintains a constant vertical FOV.
 * When the viewport height increases (e.g., hiding browser chrome),
 * the visible vertical world units remain the same, but are stretched over more pixels.
 * This causes objects to physically grow on screen instantly ("jump").
 *
 * Solution:
 * We detect height changes and immediately apply a counter-acting `camera.zoom`.
 * If height doubles, we zoom to 0.5 (keeping object size constant).
 * Then we spring-animate the zoom back to 1.0, creating a smooth "reveal"
 * of the new vertical space instead of a snap.
 */
/** Threshold for detecting when zoom has settled */
const ZOOM_SETTLED_THRESHOLD = 0.001

/**
 *
 */
export function useSmoothResizing() {
  const { size, camera } = useThree()
  const prevHeight = useRef(size.height)
  // Track pending RAF to cancel on rapid resizes
  const rafIdRef = useRef<number | null>(null)
  // Track animation state to skip work when not animating
  const isAnimatingRef = useRef(false)
  const lastZoomRef = useRef(1)

  // Spring to animate zoom. Default 1.0.
  const zoomCorrection = useSpring(1, SPRING_CONFIG)

  useEffect(() => {
    // We only care about height changes for the "jump" artifact.
    // Width changes (in vertical FOV cameras) just reveal more side content smoothly.
    const heightChanged = Math.abs(size.height - prevHeight.current) > 1

    // Ignore the very first mount/resize to 0
    const isValidResize = prevHeight.current > 0 && size.height > 0

    if (heightChanged && isValidResize) {
      // Cancel any pending RAF from previous resize to prevent race condition
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }

      // Calculate ratio needed to keep objects same pixel height
      // OldHeight = NewHeight * Ratio
      // Ratio = OldHeight / NewHeight
      const compensationRatio = prevHeight.current / size.height

      // Mark that we're animating (for useFrame early-exit)
      isAnimatingRef.current = true

      // 1. Snap immediately to the compensated zoom level
      // This neutralizes the visual jump in the very next frame
      zoomCorrection.set(compensationRatio)

      // 2. Animate back to natural zoom (1.0)
      // This creates the smooth "settling" or "reveal" effect
      // We use a slight delay or just set it in the next microtask to ensure the spring starts
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        zoomCorrection.set(1)
      })
    } else if (!isValidResize) {
      // Ensure we start at 1 for initial render
      zoomCorrection.set(1)
    }

    prevHeight.current = size.height

    // Cleanup on unmount
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [size.height, zoomCorrection])

  useFrame(() => {
    if (!(camera instanceof PerspectiveCamera)) return

    const scale = zoomCorrection.get()

    // Early exit if not animating, already at rest, AND spring is at 1
    // We check the spring value to handle edge cases (e.g., spring set externally)
    if (
      !isAnimatingRef.current &&
      lastZoomRef.current === 1 &&
      Math.abs(scale - 1) < ZOOM_SETTLED_THRESHOLD
    ) {
      return
    }

    // Check if animation has settled (back to 1.0)
    if (Math.abs(scale - 1) < ZOOM_SETTLED_THRESHOLD) {
      isAnimatingRef.current = false
      lastZoomRef.current = 1
      // Ensure camera is exactly at 1.0 when settled
      if (camera.zoom !== 1) {
        camera.zoom = 1
        camera.updateProjectionMatrix()
      }
      return
    }

    // Apply zoom correction
    // We assume no other system is aggressively animating camera.zoom
    // If zoom is needed for other features (dolly), those usually move camera position, not zoom property.
    if (camera.zoom !== scale) {
      camera.zoom = scale
      camera.updateProjectionMatrix()
    }
    lastZoomRef.current = scale
  }, FRAME_PRIORITY.ANIMATION)
}
