/**
 * Appearance slice for visual store
 *
 * Manages visual appearance of the schroedinger object:
 * - Basic colors (edge, face, background)
 * - Advanced color system (algorithms, cosine coefficients, LCH)
 * - Shader system (wireframe, surface settings)
 * - Fresnel rim controls
 * - Visual presets
 *
 * Re-exports decomposed slices.
 */

import type { StateCreator } from 'zustand'

import {
  ADVANCED_RENDERING_INITIAL_STATE,
  createAdvancedRenderingSlice,
} from './visual/advancedRenderingSlice'
import { COLOR_INITIAL_STATE, createColorSlice } from './visual/colorSlice'
import { createMaterialSlice, MATERIAL_INITIAL_STATE } from './visual/materialSlice'
import { createRenderSlice, RENDER_INITIAL_STATE } from './visual/renderSlice'
import {
  type AdvancedRenderingState,
  AppearanceSlice as AppearanceSliceType,
  type ColorSliceState,
  type MaterialSliceState,
  type RenderSliceState,
} from './visual/types'

/** Re-export of the composed appearance slice type. */
export type AppearanceSlice = AppearanceSliceType
export * from './visual/types'

// ============================================================================
// Initial State
// ============================================================================

/** State-only initial values (no actions). Safe for use with Zustand's shallow-merge `set()`. */
export type AppearanceInitialState = ColorSliceState &
  MaterialSliceState &
  RenderSliceState &
  AdvancedRenderingState

export const APPEARANCE_INITIAL_STATE: AppearanceInitialState = {
  ...COLOR_INITIAL_STATE,
  ...MATERIAL_INITIAL_STATE,
  ...RENDER_INITIAL_STATE,
  ...ADVANCED_RENDERING_INITIAL_STATE,
}

// ============================================================================
// Slice Creator
// ============================================================================

export const createAppearanceSlice: StateCreator<AppearanceSlice, [], [], AppearanceSlice> = (
  ...a
) => ({
  ...createColorSlice(...a),
  ...createMaterialSlice(...a),
  ...createRenderSlice(...a),
  ...createAdvancedRenderingSlice(...a),
  reset: () => {
    const [set] = a
    set(APPEARANCE_INITIAL_STATE)
  },
})
