/**
 * Geometry Loading Indicator
 *
 * Displays progress information during geometry generation in the Web Worker.
 * Shows stage label and progress bar for long-running operations.
 */

import React from 'react'
import { m, AnimatePresence } from 'motion/react'
import type { GenerationStage } from '@/workers/types'
import { LoadingSpinner } from './LoadingSpinner'

/**
 * Human-readable labels for generation stages
 */
const STAGE_LABELS: Record<GenerationStage, string> = {
  initializing: 'Initializing',
  vertices: 'Generating vertices',
  edges: 'Computing edges',
  faces: 'Detecting faces',
  complete: 'Complete',
}

interface GeometryLoadingIndicatorProps {
  /** Whether loading is in progress */
  isLoading: boolean
  /** Current progress percentage (0-100) */
  progress: number
  /** Current generation stage */
  stage: GenerationStage
  /** Optional additional class name */
  className?: string
}

/**
 * Geometry loading indicator with progress bar and stage label.
 *
 * Positioned in the top-right corner of its container by default.
 * Use className to override positioning.
 *
 * @param root0 - Component props
 * @param root0.isLoading - Whether loading is in progress
 * @param root0.progress - Loading progress (0-100)
 * @param root0.stage - Current generation stage
 * @param root0.className - Optional additional class name
 * @returns React element showing loading indicator or null
 * @example
 * ```tsx
 * <GeometryLoadingIndicator
 *   isLoading={isLoading}
 *   progress={progress}
 *   stage={stage}
 * />
 * ```
 */
export const GeometryLoadingIndicator: React.FC<GeometryLoadingIndicatorProps> = ({
  isLoading,
  progress,
  stage,
  className = '',
}) => {
  // Don't render if not loading
  if (!isLoading) return null

  const stageLabel = STAGE_LABELS[stage] || 'Processing'

  return (
    <AnimatePresence>
      {isLoading && (
        <m.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className={`
            absolute top-4 right-4 z-50
            bg-surface/90 backdrop-blur-sm
            border border-border/50 rounded-lg
            shadow-lg shadow-black/20
            p-3 min-w-[160px]
            ${className}
          `}
          role="status"
          aria-live="polite"
          aria-label={`${stageLabel}: ${progress}%`}
        >
          {/* Header with spinner and stage label */}
          <div className="flex items-center gap-2 mb-2">
            <LoadingSpinner size={14} className="text-accent" />
            <span className="text-xs text-muted font-medium">{stageLabel}</span>
          </div>

          {/* Progress bar track */}
          <div className="h-1 bg-surface-muted rounded-full overflow-hidden">
            {/* Progress bar fill */}
            <m.div
              className="h-full bg-accent rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{
                type: 'spring',
                stiffness: 100,
                damping: 20,
              }}
            />
          </div>

          {/* Progress percentage */}
          <div className="mt-1 text-right">
            <span className="text-[10px] text-muted/70 font-mono">{Math.round(progress)}%</span>
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Compact version for inline use
 * @param root0 - Component props
 * @param root0.isLoading - Whether loading is in progress
 * @param root0.stage - Current generation stage
 * @returns React element showing inline loading indicator
 */
export const GeometryLoadingInline: React.FC<{
  isLoading: boolean
  stage?: GenerationStage
}> = ({ isLoading, stage = 'initializing' }) => {
  if (!isLoading) return null

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <LoadingSpinner size={12} />
      <span>{STAGE_LABELS[stage]}</span>
    </span>
  )
}
