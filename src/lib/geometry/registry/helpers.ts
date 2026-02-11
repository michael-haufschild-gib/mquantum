/**
 * Object Type Registry - Helper Functions
 *
 * Helper functions that replace hardcoded object type checks throughout
 * the codebase. These functions provide O(1) lookups from the registry.
 *
 * @see src/lib/geometry/registry/registry.ts for the registry data
 */

import type { ObjectType } from '../types'
import type {
  AnimationCapabilities,
  AnimationSystemDef,
  AvailableTypeInfo,
  DimensionConstraints,
  FaceDetectionMethod,
  ObjectCategory,
  ObjectTypeEntry,
  RenderingCapabilities,
  RenderMethod,
} from './types'
import { OBJECT_TYPE_REGISTRY } from './registry'

// ============================================================================
// Core Lookups
// ============================================================================

/**
 * Gets the registry entry for an object type.
 * O(1) lookup via Map.
 *
 * @param type - The object type to look up
 * @returns The registry entry, or undefined if not found
 */
export function getObjectTypeEntry(type: ObjectType): ObjectTypeEntry | undefined {
  return OBJECT_TYPE_REGISTRY.get(type)
}

/**
 * Gets the registry entry, throwing if not found.
 * Use when you're certain the type exists.
 *
 * @param type - The object type to look up
 * @returns The registry entry
 * @throws Error if type is not in registry
 */
export function getObjectTypeEntryOrThrow(type: ObjectType): ObjectTypeEntry {
  const entry = OBJECT_TYPE_REGISTRY.get(type)
  if (!entry) {
    throw new Error(`Unknown object type: ${type}`)
  }
  return entry
}

// ============================================================================
// Category Helpers
// ============================================================================

/**
 * Gets the category of an object type.
 *
 * @param type - The object type
 * @returns The category ('fractal'), or undefined
 */
export function getObjectCategory(type: ObjectType): ObjectCategory | undefined {
  return getObjectTypeEntry(type)?.category
}

/**
 * Checks if an object type uses raymarching (schroedinger).
 *
 * @param type - The object type to check
 * @returns true if the type is a fractal
 */
export function isFractalCategory(type: string): boolean {
  const entry = OBJECT_TYPE_REGISTRY.get(type as ObjectType)
  return entry?.category === 'fractal'
}

// ============================================================================
// Rendering Capability Helpers
// ============================================================================

/**
 * Checks if an object type can render faces.
 * Replaces hardcoded canRenderFaces() functions.
 *
 * @param type - The object type
 * @returns true if faces can be rendered
 */
export function canRenderFaces(type: ObjectType): boolean {
  return getObjectTypeEntry(type)?.rendering.supportsFaces ?? false
}

/**
 * Checks if an object type can render edges.
 *
 * @param type - The object type
 * @returns true if edges can be rendered
 */
export function canRenderEdges(type: ObjectType): boolean {
  return getObjectTypeEntry(type)?.rendering.supportsEdges ?? true
}

/**
 * Checks if an object type can render points/vertices.
 *
 * @param type - The object type
 * @returns true if points can be rendered
 */
export function canRenderPoints(type: ObjectType): boolean {
  return getObjectTypeEntry(type)?.rendering.supportsPoints ?? false
}

/**
 * Gets the render method for an object type.
 *
 * @param type - The object type
 * @returns The render method ('raymarch')
 */
export function getRenderMethod(type: ObjectType): RenderMethod | undefined {
  return getObjectTypeEntry(type)?.rendering.renderMethod
}

/**
 * Checks if an object type uses raymarching.
 * Replaces RAYMARCHING_FRACTAL_TYPES array.
 *
 * @param type - The object type
 * @returns true if the type uses raymarching
 */
export function isRaymarchingType(type: ObjectType): boolean {
  return getObjectTypeEntry(type)?.rendering.renderMethod === 'raymarch'
}

/**
 * Checks if an object type is a raymarched fractal at a given dimension.
 * Replaces isRaymarchedFractal() function.
 *
 * @param type - The object type
 * @param dimension - The current dimension
 * @returns true if the type uses raymarching at this dimension
 */
export function isRaymarchingFractal(type: ObjectType, dimension: number): boolean {
  const entry = getObjectTypeEntry(type)
  if (!entry) return false
  return entry.rendering.requiresRaymarching === true && dimension >= 2
}

/**
 * Checks if an object type supports volumetric emission controls.
 * Only types with density-based rendering (e.g., Schroedinger) support this.
 *
 * @param type - The object type
 * @returns true if the type supports emission controls
 */
export function supportsEmission(type: ObjectType): boolean {
  return getObjectTypeEntry(type)?.rendering.supportsEmission ?? false
}

/**
 * Gets the full rendering capabilities for an object type.
 *
 * @param type - The object type
 * @returns The rendering capabilities object
 */
export function getRenderingCapabilities(type: ObjectType): RenderingCapabilities | undefined {
  return getObjectTypeEntry(type)?.rendering
}

/**
 * Gets the face detection method for an object type.
 *
 * @param type - The object type
 * @returns The face detection method
 */
export function getFaceDetectionMethod(type: ObjectType): FaceDetectionMethod {
  return getObjectTypeEntry(type)?.rendering.faceDetection ?? 'none'
}

/**
 * Determines render mode based on object type and settings.
 * Replaces determineRenderMode() in UnifiedRenderer.tsx.
 *
 * @param type - The object type
 * @param dimension - The current dimension
 * @returns The render mode to use
 */
export function determineRenderMode(
  type: ObjectType,
  dimension: number
): 'raymarch-schroedinger' | 'none' {
  const entry = getObjectTypeEntry(type)
  if (!entry) return 'none'

  if (entry.rendering.renderMethod === 'raymarch') {
    if (dimension < 2) return 'none'
    if (type === 'schroedinger') return 'raymarch-schroedinger'
  }

  return 'none'
}

// ============================================================================
// Dimension Constraint Helpers
// ============================================================================

/**
 * Gets dimension constraints for an object type.
 *
 * @param type - The object type
 * @returns The dimension constraints
 */
export function getDimensionConstraints(type: ObjectType): DimensionConstraints | undefined {
  return getObjectTypeEntry(type)?.dimensions
}

/**
 * Gets the minimum dimension for an object type.
 *
 * @param type - The object type
 * @returns The minimum dimension (defaults to 3)
 */
export function getMinDimension(type: ObjectType): number {
  return getObjectTypeEntry(type)?.dimensions.min ?? 3
}

/**
 * Gets the maximum dimension for an object type.
 *
 * @param type - The object type
 * @returns The maximum dimension (defaults to 11)
 */
export function getMaxDimension(type: ObjectType): number {
  return getObjectTypeEntry(type)?.dimensions.max ?? 11
}

/**
 * Gets the recommended dimension for an object type.
 *
 * @param type - The object type
 * @returns The recommended dimension, or undefined
 */
export function getRecommendedDimension(type: ObjectType): number | undefined {
  return getObjectTypeEntry(type)?.dimensions.recommended
}

/**
 * Checks if an object type is available for a given dimension.
 *
 * @param type - The object type
 * @param dimension - The dimension to check
 * @returns true if the type is available at this dimension
 */
export function isAvailableForDimension(type: ObjectType, dimension: number): boolean {
  const constraints = getDimensionConstraints(type)
  if (!constraints) return false
  return dimension >= constraints.min && dimension <= constraints.max
}

/**
 * Gets the reason why a type is unavailable for a dimension.
 *
 * @param type - The object type
 * @param dimension - The dimension to check
 * @returns The reason, or undefined if available
 */
export function getUnavailabilityReason(type: ObjectType, dimension: number): string | undefined {
  const constraints = getDimensionConstraints(type)
  if (!constraints) return 'Unknown object type'

  if (dimension < constraints.min) {
    return `Requires ${constraints.min}D+`
  }
  if (dimension > constraints.max) {
    return `Max ${constraints.max}D`
  }
  return undefined
}

/**
 * Gets all available object types for a dimension.
 * Replaces getAvailableTypes() in geometry/index.ts.
 *
 * @param dimension - The current dimension
 * @returns Array of type info with availability status
 */
export function getAvailableTypesForDimension(dimension: number): AvailableTypeInfo[] {
  const result: AvailableTypeInfo[] = []

  for (const [type, entry] of OBJECT_TYPE_REGISTRY) {
    const available = isAvailableForDimension(type, dimension)
    result.push({
      type,
      name: entry.name,
      description: entry.description,
      available,
      disabledReason: available ? undefined : getUnavailabilityReason(type, dimension),
    })
  }

  return result
}

// ============================================================================
// Animation Helpers
// ============================================================================

/**
 * Gets animation capabilities for an object type.
 *
 * @param type - The object type
 * @returns The animation capabilities
 */
export function getAnimationCapabilities(type: ObjectType): AnimationCapabilities | undefined {
  return getObjectTypeEntry(type)?.animation
}

/**
 * Checks if an object type has type-specific animations.
 *
 * @param type - The object type
 * @returns true if the type has animations beyond global rotation
 */
export function hasTypeSpecificAnimations(type: ObjectType): boolean {
  return getObjectTypeEntry(type)?.animation.hasTypeSpecificAnimations ?? false
}

/**
 * Gets available animation systems for a type at a specific dimension.
 * Filters out systems that require higher dimensions.
 *
 * @param type - The object type
 * @param dimension - The current dimension
 * @returns Record of available animation systems
 */
export function getAvailableAnimationSystems(
  type: ObjectType,
  dimension: number
): Record<string, AnimationSystemDef> {
  const entry = getObjectTypeEntry(type)
  if (!entry?.animation.hasTypeSpecificAnimations) {
    return {}
  }

  const available: Record<string, AnimationSystemDef> = {}
  for (const [key, system] of Object.entries(entry.animation.systems)) {
    if (system.minDimension === undefined || dimension >= system.minDimension) {
      available[key] = system
    }
  }
  return available
}

/**
 * Gets a specific animation system definition.
 *
 * @param type - The object type
 * @param systemKey - The animation system key
 * @returns The animation system definition, or undefined
 */
export function getAnimationSystem(
  type: ObjectType,
  systemKey: string
): AnimationSystemDef | undefined {
  return getObjectTypeEntry(type)?.animation.systems[systemKey]
}

// ============================================================================
// UI Helpers
// ============================================================================

/**
 * Gets the controls component key for an object type.
 *
 * @param type - The object type
 * @returns The component key for dynamic loading
 */
export function getControlsComponentKey(type: ObjectType): string | undefined {
  return getObjectTypeEntry(type)?.ui.controlsComponentKey
}

/**
 * Checks if an object type has timeline controls.
 *
 * @param type - The object type
 * @returns true if the type shows in TimelineControls fractal drawer
 */
export function hasTimelineControls(type: ObjectType): boolean {
  return getObjectTypeEntry(type)?.ui.hasTimelineControls ?? false
}

/**
 * Gets quality presets for an object type.
 *
 * @param type - The object type
 * @returns Array of preset names, or undefined
 */
export function getQualityPresets(type: ObjectType): string[] | undefined {
  return getObjectTypeEntry(type)?.ui.qualityPresets
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Gets all valid object types.
 * Replaces VALID_OBJECT_TYPES array.
 *
 * @returns Array of all object type strings
 */
export function getValidObjectTypes(): ObjectType[] {
  return Array.from(OBJECT_TYPE_REGISTRY.keys())
}

/**
 * Validates an object type string.
 * Type guard for ObjectType.
 *
 * @param type - String to validate
 * @returns true if the string is a valid ObjectType
 */
export function isValidObjectType(type: string): type is ObjectType {
  return OBJECT_TYPE_REGISTRY.has(type as ObjectType)
}

/**
 * Gets the display name for an object type.
 * Replaces getTypeName() in geometry/index.ts.
 *
 * @param type - The object type
 * @returns The display name
 */
export function getTypeName(type: ObjectType): string {
  return getObjectTypeEntry(type)?.name ?? type
}

/**
 * Gets the description for an object type.
 *
 * @param type - The object type
 * @returns The description
 */
export function getTypeDescription(type: ObjectType): string {
  return getObjectTypeEntry(type)?.description ?? ''
}

// ============================================================================
// Store Config Helpers
// ============================================================================

/**
 * Gets the config store key for an object type.
 *
 * @param type - The object type
 * @returns The key used in extendedObjectStore (e.g., 'schroedinger')
 */
export function getConfigStoreKey(type: ObjectType): string | undefined {
  return getObjectTypeEntry(type)?.configStoreKey
}
