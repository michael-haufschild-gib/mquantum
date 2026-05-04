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
 * } from '@/lib/geometry/registry';
 * ```
 */

// Types — flat model
export type {
  AvailableQuantumTypeInfo,
  QuantumTypeCategory,
  QuantumTypeCompileContextField,
  QuantumTypeDataPath,
  QuantumTypeEntry,
  QuantumTypeEvolutionResetKind,
  QuantumTypeInternal,
  QuantumTypeKey,
  QuantumTypeRegistry,
  QuantumTypeRuntimeMetadata,
  QuantumTypeStrategyKind,
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
  getQuantumTypeCompileContextFields,
  getQuantumTypeConfigSubKey,
  getQuantumTypeDefaultColorAlgorithm,
  getQuantumTypeEntry,
  getQuantumTypeEvolutionResetKind,
  getQuantumTypeKeyByStateSaveIdMap,
  getQuantumTypeName,
  getQuantumTypeRuntime,
  getQuantumTypeShaderUniformId,
  getQuantumTypeShaderUniformIdMap,
  getQuantumTypesRequiringDimensionAbove,
  getQuantumTypeStateSaveId,
  getQuantumTypeStateSaveIdMap,
  getQuantumTypeStrategyKind,
  isAnalyticQuantumType,
  isComputeQuantumType,
  isHydrogenFamilyQuantumType,
  isUniformComputeGridQuantumType,
  QUANTUM_MODES_3D_ONLY,
  quantumTypeHasCompileContextField,
  resolveQuantumTypeKey,
  supportsOpenQuantumForQuantumType,
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
