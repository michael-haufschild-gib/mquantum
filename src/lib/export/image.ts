/**
 * Image Export Utilities
 * Exports Three.js canvas to PNG images using on-demand screenshot capture
 */

import { useMsgBoxStore } from '@/stores/msgBoxStore';
import { useScreenshotStore } from '@/stores/screenshotStore';
import { captureScreenshotAsync } from '@/hooks/useScreenshotCapture';

export interface ExportOptions {
  /** Filename without extension */
  filename?: string;
  /** Whether to use transparent background */
  transparent?: boolean;
  /** Resolution scale factor (1 = current size, 2 = 2x) */
  scale?: number;
}

const DEFAULT_OPTIONS: Required<ExportOptions> = {
  filename: 'ndimensional-export',
  transparent: false,
  scale: 1,
};

/**
 * Exports a canvas element to a PNG file and triggers download
 *
 * @param canvas - The canvas element to export
 * @param options - Export options
 * @throws {Error} If document.body is not available (SSR/non-browser context)
 */
export function exportCanvasToPNG(
  canvas: HTMLCanvasElement,
  options: ExportOptions = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (opts.scale !== 1 || opts.transparent) {
    console.warn('Export options "scale" and "transparent" are not currently supported in this implementation.');
  }

  // Validate we're in a browser context with document.body
  if (typeof document === 'undefined' || !document.body) {
    throw new Error('Export requires browser context with document.body');
  }

  // Get the data URL from canvas (can throw if canvas is tainted)
  const dataUrl = canvas.toDataURL('image/png');

  // Create download link
  const link = document.createElement('a');
  link.download = `${opts.filename}.png`;
  link.href = dataUrl;

  // Trigger download
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Finds the Three.js canvas in the document
 *
 * @returns The canvas element or null if not found
 */
export function findThreeCanvas(): HTMLCanvasElement | null {
  // The 'main-webgl-canvas' ID is on the R3F wrapper div, so we need to find the canvas inside it
  const wrapper = document.getElementById('main-webgl-canvas');
  if (!wrapper) return null;

  if (wrapper instanceof HTMLCanvasElement) {
    return wrapper;
  }

  return wrapper.querySelector('canvas');
}

/**
 * Captures the current Three.js scene and opens the preview modal.
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
      useScreenshotStore.getState().openModal(dataUrl);
    })
    .catch((error) => {
      // Handle specific error cases with helpful messages
      let errorMsg = error instanceof Error ? error.message : 'Unknown error';

      if (error instanceof DOMException && error.name === 'SecurityError') {
        errorMsg = 'Canvas is tainted by cross-origin content (CORS). External textures or images were used without proper permissions.';
        console.error('Export failed: ' + errorMsg);
      } else {
        console.error('Export failed:', error);
      }

      useMsgBoxStore.getState().showMsgBox('Export Failed', errorMsg, 'error');
    });

  // Return true to indicate capture was initiated
  // The actual result is handled asynchronously
  return true;
}


/**
 * Generates a timestamp-based filename
 *
 * @param prefix - Filename prefix
 * @returns Filename with timestamp
 */
export function generateTimestampFilename(prefix: string = 'ndimensional'): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${prefix}-${timestamp}`;
}
