/**
 * Render Layer Constants
 *
 * Defines Three.js render layers for separating main objects from environment.
 * Used by PostProcessing to render object-only depth for depth-aware effects.
 *
 * Layer 0: Environment (gizmos, helpers, axes) - always visible
 * Layer 1: Main Object - used for depth-based effects
 * Layer 2: Skybox - excluded from normal buffer
 */

/**
 * Render layer assignments for scene objects
 */
export const RENDER_LAYERS = {
  /** Environment elements: helpers and gizmos */
  ENVIRONMENT: 0,
  /** Main n-dimensional object */
  MAIN_OBJECT: 1,
  /** Skybox - excluded from normal pass to avoid polluting normal buffer */
  SKYBOX: 2,
  /** Volumetric objects (Schroedinger) when temporal accumulation is enabled */
  VOLUMETRIC: 3,
  /**
   * Debug/Gizmo layer - rendered AFTER all post-processing via DebugOverlayPass.
   *
   * Objects on this layer bypass MRT rendering entirely, so they can use
   * standard Three.js materials (MeshBasicMaterial, LineBasicMaterial,
   * ArrowHelper, TransformControls, Line from drei, etc.) WITHOUT needing
   * custom shaders that output to 3 MRT color attachments.
   *
   * Use this layer for:
   * - Light gizmos (icons, direction arrows, cones)
   * - Transform controls (translate/rotate/scale helpers)
   * - Axis helpers (global coordinate system display)
   * - Light projection visualizations (intersection circles/ellipses)
   * - Any debug visualization that shouldn't affect post-processing
   */
  DEBUG: 4,
} as const

export type RenderLayer = (typeof RENDER_LAYERS)[keyof typeof RENDER_LAYERS]

/**
 * Check if temporal cloud accumulation needs separate volumetric pass.
 * When enabled, volumetric objects (Schroedinger) render to 1/4 res target
 * using Horizon Zero Dawn-style temporal accumulation with Bayer pattern cycling.
 *
 * The temporal accumulation pipeline:
 * 1. Renders volumetric at quarter resolution with Bayer offset
 * 2. Reprojects previous frame's accumulation to current view
 * 3. Reconstructs full resolution by blending new pixels with history
 * 4. Composites over the main scene
 *
 * @param state - State containing temporal and object type info
 * @param state.temporalCloudAccumulation - Whether temporal accumulation is enabled
 * @param state.objectType - The current object type
 * @returns True if volumetric separation is needed
 */
export function needsVolumetricSeparation(state: {
  temporalCloudAccumulation?: boolean
  objectType?: string
}): boolean {
  // Only Schroedinger benefits from temporal accumulation
  return Boolean(state.temporalCloudAccumulation && state.objectType === 'schroedinger')
}

/**
 * Check if object-only depth pass is needed based on current effect settings.
 * Returns true if any effect requires depth that should exclude environment objects.
 *
 * @param state - Current post-processing state
 * @param state.bokehEnabled
 * @param state.bokehFocusMode
 * @param state.temporalReprojectionEnabled
 * @returns True if object-only depth pass should be rendered
 */
export function needsObjectOnlyDepth(state: {
  bokehEnabled: boolean
  bokehFocusMode: string
  temporalReprojectionEnabled?: boolean
}): boolean {
  // Bokeh always needs object-only depth so blur is based on the main object only
  if (state.bokehEnabled) {
    return true
  }

  // Temporal reprojection needs depth for raymarching acceleration
  if (state.temporalReprojectionEnabled) {
    return true
  }

  return false
}
