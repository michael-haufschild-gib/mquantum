/**
 * Object Type Registry - Helper Functions
 *
 * Helper functions that provide O(1) lookups from the registry
 * for the single 'schroedinger' object type.
 *
 * @see src/lib/geometry/registry/registry.ts for the registry data
 */

import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/common'

import type { ObjectType } from '../types'
import { QUANTUM_TYPE_REGISTRY } from './quantumTypes'
import { OBJECT_TYPE_REGISTRY } from './registry'
import type {
  AvailableQuantumTypeInfo,
  AvailableTypeInfo,
  DimensionConstraints,
  ObjectTypeEntry,
  QuantumTypeEntry,
  QuantumTypeKey,
  QuantumTypeRuntimeMetadata,
  QuantumTypeStrategyKind,
} from './types'

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
 * @returns true if the type shows in TimelineControls animation drawer
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

// ============================================================================
// Quantum Type Registry — Flat Model Helpers
// ============================================================================

/**
 * Gets a quantum type entry by key.
 *
 * @param key - The quantum type key (any mode or 'pauliSpinor')
 * @returns The registry entry, or undefined if not found
 */
export function getQuantumTypeEntry(key: QuantumTypeKey): QuantumTypeEntry | undefined {
  return QUANTUM_TYPE_REGISTRY.get(key)
}

/** Gets runtime metadata for a quantum type. */
export function getQuantumTypeRuntime(key: QuantumTypeKey): QuantumTypeRuntimeMetadata | undefined {
  return QUANTUM_TYPE_REGISTRY.get(key)?.runtime
}

/** Gets the renderer strategy family for a quantum type. */
export function getQuantumTypeStrategyKind(
  key: QuantumTypeKey
): QuantumTypeStrategyKind | undefined {
  return getQuantumTypeRuntime(key)?.strategy
}

/** Gets the mode-specific sub-config key used under `schroedinger`, if any. */
export function getQuantumTypeConfigSubKey(key: QuantumTypeKey): string | undefined {
  return QUANTUM_TYPE_REGISTRY.get(key)?.internal.configSubKey
}

/** Gets the WGSL runtime mode id for `uniforms.quantumMode`, if the mode uses one. */
export function getQuantumTypeShaderUniformId(key: QuantumTypeKey): number | undefined {
  return getQuantumTypeRuntime(key)?.shaderUniformId
}

/** Gets the append-only `.mqstate` serialization id for a saveable quantum type. */
export function getQuantumTypeStateSaveId(key: QuantumTypeKey): number | undefined {
  return getQuantumTypeRuntime(key)?.stateSaveId
}

/** Gets the fallback color algorithm for a quantum type. */
export function getQuantumTypeDefaultColorAlgorithm(key: QuantumTypeKey): string | undefined {
  return getQuantumTypeRuntime(key)?.defaultColorAlgorithm
}

/** Checks if the type belongs to the hydrogen analytic shader family. */
export function isHydrogenFamilyQuantumType(key: QuantumTypeKey): boolean {
  return getQuantumTypeRuntime(key)?.analyticFamily === 'hydrogen'
}

/**
 * Checks if the type uses the shared density-grid uniform packing path.
 * This is deliberately separate from `isComputeQuantumType`: WdW and AdS are
 * compute strategies but do not use the legacy uniform compute grid branch.
 */
export function isUniformComputeGridQuantumType(key: QuantumTypeKey): boolean {
  return getQuantumTypeRuntime(key)?.uniformComputeGrid === true
}

/** Builds a shader uniform id map for renderer hot paths. */
export function getQuantumTypeShaderUniformIdMap(): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
    const id = entry.runtime.shaderUniformId
    if (id !== undefined) result[key] = id
  }
  return result
}

/** Builds an append-only save id map for `.mqstate` serialization. */
export function getQuantumTypeStateSaveIdMap(): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
    const id = entry.runtime.stateSaveId
    if (id !== undefined) result[key] = id
  }
  return result
}

/** Builds the reverse `.mqstate` id lookup map. */
export function getQuantumTypeKeyByStateSaveIdMap(): Record<number, QuantumTypeKey> {
  const result: Record<number, QuantumTypeKey> = {}
  for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
    const id = entry.runtime.stateSaveId
    if (id !== undefined) result[id] = key
  }
  return result
}

/**
 * Resolves the flat QuantumTypeKey from the runtime ObjectType + quantumMode pair.
 *
 * @param objectType - Runtime object type
 * @param quantumMode - Quantum mode (only used when objectType is 'schroedinger')
 * @returns The flat key, or undefined if no match
 */
export function resolveQuantumTypeKey(
  objectType: ObjectType,
  quantumMode?: SchroedingerQuantumMode
): QuantumTypeKey | undefined {
  if (objectType === 'pauliSpinor') return 'pauliSpinor'
  if (objectType === 'schroedinger' && quantumMode) return quantumMode
  return undefined
}

/**
 * Gets all quantum types available for a given dimension.
 *
 * @param dimension - The current dimension
 * @returns Array of type info with availability status, sorted by category
 */
export function getAvailableQuantumTypes(dimension: number): AvailableQuantumTypeInfo[] {
  const result: AvailableQuantumTypeInfo[] = []

  for (const [, entry] of QUANTUM_TYPE_REGISTRY) {
    const available = dimension >= entry.dimensions.min && dimension <= entry.dimensions.max
    const disabledReason = !available
      ? dimension < entry.dimensions.min
        ? `Requires ${entry.dimensions.min}D+`
        : `Max ${entry.dimensions.max}D`
      : undefined

    result.push({
      key: entry.key,
      name: entry.name,
      description: entry.description,
      category: entry.category,
      available,
      disabledReason,
    })
  }

  return result
}

/**
 * Checks if a quantum type key is a compute mode (GPU lattice simulation).
 *
 * @param key - The quantum type key
 * @returns true if the type uses a compute pipeline
 */
export function isComputeQuantumType(key: QuantumTypeKey): boolean {
  return QUANTUM_TYPE_REGISTRY.get(key)?.category === 'compute'
}

/**
 * Checks if a quantum type key is an analytic mode (closed-form wavefunction).
 *
 * @param key - The quantum type key
 * @returns true if the type uses analytic basis evaluation (not GPU compute)
 */
export function isAnalyticQuantumType(key: QuantumTypeKey): boolean {
  return QUANTUM_TYPE_REGISTRY.get(key)?.category === 'analytic'
}

/**
 * Gets the display name for a quantum type.
 *
 * @param key - The quantum type key
 * @returns Display name, or the key itself as fallback
 */
export function getQuantumTypeName(key: QuantumTypeKey): string {
  return QUANTUM_TYPE_REGISTRY.get(key)?.name ?? key
}

/**
 * Gets all QuantumTypeKeys whose minimum dimension is > the given threshold.
 * Useful for deriving sets like QUANTUM_MODES_3D_ONLY.
 *
 * @param minDimThreshold - Dimension threshold (exclusive)
 * @returns Set of keys requiring dimension > threshold
 */
export function getQuantumTypesRequiringDimensionAbove(
  minDimThreshold: number
): Set<QuantumTypeKey> {
  const result = new Set<QuantumTypeKey>()
  for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
    if (entry.dimensions.min > minDimThreshold) {
      result.add(key)
    }
  }
  return result
}

/**
 * Quantum modes that require 3D+ dimensions (no 2D rendering path).
 * Compute modes render a 3D density grid via volume raymarching;
 * the 2D heatmap pipeline cannot sample their density grids.
 *
 * Derived from the quantum type registry: all entries with dimensions.min > 2.
 */
export const QUANTUM_MODES_3D_ONLY = getQuantumTypesRequiringDimensionAbove(2)
