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
 * This ensures that old saved scenes automatically get default values
 * for any new parameters that were added after the scene was saved.
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
