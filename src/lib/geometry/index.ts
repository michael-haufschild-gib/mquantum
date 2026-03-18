/**
 * N-Dimensional Geometry Library
 *
 * Provides configuration and registry for Schroedinger quantum objects
 * rendered via volumetric ray marching (WebGPU).
 */

// Type exports from types.ts
export type { ObjectType } from './types'
export { isExtendedObjectType } from './types'

// Registry exports (single source of truth for object type capabilities)
export type {
  AnimationCapabilities,
  AnimationSystemDef,
  AvailableTypeInfo,
  DimensionConstraints,
  ObjectTypeEntry,
  RenderingCapabilities,
} from './registry'
export {
  getAvailableTypesForDimension,
  getConfigStoreKey,
  getControlsComponent,
  // UI
  getControlsComponentKey,
  // Dimension constraints
  getDimensionConstraints,
  // Core lookups
  getObjectTypeEntry,
  hasTimelineControls,
  isAvailableForDimension,
  // Rendering capabilities
  isRaymarchingType,
  // Validation
  isValidObjectType,
  // Registry data
  OBJECT_TYPE_REGISTRY,
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
