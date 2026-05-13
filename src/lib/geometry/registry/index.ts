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
  supportsSchroedingerSurfaceMode,
} from './helpers'

// Helpers — per-ObjectType API derived from QUANTUM_TYPE_REGISTRY
export {
  getAvailableTypesForDimension,
  getConfigStoreKey,
  getControlsComponentKey,
  getDimensionConstraints,
  getRecommendedDimension,
  getUnavailabilityReason,
  hasTimelineControls,
  isAvailableForDimension,
  isRaymarchingType,
  isValidObjectType,
} from './helpers'
