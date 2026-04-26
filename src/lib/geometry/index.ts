/**
 * N-Dimensional Geometry Library
 *
 * Provides configuration and registry for Schroedinger quantum objects
 * rendered via volumetric ray marching (WebGPU).
 */

// Type exports from types.ts
export type { ObjectType } from './types'
export { isExtendedObjectType } from './types'

// Registry exports — flat quantum type model (user-facing)
export type {
  AvailableQuantumTypeInfo,
  QuantumTypeCategory,
  QuantumTypeEntry,
  QuantumTypeKey,
} from './registry'
export {
  getAvailableQuantumTypes,
  getQuantumTypeEntry,
  getQuantumTypeName,
  isComputeQuantumType,
  QUANTUM_TYPE_REGISTRY,
  resolveQuantumTypeKey,
} from './registry'

// Registry exports — legacy object type model (internal plumbing)
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
  getControlsComponentKey,
  getDimensionConstraints,
  getObjectTypeEntry,
  hasTimelineControls,
  isAvailableForDimension,
  isRaymarchingType,
  isValidObjectType,
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
