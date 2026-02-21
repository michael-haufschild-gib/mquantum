/**
 * Object Type Registry - Helper Functions
 *
 * Helper functions that provide O(1) lookups from the registry
 * for the single 'schroedinger' object type.
 *
 * @see src/lib/geometry/registry/registry.ts for the registry data
 */

import type { ObjectType } from '../types'
import type { AvailableTypeInfo, DimensionConstraints, ObjectTypeEntry } from './types'
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

// ============================================================================
// Rendering Capability Helpers
// ============================================================================

/**
 * Checks if an object type uses raymarching.
 *
 * @param type - The object type
 * @returns true if the type uses raymarching
 */
export function isRaymarchingType(type: ObjectType): boolean {
  return getObjectTypeEntry(type)?.rendering.renderMethod === 'raymarch'
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

// ============================================================================
// Validation Helpers
// ============================================================================

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
