/**
 * Visual store slices barrel export
 */

export {
  APPEARANCE_INITIAL_STATE,
  createAppearanceSlice,
  type AppearanceSlice,
} from './appearanceSlice'
// Re-export sub-slice types from visual/types
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

export {
  LIGHTING_INITIAL_STATE,
  createLightingSlice,
  type LightingSlice,
  type LightingSliceActions,
  type LightingSliceState,
} from './lightingSlice'

export {
  POST_PROCESSING_INITIAL_STATE,
  createPostProcessingSlice,
  type PostProcessingSlice,
  type PostProcessingSliceActions,
  type PostProcessingSliceState,
} from './postProcessingSlice'

export {
  UI_INITIAL_STATE,
  createUISlice,
  type UISlice,
  type UISliceActions,
  type UISliceState,
} from './uiSlice'

export {
  SKYBOX_INITIAL_STATE,
  createSkyboxSlice,
  type SkyboxSlice,
  type SkyboxSliceActions,
  type SkyboxSliceState,
} from './skyboxSlice'
