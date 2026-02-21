/**
 * UI slice for visual store
 *
 * Manages UI-related and miscellaneous visual settings:
 * - Axis helper visibility
 * - Performance monitor visibility
 * - Animation bias
 */

import type { StateCreator } from 'zustand'
import {
  DEFAULT_ANIMATION_BIAS,
  DEFAULT_SHOW_AXIS_HELPER,
  DEFAULT_SHOW_DEPTH_BUFFER,
  DEFAULT_SHOW_NORMAL_BUFFER,
  DEFAULT_SHOW_PERF_MONITOR,
  DEFAULT_SHOW_TEMPORAL_DEPTH_BUFFER,
} from '../defaults/visualDefaults'

// ============================================================================
// Types
// ============================================================================

/** Active tab in the performance monitor */
export type PerfMonitorTab = 'perf' | 'sys' | 'shader' | 'buffers'

// ============================================================================
// State Interface
// ============================================================================

/**
 * UI slice state fields.
 */
export interface UISliceState {
  // --- UI Helpers ---
  showAxisHelper: boolean
  showPerfMonitor: boolean
  /** Whether the performance monitor is expanded (vs collapsed) */
  perfMonitorExpanded: boolean
  /** Active tab in the performance monitor */
  perfMonitorTab: PerfMonitorTab
  showDepthBuffer: boolean
  showNormalBuffer: boolean
  showTemporalDepthBuffer: boolean

  // --- Animation ---
  animationBias: number
}

/**
 * UI slice actions.
 */
export interface UISliceActions {
  // --- UI Helper Actions ---
  setShowAxisHelper: (show: boolean) => void
  setShowPerfMonitor: (show: boolean) => void
  setPerfMonitorExpanded: (expanded: boolean) => void
  setPerfMonitorTab: (tab: PerfMonitorTab) => void
  setShowDepthBuffer: (show: boolean) => void
  setShowNormalBuffer: (show: boolean) => void
  setShowTemporalDepthBuffer: (show: boolean) => void

  // --- Animation Actions ---
  setAnimationBias: (bias: number) => void
}

/**
 * Combined UI slice type.
 */
export type UISlice = UISliceState & UISliceActions

// ============================================================================
// Initial State
// ============================================================================

export const UI_INITIAL_STATE: UISliceState = {
  // UI helpers
  showAxisHelper: DEFAULT_SHOW_AXIS_HELPER,
  showPerfMonitor: DEFAULT_SHOW_PERF_MONITOR,
  perfMonitorExpanded: false,
  perfMonitorTab: 'perf',
  showDepthBuffer: DEFAULT_SHOW_DEPTH_BUFFER,
  showNormalBuffer: DEFAULT_SHOW_NORMAL_BUFFER,
  showTemporalDepthBuffer: DEFAULT_SHOW_TEMPORAL_DEPTH_BUFFER,

  // Animation
  animationBias: DEFAULT_ANIMATION_BIAS,
}

// ============================================================================
// Slice Creator
// ============================================================================

export const createUISlice: StateCreator<UISlice, [], [], UISlice> = (set) => ({
  ...UI_INITIAL_STATE,

  // --- UI Helper Actions ---
  setShowAxisHelper: (show: boolean) => {
    set({ showAxisHelper: show })
  },

  setShowPerfMonitor: (show: boolean) => {
    set({ showPerfMonitor: show })
  },

  setPerfMonitorExpanded: (expanded: boolean) => {
    set({ perfMonitorExpanded: expanded })
  },

  setPerfMonitorTab: (tab: PerfMonitorTab) => {
    set({ perfMonitorTab: tab })
  },

  // Buffer visualizations are mutually exclusive - enabling one disables the others
  setShowDepthBuffer: (show: boolean) => {
    set({
      showDepthBuffer: show,
      ...(show && { showNormalBuffer: false, showTemporalDepthBuffer: false }),
    })
  },

  setShowNormalBuffer: (show: boolean) => {
    set({
      showNormalBuffer: show,
      ...(show && { showDepthBuffer: false, showTemporalDepthBuffer: false }),
    })
  },

  setShowTemporalDepthBuffer: (show: boolean) => {
    set({
      showTemporalDepthBuffer: show,
      ...(show && { showDepthBuffer: false, showNormalBuffer: false }),
    })
  },

  // --- Animation Actions ---
  setAnimationBias: (bias: number) => {
    if (!Number.isFinite(bias)) {
      if (import.meta.env.DEV) {
        console.warn('[uiSlice] Ignoring non-finite animation bias:', bias)
      }
      return
    }
    set({ animationBias: Math.max(0, Math.min(1, bias)) })
  },
})
