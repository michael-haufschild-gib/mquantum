/**
 * Progressive Refinement Hook
 * Manages quality stages after interaction stops
 */

import { useEnvironmentStore } from '@/stores/environmentStore'
import {
  REFINEMENT_STAGE_TIMING,
  REFINEMENT_STAGES,
  usePerformanceStore,
  type RefinementStage,
} from '@/stores/performanceStore'
import { useExportStore } from '@/stores/exportStore'
import { useCallback, useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

export interface UseProgressiveRefinementOptions {
  /** Enable progressive refinement (default: true) */
  enabled?: boolean
}

export interface ProgressiveRefinementState {
  /** Current refinement stage */
  stage: RefinementStage
  /** Current quality multiplier (0.25-1.0) */
  qualityMultiplier: number
  /** Current progress (0-100) */
  progress: number
  /** Whether refinement is complete */
  isComplete: boolean
}

/**
 * Hook for managing progressive quality refinement after interaction stops.
 *
 * Stages: low → medium → high → final
 * Timing: instant → 100ms → 300ms → 500ms
 *
 * The hook listens to interaction state changes and advances through
 * quality stages automatically after interaction stops.
 *
 * @param options - Configuration options
 * @returns Current refinement state
 */
export function useProgressiveRefinement(
  options: UseProgressiveRefinementOptions = {}
): ProgressiveRefinementState {
  const { enabled: optionEnabled = true } = options

  // Consolidated store subscriptions for better performance
  const {
    storeEnabled,
    stage,
    progress,
    qualityMultiplier,
    isInteracting,
    sceneTransitioning,
    setRefinementStage,
    setRefinementProgress,
  } = usePerformanceStore(
    useShallow((s) => ({
      storeEnabled: s.progressiveRefinementEnabled,
      stage: s.refinementStage,
      progress: s.refinementProgress,
      qualityMultiplier: s.qualityMultiplier,
      isInteracting: s.isInteracting,
      sceneTransitioning: s.sceneTransitioning,
      setRefinementStage: s.setRefinementStage,
      setRefinementProgress: s.setRefinementProgress,
    }))
  )

  // Skybox loading state - keep low quality while loading
  const skyboxLoading = useEnvironmentStore((s) => s.skyboxLoading)

  // Export state - don't interfere with VideoExportController's quality management
  const isExporting = useExportStore((s) => s.isExporting)

  const enabled = optionEnabled && storeEnabled

  // Timer refs
  const stageTimersRef = useRef<number[]>([])
  const progressRafRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)

  // Clear all timers
  const clearTimers = useCallback(() => {
    stageTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    stageTimersRef.current = []

    if (progressRafRef.current !== null) {
      cancelAnimationFrame(progressRafRef.current)
      progressRafRef.current = null
    }
  }, [])

  // Start refinement sequence
  const startRefinement = useCallback(() => {
    if (!enabled) return

    clearTimers()
    startTimeRef.current = performance.now()

    // Set initial stage
    setRefinementStage('low')
    setRefinementProgress(0)

    // Schedule stage transitions
    const stages = REFINEMENT_STAGES.slice(1) // Skip 'low', already set
    stages.forEach((stageKey) => {
      const delay = REFINEMENT_STAGE_TIMING[stageKey]
      const timer = window.setTimeout(() => {
        setRefinementStage(stageKey)
      }, delay)
      stageTimersRef.current.push(timer)
    })

    // Start progress animation using RAF for proper frame sync
    const totalDuration = REFINEMENT_STAGE_TIMING.final
    const updateProgress = () => {
      const elapsed = performance.now() - startTimeRef.current
      const newProgress = Math.min(100, (elapsed / totalDuration) * 100)
      setRefinementProgress(newProgress)

      if (newProgress < 100) {
        progressRafRef.current = requestAnimationFrame(updateProgress)
      } else {
        progressRafRef.current = null
      }
    }
    progressRafRef.current = requestAnimationFrame(updateProgress)
  }, [enabled, clearTimers, setRefinementStage, setRefinementProgress])

  // Stop refinement (reset to low)
  const stopRefinement = useCallback(() => {
    clearTimers()
    setRefinementStage('low')
    setRefinementProgress(0)
  }, [clearTimers, setRefinementStage, setRefinementProgress])

  // React to interaction state, skybox loading, scene transitions, and export state
  useEffect(() => {
    // During export, don't manage refinement - VideoExportController handles quality
    if (isExporting) {
      clearTimers()
      return
    }

    if (!enabled) {
      // If disabled, ensure we're at final quality
      setRefinementStage('final')
      setRefinementProgress(100)
      return
    }

    // Keep low quality while skybox is loading, during interaction, or scene transition
    if (isInteracting || skyboxLoading || sceneTransitioning) {
      // Interaction/loading/transition - reset to low quality
      stopRefinement()
    } else {
      // All clear - start refinement sequence
      startRefinement()
    }

    return clearTimers
  }, [
    enabled,
    isExporting,
    isInteracting,
    skyboxLoading,
    sceneTransitioning,
    startRefinement,
    stopRefinement,
    clearTimers,
    setRefinementStage,
    setRefinementProgress,
  ])

  // Cleanup on unmount
  useEffect(() => {
    return clearTimers
  }, [clearTimers])

  return {
    stage,
    qualityMultiplier,
    progress,
    isComplete: stage === 'final' && progress >= 100,
  }
}
