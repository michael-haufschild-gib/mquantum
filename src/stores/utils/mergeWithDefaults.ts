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

import type { ObjectType } from '@/lib/geometry/types'
import {
  DEFAULT_BLACK_HOLE_CONFIG,
  DEFAULT_CLIFFORD_TORUS_CONFIG,
  DEFAULT_MANDELBROT_CONFIG,
  DEFAULT_NESTED_TORUS_CONFIG,
  DEFAULT_POLYTOPE_CONFIG,
  DEFAULT_QUATERNION_JULIA_CONFIG,
  DEFAULT_ROOT_SYSTEM_CONFIG,
  DEFAULT_SCHROEDINGER_CONFIG,
  DEFAULT_WYTHOFF_POLYTOPE_CONFIG,
} from '@/lib/geometry/extended/types'
import { OBJECT_TYPE_TO_CONFIG_KEY } from './presetSerialization'

/**
 * Mapping from config key to its default config.
 */
const CONFIG_KEY_TO_DEFAULT: Record<string, object> = {
  polytope: DEFAULT_POLYTOPE_CONFIG,
  wythoffPolytope: DEFAULT_WYTHOFF_POLYTOPE_CONFIG,
  rootSystem: DEFAULT_ROOT_SYSTEM_CONFIG,
  cliffordTorus: DEFAULT_CLIFFORD_TORUS_CONFIG,
  nestedTorus: DEFAULT_NESTED_TORUS_CONFIG,
  mandelbulb: DEFAULT_MANDELBROT_CONFIG,
  quaternionJulia: DEFAULT_QUATERNION_JULIA_CONFIG,
  schroedinger: DEFAULT_SCHROEDINGER_CONFIG,
  blackhole: DEFAULT_BLACK_HOLE_CONFIG,
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
  // If loaded is null/undefined/not-object, return copy of defaults
  if (!loaded || typeof loaded !== 'object') {
    return { ...defaults }
  }

  const result = { ...defaults } as T
  const loadedObj = loaded as Record<string, unknown>

  for (const key of Object.keys(loadedObj)) {
    const loadedVal = loadedObj[key]
    const defaultVal = (defaults as Record<string, unknown>)[key]

    if (loadedVal === undefined) {
      // Undefined in loaded means use default (already in result)
      continue
    }

    if (Array.isArray(loadedVal)) {
      // Arrays are replaced, not merged
      // (e.g., parameterValues, center, juliaConstant are position-specific)
      ;(result as Record<string, unknown>)[key] = loadedVal
    } else if (
      loadedVal !== null &&
      typeof loadedVal === 'object' &&
      defaultVal !== null &&
      typeof defaultVal === 'object' &&
      !Array.isArray(defaultVal)
    ) {
      // Recursively merge nested objects (e.g., cosineParams, customPalette)
      ;(result as Record<string, unknown>)[key] = deepMerge(
        defaultVal as object,
        loadedVal
      )
    } else {
      // Primitives: loaded value overrides default
      ;(result as Record<string, unknown>)[key] = loadedVal
    }
  }

  return result
}

/**
 * Merges loaded extended object state with all config defaults.
 *
 * @deprecated Use mergeExtendedObjectStateForType instead to only merge the relevant config.
 * This function merges ALL configs which can overwrite unrelated object type settings.
 *
 * @param loaded - The loaded extended object state from a saved scene
 * @returns Merged state with all defaults filled in
 */
export function mergeExtendedObjectState(
  loaded: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...loaded,
    // Merge each config object with its defaults
    polytope: deepMerge(DEFAULT_POLYTOPE_CONFIG, loaded.polytope),
    wythoffPolytope: deepMerge(DEFAULT_WYTHOFF_POLYTOPE_CONFIG, loaded.wythoffPolytope),
    rootSystem: deepMerge(DEFAULT_ROOT_SYSTEM_CONFIG, loaded.rootSystem),
    cliffordTorus: deepMerge(DEFAULT_CLIFFORD_TORUS_CONFIG, loaded.cliffordTorus),
    nestedTorus: deepMerge(DEFAULT_NESTED_TORUS_CONFIG, loaded.nestedTorus),
    mandelbulb: deepMerge(DEFAULT_MANDELBROT_CONFIG, loaded.mandelbulb),
    quaternionJulia: deepMerge(DEFAULT_QUATERNION_JULIA_CONFIG, loaded.quaternionJulia),
    schroedinger: deepMerge(DEFAULT_SCHROEDINGER_CONFIG, loaded.schroedinger),
    blackhole: deepMerge(DEFAULT_BLACK_HOLE_CONFIG, loaded.blackhole),
  }
}

/**
 * Merges loaded extended object state for a specific object type only.
 *
 * This is the preferred function for scene loading. It:
 * 1. Only updates the config for the loaded object type
 * 2. Merges with defaults to handle newly added parameters
 * 3. Does NOT touch configs for other object types
 *
 * This prevents issues like:
 * - Loading a hypercube scene overwriting blackhole settings
 * - Loading a blackhole scene overwriting schroedinger settings
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
    console.warn(`Unknown object type for extended config merge: ${objectType}`)
    return {}
  }

  const defaultConfig = CONFIG_KEY_TO_DEFAULT[configKey]
  if (!defaultConfig) {
    console.warn(`No default config found for key: ${configKey}`)
    return {}
  }

  const loadedConfig = loaded[configKey]

  // Return only the merged config for this object type
  // This ensures we don't overwrite other object type configs
  return {
    [configKey]: deepMerge(defaultConfig, loadedConfig),
  }
}
