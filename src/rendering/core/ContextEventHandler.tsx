/**
 * ContextEventHandler - WebGL context loss/restoration event handler.
 *
 * This component lives INSIDE the R3F Canvas and listens for WebGL context
 * events on the canvas element. It coordinates with the WebGLContextStore
 * and ResourceRecovery system to handle context loss gracefully.
 *
 * IMPORTANT: Must be placed as a child of <Canvas>, not outside it.
 *
 * For simulated context loss (debug), we must manually call restoreContext()
 * since browsers only auto-restore real GPU crashes. The normal recovery flow
 * handles this transparently.
 *
 * @module rendering/core/ContextEventHandler
 */

import { useWebGLContextStore } from '@/stores/webglContextStore'
import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import { resourceRecovery } from './ResourceRecovery'

/** WEBGL_lose_context extension interface */
interface WEBGL_lose_context {
  loseContext(): void
  restoreContext(): void
}

/**
 * Handles WebGL context loss and restoration events.
 * Returns null as it's a logic-only component with no visual output.
 * @returns null - no visual output
 */
export function ContextEventHandler(): null {
  const { gl } = useThree()
  const recoveryTimeoutRef = useRef<number | null>(null)
  const loseContextExtRef = useRef<WEBGL_lose_context | null>(null)

  // Subscribe to store state
  const debugContextLossCounter = useWebGLContextStore((s) => s.debugContextLossCounter)
  const status = useWebGLContextStore((s) => s.status)
  const prevStatusRef = useRef<string>(status)

  /**
   * Get or cache the WEBGL_lose_context extension.
   * Used for both debug context loss and manual restoration.
   */
  const getExtension = useCallback((): WEBGL_lose_context | null => {
    if (!loseContextExtRef.current) {
      loseContextExtRef.current = gl
        .getContext()
        .getExtension('WEBGL_lose_context') as WEBGL_lose_context | null
    }
    return loseContextExtRef.current
  }, [gl])

  /**
   * Attempt to restore context.
   * For simulated losses, we must call restoreContext() manually.
   * For real GPU crashes, the browser handles restoration.
   */
  const attemptRestore = useCallback(() => {
    const ext = getExtension()
    if (ext) {
      console.warn('[ContextEventHandler] Attempting context restoration')
      ext.restoreContext()
    }
  }, [getExtension])

  // Debug: Force context loss for testing (only in development)
  const forceContextLoss = useCallback(() => {
    const ext = getExtension()
    if (ext) {
      console.warn('[ContextEventHandler] Forcing context loss for debugging')
      ext.loseContext()
      // No special handling - let the normal flow handle everything
    } else {
      console.warn('[ContextEventHandler] WEBGL_lose_context extension not available')
    }
  }, [getExtension])

  // Trigger context loss when debugContextLossCounter changes
  useEffect(() => {
    if (debugContextLossCounter > 0) {
      forceContextLoss()
    }
  }, [debugContextLossCounter, forceContextLoss])

  // Watch for status transitions that require manual restore trigger
  // When user clicks buttons in escalated state, status goes from 'escalated' to 'lost'
  useEffect(() => {
    const prevStatus = prevStatusRef.current
    prevStatusRef.current = status

    // User clicked "Try Again" or "Reduce Quality & Retry" from escalated state
    if (prevStatus === 'escalated' && status === 'lost') {
      console.warn('[ContextEventHandler] User requested retry from escalated state')
      // Small delay to let state settle, then trigger restore
      const timeoutId = window.setTimeout(() => {
        attemptRestore()
      }, 100)
      return () => {
        window.clearTimeout(timeoutId)
      }
    }
    return undefined
  }, [status, attemptRestore])

  useEffect(() => {
    const canvas = gl.domElement
    const store = useWebGLContextStore.getState

    /**
     * Handle context lost event.
     * CRITICAL: event.preventDefault() allows the browser to attempt restoration.
     */
    const handleContextLost = (event: Event): void => {
      const contextEvent = event as WebGLContextEvent
      contextEvent.preventDefault() // CRITICAL: allows browser to restore context

      // Clear any pending recovery timeout
      if (recoveryTimeoutRef.current !== null) {
        window.clearTimeout(recoveryTimeoutRef.current)
        recoveryTimeoutRef.current = null
      }

      store().onContextLost()

      // Check for rapid failure - escalate to user prompt instead of auto-retry
      if (store().isRapidFailure()) {
        console.warn('[ContextEventHandler] Rapid failure detected, escalating to user prompt')
        store().escalateToUserPrompt()
        return // Don't set up auto-recovery, wait for user action
      }

      // Set up recovery timeout with exponential backoff
      const timeout = store().getCurrentTimeout()
      recoveryTimeoutRef.current = window.setTimeout(() => {
        const state = store()
        if (state.status === 'lost' || state.status === 'restoring') {
          // Check if we've exceeded max attempts
          if (state.recoveryAttempts >= state.recoveryConfig.maxAttempts) {
            store().onContextFailed('Maximum recovery attempts exceeded')
          } else {
            // Try to restore (needed for simulated context loss)
            const ext = loseContextExtRef.current
            if (ext) {
              console.warn('[ContextEventHandler] Recovery timeout - attempting restore')
              ext.restoreContext()
            }
          }
        }
      }, timeout)
    }

    /**
     * Handle context restored event.
     * Triggers resource reinitialization in priority order.
     */
    const handleContextRestored = async (): Promise<void> => {
      // Clear recovery timeout
      if (recoveryTimeoutRef.current !== null) {
        window.clearTimeout(recoveryTimeoutRef.current)
        recoveryTimeoutRef.current = null
      }

      const store = useWebGLContextStore.getState()
      store.onContextRestoring()

      try {
        // Trigger resource recovery in priority order
        await resourceRecovery.recover(gl)
        useWebGLContextStore.getState().onContextRestored()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown recovery error'
        useWebGLContextStore.getState().onContextFailed(message)
      }
    }

    /**
     * iOS Safari specific: Handle page show event for bfcache.
     * When page is restored from bfcache, context may be lost.
     */
    const handlePageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) {
        // Page was restored from bfcache
        const context = gl.getContext()
        if (context && context.isContextLost()) {
          store().onContextLost()
        }
      }
    }

    // Add event listeners
    canvas.addEventListener('webglcontextlost', handleContextLost)
    canvas.addEventListener('webglcontextrestored', handleContextRestored)
    window.addEventListener('pageshow', handlePageShow)

    // Cleanup
    return () => {
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      window.removeEventListener('pageshow', handlePageShow)

      if (recoveryTimeoutRef.current !== null) {
        window.clearTimeout(recoveryTimeoutRef.current)
      }
    }
  }, [gl])

  return null
}
