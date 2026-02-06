/**
 * Renderer state management using Zustand
 *
 * Manages WebGPU renderer state and detection.
 * WebGPU is the only supported renderer.
 *
 * @module stores/rendererStore
 */

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

// ============================================================================
// Types
// ============================================================================

/** Available rendering backends */
export type RendererMode = 'webgpu'

/** WebGPU support status */
export type WebGPUSupportStatus = 'unknown' | 'checking' | 'supported' | 'unsupported'

/** Reason why WebGPU is not available */
export type WebGPUUnavailableReason =
  | 'not_in_browser' // navigator.gpu doesn't exist
  | 'no_adapter' // requestAdapter() returned null
  | 'device_lost' // Device was lost and couldn't recover
  | 'initialization_error' // Error during initialization

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

  /** Current active rendering mode (always webgpu) */
  mode: RendererMode

  /** WebGPU support detection status */
  webgpuStatus: WebGPUSupportStatus

  /** Detailed WebGPU capability info */
  webgpuCapabilities: WebGPUCapabilityInfo | null

  /** Whether auto-detection has run */
  detectionComplete: boolean

  /** Whether to show a notification when WebGPU is unavailable */
  showFallbackNotification: boolean

  // --- Actions ---

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

  /** Reset to initial state */
  reset: () => void
}

// ============================================================================
// Initial State
// ============================================================================

const initialState: Omit<
  RendererState,
  | 'setWebGPUStatus'
  | 'setWebGPUCapabilities'
  | 'completeDetection'
  | 'handleDeviceLost'
  | 'dismissFallbackNotification'
  | 'reset'
> = {
  mode: 'webgpu',
  webgpuStatus: 'unknown',
  webgpuCapabilities: null,
  detectionComplete: false,
  showFallbackNotification: false,
}

// ============================================================================
// Store
// ============================================================================

export const useRendererStore = create<RendererState>()(
  subscribeWithSelector((set) => ({
    ...initialState,

    setWebGPUStatus: (status: WebGPUSupportStatus) => {
      set({ webgpuStatus: status })
    },

    setWebGPUCapabilities: (capabilities: WebGPUCapabilityInfo) => {
      set({ webgpuCapabilities: capabilities })
    },

    completeDetection: (capabilities: WebGPUCapabilityInfo) => {
      set({
        webgpuCapabilities: capabilities,
        webgpuStatus: capabilities.supported ? 'supported' : 'unsupported',
        detectionComplete: true,
        mode: 'webgpu',
        showFallbackNotification: !capabilities.supported,
      })
    },

    handleDeviceLost: (reason: string) => {
      console.warn(`[RendererStore] WebGPU device lost: ${reason}`)

      set({
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

    reset: () => {
      set({ ...initialState })
    },
  }))
)

// ============================================================================
// Selectors
// ============================================================================

/**
 * Select current renderer mode
 * @param state
 */
export const selectRendererMode = (state: RendererState) => state.mode

/**
 * Select whether WebGPU is available
 * @param state
 */
export const selectWebGPUAvailable = (state: RendererState) =>
  state.webgpuCapabilities?.supported ?? false

/**
 * Select whether detection is complete
 * @param state
 */
export const selectDetectionComplete = (state: RendererState) => state.detectionComplete

/**
 * Select whether to show fallback notification
 * @param state
 */
export const selectShowFallbackNotification = (state: RendererState) =>
  state.showFallbackNotification

/**
 * Select WebGPU capabilities
 * @param state
 */
export const selectWebGPUCapabilities = (state: RendererState) => state.webgpuCapabilities
