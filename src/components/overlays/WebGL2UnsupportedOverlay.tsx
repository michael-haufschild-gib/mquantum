/**
 * WebGL2UnsupportedOverlay - Displayed when browser doesn't support WebGL2.
 *
 * This application requires WebGL2 for:
 * - GLSL ES 3.00 shaders
 * - Multiple Render Targets (MRT)
 * - GPU timer queries
 * - Advanced texture formats
 *
 * WebGL2 support detection is now handled by the unified device capabilities
 * module at @/lib/deviceCapabilities.ts
 *
 * @module components/overlays/WebGL2UnsupportedOverlay
 */

import React from 'react'

/**
 * Overlay shown when WebGL2 is not supported.
 * Replaces the Canvas area with an error message.
 * @returns The WebGL2 unsupported overlay
 */
export const WebGL2UnsupportedOverlay: React.FC = () => {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-panel-bg"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex flex-col items-center gap-6 text-center p-8 max-w-md">
        {/* Error icon */}
        <div
          className="w-16 h-16 rounded-full bg-danger-bg flex items-center justify-center"
          aria-hidden="true"
        >
          <svg
            className="w-8 h-8 text-danger"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            WebGL2 Required
          </h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            This application requires WebGL2 for advanced 3D rendering, which is
            not supported by your browser or has been disabled.
          </p>
        </div>

        <div className="text-xs text-text-secondary/70 space-y-2">
          <p>Please try one of the following:</p>
          <ul className="list-disc list-inside text-left space-y-1">
            <li>Update to a modern browser (Chrome, Firefox, Edge, Safari 15+)</li>
            <li>Enable hardware acceleration in browser settings</li>
            <li>Update your graphics drivers</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
