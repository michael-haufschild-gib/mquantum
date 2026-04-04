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

import { DEFAULT_PAULI_CONFIG, DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/types'
import type { ObjectType } from '@/lib/geometry/types'
import { logger } from '@/lib/logger'

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

function normalizeSchroedingerConfig<T extends { quantumMode?: unknown }>(merged: T): T {
  let normalized = merged as unknown as Record<string, unknown>
  if (normalized.quantumMode === 'hydrogenOrbital') {
    normalized = { ...normalized, quantumMode: 'hydrogenND' }
  }
  return normalized as T
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
  const mergedConfig = deepMerge(defaultConfig, migratedLoadedConfig)
  const normalizedConfig =
    configKey === 'schroedinger'
      ? normalizeSchroedingerConfig(mergedConfig as typeof DEFAULT_SCHROEDINGER_CONFIG)
      : mergedConfig

  return {
    [configKey]: normalizedConfig,
  }
}
