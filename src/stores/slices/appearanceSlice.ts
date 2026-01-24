/**
 * Appearance slice for visual store
 *
 * Manages visual appearance of the polytope:
 * - Basic colors (edge, face, background)
 * - Advanced color system (algorithms, cosine coefficients, LCH)
 * - Shader system (wireframe, surface settings)
 * - Render mode toggles (edges/faces visible)
 * - Depth effects (attenuation, fresnel)
 * - Visual presets
 *
 * Re-exports decomposed slices.
 */

import type { StateCreator } from 'zustand'
import { AppearanceSlice as AppearanceSliceType } from './visual/types'
import { createColorSlice, COLOR_INITIAL_STATE } from './visual/colorSlice'
import { createMaterialSlice, MATERIAL_INITIAL_STATE } from './visual/materialSlice'
import { createRenderSlice, RENDER_INITIAL_STATE } from './visual/renderSlice'
import {
  createAdvancedRenderingSlice,
  ADVANCED_RENDERING_INITIAL_STATE,
} from './visual/advancedRenderingSlice'

export type AppearanceSlice = AppearanceSliceType
export * from './visual/types'

// ============================================================================
// Initial State
// ============================================================================

export const APPEARANCE_INITIAL_STATE: AppearanceSliceType = {
  ...COLOR_INITIAL_STATE,
  ...MATERIAL_INITIAL_STATE,
  ...RENDER_INITIAL_STATE,
  ...ADVANCED_RENDERING_INITIAL_STATE,
} as AppearanceSliceType

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
