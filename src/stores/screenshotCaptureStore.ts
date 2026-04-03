/**
 * Screenshot Capture Store
 *
 * Manages on-demand screenshot capture state for the application.
 * Works with WebGPU canvas readback integration to capture frames on demand.
 *
 * State Machine:
 * - idle: No capture in progress
 * - capturing: Capture requested, waiting for controller to process
 * - ready: Capture complete, image available
 * - error: Capture failed
 *
 * @example
 * ```tsx
 * // Request a capture
 * useScreenshotCaptureStore.getState().requestCapture()
 *
 * // Check result
 * const { status, capturedImage } = useScreenshotCaptureStore.getState()
 * ```
 */

import { create } from 'zustand'

import { logger } from '@/lib/logger'

/** Screenshot capture lifecycle status. */
export type CaptureStatus = 'idle' | 'capturing' | 'ready' | 'error'

/** State for the screenshot capture pipeline. */
export interface ScreenshotCaptureState {
  /** Current capture status */
  status: CaptureStatus
  /** Captured image as data URL (PNG format) */
  capturedImage: string | null
  /** Error message if capture failed */
  error: string | null
  /** Monotonic request identifier used to ignore stale async completions */
  requestId: number

  // Actions
  /** Request a screenshot capture. Returns active request ID. */
  requestCapture: () => number
  /** Set the captured image result. Requires the request ID to reject stale completions. */
  setCapturedImage: (dataUrl: string, requestId: number) => void
  /** Set an error state. Requires the request ID to reject stale completions. */
  setError: (error: string, requestId: number) => void
  /** Reset to idle state */
  reset: () => void
}

export const useScreenshotCaptureStore = create<ScreenshotCaptureState>((set, get) => ({
  status: 'idle',
  capturedImage: null,
  error: null,
  requestId: 0,

  requestCapture: () => {
    // Prevent concurrent capture requests - race condition guard
    if (get().status === 'capturing') {
      logger.warn('[ScreenshotCaptureStore] Capture already in progress, ignoring request')
      return get().requestId
    }
    const nextRequestId = get().requestId + 1
    set({ status: 'capturing', capturedImage: null, error: null, requestId: nextRequestId })
    return nextRequestId
  },
  setCapturedImage: (dataUrl, requestId) =>
    set((state) => {
      if (requestId !== state.requestId || state.status !== 'capturing') return state
      return { status: 'ready', capturedImage: dataUrl, error: null }
    }),
  setError: (error, requestId) =>
    set((state) => {
      if (requestId !== state.requestId || state.status !== 'capturing') return state
      return { status: 'error', error, capturedImage: null }
    }),
  reset: () =>
    set((state) => ({
      status: 'idle',
      capturedImage: null,
      error: null,
      // Invalidate any in-flight async completion tied to the previous request ID.
      requestId: state.requestId + 1,
    })),
}))
