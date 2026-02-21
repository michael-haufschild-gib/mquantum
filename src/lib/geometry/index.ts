/**
 * N-Dimensional Geometry Library
 *
 * Provides configuration and registry for Schroedinger quantum objects
 * rendered via volumetric ray marching (WebGPU).
 */

// Type exports from types.ts
export { isExtendedObjectType } from './types'
export type { ObjectType } from './types'

// Registry exports (single source of truth for object type capabilities)
export {
  // Registry data
  OBJECT_TYPE_REGISTRY,
  // Core lookups
  getObjectTypeEntry,
  // Rendering capabilities
  isRaymarchingType,
  // Dimension constraints
  getDimensionConstraints,
  isAvailableForDimension,
  getAvailableTypesForDimension,
  // UI
  getControlsComponentKey,
  hasTimelineControls,
  getControlsComponent,
  // Validation
  isValidObjectType,
  getConfigStoreKey,
} from './registry'
export type {
  AnimationCapabilities,
  AnimationSystemDef,
  AvailableTypeInfo,
  DimensionConstraints,
  ObjectTypeEntry,
  RenderingCapabilities,
} from './registry'

// Extended object type exports (Schroedinger only)
export type {
  ExtendedObjectParams,
  SchroedingerColorMode,
  SchroedingerConfig,
  SchroedingerPalette,
  SchroedingerQualityPreset,
  SchroedingerRenderStyle,
} from './extended'

// Default configs
export {
  DEFAULT_EXTENDED_OBJECT_PARAMS,
  DEFAULT_SCHROEDINGER_CONFIG,
  SCHROEDINGER_QUALITY_PRESETS,
} from './extended'
