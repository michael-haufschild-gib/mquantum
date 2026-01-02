/**
 * Animation Loop Hook
 *
 * Integrates rotation animation with R3F's frame system via useFrame.
 * FpsController handles frame timing via advance(), this hook updates
 * rotation state at the ANIMATION priority level.
 *
 * Performance: Uses a single RAF driver (FpsController) instead of separate
 * RAF loops, eliminating duplicate timing logic and redundant wakeups.
 */

import { getPlaneMultiplier } from '@/lib/animation/biasCalculation'
import { FRAME_PRIORITY } from '@/rendering/core/framePriorities'
import { useAnimationStore } from '@/stores/animationStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useExportStore } from '@/stores/exportStore'
import { useMsgBoxStore } from '@/stores/msgBoxStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { useRotationStore } from '@/stores/rotationStore'
import { useUIStore } from '@/stores/uiStore'
import { useFrame } from '@react-three/fiber'
import { useCallback, useRef } from 'react'

/**
 * Hook that runs animation updates within R3F's frame loop.
 * Updates rotation angles for all animating planes at ANIMATION priority.
 *
 * All state is read via getState() inside the callback for fresh values.
 * This ensures the callback is stable (empty deps) and conditions are
 * always evaluated with current store state.
 *
 * Pauses during:
 * - skybox loading
 * - scene transitions
 * - video export (export handles its own animation stepping)
 */
export function useAnimationLoop(): void {
  // Reusable Map for rotation updates (avoids allocation every frame)
  const updatesRef = useRef(new Map<string, number>())

  // Stable callback - all state read via getState() inside
  const animationCallback = useCallback(
    (_state: unknown, delta: number) => {
      try {
        // Convert delta from seconds to milliseconds
        const deltaTimeMs = delta * 1000

        // Skip if delta is too large (e.g., tab was inactive or first frame)
        if (deltaTimeMs > 100 || deltaTimeMs <= 0) {
          return
        }

        // Batch all store reads at start of callback
        const animState = useAnimationStore.getState()
        const { isPlaying, animatingPlanes, getRotationDelta, updateAccumulatedTime } = animState
        const { skyboxLoading } = useEnvironmentStore.getState()
        const { sceneTransitioning } = usePerformanceStore.getState()
        const { isExporting } = useExportStore.getState()

        // Check all pause conditions
        if (!isPlaying || animatingPlanes.size === 0 || skyboxLoading || sceneTransitioning || isExporting) {
          return
        }

        const { animationBias } = useUIStore.getState()
        const rotationState = useRotationStore.getState()

        // Update global accumulated time (used by fractals and blackholes)
        updateAccumulatedTime(delta)

        const rotationDelta = getRotationDelta(deltaTimeMs)

        // Reuse Map instance to avoid allocation every frame
        const updates = updatesRef.current
        updates.clear()

        // Update each animating plane with per-plane bias multiplier
        const totalPlanes = animatingPlanes.size
        let planeIndex = 0
        for (const plane of animatingPlanes) {
          const currentAngle = rotationState.rotations.get(plane) ?? 0
          // Apply per-plane bias multiplier using golden ratio spread
          const multiplier = getPlaneMultiplier(planeIndex, totalPlanes, animationBias)
          const biasedDelta = rotationDelta * multiplier
          let newAngle = currentAngle + biasedDelta

          // Normalize to [0, 2π) - using modulo for safety against NaN/Infinity
          if (!isFinite(newAngle)) {
            newAngle = 0
          } else {
            newAngle = ((newAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
          }

          updates.set(plane, newAngle)
          planeIndex++
        }

        if (updates.size > 0) {
          rotationState.updateRotations(updates)
        }
      } catch (error) {
        console.error('Animation Loop Error:', error)

        // Stop animation
        useAnimationStore.getState().pause()

        // Show error message - wrap in try-catch to prevent double-error crashes
        try {
          useMsgBoxStore.getState().showMsgBox(
            'Animation Error',
            `The animation loop encountered an error and has been stopped.\n\n${error instanceof Error ? error.message : 'Unknown error'}`,
            'error',
            [
              {
                label: 'Reload Page',
                onClick: () => window.location.reload(),
                variant: 'danger'
              },
              {
                label: 'Close',
                onClick: () => useMsgBoxStore.getState().closeMsgBox(),
                variant: 'secondary'
              }
            ]
          )
        } catch (msgBoxError) {
          console.error('Failed to show animation error dialog:', msgBoxError)
        }
      }
    },
    [] // Empty deps - all state read via getState()
  )

  // Register with R3F's frame system at ANIMATION priority
  useFrame(animationCallback, FRAME_PRIORITY.ANIMATION)
}
