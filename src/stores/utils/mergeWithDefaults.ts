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
function deepMerge<T extends object>(defaults: T, loaded: unknown): T {
  // If loaded is null/undefined/not-object/array, return copy of defaults
  if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
    return { ...defaults }
  }

  const result = { ...defaults } as T
  // After the guard above, loaded is a non-null, non-array object
  const loadedObj = loaded as Record<string, unknown>

  for (const key of Object.keys(loadedObj)) {
    // Only merge keys that exist in defaults to preserve canonical state shape.
    if (!Object.prototype.hasOwnProperty.call(defaults, key)) {
      continue
    }

    const loadedVal = loadedObj[key]
    const defaultVal = (defaults as Record<string, unknown>)[key]

    if (loadedVal === undefined) {
      // Undefined in loaded means use default (already in result)
      continue
    }

    const defaultIsObject =
      defaultVal !== null && typeof defaultVal === 'object' && !Array.isArray(defaultVal)

    const defaultIsArray = Array.isArray(defaultVal)

    if (loadedVal === null && (defaultIsObject || defaultIsArray)) {
      // Null loaded where default is an object or array: keep the default to prevent
      // downstream property-access crashes (e.g., cosineParams: null → cosineParams.a fails,
      // or cosineParams.a: null → cosineParams.a.length fails)
      continue
    }

    if (Array.isArray(loadedVal)) {
      if (defaultIsObject) {
        // Loaded array where default is a plain object: type mismatch.
        // Keep the default to preserve expected property structure
        // (e.g., cosineParams: [] would lose a/b/c/d properties).
        continue
      }
      // Arrays are replaced, not merged — but validate length for fixed-size arrays.
      // When the default array is non-empty (fixed-size, e.g., cosineParams.a = [0.5, 0.5, 0.5]),
      // the loaded array must match that length; otherwise downstream code that indexes into it
      // will read undefined values. Variable-length arrays (default = []) accept any length.
      const defaultArr = defaultVal as unknown[]
      if (
        defaultIsArray &&
        defaultArr.length > 0 &&
        (loadedVal as unknown[]).length !== defaultArr.length
      ) {
        continue
      }
      ;(result as Record<string, unknown>)[key] = loadedVal
    } else if (defaultIsArray) {
      // Default is an array but loaded is not an array (it's a non-array object or primitive).
      // Type mismatch: keep the default to preserve array structure
      // (e.g., cosineParams.a: {} would lose the [0.5, 0.5, 0.5] array).
      continue
    } else if (loadedVal !== null && typeof loadedVal === 'object' && defaultIsObject) {
      // Recursively merge nested objects (e.g., cosineParams, customPalette)
      ;(result as Record<string, unknown>)[key] = deepMerge(defaultVal as object, loadedVal)
    } else if (!defaultIsObject || typeof loadedVal === typeof defaultVal) {
      // Primitives: loaded value overrides default, but only if types match
      // (prevents a number replacing an expected object or array,
      // e.g., cosineParams: 42, parameterValues: "garbage")
      ;(result as Record<string, unknown>)[key] = loadedVal
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
