/**
 * Object Type Registry - Helper Functions
 *
 * Helper functions that provide O(1) lookups derived from
 * {@link QUANTUM_TYPE_REGISTRY}. There is no separate ObjectType registry —
 * the per-ObjectType envelope (name, description, dimension union, render
 * method, etc.) is computed from the flat quantum-type registry below.
 *
 * @see src/lib/geometry/registry/quantumTypes.ts for the underlying data
 */

import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/common'

import type { ObjectType } from '../types'
import { QUANTUM_TYPE_REGISTRY } from './quantumTypes'
import type {
  AvailableQuantumTypeInfo,
  AvailableTypeInfo,
  DimensionConstraints,
  QuantumTypeCompileContextField,
  QuantumTypeEntry,
  QuantumTypeEvolutionResetKind,
  QuantumTypeKey,
  QuantumTypeRuntimeMetadata,
  QuantumTypeStrategyKind,
} from './types'

/** Inputs for checking whether the surface-mode toggle can affect rendering. */
export interface SchroedingerSurfaceModeSupportOptions {
  objectType: ObjectType
  quantumMode?: SchroedingerQuantumMode
  dimension: number
  representation?: 'position' | 'momentum' | 'wigner'
}

// ============================================================================
// Curated Per-ObjectType Display Strings
// ============================================================================

/**
 * Display strings and recommended dimensions per ObjectType.
 *
 * The flat {@link QUANTUM_TYPE_REGISTRY} has per-mode display strings; an
 * ObjectType wraps potentially many modes (`schroedinger` wraps ten different
 * quantum modes), so the per-ObjectType label/description and recommended
 * default cannot be aggregated unambiguously and are curated here instead.
 *
 * `recommended` represents the typical default dimension for that ObjectType
 * — `schroedinger=4` (rich quantum interference patterns with good
 * performance, matches harmonicOscillator's default), `pauliSpinor=3`
 * (intuitive spin dynamics in physical 3-space).
 */
const OBJECT_TYPE_DISPLAY: Readonly<
  Record<
    ObjectType,
    {
      readonly name: string
      readonly description: string
      readonly recommended: number
      readonly recommendedReason: string
    }
  >
> = {
  schroedinger: {
    name: 'Schrödinger Slices',
    description: 'Organic volumes from an N-dimensional wavefunction.',
    recommended: 4,
    recommendedReason: '4D provides rich quantum interference patterns with good performance',
  },
  pauliSpinor: {
    name: 'Pauli Spinor',
    description:
      'Two-component spinor wavefunction in a magnetic field. Visualizes spin precession and Stern-Gerlach splitting.',
    recommended: 3,
    recommendedReason: '3D provides intuitive spin dynamics with magnetic field in physical space',
  },
  bellPair: {
    name: 'Bell Pair',
    description:
      'Two-qubit entangled spin state. Drives the CHSH / Bell experiment with live S(N) plot crossing the classical bound toward Tsirelson.',
    recommended: 3,
    recommendedReason: 'CHSH lives in the spin sector; the canvas only needs 3D for the apparatus.',
  },
}

/** All ObjectType values that have at least one entry in QUANTUM_TYPE_REGISTRY. */
const VALID_OBJECT_TYPES: ReadonlySet<ObjectType> = (() => {
  const out = new Set<ObjectType>()
  for (const [, entry] of QUANTUM_TYPE_REGISTRY) {
    out.add(entry.internal.objectType)
  }
  return out
})()

/**
 * Aggregate the dimension envelope for an ObjectType across every
 * QUANTUM_TYPE_REGISTRY entry whose `internal.objectType` matches.
 *
 * `min` is the tightest lower bound any wrapped mode supports; `max` is the
 * loosest upper bound. The result is the union of all wrapped modes' ranges
 * — i.e. the set of dimensions for which AT LEAST ONE wrapped mode renders.
 */
function aggregateDimensions(type: ObjectType): DimensionConstraints | undefined {
  let min = Infinity
  let max = -Infinity
  let found = false
  for (const [, entry] of QUANTUM_TYPE_REGISTRY) {
    if (entry.internal.objectType !== type) continue
    if (entry.dimensions.min < min) min = entry.dimensions.min
    if (entry.dimensions.max > max) max = entry.dimensions.max
    found = true
  }
  if (!found) return undefined
  const display = OBJECT_TYPE_DISPLAY[type]
  return {
    min,
    max,
    recommended: display?.recommended,
    recommendedReason: display?.recommendedReason,
  }
}

/** Return the first QUANTUM_TYPE_REGISTRY entry whose internal.objectType matches. */
function firstEntryFor(type: ObjectType): QuantumTypeEntry | undefined {
  for (const [, entry] of QUANTUM_TYPE_REGISTRY) {
    if (entry.internal.objectType === type) return entry
  }
  return undefined
}

// ============================================================================
// Rendering Capability Helpers
// ============================================================================

/**
 * Checks if an object type uses raymarching.
 *
 * @param type - The object type
 * @returns true if any wrapped quantum mode uses raymarching
 */
export function isRaymarchingType(type: ObjectType): boolean {
  for (const [, entry] of QUANTUM_TYPE_REGISTRY) {
    if (entry.internal.objectType !== type) continue
    if (entry.rendering.renderMethod === 'raymarch') return true
  }
  return false
}

// ============================================================================
// Dimension Constraint Helpers
// ============================================================================

/**
 * Gets dimension constraints for an object type, computed as the union of
 * all wrapped quantum modes' dimension ranges.
 *
 * @param type - The object type
 * @returns The dimension constraints, or undefined if the ObjectType has no
 *   QUANTUM_TYPE_REGISTRY entries
 */
export function getDimensionConstraints(type: ObjectType): DimensionConstraints | undefined {
  return aggregateDimensions(type)
}

/**
 * Gets the recommended dimension for an object type.
 *
 * @param type - The object type
 * @returns The curated recommended dimension, or undefined when unknown
 */
export function getRecommendedDimension(type: ObjectType): number | undefined {
  return OBJECT_TYPE_DISPLAY[type]?.recommended
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
 * Gets all available object types for a dimension. Iteration order matches
 * the QUANTUM_TYPE_REGISTRY insertion order — Schrödinger modes appear before
 * the Pauli Spinor entry, so the resulting list is `[schroedinger, pauliSpinor]`.
 *
 * @param dimension - The current dimension
 * @returns Array of type info with availability status
 */
export function getAvailableTypesForDimension(dimension: number): AvailableTypeInfo[] {
  const seen = new Set<ObjectType>()
  const result: AvailableTypeInfo[] = []
  for (const [, entry] of QUANTUM_TYPE_REGISTRY) {
    const type = entry.internal.objectType
    if (seen.has(type)) continue
    seen.add(type)
    const display = OBJECT_TYPE_DISPLAY[type]
    if (!display) continue
    const available = isAvailableForDimension(type, dimension)
    result.push({
      type,
      name: display.name,
      description: display.description,
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
 * @returns The component key for dynamic loading, or undefined
 */
export function getControlsComponentKey(type: ObjectType): string | undefined {
  return firstEntryFor(type)?.ui.controlsComponentKey
}

/**
 * Checks if an object type has timeline controls. Returns true when ANY
 * wrapped quantum mode opts into the TimelineControls drawer.
 *
 * @param type - The object type
 * @returns true if the type shows in TimelineControls animation drawer
 */
export function hasTimelineControls(type: ObjectType): boolean {
  for (const [, entry] of QUANTUM_TYPE_REGISTRY) {
    if (entry.internal.objectType !== type) continue
    if (entry.ui.hasTimelineControls) return true
  }
  return false
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
  return VALID_OBJECT_TYPES.has(type as ObjectType)
}

// ============================================================================
// Store Config Helpers
// ============================================================================

/**
 * Gets the config store key for an object type.
 *
 * Every QUANTUM_TYPE_REGISTRY entry asserts `internal.configStoreKey ===
 * internal.objectType` (validated by registry tests), so the ObjectType
 * itself doubles as the store key.
 *
 * @param type - The object type
 * @returns The key used in extendedObjectStore (e.g., 'schroedinger')
 */
export function getConfigStoreKey(type: ObjectType): string | undefined {
  if (!VALID_OBJECT_TYPES.has(type)) return undefined
  return type
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

/** Gets the store-side evolution reset behavior for a quantum type. */
export function getQuantumTypeEvolutionResetKind(
  key: QuantumTypeKey
): QuantumTypeEvolutionResetKind | undefined {
  return getQuantumTypeRuntime(key)?.evolutionReset
}

/** Gets the mode-specific sub-config key used under `schroedinger`, if any. */
export function getQuantumTypeConfigSubKey(key: QuantumTypeKey): string | undefined {
  return QUANTUM_TYPE_REGISTRY.get(key)?.internal.configSubKey
}

/** Gets the fallback color algorithm for a quantum type. */
export function getQuantumTypeDefaultColorAlgorithm(key: QuantumTypeKey): string | undefined {
  return getQuantumTypeRuntime(key)?.defaultColorAlgorithm
}

/** Checks if the type belongs to the hydrogen analytic shader family. */
export function isHydrogenFamilyQuantumType(key: QuantumTypeKey): boolean {
  return getQuantumTypeRuntime(key)?.analyticFamily === 'hydrogen'
}

/** Checks if a quantum type supports open-quantum density-matrix evolution. */
export function supportsOpenQuantumForQuantumType(key: QuantumTypeKey): boolean {
  return getQuantumTypeRuntime(key)?.supportsOpenQuantum === true
}

/** Gets compile-time selector fields required by this quantum type. */
export function getQuantumTypeCompileContextFields(
  key: QuantumTypeKey
): readonly QuantumTypeCompileContextField[] {
  return getQuantumTypeRuntime(key)?.compileContextFields ?? []
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
  if (objectType === 'pauliSpinor') {
    return QUANTUM_TYPE_REGISTRY.has('pauliSpinor') ? 'pauliSpinor' : undefined
  }
  if (objectType === 'bellPair') {
    return QUANTUM_TYPE_REGISTRY.has('bellTest') ? 'bellTest' : undefined
  }
  if (objectType === 'schroedinger' && quantumMode) {
    const entry = QUANTUM_TYPE_REGISTRY.get(quantumMode)
    return entry?.internal.objectType === 'schroedinger' &&
      entry.internal.quantumMode === quantumMode
      ? quantumMode
      : undefined
  }
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
 * Returns whether the Schrödinger surface-mode toggle is meaningful.
 *
 * Both analytic modes (inline wavefunction evaluation) and compute modes
 * (density-grid sampling via `useDensityGrid=true`) support isosurface
 * rendering. The isosurface shader has full density-grid code paths
 * (see `isosurfaceSampling.ts`). Wigner representation is excluded
 * (2D phase-space, no 3D surface).
 */
export function supportsSchroedingerSurfaceMode(
  options: SchroedingerSurfaceModeSupportOptions
): boolean {
  if (options.objectType !== 'schroedinger' && options.objectType !== 'pauliSpinor') return false
  if (options.dimension < 2) return false
  if (options.representation === 'wigner') return false

  return true
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
