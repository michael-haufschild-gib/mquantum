/**
 * Refinement Indicator Component
 * Displays progressive refinement progress
 */

import { usePerformanceStore } from '@/stores/performanceStore'
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'

export interface RefinementIndicatorProps {
  /** Position in the viewport */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  /** Auto-hide delay after reaching 100% (ms) */
  autoHideDelay?: number
}

/**
 * Overlay indicator showing progressive refinement progress.
 * Shows during refinement and auto-hides after completion.
 * @param root0 - Component props
 * @param root0.position - Position in the viewport
 * @param root0.autoHideDelay - Auto-hide delay after reaching 100%
 * @returns The refinement progress indicator component
 */
export const RefinementIndicator: React.FC<RefinementIndicatorProps> = ({
  position = 'bottom-right',
  autoHideDelay = 1000,
}) => {
  const { enabled, stage, progress, isInteracting } = usePerformanceStore(
    useShallow((s) => ({
      enabled: s.progressiveRefinementEnabled,
      stage: s.refinementStage,
      progress: s.refinementProgress,
      isInteracting: s.isInteracting,
    }))
  )

  const [isVisible, setIsVisible] = useState(false)
  const [fadeOut, setFadeOut] = useState(false)

  // Show/hide logic
  useEffect(() => {
    if (!enabled) {
      setIsVisible(false)
      setFadeOut(false)
      return undefined
    }

    if (isInteracting) {
      // During interaction - hide immediately
      setIsVisible(false)
      setFadeOut(false)
      return undefined
    }

    if (progress < 100) {
      // During refinement - show
      setIsVisible(true)
      setFadeOut(false)
      return undefined
    }

    if (progress >= 100 && stage === 'final') {
      // Complete - start fade out
      setFadeOut(true)
      const timer = setTimeout(() => {
        setIsVisible(false)
        setFadeOut(false)
      }, autoHideDelay)
      return () => clearTimeout(timer)
    }

    return undefined
  }, [enabled, isInteracting, progress, stage, autoHideDelay])

  // Don't render if not visible
  if (!isVisible && !fadeOut) {
    return null
  }

  // Position classes
  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-20 left-4',
    'bottom-right': 'bottom-20 right-4',
  }

  return createPortal(
    <div
      className={`fixed ${positionClasses[position]} z-[100] pointer-events-none transition-opacity duration-500 ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
      data-testid="refinement-indicator"
    >
      <div className="glass-panel px-3 py-2 rounded-lg border border-[var(--border-subtle)] min-w-[80px]">
        {/* Progress bar */}
        <div className="relative h-1 bg-[var(--bg-hover)] rounded-full overflow-hidden mb-1.5">
          <div
            className="absolute inset-y-0 left-0 bg-accent transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Stage label */}
        <div className="flex justify-between items-center gap-3">
          <span className="text-xs text-[var(--text-secondary)]">
            {stage === 'final' ? 'Complete' : 'Refining'}
          </span>
          <span className="text-xs font-mono text-[var(--text-primary)]">
            {Math.round(progress)}%
          </span>
        </div>
      </div>
    </div>,
    document.body
  )
}
