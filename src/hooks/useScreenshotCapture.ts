/**
 * useScreenshotCapture Hook
 *
 * Provides a promise-based interface for capturing screenshots.
 * Works with the WebGPU canvas capture bridge to capture frames on demand.
 *
 * Can be used from outside R3F context (e.g., in menu handlers).
 *
 * @remarks
 * - Uses store subscription for efficient status change detection
 * - Automatically cleans up subscriptions on completion or timeout
 * - Prevents concurrent capture requests via store-level guard
 */

import { useScreenshotCaptureStore, type CaptureStatus } from '@/stores/screenshotCaptureStore'
import { useShallow } from 'zustand/react/shallow'
import { useCallback } from 'react'

const CAPTURE_TIMEOUT_MS = 5000

export interface UseScreenshotCaptureResult {
  /** Request a screenshot and wait for the result */
  captureScreenshot: () => Promise<string>
  /** Current capture status */
  status: CaptureStatus
  /** Last captured image data URL */
  capturedImage: string | null
  /** Error message if capture failed */
  error: string | null
}

/**
 * Captures a screenshot asynchronously using store subscription.
 * Uses subscription-based notification instead of RAF polling for efficiency.
 *
 * @returns Promise that resolves with the captured image data URL
 * @throws Error if capture times out or fails
 */
async function captureWithSubscription(): Promise<string> {
  const store = useScreenshotCaptureStore.getState()
  const requestId = store.status === 'capturing' ? store.requestId : store.requestCapture()

  // If already capturing, wait for current capture to complete
  if (store.status === 'capturing') {
    // Fall through to subscription below
  }

  return new Promise((resolve, reject) => {
    let resolved = false
    let unsubscribe: (() => void) | null = null

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true
        useScreenshotCaptureStore.getState().setError('Screenshot capture timeout', requestId)
        unsubscribe?.()
        reject(new Error('Screenshot capture timeout'))
      }
    }, CAPTURE_TIMEOUT_MS)

    // Cleanup helper
    const cleanup = () => {
      clearTimeout(timeoutId)
      unsubscribe?.()
    }

    // Subscribe to store changes for instant notification
    unsubscribe = useScreenshotCaptureStore.subscribe((state) => {
      if (resolved) return

      if (state.status === 'ready' && state.capturedImage) {
        resolved = true
        cleanup()
        resolve(state.capturedImage)
      } else if (state.status === 'error') {
        resolved = true
        cleanup()
        reject(new Error(state.error || 'Screenshot capture failed'))
      }
    })

    // Check if already complete (in case state changed before subscription)
    const currentState = useScreenshotCaptureStore.getState()
    if (currentState.status === 'ready' && currentState.capturedImage) {
      resolved = true
      cleanup()
      resolve(currentState.capturedImage)
    } else if (currentState.status === 'error') {
      resolved = true
      cleanup()
      reject(new Error(currentState.error || 'Screenshot capture failed'))
    }
  })
}

/**
 * Hook for capturing screenshots from outside R3F context.
 * Returns a promise-based captureScreenshot function.
 *
 * @returns Object with captureScreenshot function and current status
 *
 * @example
 * ```tsx
 * const { captureScreenshot } = useScreenshotCapture()
 *
 * const handleExport = async () => {
 *   try {
 *     const dataUrl = await captureScreenshot()
 *     // Use dataUrl...
 *   } catch (error) {
 *     console.error('Capture failed:', error)
 *   }
 * }
 * ```
 */
export function useScreenshotCapture(): UseScreenshotCaptureResult {
  const { status, capturedImage, error } = useScreenshotCaptureStore(
    useShallow((s) => ({ status: s.status, capturedImage: s.capturedImage, error: s.error }))
  )

  const captureScreenshot = useCallback(async (): Promise<string> => {
    return captureWithSubscription()
  }, [])

  return { captureScreenshot, status, capturedImage, error }
}

/**
 * Non-hook version for use in non-React contexts.
 * Can be called directly from event handlers or utility functions.
 *
 * @returns Promise that resolves with the captured image data URL
 * @throws Error if capture times out or fails
 *
 * @example
 * ```ts
 * try {
 *   const dataUrl = await captureScreenshotAsync()
 *   console.log('Captured:', dataUrl.substring(0, 50))
 * } catch (error) {
 *   console.error('Capture failed:', error)
 * }
 * ```
 */
export async function captureScreenshotAsync(): Promise<string> {
  return captureWithSubscription()
}
