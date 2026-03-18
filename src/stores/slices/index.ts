/**
 * Visual store slices barrel export
 */

export {
  APPEARANCE_INITIAL_STATE,
  type AppearanceSlice,
  createAppearanceSlice,
} from './appearanceSlice'
// Re-export sub-slice types from visual/types
export {
  createLightingSlice,
  LIGHTING_INITIAL_STATE,
  type LightingSlice,
  type LightingSliceActions,
  type LightingSliceState,
} from './lightingSlice'
export {
  createPostProcessingSlice,
  POST_PROCESSING_INITIAL_STATE,
  type PostProcessingSlice,
  type PostProcessingSliceActions,
  type PostProcessingSliceState,
} from './postProcessingSlice'
export {
  createSkyboxSlice,
  SKYBOX_INITIAL_STATE,
  type SkyboxSlice,
  type SkyboxSliceActions,
  type SkyboxSliceState,
} from './skyboxSlice'
export {
  createUISlice,
  UI_INITIAL_STATE,
  type UISlice,
  type UISliceActions,
  type UISliceState,
} from './uiSlice'
export type {
  ColorSlice,
  ColorSliceActions,
  ColorSliceState,
  MaterialSlice,
  MaterialSliceActions,
  MaterialSliceState,
  RenderSlice,
  RenderSliceActions,
  RenderSliceState,
} from './visual/types'
