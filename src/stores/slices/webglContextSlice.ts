/**
 * WebGL Context slice for managing WebGL context lifecycle.
 *
 * Handles context loss/restoration events, page visibility,
 * and coordinates resource recovery for the rendering pipeline.
 */

import type { StateCreator } from 'zustand'

// ============================================================================
// Types
// ============================================================================

/** WebGL context status states */
export type WebGLContextStatus = 'active' | 'lost' | 'restoring' | 'escalated' | 'failed'

/** Recovery configuration with exponential backoff */
export interface RecoveryConfig {
  initialTimeout: number
  maxTimeout: number
  backoffMultiplier: number
  maxAttempts: number
  rapidFailureWindow: number
  rapidFailureThreshold: number
}

// ============================================================================
// Constants
// ============================================================================

/** Default recovery configuration */
export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  initialTimeout: 3000, // First attempt: 3s
  maxTimeout: 30000, // Max wait: 30s
  backoffMultiplier: 2, // Double each time
  maxAttempts: 5, // Total before giving up
  rapidFailureWindow: 10000, // Detect rapid failures in 10s window
  rapidFailureThreshold: 3, // 3 failures in window = back off more
}

/** localStorage key for state persistence before reload */
export const RECOVERY_STATE_KEY = 'mdim_recovery_state'

/** Max age for recovered state (5 minutes) */
export const RECOVERY_STATE_MAX_AGE = 5 * 60 * 1000

// ============================================================================
// State Interface
// ============================================================================

export interface WebGLContextSliceState {
  /** Current context status */
  status: WebGLContextStatus

  /** Timestamp when context was lost */
  lostAt: number | null

  /** Timestamp when context was restored */
  restoredAt: number | null

  /** Counter incremented on each restore (used to trigger useMemo recreation) */
  restoreCount: number

  /** Total times context has been lost */
  lostCount: number

  /** History of loss timestamps for rapid failure detection */
  lossHistory: number[]

  /** Last error message */
  lastError: string | null

  /** Whether the page is currently visible */
  isPageVisible: boolean

  /** Current recovery attempt number */
  recoveryAttempts: number

  /** Current timeout being used (increases with backoff) */
  currentTimeout: number

  /** Recovery configuration */
  recoveryConfig: RecoveryConfig

  /** Debug: Counter for triggering context loss from UI (incremented to signal) */
  debugContextLossCounter: number

  /** Whether recovery has escalated to user prompt (after repeated failures) */
  escalated: boolean

  /** Whether safe mode is active (reduced quality settings applied) */
  safeMode: boolean
}

export interface WebGLContextSliceActions {
  /** Called when WebGL context is lost */
  onContextLost: () => void

  /** Called when context restoration begins */
  onContextRestoring: () => void

  /** Called when context is successfully restored */
  onContextRestored: () => void

  /** Called when recovery fails after max attempts */
  onContextFailed: (error: string) => void

  /** Called when page visibility changes */
  onVisibilityChange: (visible: boolean) => void

  /** Reset to initial state */
  reset: () => void

  /** Get current timeout with exponential backoff */
  getCurrentTimeout: () => number

  /** Check if in rapid failure mode */
  isRapidFailure: () => boolean

  /** Debug: Trigger context loss (only works in development) */
  debugTriggerContextLoss: () => void

  /** Escalate to user prompt after repeated failures */
  escalateToUserPrompt: () => void

  /** User chose to retry from escalated state */
  retryFromEscalation: () => void

  /** User chose to apply safe mode and retry */
  applySafeModeAndRetry: () => void
}

export type WebGLContextSlice = WebGLContextSliceState & WebGLContextSliceActions

// ============================================================================
// Initial State
// ============================================================================

export const WEBGL_CONTEXT_INITIAL_STATE: WebGLContextSliceState = {
  status: 'active',
  lostAt: null,
  restoredAt: null,
  restoreCount: 0,
  lostCount: 0,
  lossHistory: [],
  lastError: null,
  isPageVisible: true,
  recoveryAttempts: 0,
  currentTimeout: DEFAULT_RECOVERY_CONFIG.initialTimeout,
  recoveryConfig: { ...DEFAULT_RECOVERY_CONFIG },
  debugContextLossCounter: 0,
  escalated: false,
  safeMode: false,
}

// ============================================================================
// State Persistence Helpers
// ============================================================================

/**
 * Saves critical state to localStorage before page reload.
 * Called when context recovery fails and user needs to reload.
 *
 * Note: This is a simplified version that saves minimal state.
 * Store imports are avoided to prevent circular dependencies.
 * The actual saving is triggered by App.tsx when context fails.
 */
function saveStateForRecovery(): void {
  try {
    // Save minimal state - just a marker that recovery is needed
    // Full state restoration is handled by App.tsx which has access to stores
    const stateToSave = {
      savedAt: Date.now(),
    }
    localStorage.setItem(RECOVERY_STATE_KEY, JSON.stringify(stateToSave))
  } catch {
    // Silent fail - state persistence is best-effort
  }
}

// ============================================================================
// Slice Creator
// ============================================================================

export const createWebGLContextSlice: StateCreator<
  WebGLContextSlice,
  [],
  [],
  WebGLContextSlice
> = (set, get) => ({
  ...WEBGL_CONTEXT_INITIAL_STATE,

  onContextLost: () => {
    const now = Date.now()
    const state = get()

    // Update loss history for rapid failure detection
    // Use spread instead of push for immutability
    const recentLosses = state.lossHistory.filter(
      (t) => now - t < state.recoveryConfig.rapidFailureWindow
    )

    set({
      status: 'lost',
      lostAt: now,
      lostCount: state.lostCount + 1,
      lossHistory: [...recentLosses, now],
      lastError: null,
    })
  },

  onContextRestoring: () => {
    const state = get()
    set({
      status: 'restoring',
      recoveryAttempts: state.recoveryAttempts + 1,
    })
  },

  onContextRestored: () => {
    const now = Date.now()
    set({
      status: 'active',
      restoredAt: now,
      restoreCount: get().restoreCount + 1,
      recoveryAttempts: 0,
      currentTimeout: DEFAULT_RECOVERY_CONFIG.initialTimeout,
      lastError: null,
    })
  },

  onContextFailed: (error: string) => {
    // Save state before showing reload button
    saveStateForRecovery()

    set({
      status: 'failed',
      lastError: error,
    })
  },

  onVisibilityChange: (visible: boolean) => {
    set({ isPageVisible: visible })
  },

  reset: () => {
    set({
      ...WEBGL_CONTEXT_INITIAL_STATE,
      // Preserve safeMode flag across resets if it was set
      safeMode: get().safeMode,
    })
  },

  getCurrentTimeout: () => {
    const state = get()
    const { recoveryConfig, recoveryAttempts } = state

    // Calculate timeout with exponential backoff
    const timeout = Math.min(
      recoveryConfig.initialTimeout *
        Math.pow(recoveryConfig.backoffMultiplier, recoveryAttempts),
      recoveryConfig.maxTimeout
    )

    // If in rapid failure mode, increase timeout further
    if (get().isRapidFailure()) {
      return Math.min(timeout * 2, recoveryConfig.maxTimeout)
    }

    return timeout
  },

  isRapidFailure: () => {
    const state = get()
    const now = Date.now()
    const recentLosses = state.lossHistory.filter(
      (t) => now - t < state.recoveryConfig.rapidFailureWindow
    )
    return recentLosses.length >= state.recoveryConfig.rapidFailureThreshold
  },

  debugTriggerContextLoss: () => {
    // Only in development mode
    if (import.meta.env.MODE !== 'production') {
      set((state) => ({ debugContextLossCounter: state.debugContextLossCounter + 1 }))
    }
  },

  escalateToUserPrompt: () => {
    set({
      status: 'escalated',
      escalated: true,
    })
  },

  retryFromEscalation: () => {
    // User clicked "Try Again" - go back to lost state to trigger retry
    set({
      status: 'lost',
      escalated: false,
      // Reset recovery attempts to give one more chance
      recoveryAttempts: 0,
    })
  },

  applySafeModeAndRetry: () => {
    // User clicked "Reduce Quality & Retry"
    // Note: The actual settings are applied by the overlay component
    // which calls applySafeModeSettings() before triggering this action
    set({
      status: 'lost',
      escalated: false,
      safeMode: true,
      // Reset recovery attempts for fresh start with reduced settings
      recoveryAttempts: 0,
    })
  },
})
