/**
 * Object Type Registry - Barrel Export
 *
 * Central registry for all object type metadata, capabilities, and configurations.
 * Import from this module to access registry functions and types.
 *
 * @example
 * ```typescript
 * import {
 *   canRenderFaces,
 *   getAvailableTypesForDimension,
 *   getControlsComponent,
 * } from '@/lib/geometry/registry';
 * ```
 */

// Types
export type {
  AnimationCapabilities,
  AnimationParamRange,
  AnimationSystemDef,
  AvailableTypeInfo,
  DimensionConstraints,
  FaceDetectionMethod,
  ObjectCategory,
  ObjectTypeEntry,
  ObjectTypeRegistry,
  RenderingCapabilities,
  RenderMethod,
  UiComponentMapping,
  UrlSerializationConfig,
} from './types'

// Registry
export { OBJECT_TYPE_REGISTRY, getAllObjectTypes, getAllRegistryEntries } from './registry'

// Helper functions
export {
  // Core lookups
  getObjectTypeEntry,
  getObjectTypeEntryOrThrow,
  // Category helpers
  getObjectCategory,
  isFractalCategory,
  // Rendering capability helpers
  canRenderFaces,
  canRenderEdges,
  canRenderPoints,
  getRenderMethod,
  isRaymarchingType,
  isRaymarchingFractal,
  supportsEmission,
  getRenderingCapabilities,
  getFaceDetectionMethod,
  determineRenderMode,
  // Dimension constraint helpers
  getDimensionConstraints,
  getMinDimension,
  getMaxDimension,
  getRecommendedDimension,
  isAvailableForDimension,
  getUnavailabilityReason,
  getAvailableTypesForDimension,
  // Animation helpers
  getAnimationCapabilities,
  hasTypeSpecificAnimations,
  getAvailableAnimationSystems,
  getAnimationSystem,
  // UI helpers
  getControlsComponentKey,
  hasTimelineControls,
  getQualityPresets,
  // Validation helpers
  getValidObjectTypes,
  isValidObjectType,
  getTypeName,
  getTypeDescription,
  // Store config helpers
  getConfigStoreKey,
} from './helpers'

// Component loader
export {
  getControlsComponent,
  preloadControlsComponent,
  hasControlsComponent,
  getAllComponentKeys,
} from './components'
