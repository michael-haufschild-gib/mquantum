/**
 * Centralized z-index values for consistent stacking order.
 *
 * Using a centralized system prevents z-index conflicts and makes
 * it easy to understand the stacking order at a glance.
 *
 * @module constants/zIndex
 */

export const Z_INDEX = {
  /** Base canvas layer */
  CANVAS: 0,

  /** Ground plane and 3D gizmos */
  GROUND_PLANE: 10,

  /** UI controls and panels */
  UI_CONTROLS: 100,

  /** Shader compilation overlay (non-blocking, bottom of screen) */
  SHADER_COMPILATION_OVERLAY: 150,

  /** Context lost overlay (blocking, full screen) */
  CONTEXT_LOST_OVERLAY: 200,

  /** Modal dialogs */
  MODAL: 300,

  /** Tooltips and popovers */
  TOOLTIP: 400,
} as const

/** Type for z-index values */
export type ZIndexKey = keyof typeof Z_INDEX
