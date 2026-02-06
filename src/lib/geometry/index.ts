/**
 * N-Dimensional Geometry Library
 *
 * Provides generators for Schroedinger quantum objects rendered via
 * volumetric ray marching (WebGPU). This is the single entry point
 * for geometry types, the object-type registry, cross-section
 * computation, and face detection utilities.
 */

// Type exports from types.ts
export { isExtendedObjectType, isPolytopeType } from './types'
export type { GeometryMetadata, NdGeometry, ObjectType } from './types'

// Registry exports (single source of truth for object type capabilities)
export {
  // Registry data
  OBJECT_TYPE_REGISTRY,
  getAllObjectTypes,
  // Core lookups
  getObjectTypeEntry,
  // Rendering capabilities
  canRenderFaces,
  canRenderEdges,
  isRaymarchingType,
  isRaymarchingFractal,
  getRenderingCapabilities,
  getFaceDetectionMethod,
  determineRenderMode,
  // Dimension constraints
  getDimensionConstraints,
  isAvailableForDimension,
  getAvailableTypesForDimension,
  // Animation
  getAnimationCapabilities,
  hasTypeSpecificAnimations,
  getAvailableAnimationSystems,
  // UI
  getControlsComponentKey,
  hasTimelineControls,
  getControlsComponent,
  // Validation
  getValidObjectTypes,
  isValidObjectType,
  getTypeName,
  getTypeDescription,
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

// Extended object generator exports
export {
  generateSchroedinger,
  generateExtendedObject,
  buildKnnEdges,
  buildShortEdges,
} from './extended'

import type { NdGeometry, ObjectType } from './types'
import type { ExtendedObjectParams } from './extended'
import { DEFAULT_EXTENDED_OBJECT_PARAMS, generateExtendedObject } from './extended'

/**
 * Generates geometry for the given object type and dimension.
 *
 * Since the only supported ObjectType is 'schroedinger', this delegates
 * directly to {@link generateExtendedObject}.
 *
 * @param type - Object type to generate (currently only 'schroedinger')
 * @param dimension - Dimensionality of the ambient space
 * @param params - Extended object parameters (optional, uses defaults)
 * @returns NdGeometry representing the object
 * @throws {Error} If type is invalid or dimension constraints are violated
 */
export function generateGeometry(
  type: ObjectType,
  dimension: number,
  params?: ExtendedObjectParams
): NdGeometry {
  const effectiveParams = params ?? DEFAULT_EXTENDED_OBJECT_PARAMS
  return generateExtendedObject(type, dimension, effectiveParams)
}
