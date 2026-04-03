/**
 * Object Type Registry — Barrel Export
 *
 * Provides both the legacy ObjectType registry (for internal plumbing)
 * and the flat QuantumType registry (for user-facing type selection).
 *
 * @example
 * ```typescript
 * import {
 *   getAvailableQuantumTypes,
 *   getQuantumTypeEntry,
 *   getControlsComponent,
 * } from '@/lib/geometry/registry';
 * ```
 */

// Types — flat model
export type {
  AvailableQuantumTypeInfo,
  QuantumTypeCategory,
  QuantumTypeEntry,
  QuantumTypeInternal,
  QuantumTypeKey,
  QuantumTypeRegistry,
} from './types'

// Types — legacy model (still used by internal plumbing)
export type {
  AnimationCapabilities,
  AnimationSystemDef,
  AvailableTypeInfo,
  DimensionConstraints,
  ObjectTypeEntry,
  RenderingCapabilities,
} from './types'

// Registries
export { QUANTUM_TYPE_REGISTRY } from './quantumTypes'
export { OBJECT_TYPE_REGISTRY } from './registry'

// Helper functions — flat model
export {
  getAvailableQuantumTypes,
  getQuantumTypeEntry,
  getQuantumTypeName,
  getQuantumTypesRequiringDimensionAbove,
  isComputeQuantumType,
  resolveQuantumTypeKey,
} from './helpers'

// Helper functions — legacy model (still used by stores, URL serializer, etc.)
export {
  getAvailableTypesForDimension,
  getConfigStoreKey,
  getControlsComponentKey,
  getDimensionConstraints,
  getObjectTypeEntry,
  getRecommendedDimension,
  getUnavailabilityReason,
  hasTimelineControls,
  isAvailableForDimension,
  isRaymarchingType,
  isValidObjectType,
} from './helpers'

// Component loader
export { getControlsComponent, hasControlsComponent } from './components'
