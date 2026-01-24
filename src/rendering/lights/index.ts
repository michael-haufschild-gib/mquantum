/**
 * Multi-Light System
 *
 * Advanced lighting system supporting up to 4 dynamic light sources
 * with Point, Directional, and Spot light types.
 *
 * @example
 * ```tsx
 * import { createNewLight, updateLightUniforms } from '@/rendering/lights';
 *
 * const light = createNewLight('point', 0);
 * updateLightUniforms(shaderUniforms, [light]);
 * ```
 */

// Type definitions
export type { LightSource, LightType, TransformMode } from './types'

// Constants
export {
  MAX_LIGHTS,
  MIN_LIGHTS,
  LIGHT_TYPE_TO_INT,
  DEFAULT_LIGHT_VALUES,
  DEFAULT_NEW_LIGHT_POSITIONS,
} from './types'

// Factory functions
export { createDefaultLight, createNewLight, cloneLight } from './types'

// Utility functions
export { rotationToDirection, clampIntensity, clampConeAngle, clampPenumbra } from './types'

// Uniform types and helpers
export type { LightUniforms } from './uniforms'
export {
  createLightUniforms,
  updateLightUniforms,
  mergeLightUniforms,
  getLightUniformDeclarations,
} from './uniforms'
