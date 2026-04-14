/**
 * Utility for merging loaded state with defaults.
 *
 * When loading saved scenes from localStorage, old scenes may be missing
 * newly added parameters. This utility ensures that missing parameters
 * automatically get their default values while preserving saved values.
 *
 * This provides forward-compatibility: when new parameters are added to
 * any config, old saved scenes will automatically work by using defaults
 * for the missing parameters.
 */

import { DEFAULT_PREHEATING_CONFIG } from '@/lib/geometry/extended/freeScalar'
import {
  DEFAULT_PAULI_CONFIG,
  DEFAULT_SCHROEDINGER_CONFIG,
  type FreeScalarConfig,
} from '@/lib/geometry/extended/types'
import type { ObjectType } from '@/lib/geometry/types'
import { logger } from '@/lib/logger'

import { reconcileCosmologyInvariants } from '../slices/geometry/setters/freeScalarCosmologySetters'
import { OBJECT_TYPE_TO_CONFIG_KEY } from './presetSerialization'

/**
 * Mapping from config key to its default config.
 */
const CONFIG_KEY_TO_DEFAULT: Record<string, object> = {
  schroedinger: DEFAULT_SCHROEDINGER_CONFIG,
  pauliSpinor: DEFAULT_PAULI_CONFIG,
}

/**
 * Deep merges loaded state with defaults.
 *
 * Merge semantics:
 * - Objects: recursively merged (loaded values override defaults)
 * - Arrays: replaced entirely (not concatenated)
 * - Primitives: loaded value overrides default
 * - Missing keys: get default value
 *
 * @param defaults - The default configuration object
 * @param loaded - The loaded state (may be partial or undefined)
 * @returns Merged object with all default keys present
 */
/**
 * Determines whether a loaded array value should replace the default.
 * Returns false (skip) when the default is a plain object (type mismatch)
 * or a fixed-size array whose length doesn't match.
 */
function shouldAcceptLoadedArray(
  loadedVal: unknown[],
  defaultVal: unknown,
  defaultIsObject: boolean,
  defaultIsArray: boolean
): boolean {
  // Loaded array where default is a plain object: type mismatch.
  if (defaultIsObject) return false
  // Fixed-size default array whose length doesn't match: reject.
  if (!defaultIsArray) return true
  const defaultArr = defaultVal as unknown[]
  return defaultArr.length === 0 || loadedVal.length === defaultArr.length
}

/** Resolve a single key during deep-merge, returning the value to set or `undefined` to skip. */
function resolveMergeKey(
  loadedVal: unknown,
  defaultVal: unknown,
  defaultIsObject: boolean,
  defaultIsArray: boolean
): unknown | undefined {
  // Null loaded where default is a structured type: keep default.
  if (loadedVal === null && (defaultIsObject || defaultIsArray)) return undefined

  if (Array.isArray(loadedVal)) {
    return shouldAcceptLoadedArray(loadedVal, defaultVal, defaultIsObject, defaultIsArray)
      ? loadedVal
      : undefined
  }

  // Default is array but loaded is not: type mismatch.
  if (defaultIsArray) return undefined

  // Both are plain objects: recurse.
  if (loadedVal !== null && typeof loadedVal === 'object' && defaultIsObject) {
    return deepMerge(defaultVal as object, loadedVal)
  }

  // Primitives: only accept when types match (prevents number replacing an expected object).
  if (!defaultIsObject || typeof loadedVal === typeof defaultVal) return loadedVal
  return undefined
}

function deepMerge<T extends object>(defaults: T, loaded: unknown): T {
  // If loaded is null/undefined/not-object/array, return copy of defaults
  if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
    return { ...defaults }
  }

  const result = { ...defaults } as T
  const loadedObj = loaded as Record<string, unknown>

  for (const key of Object.keys(loadedObj)) {
    if (!Object.prototype.hasOwnProperty.call(defaults, key)) continue

    const loadedVal = loadedObj[key]
    if (loadedVal === undefined) continue

    const defaultVal = (defaults as Record<string, unknown>)[key]
    const defaultIsObject =
      defaultVal !== null && typeof defaultVal === 'object' && !Array.isArray(defaultVal)
    const defaultIsArray = Array.isArray(defaultVal)

    const resolved = resolveMergeKey(loadedVal, defaultVal, defaultIsObject, defaultIsArray)
    if (resolved !== undefined) {
      ;(result as Record<string, unknown>)[key] = resolved
    }
  }

  return result
}

/**
 * Applies backwards-compatibility migrations for merged Schrödinger config.
 * @param merged
 */
function migrateLegacyShimmerFields<T>(loaded: T): T {
  if (!loaded || typeof loaded !== 'object') {
    return loaded
  }

  const loadedRecord = loaded as unknown as Record<string, unknown>
  let migrated = loadedRecord

  const hasBoundaryEnabled = Object.prototype.hasOwnProperty.call(
    loadedRecord,
    'uncertaintyBoundaryEnabled'
  )
  const hasBoundaryStrength = Object.prototype.hasOwnProperty.call(
    loadedRecord,
    'uncertaintyBoundaryStrength'
  )

  if (!hasBoundaryEnabled && typeof loadedRecord.shimmerEnabled === 'boolean') {
    migrated = { ...migrated, uncertaintyBoundaryEnabled: loadedRecord.shimmerEnabled }
  }
  if (!hasBoundaryStrength && typeof loadedRecord.shimmerStrength === 'number') {
    migrated = { ...migrated, uncertaintyBoundaryStrength: loadedRecord.shimmerStrength }
  }

  return migrated as T
}

function normalizeTdseBhParams(normalized: Record<string, unknown>): Record<string, unknown> {
  const tdse = normalized.tdse
  if (!tdse || typeof tdse !== 'object') return normalized
  const tdseRecord = tdse as Record<string, unknown>
  // Replace NaN / non-finite BH params with safe defaults before clamping.
  // `typeof NaN === 'number'` is true, so a corrupted scene could sneak
  // NaN through a bare `typeof` guard. Default to the canonical TDSE
  // defaults (bhMass=1, bhSpin=2, bhMultipoleL=2).
  const rawMass = tdseRecord.bhMass
  if (typeof rawMass === 'number' && !Number.isFinite(rawMass)) {
    tdseRecord.bhMass = 1.0
  }
  const rawSpin = tdseRecord.bhSpin
  const rawEll = tdseRecord.bhMultipoleL
  const spinNum = typeof rawSpin === 'number' && Number.isFinite(rawSpin) ? rawSpin : 2
  const ellNum = typeof rawEll === 'number' && Number.isFinite(rawEll) ? rawEll : 2
  const spin = Math.max(0, Math.min(2, Math.floor(spinNum)))
  const ell = Math.max(spin, Math.min(6, Math.floor(ellNum)))
  if (spin !== rawSpin || ell !== rawEll) {
    return { ...normalized, tdse: { ...tdseRecord, bhSpin: spin, bhMultipoleL: ell } }
  }
  return normalized
}

/**
 * Reconcile `latticeDim` with the authoritative `gridSize.length` in each
 * compute-mode sub-config. `reshapeSchroedingerDefaultsForLoadedLattice` only
 * corrects the default side when the loaded `latticeDim` is a valid integer
 * in [1, 11]. If the loaded value is out of range, non-integer, non-number,
 * or non-finite, the reshape step skips and `deepMerge`'s length-equality guard
 * keeps the default-length arrays while the `latticeDim` primitive is
 * preserved from the loaded config — leaving an inconsistent (latticeDim,
 * gridSize) pair. Here we snap `latticeDim` back to `gridSize.length` so the
 * merged state is always self-consistent.
 */
function sanitizeComputeLatticeDims(normalized: Record<string, unknown>): Record<string, unknown> {
  let out = normalized
  let cloned = false
  for (const subKey of LATTICE_SIZED_SUB_CONFIGS) {
    const sub = out[subKey]
    if (!sub || typeof sub !== 'object' || Array.isArray(sub)) continue
    const subRec = sub as Record<string, unknown>
    const gridSize = subRec.gridSize
    if (!Array.isArray(gridSize)) continue
    const authoritative = gridSize.length
    const current = subRec.latticeDim
    const valid =
      typeof current === 'number' &&
      Number.isFinite(current) &&
      Number.isInteger(current) &&
      current === authoritative
    if (valid) continue
    if (!cloned) {
      out = { ...normalized }
      cloned = true
    }
    out[subKey] = { ...subRec, latticeDim: authoritative }
  }
  return out
}

function normalizeSchroedingerConfig<T extends { quantumMode?: unknown }>(merged: T): T {
  let normalized = merged as unknown as Record<string, unknown>
  if (normalized.quantumMode === 'hydrogenOrbital') {
    normalized = { ...normalized, quantumMode: 'hydrogenND' }
  }
  normalized = sanitizeComputeLatticeDims(normalized)

  // Enforce the ℓ ≥ s physical invariant on TDSE black-hole parameters for
  // legacy scenes. The BH setters promote ℓ whenever the user raises s, but
  // scene loading writes `tdse` directly via setState and bypasses the setter
  // path — so a pre-constraint scene with (bhSpin=2, bhMultipoleL=0) would slip
  // through. Clamp here so the invariant always holds in memory.
  normalized = normalizeTdseBhParams(normalized)

  // Reconcile cosmology invariants for the freeScalar sub-config. A scene
  // saved at one grid (e.g. 32³ at d=3, large safe η₀) loaded onto a smaller
  // grid (e.g. 8⁶ at d=6, smaller safe η₀) will have an `eta0` that the
  // user-facing setters would have clamped — but the loader path bypasses
  // those setters via direct `setState`. Without this normalisation step,
  // the next vacuumNoise reset would feed an out-of-range `eta0` into
  // `sampleAdiabaticVacuum` and either throw or fall back silently.
  //
  // Also back-fill the `preheating` sub-config from its default whenever a
  // scene saved before the parametric-resonance feature shipped is loaded.
  // The GPU pass reads `config.preheating.enabled` every substep, so an
  // undefined value would crash the leapfrog loop on the first frame.
  const fs = normalized.freeScalar
  if (fs && typeof fs === 'object') {
    const fsRecord = fs as Record<string, unknown>
    if (!fsRecord.preheating || typeof fsRecord.preheating !== 'object') {
      normalized = {
        ...normalized,
        freeScalar: { ...fsRecord, preheating: { ...DEFAULT_PREHEATING_CONFIG } },
      }
    }
    const reconciled = reconcileCosmologyInvariants(
      (normalized.freeScalar as FreeScalarConfig) ?? (fs as FreeScalarConfig)
    )
    if (Object.keys(reconciled).length > 0) {
      normalized = {
        ...normalized,
        freeScalar: { ...(normalized.freeScalar as object), ...reconciled },
      }
    }
  }

  return normalized as T
}

/**
 * Compute-mode sub-configs that size `gridSize`, `spacing`, `initialPosition`
 * to `latticeDim`. The default constants below declare fixed-length arrays
 * (e.g. length 2 for `quantumWalk`, length 3 for the others), so `deepMerge`'s
 * length-equality guard silently discards loaded arrays whose length doesn't
 * match the default — leaving the sub-config with `latticeDim: N` but
 * companion arrays of the default length, which produces wrong strides and
 * a black render. We reshape the defaults to the loaded `latticeDim` before
 * merging so the loaded arrays are accepted verbatim.
 */
const LATTICE_SIZED_SUB_CONFIGS = ['quantumWalk', 'tdse', 'bec', 'dirac', 'freeScalar'] as const
const LATTICE_SIZED_ARRAY_FIELDS = ['gridSize', 'spacing', 'initialPosition'] as const

function reshapeArrayToLength(arr: unknown[], targetLen: number): unknown[] {
  if (arr.length === targetLen) return arr
  const fill = arr.length > 0 ? arr[arr.length - 1] : 0
  return Array.from({ length: targetLen }, (_, i) => (i < arr.length ? arr[i] : fill))
}

function reshapeSubConfigDefaults(
  defaultSub: Record<string, unknown>,
  loadedLatticeDim: number
): Record<string, unknown> {
  let reshaped = defaultSub
  let changed = false
  for (const key of LATTICE_SIZED_ARRAY_FIELDS) {
    const arr = defaultSub[key]
    if (Array.isArray(arr) && arr.length !== loadedLatticeDim) {
      if (!changed) reshaped = { ...defaultSub }
      reshaped[key] = reshapeArrayToLength(arr, loadedLatticeDim)
      changed = true
    }
  }
  const slicePositions = defaultSub.slicePositions
  if (Array.isArray(slicePositions)) {
    const targetLen = Math.max(0, loadedLatticeDim - 3)
    if (slicePositions.length !== targetLen) {
      if (!changed) reshaped = { ...defaultSub }
      reshaped.slicePositions = Array.from({ length: targetLen }, (_, i) =>
        i < slicePositions.length ? slicePositions[i] : 0
      )
    }
  }
  return reshaped
}

/**
 * Rewrite the lattice-sized array fields inside compute-mode sub-configs
 * (quantumWalk, tdse, bec, dirac, freeScalar) so their length matches the
 * loaded `latticeDim`. Applied to the default config before merging —
 * afterwards deepMerge's length-equality guard no longer rejects the loaded
 * arrays. Leaves sub-configs untouched when the loader didn't declare
 * `latticeDim` or declared an out-of-range value.
 */
function reshapeSchroedingerDefaultsForLoadedLattice(
  defaultConfig: Record<string, unknown>,
  loaded: unknown
): Record<string, unknown> {
  if (!loaded || typeof loaded !== 'object') return defaultConfig
  const loadedRec = loaded as Record<string, unknown>
  let result = defaultConfig
  let cloned = false
  for (const subKey of LATTICE_SIZED_SUB_CONFIGS) {
    const loadedSub = loadedRec[subKey]
    if (!loadedSub || typeof loadedSub !== 'object' || Array.isArray(loadedSub)) continue
    const loadedLatticeDim = (loadedSub as Record<string, unknown>).latticeDim
    if (
      typeof loadedLatticeDim !== 'number' ||
      !Number.isInteger(loadedLatticeDim) ||
      loadedLatticeDim < 1 ||
      loadedLatticeDim > 11
    ) {
      continue
    }
    const defaultSub = result[subKey]
    if (!defaultSub || typeof defaultSub !== 'object' || Array.isArray(defaultSub)) continue
    const reshapedSub = reshapeSubConfigDefaults(
      defaultSub as Record<string, unknown>,
      Math.floor(loadedLatticeDim)
    )
    if (reshapedSub !== defaultSub) {
      if (!cloned) {
        result = { ...defaultConfig }
        cloned = true
      }
      result[subKey] = reshapedSub
    }
  }
  return result
}

/**
 * Merges loaded extended object state for a specific object type only.
 *
 * This is the preferred function for scene loading. It:
 * 1. Only updates the config for the loaded object type
 * 2. Merges with defaults to handle newly added parameters
 * 3. Does NOT touch configs for other object types
 *
 * @param loaded - The loaded extended object state from a saved scene (typically only contains one config)
 * @param objectType - The object type being loaded
 * @returns Partial state update containing only the relevant config
 */
export function mergeExtendedObjectStateForType(
  loaded: Record<string, unknown>,
  objectType: ObjectType
): Record<string, unknown> {
  const configKey = OBJECT_TYPE_TO_CONFIG_KEY[objectType]
  if (!configKey) {
    logger.warn(`Unknown object type for extended config merge: ${objectType}`)
    return {}
  }

  const defaultConfig = CONFIG_KEY_TO_DEFAULT[configKey]
  if (!defaultConfig) {
    logger.warn(`No default config found for key: ${configKey}`)
    return {}
  }

  // Guard: loaded may be null/undefined/non-object from corrupted or stale presets
  if (loaded == null || typeof loaded !== 'object') {
    return { [configKey]: { ...defaultConfig } }
  }

  const loadedConfig = loaded[configKey]

  // Return only the merged config for this object type
  // This ensures we don't overwrite other object type configs
  const migratedLoadedConfig =
    configKey === 'schroedinger' ? migrateLegacyShimmerFields(loadedConfig) : loadedConfig
  const effectiveDefault =
    configKey === 'schroedinger'
      ? reshapeSchroedingerDefaultsForLoadedLattice(
          defaultConfig as Record<string, unknown>,
          migratedLoadedConfig
        )
      : (defaultConfig as Record<string, unknown>)
  const mergedConfig = deepMerge(effectiveDefault, migratedLoadedConfig)
  const normalizedConfig =
    configKey === 'schroedinger'
      ? normalizeSchroedingerConfig(mergedConfig as unknown as typeof DEFAULT_SCHROEDINGER_CONFIG)
      : mergedConfig

  return {
    [configKey]: normalizedConfig,
  }
}
