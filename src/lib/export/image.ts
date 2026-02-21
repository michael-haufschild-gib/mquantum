/**
 * Image Export Utilities
 * Exports WebGPU canvas content to PNG images using on-demand screenshot capture
 */

import { useMsgBoxStore } from '@/stores/msgBoxStore'
import { useScreenshotStore } from '@/stores/screenshotStore'
import { captureScreenshotAsync } from '@/hooks/useScreenshotCapture'

export interface ExportOptions {
  /** Filename without extension */
  filename?: string
  /** Whether to use transparent background */
  transparent?: boolean
  /** Resolution scale factor (1 = current size, 2 = 2x) */
  scale?: number
}

/**
 * Captures the current WebGPU scene and opens the preview modal.
 * Uses the on-demand screenshot capture system which works without
 * preserveDrawingBuffer being enabled.
 *
 * @param _options - Export options (filename ignored in favor of modal flow)
 * @returns True if capture was initiated (async operation)
 */
export function exportSceneToPNG(_options: ExportOptions = {}): boolean {
  // Trigger async capture
  captureScreenshotAsync()
    .then((dataUrl) => {
      // Open the modal with the captured image
      useScreenshotStore.getState().openModal(dataUrl)
    })
    .catch((error) => {
      // Handle specific error cases with helpful messages
      let errorMsg = error instanceof Error ? error.message : 'Unknown error'

      if (error instanceof DOMException && error.name === 'SecurityError') {
        errorMsg =
          'Canvas is tainted by cross-origin content (CORS). External textures or images were used without proper permissions.'
        console.error('Export failed: ' + errorMsg)
      } else {
        console.error('Export failed:', error)
      }

      useMsgBoxStore.getState().showMsgBox('Export Failed', errorMsg, 'error')
    })

  // Return true to indicate capture was initiated
  // The actual result is handled asynchronously
  return true
}

/**
 * Generates a timestamp-based filename
 *
 * @param prefix - Filename prefix
 * @returns Filename with timestamp
 */
export function generateTimestampFilename(prefix: string = 'ndimensional'): string {
  const now = new Date()
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `${prefix}-${timestamp}`
}
