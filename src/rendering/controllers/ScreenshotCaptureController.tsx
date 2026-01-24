/**
 * Screenshot Capture Controller
 *
 * Headless R3F component that captures screenshots on demand.
 * Uses a synchronous canvas copy approach immediately after render
 * to capture the post-processed output without requiring preserveDrawingBuffer.
 *
 * When preserveDrawingBuffer is false, the WebGL buffer is cleared after
 * browser compositing. However, if we copy the canvas immediately after
 * render (before compositing), we can capture the frame.
 *
 * @returns null - This is a headless controller component
 *
 * @remarks
 * - Must be placed inside the R3F Canvas component
 * - Uses useFrame with priority 999 to run after all other frame callbacks
 * - Creates a persistent 2D canvas for efficient repeated captures
 */

import { useScreenshotCaptureStore } from '@/stores/screenshotCaptureStore'
import { useThree, useFrame } from '@react-three/fiber'
import { useEffect, useRef, useCallback } from 'react'

export function ScreenshotCaptureController() {
  const { gl, advance } = useThree()

  const pendingCaptureRef = useRef(false)
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const captureCtxRef = useRef<CanvasRenderingContext2D | null>(null)

  // Create capture canvas once
  useEffect(() => {
    captureCanvasRef.current = document.createElement('canvas')
    captureCtxRef.current = captureCanvasRef.current.getContext('2d', {
      willReadFrequently: false,
      alpha: false,
    })

    return () => {
      captureCanvasRef.current = null
      captureCtxRef.current = null
    }
  }, [])

  // Perform the actual capture
  const doCapture = useCallback(() => {
    const sourceCanvas = gl.domElement
    const captureCanvas = captureCanvasRef.current
    const ctx = captureCtxRef.current

    // Get store actions directly to avoid subscription overhead
    const { setCapturedImage, setError } = useScreenshotCaptureStore.getState()

    if (!sourceCanvas || !captureCanvas || !ctx) {
      setError('Capture canvas not initialized')
      return
    }

    try {
      // Resize capture canvas to match source
      const width = sourceCanvas.width
      const height = sourceCanvas.height

      if (captureCanvas.width !== width || captureCanvas.height !== height) {
        captureCanvas.width = width
        captureCanvas.height = height
      }

      // Force a synchronous render
      // The advance() call renders the scene including all post-processing
      const now = performance.now()
      advance(now)

      // Immediately copy to 2D canvas before browser compositing clears the buffer
      // This works because drawImage() is synchronous in the same JS task
      ctx.drawImage(sourceCanvas, 0, 0)

      // Convert to data URL (this is safe on our 2D canvas)
      const dataUrl = captureCanvas.toDataURL('image/png')

      setCapturedImage(dataUrl)
    } catch (error) {
      console.error('[ScreenshotCaptureController] Capture failed:', error)
      setError(error instanceof Error ? error.message : 'Screenshot capture failed')
    }
  }, [gl.domElement, advance])

  // Subscribe to store changes for capture requests
  // Using subscription instead of useEffect on status avoids component re-renders
  useEffect(() => {
    const unsubscribe = useScreenshotCaptureStore.subscribe((state, prevState) => {
      // Only trigger when transitioning TO 'capturing' status
      if (state.status === 'capturing' && prevState.status !== 'capturing') {
        pendingCaptureRef.current = true
      }
    })

    return unsubscribe
  }, [])

  // Process capture request on next frame
  // Using useFrame ensures we're in sync with the R3F render loop
  useFrame(() => {
    if (!pendingCaptureRef.current) return
    pendingCaptureRef.current = false
    doCapture()
  }, 999) // High priority number = runs last, after all other useFrame hooks

  return null
}
