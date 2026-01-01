/**
 * ContextLostOverlay - User feedback overlay for WebGL context issues.
 *
 * Displays different states based on WebGL context status:
 * - Lost: Shows "GPU Connection Lost" with spinner
 * - Restoring: Shows "Reconnecting..." with attempt counter
 * - Escalated: Shows options to reduce quality or retry (after rapid failures)
 * - Failed: Shows "Unable to Recover" with reload button
 *
 * @module components/overlays/ContextLostOverlay
 */

import { Z_INDEX } from '@/constants/zIndex'
import { applySafeModeSettings } from '@/rendering/core/SafeModeSettings'
import { useWebGLContextStore, type WebGLContextState } from '@/stores/webglContextStore'
import { AnimatePresence, m } from 'motion/react'
import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Button } from '../ui/Button'
import { LoadingSpinner } from '../ui/LoadingSpinner'

/** Animation duration for overlay transitions (seconds) */
const OVERLAY_ANIMATION_DURATION = 0.2

/** Animation duration for content card (seconds) */
const CARD_ANIMATION_DURATION = 0.2

/** Delay before card animation starts (seconds) */
const CARD_ANIMATION_DELAY = 0.1

/**
 * Lost state - shown immediately when context is lost.
 * @returns The lost state UI component
 */
const LostState: React.FC = () => {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {/* Warning icon (decorative) */}
      <div className="w-16 h-16 rounded-full bg-warning-bg flex items-center justify-center" aria-hidden="true">
        <svg
          className="w-8 h-8 text-warning"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      <div>
        <h2 id="context-lost-title" className="text-xl font-semibold text-text-primary mb-2">
          GPU Connection Lost
        </h2>
        <p id="context-lost-description" className="text-sm text-text-secondary max-w-xs">
          Your graphics connection was interrupted. Attempting to reconnect...
        </p>
      </div>

      <LoadingSpinner size={24} color="var(--color-accent)" />
    </div>
  )
}

/**
 * Restoring state - shown during recovery attempts.
 * @returns The restoring state UI
 */
const RestoringState: React.FC = React.memo(() => {
  const { recoveryAttempts, maxAttempts } = useWebGLContextStore(
    useShallow((s: WebGLContextState) => ({
      recoveryAttempts: s.recoveryAttempts,
      maxAttempts: s.recoveryConfig.maxAttempts,
    }))
  )

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {/* Sync icon (decorative) */}
      <div className="w-16 h-16 rounded-full bg-accent/20 flex items-center justify-center" aria-hidden="true">
        <svg
          className="w-8 h-8 text-accent animate-spin"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </div>

      <div>
        <h2 id="context-lost-title" className="text-xl font-semibold text-text-primary mb-2">
          Reconnecting...
        </h2>
        <p id="context-lost-description" className="text-sm text-text-secondary max-w-xs">
          Restoring graphics connection. This may take a moment.
        </p>
      </div>

      {/* Progress indicator */}
      <div className="flex flex-col items-center gap-2">
        <div className="w-48 h-1 bg-surface-elevated rounded-full overflow-hidden">
          <m.div
            className="h-full bg-accent"
            initial={{ width: 0 }}
            animate={{
              width: `${(recoveryAttempts / maxAttempts) * 100}%`,
            }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <span className="text-xs text-text-secondary">
          Attempt {recoveryAttempts} of {maxAttempts}
        </span>
      </div>
    </div>
  )
})

RestoringState.displayName = 'RestoringState'

/**
 * Failed state - shown when recovery fails after max attempts.
 * @returns The failed state UI
 */
const FailedState: React.FC = React.memo(() => {
  const lastError = useWebGLContextStore((s) => s.lastError)

  const handleReload = (): void => {
    window.location.reload()
  }

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {/* Error icon (decorative) */}
      <div className="w-16 h-16 rounded-full bg-danger-bg flex items-center justify-center" aria-hidden="true">
        <svg
          className="w-8 h-8 text-danger"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </div>

      <div>
        <h2 id="context-lost-title" className="text-xl font-semibold text-text-primary mb-2">
          Unable to Recover
        </h2>
        <p id="context-lost-description" className="text-sm text-text-secondary max-w-xs mb-2">
          The GPU connection could not be restored. Your settings have been saved
          and will be restored after reloading.
        </p>
        {lastError && (
          <p className="text-xs text-text-secondary/60 font-mono">
            {lastError}
          </p>
        )}
      </div>

      <Button
        variant="primary"
        onClick={handleReload}
        className="min-w-[140px]"
      >
        Reload Page
      </Button>
    </div>
  )
})

FailedState.displayName = 'FailedState'

/**
 * Escalated state - shown when rapid failures are detected.
 * Gives user options to reduce quality or manually retry.
 * @returns The escalated state UI
 */
const EscalatedState: React.FC = React.memo(() => {
  const { retryFromEscalation, applySafeModeAndRetry } = useWebGLContextStore(
    useShallow((s: WebGLContextState) => ({
      retryFromEscalation: s.retryFromEscalation,
      applySafeModeAndRetry: s.applySafeModeAndRetry,
    }))
  )

  const handleReduceQuality = useCallback((): void => {
    // Apply safe mode settings first
    applySafeModeSettings()
    // Then trigger retry with safe mode flag
    applySafeModeAndRetry()
  }, [applySafeModeAndRetry])

  const handleManualRetry = useCallback((): void => {
    retryFromEscalation()
  }, [retryFromEscalation])

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {/* Warning icon (decorative) */}
      <div className="w-16 h-16 rounded-full bg-warning-bg flex items-center justify-center" aria-hidden="true">
        <svg
          className="w-8 h-8 text-warning"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      <div>
        <h2 id="context-lost-title" className="text-xl font-semibold text-text-primary mb-2">
          Graphics Recovery Failed
        </h2>
        <p id="context-lost-description" className="text-sm text-text-secondary max-w-xs">
          The GPU context was lost multiple times. This may be caused by memory pressure.
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 w-full">
        <Button
          variant="primary"
          onClick={handleReduceQuality}
          className="flex-1 min-w-[140px]"
        >
          Reduce Quality & Retry
        </Button>
        <Button
          variant="secondary"
          onClick={handleManualRetry}
          className="flex-1 min-w-[140px]"
        >
          Try Again
        </Button>
      </div>

      {/* Help text */}
      <p className="text-xs text-text-secondary/60 max-w-xs">
        &ldquo;Reduce Quality&rdquo; lowers resolution to 50% and disables bloom, ambient occlusion, reflections, and shadows.
      </p>
    </div>
  )
})

EscalatedState.displayName = 'EscalatedState'

/**
 * Main overlay component that shows appropriate state.
 * @returns The context lost overlay component
 */
export const ContextLostOverlay: React.FC = React.memo(() => {
  const status = useWebGLContextStore((s) => s.status)

  // Don't render anything when context is active
  if (status === 'active') {
    return null
  }

  return (
    <AnimatePresence>
      <m.div
        key="context-lost-overlay"
        className="fixed inset-0 flex items-center justify-center"
        style={{ zIndex: Z_INDEX.CONTEXT_LOST_OVERLAY }}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="context-lost-title"
        aria-describedby="context-lost-description"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: OVERLAY_ANIMATION_DURATION }}
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm" aria-hidden="true" />

        {/* Content card */}
        <m.div
          className="relative z-10 p-8 rounded-xl glass-panel max-w-sm mx-4"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: CARD_ANIMATION_DURATION, delay: CARD_ANIMATION_DELAY }}
        >
          {status === 'lost' && <LostState />}
          {status === 'restoring' && <RestoringState />}
          {status === 'escalated' && <EscalatedState />}
          {status === 'failed' && <FailedState />}
        </m.div>
      </m.div>
    </AnimatePresence>
  )
})

ContextLostOverlay.displayName = 'ContextLostOverlay'
