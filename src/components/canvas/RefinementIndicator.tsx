/**
 * Refinement Indicator Component
 * Displays progressive refinement progress
 */

import { useProgressiveRefinement } from '@/hooks/useProgressiveRefinement'
import { usePerformanceStore } from '@/stores/performanceStore'
import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'

/**
 *
 */
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
  // Drive the progressive refinement state machine
  useProgressiveRefinement()

  const { enabled, stage, progress, isInteracting } = usePerformanceStore(
    useShallow((s) => ({
      enabled: s.progressiveRefinementEnabled,
      stage: s.refinementStage,
      progress: s.refinementProgress,
      isInteracting: s.isInteracting,
    }))
  )

  // Derive visibility directly from store values
  const shouldShow = enabled && !isInteracting
  const isComplete = shouldShow && progress >= 100 && stage === 'final'
  const isRefining = shouldShow && progress > 0 && progress < 100

  // Timer state for auto-hide after completion
  const [autoHidden, setAutoHidden] = useState(false)

  // Reset autoHidden during render when leaving completion phase
  if (autoHidden && !isComplete) {
    setAutoHidden(false)
  }

  // Start auto-hide timer when entering completion phase
  useEffect(() => {
    if (!isComplete) return undefined
    const timer = setTimeout(() => setAutoHidden(true), autoHideDelay)
    return () => clearTimeout(timer)
  }, [isComplete, autoHideDelay])

  const isVisible = isRefining || (isComplete && !autoHidden)
  const fadeOut = isComplete && !autoHidden

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
