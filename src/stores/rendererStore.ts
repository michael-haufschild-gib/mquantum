/**
 * Renderer state management using Zustand
 *
 * Manages WebGL/WebGPU renderer selection and fallback behavior.
 * Handles automatic detection of WebGPU support and graceful fallback.
 *
 * @module stores/rendererStore
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

// ============================================================================
// Types
// ============================================================================

/** Available rendering backends */
export type RendererMode = 'webgl' | 'webgpu'

/** WebGPU support status */
export type WebGPUSupportStatus = 'unknown' | 'checking' | 'supported' | 'unsupported'

/** Reason why WebGPU is not available */
export type WebGPUUnavailableReason =
  | 'not_in_browser' // navigator.gpu doesn't exist
  | 'no_adapter' // requestAdapter() returned null
  | 'device_lost' // Device was lost and couldn't recover
  | 'initialization_error' // Error during initialization
  | 'user_disabled' // User explicitly chose WebGL

/** WebGPU capability information */
export interface WebGPUCapabilityInfo {
  /** Whether WebGPU is supported */
  supported: boolean
  /** Adapter vendor info */
  vendor?: string
  /** Adapter architecture */
  architecture?: string
  /** Adapter device description */
  device?: string
  /** Reason if not supported */
  unavailableReason?: WebGPUUnavailableReason
}

/** Renderer store state */
export interface RendererState {
  // --- State ---

  /** Current active rendering mode */
  mode: RendererMode

  /** Preferred rendering mode (user choice) */
  preferredMode: RendererMode

  /** WebGPU support detection status */
  webgpuStatus: WebGPUSupportStatus

  /** Detailed WebGPU capability info */
  webgpuCapabilities: WebGPUCapabilityInfo | null

  /** Whether auto-detection has run */
  detectionComplete: boolean

  /** Whether to show a notification when falling back to WebGL */
  showFallbackNotification: boolean

  // --- Actions ---

  /** Set the preferred renderer mode */
  setPreferredMode: (mode: RendererMode) => void

  /** Set WebGPU support status */
  setWebGPUStatus: (status: WebGPUSupportStatus) => void

  /** Set WebGPU capabilities after detection */
  setWebGPUCapabilities: (capabilities: WebGPUCapabilityInfo) => void

  /** Mark detection as complete and apply mode */
  completeDetection: (capabilities: WebGPUCapabilityInfo) => void

  /** Handle WebGPU device lost event */
  handleDeviceLost: (reason: string) => void

  /** Dismiss fallback notification */
  dismissFallbackNotification: () => void

  /** Force switch to WebGL (emergency fallback) */
  forceWebGL: (reason: WebGPUUnavailableReason) => void

  /** Reset to initial state */
  reset: () => void
}

// ============================================================================
// Constants
// ============================================================================

/** localStorage key for persisting preferred mode */
const PREFERRED_MODE_KEY = 'mdim_preferred_renderer'

/**
 * Load persisted preferred mode from localStorage.
 */
function loadPersistedMode(): RendererMode {
  try {
    const stored = localStorage.getItem(PREFERRED_MODE_KEY)
    if (stored === 'webgl' || stored === 'webgpu') {
      return stored
    }
  } catch {
    // Silent fail - localStorage may not be available
  }
  // Default to WebGPU preference (will fall back if not supported)
  return 'webgpu'
}

/**
 * Persist preferred mode to localStorage.
 */
function persistPreferredMode(mode: RendererMode): void {
  try {
    localStorage.setItem(PREFERRED_MODE_KEY, mode)
  } catch {
    // Silent fail - localStorage may not be available
  }
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: Omit<
  RendererState,
  | 'setPreferredMode'
  | 'setWebGPUStatus'
  | 'setWebGPUCapabilities'
  | 'completeDetection'
  | 'handleDeviceLost'
  | 'dismissFallbackNotification'
  | 'forceWebGL'
  | 'reset'
> = {
  mode: 'webgl', // Start with WebGL until detection completes
  preferredMode: loadPersistedMode(),
  webgpuStatus: 'unknown',
  webgpuCapabilities: null,
  detectionComplete: false,
  showFallbackNotification: false,
}

// ============================================================================
// Store
// ============================================================================

export const useRendererStore = create<RendererState>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    setPreferredMode: (mode: RendererMode) => {
      persistPreferredMode(mode)
      const state = get()

      // If WebGPU is preferred but not supported, stay on WebGL
      if (mode === 'webgpu' && state.webgpuCapabilities?.supported === false) {
        set({
          preferredMode: mode,
          mode: 'webgl',
          showFallbackNotification: true,
        })
        return
      }

      // If WebGL is preferred, switch immediately
      if (mode === 'webgl') {
        set({
          preferredMode: mode,
          mode: 'webgl',
        })
        return
      }

      // WebGPU is preferred and either supported or unknown
      set({
        preferredMode: mode,
        mode: state.webgpuCapabilities?.supported ? 'webgpu' : state.mode,
      })
    },

    setWebGPUStatus: (status: WebGPUSupportStatus) => {
      set({ webgpuStatus: status })
    },

    setWebGPUCapabilities: (capabilities: WebGPUCapabilityInfo) => {
      set({ webgpuCapabilities: capabilities })
    },

    completeDetection: (capabilities: WebGPUCapabilityInfo) => {
      const state = get()

      // Determine active mode based on preference and support
      let activeMode: RendererMode = 'webgl'
      let showNotification = false

      if (state.preferredMode === 'webgpu') {
        if (capabilities.supported) {
          activeMode = 'webgpu'
        } else {
          // User wanted WebGPU but it's not available
          activeMode = 'webgl'
          showNotification = true
        }
      } else {
        // User prefers WebGL
        activeMode = 'webgl'
      }

      set({
        webgpuCapabilities: capabilities,
        webgpuStatus: capabilities.supported ? 'supported' : 'unsupported',
        detectionComplete: true,
        mode: activeMode,
        showFallbackNotification: showNotification,
      })
    },

    handleDeviceLost: (reason: string) => {
      console.warn(`[RendererStore] WebGPU device lost: ${reason}`)

      set({
        mode: 'webgl',
        webgpuStatus: 'unsupported',
        webgpuCapabilities: {
          supported: false,
          unavailableReason: 'device_lost',
        },
        showFallbackNotification: true,
      })
    },

    dismissFallbackNotification: () => {
      set({ showFallbackNotification: false })
    },

    forceWebGL: (reason: WebGPUUnavailableReason) => {
      set({
        mode: 'webgl',
        webgpuStatus: 'unsupported',
        webgpuCapabilities: {
          supported: false,
          unavailableReason: reason,
        },
        showFallbackNotification: reason !== 'user_disabled',
      })
    },

    reset: () => {
      set({
        ...initialState,
        preferredMode: loadPersistedMode(),
      })
    },
  }))
)

// ============================================================================
// Selectors
// ============================================================================

/** Select current renderer mode */
export const selectRendererMode = (state: RendererState) => state.mode

/** Select whether WebGPU is available */
export const selectWebGPUAvailable = (state: RendererState) =>
  state.webgpuCapabilities?.supported ?? false

/** Select whether detection is complete */
export const selectDetectionComplete = (state: RendererState) => state.detectionComplete

/** Select whether to show fallback notification */
export const selectShowFallbackNotification = (state: RendererState) =>
  state.showFallbackNotification

/** Select WebGPU capabilities */
export const selectWebGPUCapabilities = (state: RendererState) => state.webgpuCapabilities
