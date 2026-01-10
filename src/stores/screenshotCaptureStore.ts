/**
 * Screenshot Capture Store
 *
 * Manages on-demand screenshot capture state for the application.
 * Works with ScreenshotCaptureController to capture frames using
 * a synchronous canvas copy approach, bypassing the preserveDrawingBuffer requirement.
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

export type CaptureStatus = 'idle' | 'capturing' | 'ready' | 'error'

export interface ScreenshotCaptureState {
  /** Current capture status */
  status: CaptureStatus
  /** Captured image as data URL (PNG format) */
  capturedImage: string | null
  /** Error message if capture failed */
  error: string | null

  // Actions
  /** Request a screenshot capture. Ignored if already capturing. */
  requestCapture: () => void
  /** Set the captured image result */
  setCapturedImage: (dataUrl: string) => void
  /** Set an error state */
  setError: (error: string) => void
  /** Reset to idle state */
  reset: () => void
}

export const useScreenshotCaptureStore = create<ScreenshotCaptureState>((set, get) => ({
  status: 'idle',
  capturedImage: null,
  error: null,

  requestCapture: () => {
    // Prevent concurrent capture requests - race condition guard
    if (get().status === 'capturing') {
      console.warn('[ScreenshotCaptureStore] Capture already in progress, ignoring request')
      return
    }
    set({ status: 'capturing', capturedImage: null, error: null })
  },
  setCapturedImage: (dataUrl) => set({ status: 'ready', capturedImage: dataUrl }),
  setError: (error) => set({ status: 'error', error }),
  reset: () => set({ status: 'idle', capturedImage: null, error: null }),
}))
