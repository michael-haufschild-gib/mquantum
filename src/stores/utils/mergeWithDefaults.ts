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

import {
  createDefaultBellPairConfig,
  sanitizeBellPairConfig,
} from '@/lib/geometry/extended/bellPair'
import {
  type DiracConfig,
  isDiracFieldView,
  isDiracInitialCondition,
  isDiracPotentialType,
  sanitizeDiracLatticeConfig,
} from '@/lib/geometry/extended/dirac'
import { createDefaultPauliConfig, type PauliConfig } from '@/lib/geometry/extended/pauli'
import { sanitizeQuantumWalkConfig } from '@/lib/geometry/extended/quantumWalk'
import { sanitizeHarmonicOscillatorScalars } from '@/lib/geometry/extended/schroedinger/configSanitization'
import {
  isTdseDensityView,
  isTdseDisorderDistribution,
  isTdseDriveWaveform,
  isTdseFieldView,
  isTdseInitialCondition,
  isTdsePotentialType,
  normalizeTdseBlackHoleParams,
} from '@/lib/geometry/extended/tdse'
import {
  createDefaultSchroedingerConfig,
  DEFAULT_SCHROEDINGER_CONFIG,
  RAYMARCH_QUALITY_TO_SAMPLES,
  SCHROEDINGER_QUALITY_PRESETS,
} from '@/lib/geometry/extended/types'
import {
  DEFAULT_WHEELER_DEWITT_CONFIG,
  type WdwSrmtClock,
} from '@/lib/geometry/extended/wheelerDeWitt'
import type { ObjectType } from '@/lib/geometry/types'
import { logger } from '@/lib/logger'
import { sanitizeOpenQuantumConfig } from '@/lib/physics/openQuantum/types'
import {
  isWdwBoundaryCondition,
  WDW_SOLVER_MAX_A_MAX,
  WDW_SOLVER_MAX_A_MIN,
  WDW_SOLVER_MAX_COSMOLOGICAL_CONSTANT,
  WDW_SOLVER_MAX_GRID_NA,
  WDW_SOLVER_MAX_GRID_NPHI,
  WDW_SOLVER_MAX_INFLATON_MASS,
  WDW_SOLVER_MAX_INFLATON_MASS_ASYMMETRY,
  WDW_SOLVER_MAX_PHI_EXTENT,
  WDW_SOLVER_MIN_A_MIN,
  WDW_SOLVER_MIN_A_SPAN,
  WDW_SOLVER_MIN_COSMOLOGICAL_CONSTANT,
  WDW_SOLVER_MIN_INFLATON_MASS,
  WDW_SOLVER_MIN_INFLATON_MASS_ASYMMETRY,
  WDW_SOLVER_MIN_PHI_EXTENT,
} from '@/lib/physics/wheelerDeWitt/solverInputValidation'

import { normalizeAntiDeSitterLoadedConfig } from './mergeWithDefaultsAntiDeSitter'
import { normalizeFreeScalarLoadedConfig } from './mergeWithDefaultsFreeScalar'
import { normalizePauliLoadedConfig } from './mergeWithDefaultsPauli'
import { normalizeSchroedingerNumericScalars } from './mergeWithDefaultsSchroedingerScalars'
import { OBJECT_TYPE_TO_CONFIG_KEY } from './presetSerialization'

/**
 * Mapping from config key to its default config.
 */
const CONFIG_KEY_TO_DEFAULT: Record<string, () => object> = {
  schroedinger: createDefaultSchroedingerConfig,
  pauliSpinor: createDefaultPauliConfig,
  bellPair: createDefaultBellPairConfig,
}

function hasRecordKey<T extends object>(record: T, value: unknown): value is keyof T {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(record, value)
}

const NUMERIC_ARRAY_FIELDS = new Set([
  'angularChain',
  'center',
  'compactRadii',
  'crossSectionPlaneNormal',
  'extraDimOmega',
  'extraDimQuantumNumbers',
  'fieldDirection',
  'gridSize',
  'initialPosition',
  'initialSpinDirection',
  'modeK',
  'packetCenter',
  'packetMomentum',
  'parameterValues',
  'particleColor',
  'spacing',
  'spinDirection',
  'spinDownColor',
  'spinUpColor',
  'slicePositions',
  'trapAnisotropy',
  'visualizationAxes',
  'vortexPlane1',
  'vortexPlane2',
  'a',
  'b',
  'c',
  'd',
])

const BOOLEAN_ARRAY_FIELDS = new Set(['compactDims'])

// `gridSize`, `spacing`, and `initialPosition` are intentionally excluded.
// Their downstream sanitizer (`sanitizeQuantumWalkConfig` and the
// `LATTICE_SIZED_ARRAY_FIELDS` reshape) fixes non-finite entries per index,
// preserving the user's other valid values. Enforcing finite at the merge
// gate would reject the whole array and erase those values along with the
// bad one — see the "sanitizes loaded quantumWalk grids" test.
const FINITE_NUMERIC_ARRAY_FIELDS = new Set([
  'angularChain',
  'center',
  'crossSectionPlaneNormal',
  'extraDimOmega',
  'extraDimQuantumNumbers',
  'fieldDirection',
  'modeK',
  'packetCenter',
  'initialSpinDirection',
  'parameterValues',
  'particleColor',
  'spinDirection',
  'spinDownColor',
  'spinUpColor',
  'visualizationAxes',
  'vortexPlane1',
  'vortexPlane2',
  'a',
  'b',
  'c',
  'd',
])

function matchesNumericArrayElement(value: unknown, key: string): boolean {
  if (typeof value !== 'number') return false
  return !FINITE_NUMERIC_ARRAY_FIELDS.has(key) || Number.isFinite(value)
}

function arrayElementsMatchFieldContract(
  loadedVal: unknown[],
  defaultVal: unknown,
  key: string
): boolean {
  if (NUMERIC_ARRAY_FIELDS.has(key)) {
    return loadedVal.every((value) => matchesNumericArrayElement(value, key))
  }
  if (BOOLEAN_ARRAY_FIELDS.has(key)) {
    return loadedVal.every((value) => typeof value === 'boolean')
  }
  if (!Array.isArray(defaultVal) || defaultVal.length === 0) return true

  const exemplar = defaultVal.find((value) => value !== undefined)
  if (typeof exemplar === 'number') {
    return loadedVal.every((value) => matchesNumericArrayElement(value, key))
  }
  if (typeof exemplar === 'boolean') {
    return loadedVal.every((value) => typeof value === 'boolean')
  }
  if (typeof exemplar === 'string') {
    return loadedVal.every((value) => typeof value === 'string')
  }
  return true
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
  defaultIsArray: boolean,
  key: string
): boolean {
  // Loaded array where default is a plain object: type mismatch.
  if (defaultIsObject) return false
  // Fixed-size default array whose length doesn't match: reject.
  if (!defaultIsArray) return true
  const defaultArr = defaultVal as unknown[]
  if (defaultArr.length !== 0 && loadedVal.length !== defaultArr.length) return false
  return arrayElementsMatchFieldContract(loadedVal, defaultVal, key)
}

/** Resolve a single key during deep-merge, returning the value to set or `undefined` to skip. */
function resolveMergeKey(
  key: string,
  loadedVal: unknown,
  defaultVal: unknown,
  defaultIsObject: boolean,
  defaultIsArray: boolean
): unknown | undefined {
  // Null loaded where default is a structured type: keep default.
  if (loadedVal === null && (defaultIsObject || defaultIsArray)) return undefined

  if (Array.isArray(loadedVal)) {
    return shouldAcceptLoadedArray(loadedVal, defaultVal, defaultIsObject, defaultIsArray, key)
      ? loadedVal
      : undefined
  }

  // Default is array but loaded is not: type mismatch.
  if (defaultIsArray) return undefined

  // Both are plain objects: recurse.
  if (loadedVal !== null && typeof loadedVal === 'object' && defaultIsObject) {
    return deepMerge(defaultVal as object, loadedVal)
  }

  // Primitives: only accept when types match.
  if (!defaultIsObject && typeof loadedVal === typeof defaultVal) return loadedVal
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

    const resolved = resolveMergeKey(key, loadedVal, defaultVal, defaultIsObject, defaultIsArray)
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
  const bh = normalizeTdseBlackHoleParams(tdseRecord)
  if (
    bh.bhMass !== tdseRecord.bhMass ||
    bh.bhSpin !== tdseRecord.bhSpin ||
    bh.bhMultipoleL !== tdseRecord.bhMultipoleL
  ) {
    return { ...normalized, tdse: { ...tdseRecord, ...bh } }
  }
  return normalized
}

function normalizeDiracEnums(normalized: Record<string, unknown>): Record<string, unknown> {
  const dirac = normalized.dirac
  if (!dirac || typeof dirac !== 'object' || Array.isArray(dirac)) return normalized

  const diracRecord = dirac as Record<string, unknown>
  const defaults = DEFAULT_SCHROEDINGER_CONFIG.dirac
  let next = diracRecord

  if (!isDiracPotentialType(diracRecord.potentialType)) {
    next = next === diracRecord ? { ...diracRecord } : next
    next.potentialType = defaults.potentialType
  }
  if (!isDiracInitialCondition(diracRecord.initialCondition)) {
    next = next === diracRecord ? { ...diracRecord } : next
    next.initialCondition = defaults.initialCondition
  }
  if (!isDiracFieldView(diracRecord.fieldView)) {
    next = next === diracRecord ? { ...diracRecord } : next
    next.fieldView = defaults.fieldView
  }

  const sanitized = sanitizeDiracLatticeConfig(next as unknown as DiracConfig)
  if (sanitized !== (next as unknown)) next = sanitized as unknown as Record<string, unknown>

  return next === diracRecord ? normalized : { ...normalized, dirac: next }
}

interface EnumFieldRule {
  field: string
  isValid: (value: unknown) => boolean
}

const TDSE_ENUM_FIELD_RULES: readonly EnumFieldRule[] = [
  { field: 'potentialType', isValid: isTdsePotentialType },
  { field: 'initialCondition', isValid: isTdseInitialCondition },
  { field: 'fieldView', isValid: isTdseFieldView },
  { field: 'driveWaveform', isValid: isTdseDriveWaveform },
  { field: 'disorderDistribution', isValid: isTdseDisorderDistribution },
  { field: 'densityView', isValid: isTdseDensityView },
] as const
const WDW_SRMT_CLOCK_SET = new Set<WdwSrmtClock>(['a', 'phi1', 'phi2'])

function normalizeEnumFields(
  record: Record<string, unknown>,
  defaults: Record<string, unknown>,
  rules: readonly EnumFieldRule[]
): Record<string, unknown> {
  let next = record
  for (const { field, isValid } of rules) {
    if (isValid(record[field])) continue
    next = next === record ? { ...record } : next
    next[field] = defaults[field]
  }
  return next
}

function normalizeTdseEnums(normalized: Record<string, unknown>): Record<string, unknown> {
  const tdse = normalized.tdse
  if (!tdse || typeof tdse !== 'object' || Array.isArray(tdse)) return normalized

  const tdseRecord = tdse as Record<string, unknown>
  const defaults = DEFAULT_SCHROEDINGER_CONFIG.tdse as unknown as Record<string, unknown>
  const next = normalizeEnumFields(tdseRecord, defaults, TDSE_ENUM_FIELD_RULES)

  return next === tdseRecord ? normalized : { ...normalized, tdse: next }
}

function isWdwSrmtClock(value: unknown): value is WdwSrmtClock {
  return typeof value === 'string' && WDW_SRMT_CLOCK_SET.has(value as WdwSrmtClock)
}

function clampFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

function clampFiniteInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

function normalizeWheelerDeWittConfig(
  normalized: Record<string, unknown>
): Record<string, unknown> {
  const wdw = normalized.wheelerDeWitt
  if (!wdw || typeof wdw !== 'object' || Array.isArray(wdw)) return normalized

  const current = wdw as Record<string, unknown>
  const defaults = DEFAULT_WHEELER_DEWITT_CONFIG
  let aMin = clampFiniteNumber(
    current.aMin,
    defaults.aMin,
    WDW_SOLVER_MIN_A_MIN,
    WDW_SOLVER_MAX_A_MIN
  )
  let aMax = clampFiniteNumber(
    current.aMax,
    defaults.aMax,
    WDW_SOLVER_MIN_A_MIN + WDW_SOLVER_MIN_A_SPAN,
    WDW_SOLVER_MAX_A_MAX
  )
  if (!(aMax > aMin)) {
    aMin = defaults.aMin
    aMax = defaults.aMax
  }

  return {
    ...normalized,
    wheelerDeWitt: {
      ...current,
      boundaryCondition: isWdwBoundaryCondition(current.boundaryCondition)
        ? current.boundaryCondition
        : defaults.boundaryCondition,
      inflatonMass: clampFiniteNumber(
        current.inflatonMass,
        defaults.inflatonMass,
        WDW_SOLVER_MIN_INFLATON_MASS,
        WDW_SOLVER_MAX_INFLATON_MASS
      ),
      inflatonMassAsymmetry: clampFiniteNumber(
        current.inflatonMassAsymmetry,
        defaults.inflatonMassAsymmetry,
        WDW_SOLVER_MIN_INFLATON_MASS_ASYMMETRY,
        WDW_SOLVER_MAX_INFLATON_MASS_ASYMMETRY
      ),
      cosmologicalConstant: clampFiniteNumber(
        current.cosmologicalConstant,
        defaults.cosmologicalConstant,
        WDW_SOLVER_MIN_COSMOLOGICAL_CONSTANT,
        WDW_SOLVER_MAX_COSMOLOGICAL_CONSTANT
      ),
      aMin,
      aMax,
      gridNa: clampFiniteInteger(current.gridNa, defaults.gridNa, 16, WDW_SOLVER_MAX_GRID_NA),
      gridNphi: clampFiniteInteger(
        current.gridNphi,
        defaults.gridNphi,
        8,
        WDW_SOLVER_MAX_GRID_NPHI
      ),
      phiExtent: clampFiniteNumber(
        current.phiExtent,
        defaults.phiExtent,
        WDW_SOLVER_MIN_PHI_EXTENT,
        WDW_SOLVER_MAX_PHI_EXTENT
      ),
      streamlineDensity: clampFiniteInteger(
        current.streamlineDensity,
        defaults.streamlineDensity,
        2,
        16
      ),
      phaseRotationSpeed: clampFiniteNumber(
        current.phaseRotationSpeed,
        defaults.phaseRotationSpeed,
        0,
        5
      ),
      worldlineSpeed: clampFiniteNumber(current.worldlineSpeed, defaults.worldlineSpeed, 0.1, 3),
      worldlinePulseWidth: clampFiniteNumber(
        current.worldlinePulseWidth,
        defaults.worldlinePulseWidth,
        0.02,
        0.3
      ),
      renderDynamicRange: clampFiniteNumber(
        current.renderDynamicRange,
        defaults.renderDynamicRange,
        1,
        10_000
      ),
      srmtClock: isWdwSrmtClock(current.srmtClock) ? current.srmtClock : defaults.srmtClock,
      srmtCutNormalized: clampFiniteNumber(
        current.srmtCutNormalized,
        defaults.srmtCutNormalized,
        0.1,
        0.9
      ),
      srmtRankCap: clampFiniteInteger(current.srmtRankCap, defaults.srmtRankCap, 8, 256),
      srmtHeatmapIntensity: clampFiniteNumber(
        current.srmtHeatmapIntensity,
        defaults.srmtHeatmapIntensity,
        0,
        1
      ),
    },
  }
}

function normalizeSchroedingerQualityEnums(
  normalized: Record<string, unknown>
): Record<string, unknown> {
  let next = normalized
  if (!hasRecordKey(SCHROEDINGER_QUALITY_PRESETS, normalized.qualityPreset)) {
    next = next === normalized ? { ...normalized } : next
    next.qualityPreset = DEFAULT_SCHROEDINGER_CONFIG.qualityPreset
  }
  if (!hasRecordKey(RAYMARCH_QUALITY_TO_SAMPLES, normalized.raymarchQuality)) {
    next = next === normalized ? { ...normalized } : next
    next.raymarchQuality = DEFAULT_SCHROEDINGER_CONFIG.raymarchQuality
  }
  return next
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
  normalized = normalizeSchroedingerQualityEnums(normalized)
  normalized = sanitizeHarmonicOscillatorScalars(normalized, DEFAULT_SCHROEDINGER_CONFIG)
  normalized = normalizeSchroedingerNumericScalars(normalized)
  normalized = sanitizeComputeLatticeDims(normalized)
  normalized = normalizeDiracEnums(normalized)

  const qw = normalized.quantumWalk
  if (qw && typeof qw === 'object' && !Array.isArray(qw)) {
    normalized = {
      ...normalized,
      quantumWalk: sanitizeQuantumWalkConfig(qw as typeof DEFAULT_SCHROEDINGER_CONFIG.quantumWalk),
    }
  }

  // Enforce the ℓ ≥ s physical invariant on TDSE black-hole parameters for
  // legacy scenes. The BH setters promote ℓ whenever the user raises s, but
  // scene loading writes `tdse` directly via setState and bypasses the setter
  // path — so a pre-constraint scene with (bhSpin=2, bhMultipoleL=0) would slip
  // through. Clamp here so the invariant always holds in memory.
  normalized = normalizeTdseBhParams(normalized)
  normalized = normalizeTdseEnums(normalized)
  normalized = normalizeAntiDeSitterLoadedConfig(normalized)
  normalized = normalizeWheelerDeWittConfig(normalized)
  normalized = {
    ...normalized,
    openQuantum: sanitizeOpenQuantumConfig(normalized.openQuantum),
  }
  normalized = normalizeSchroedingerSurfaceMode(normalized)

  normalized = normalizeFreeScalarLoadedConfig(normalized)

  return normalized as T
}

function normalizeSchroedingerSurfaceMode(
  normalized: Record<string, unknown>
): Record<string, unknown> {
  if (normalized.isoEnabled !== true) return normalized

  const surfaceSupported = normalized.representation !== 'wigner'

  return surfaceSupported ? normalized : { ...normalized, isoEnabled: false }
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

  const defaultConfigFactory = CONFIG_KEY_TO_DEFAULT[configKey]
  if (!defaultConfigFactory) {
    logger.warn(`No default config found for key: ${configKey}`)
    return {}
  }
  const defaultConfig = defaultConfigFactory()

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
      : configKey === 'pauliSpinor'
        ? normalizePauliLoadedConfig(mergedConfig as unknown as PauliConfig, migratedLoadedConfig)
        : configKey === 'bellPair'
          ? sanitizeBellPairConfig(mergedConfig)
          : mergedConfig

  return {
    [configKey]: normalizedConfig,
  }
}
