/**
 * Object Type Registry — Public API.
 *
 * Re-exports the actually-imported subset of the registry. Names that
 * are only used internally (within `helpers.ts` / `quantumTypes.ts` /
 * `registry.ts`) deliberately do not appear here so the public surface
 * matches what consumers actually depend on.
 *
 * @example
 * ```typescript
 * import {
 *   getAvailableQuantumTypes,
 *   getQuantumTypeEntry,
 * } from '@/lib/geometry/registry'
 * ```
 */

// Types
export type {
  AnimationSystemDef,
  AvailableQuantumTypeInfo,
  QuantumTypeCompileContextField,
  QuantumTypeEvolutionResetKind,
  QuantumTypeKey,
} from './types'

// Registries
export { QUANTUM_TYPE_REGISTRY } from './quantumTypes'
export { OBJECT_TYPE_REGISTRY } from './registry'

// Helpers — flat quantum-type API
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
  getQuantumTypeShaderUniformIdMap,
  getQuantumTypeStateSaveIdMap,
  getQuantumTypeStrategyKind,
  isAnalyticQuantumType,
  isComputeQuantumType,
  isHydrogenFamilyQuantumType,
  isUniformComputeGridQuantumType,
  QUANTUM_MODES_3D_ONLY,
  resolveQuantumTypeKey,
  supportsOpenQuantumForQuantumType,
} from './helpers'

// Helpers — legacy object-type API
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
