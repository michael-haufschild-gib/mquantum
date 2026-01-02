/**
 * FPS Controller Component
 *
 * Controls render rate using the R3F recommended pattern:
 * - Uses frameloop="never" to disable automatic rendering
 * - Uses requestAnimationFrame for timing (syncs with display refresh)
 * - Calls advance() to trigger frames at the target FPS
 *
 * @see https://github.com/pmndrs/react-three-fiber/discussions/667
 *
 * @remarks
 * - Must be placed inside a Canvas component with frameloop="never"
 * - Uses requestAnimationFrame instead of setInterval for accurate timing
 * - Subscribes to maxFps changes and adjusts timing accordingly
 * - Pauses rendering when WebGL context is lost or page is not visible
 */

import { useAnimationStore } from '@/stores/animationStore'
import { useExportStore } from '@/stores/exportStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { useWebGLContextStore } from '@/stores/webglContextStore'
import { useThree } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'

/**
 * FPS Controller that triggers renders at a controlled rate.
 *
 * Uses the R3F maintainer-recommended pattern with requestAnimationFrame
 * and advance() for proper frame limiting that syncs with display refresh.
 *
 * Implements "Dynamic FPS":
 * - Full FPS (up to maxFps) when playing animation or user is interacting.
 * - Low FPS (10fps) when idle to save power.
 *
 * @returns null - This component renders nothing, only manages frame timing
 */
export function FpsController(): null {
  const { advance, gl } = useThree()
  const rafRef = useRef<number | null>(null)
  const thenRef = useRef<number>(0)

  useLayoutEffect(() => {
    /**
     * Animation tick using requestAnimationFrame.
     * Only advances the frame when enough time has elapsed based on maxFps.
     * Skips rendering when context is lost or page is hidden.
     * @param now
     */
    const tick = (now: number): void => {
      rafRef.current = requestAnimationFrame(tick)

      // Batch all store reads at start of tick (avoids multiple getState() calls)
      const contextStore = useWebGLContextStore.getState()
      const { status, isPageVisible, onContextLost } = contextStore
      const { isExporting } = useExportStore.getState()
      const { isPlaying } = useAnimationStore.getState()
      const { isInteracting, maxFps } = usePerformanceStore.getState()

      // Check WebGL context state - skip rendering if not active
      if (status !== 'active') {
        return
      }

      // Skip if page is not visible (power saving)
      // Also skip if exporting (manual control)
      if (!isPageVisible || isExporting) {
        return
      }

      // Double-check context isn't actually lost (defensive check)
      // This catches cases where the event hasn't fired yet
      const context = gl.getContext()
      if (context && context.isContextLost()) {
        // Trigger context lost handling if not already in progress
        if (status === 'active') {
          onContextLost()
        }
        return
      }

      // If idle (not playing and not interacting), cap at 10 FPS to save power
      // while still allowing UI updates to reflect reasonably fast.
      const targetFps = (isPlaying || isInteracting) ? maxFps : 10
      const interval = 1000 / targetFps
      const elapsed = now - thenRef.current

      // Use 1ms tolerance to handle floating point precision issues.
      // Without tolerance, elapsed=16.665ms vs interval=16.666ms fails the check,
      // causing exactly 30 FPS (every other frame skipped).
      // See: docs/bugfixing/log/fps-cap-30.md
      if (elapsed >= interval - 1) {
        // Advance the frame - this triggers useFrame callbacks and renders
        // R3F's advance() expects timestamp in SECONDS, not milliseconds
        // RAF provides timestamp in ms, so convert: now / 1000
        advance(now / 1000)

        // Account for elapsed time to prevent drift, but don't set it to future
        // and ensure we don't 'lose' time if we skipped many frames.
        thenRef.current = now - (elapsed % interval)
      }
    }

    // Start the animation loop
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [advance, gl])

  return null
}
