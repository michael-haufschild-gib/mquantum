import type { ObjectType } from '@/lib/geometry/types'
import { logger } from '@/lib/logger'

import type { SavedScene, SavedStyle } from './presetTypes'

/**
 * Mapping from ObjectType to the config key in the extended object store.
 * Used to serialize only the relevant config when saving a scene,
 * and to apply only the relevant config when loading a scene.
 */
export const OBJECT_TYPE_TO_CONFIG_KEY: Record<ObjectType, string> = {
  schroedinger: 'schroedinger',
  pauliSpinor: 'pauliSpinor',
  bellPair: 'bellPair',
}

/**
 * Fields that should never be serialized to presets.
 * These are transient runtime states that don't represent user configuration.
 *
 * WHY blacklist (not whitelist):
 * New store fields should serialize by default — user settings must persist
 * in presets without requiring explicit opt-in. A whitelist would cause silent
 * regressions: new features wouldn't save to presets until someone remembered
 * to add them. The blacklist only grows when we add runtime-only state (rare)
 * or need to strip legacy fields from imported presets (backward compat).
 */
export const TRANSIENT_FIELDS = new Set([
  // Skybox - runtime texture object and loading state
  'classicCubeTexture',
  'skyboxLoading',
  // Lighting - UI interaction state and gizmo visibility
  'isDraggingLight',
  'showLightGizmos',
  // Camera - legacy runtime control objects (strip from imported presets)
  'controls',
  'savedState',
  // UI - helper visibility (excluded per user specification)
  'showAxisHelper',
  // UI - performance monitor state (user-specific, not scene/style config)
  'showPerfMonitor',
  'perfMonitorExpanded',
  'perfMonitorTab',

  // UI - FPS limit (device-specific preference, not scene/style config)
  'maxFps',

  // UI - debug buffer visualizations (developer tools, not scene/style config)
  'showTemporalDepthBuffer',

  // Version counters - internal dirty-flag optimization state
  // These are auto-incremented for render optimization and should never be persisted
  'appearanceVersion',
  'iblVersion',
  'groundVersion',
  'skyboxVersion',
  'version', // Used by rotationStore and lightingSlice
  'pbrVersion',
  'schroedingerVersion',
  'pauliSpinorVersion',
  'bellPairVersion',

  // Exposure - runtime display preference, not part of scene/style presets
  'autoScaleMaxGain',

  // Legacy version counters from removed object types - strip from imported presets
  'gravityVersion',
  'polytopeVersion',
  'blackholeVersion',
  'mandelbulbVersion',
  'quaternionJuliaVersion',

  // Legacy environment fields removed from the quantum-only fork
  'activeWalls',
  'groundPlaneOffset',
  'groundPlaneColor',
  'groundPlaneType',
  'groundPlaneSizeScale',
  'showGroundGrid',
  'groundGridColor',
  'groundGridSpacing',
  'iblQuality',
  'iblIntensity',

  // Legacy post-processing fields removed from the quantum-only fork
  'refractionEnabled',
  'refractionIOR',
  'refractionStrength',
  'refractionChromaticAberration',

  // Legacy PBR field for removed environment surfaces
  'ground',

  // Legacy appearance fields removed from render mode controls
  'edgesVisible',
  'facesVisible',
  'faceOpacity',

  // Legacy Fresnel rim fields (removed — has no visible effect on volumetric rendering)
  'fresnelEnabled',
  'fresnelIntensity',
  'faceRimFalloff',
  'rimExponent',

  // Legacy edge thickness fields (removed — single object type has no geometric edges)
  'edgeThickness',
  'tubeCaps',

  // Legacy density grid rendering acceleration (removed — compute pass kept for uncertainty boundary only)
  'useDensityGrid',

  // Legacy skybox blend mode (removed — never connected to rendering pipeline)
  'backgroundBlendMode',

  // Legacy skybox sync-with-object toggle (removed — skybox always uses palette)
  'syncWithObject',

  // Legacy skybox selector replaced by unified skyboxSelection
  'classicSkyboxType',

  // Legacy bloom fields (removed — replaced by progressive downsample/upsample bloom)
  'bloomMode',
  'bloomBands',
  'bloomConvolutionRadius',
  'bloomConvolutionResolutionScale',
  'bloomConvolutionBoost',
  'bloomConvolutionTint',

  // Legacy depth/gravity post-processing fields (removed from quantum-only pipeline)
  'objectOnlyDepth',
  'gravityEnabled',
  'gravityStrength',
  'gravityDistortionScale',
  'gravityFalloff',
  'gravityChromaticAberration',

  // Free scalar field runtime trigger (not persisted in presets)
  'needsReset',

  // Imaginary-time propagation mode — runtime toggle, not scene state

  // Second quantization educational layer — session-specific interpretive UI, not scene state
  'sqLayerEnabled',
  'sqLayerMode',
  'sqLayerSelectedModeIndex',
  'sqLayerFockQuantumNumber',
  'sqLayerShowOccupation',
  'sqLayerShowUncertainty',
  'sqLayerCoherentAlphaRe',
  'sqLayerCoherentAlphaIm',
  'sqLayerSqueezeR',
  'sqLayerSqueezeTheta',

  // N-D basis vectors — runtime-computed by the renderer, not user-configurable scene state
  'basisX',
  'basisY',
  'basisZ',
  'origin',

  // Legacy absorber strength — replaced by auto-computed σ_max from pmlTargetReflection
  'absorberStrength',

  // Legacy fractal animation quality toggle — removed with fractal object types
  'fractalAnimationLowQuality',
])

function warnDroppedNonFinitePresetValue(path: string, value: number): void {
  logger.warn(`[presetSerialization] Dropping non-finite numeric value at "${path}":`, value)
}

/** Sanitize an array value, returning undefined if any element is non-finite. */
function sanitizeFiniteArray(
  value: unknown[],
  path: string,
  seen: WeakSet<object>
): unknown[] | undefined {
  const sanitizedArray: unknown[] = []
  for (let index = 0; index < value.length; index += 1) {
    const sanitizedItem = sanitizeFiniteLoadedValue(value[index], `${path}[${index}]`, seen)
    // Preserve array shape invariants by dropping the whole array when any item is invalid.
    if (sanitizedItem === undefined) return undefined
    sanitizedArray.push(sanitizedItem)
  }
  return sanitizedArray
}

/** Sanitize a record value, dropping keys whose values are non-finite. */
function sanitizeFiniteRecord(
  value: Record<string, unknown>,
  path: string,
  seen: WeakSet<object>
): Record<string, unknown> {
  if (seen.has(value)) {
    throw new TypeError(`Cannot sanitize cyclic preset value at "${path}"`)
  }
  seen.add(value)
  const sanitizedRecord: Record<string, unknown> = {}
  for (const [key, candidateValue] of Object.entries(value)) {
    const sanitizedChild = sanitizeFiniteLoadedValue(candidateValue, `${path}.${key}`, seen)
    if (sanitizedChild !== undefined) {
      sanitizedRecord[key] = sanitizedChild
    }
  }
  seen.delete(value)
  return sanitizedRecord
}

function sanitizeFiniteLoadedValue(
  value: unknown,
  path: string,
  seen: WeakSet<object> = new WeakSet()
): unknown | undefined {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      warnDroppedNonFinitePresetValue(path, value)
      return undefined
    }
    return value
  }

  if (Array.isArray(value)) return sanitizeFiniteArray(value, path, seen)
  if (value && typeof value === 'object')
    return sanitizeFiniteRecord(value as Record<string, unknown>, path, seen)
  return value
}

/**
 * Deep clones state and removes functions and transient fields to ensure JSON serializability.
 * Prevents reference mutation issues where saved presets would change when store changes.
 * @param state - The state object to serialize.
 * @returns A JSON-serializable version of the state.
 */
export const serializeState = <T extends object>(state: T): Record<string, unknown> => {
  const stripped = stripTransientFields(state as Record<string, unknown>)
  const sanitized = sanitizeFiniteLoadedValue(stripped, 'state')
  const serializable =
    sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized) ? sanitized : {}
  return JSON.parse(JSON.stringify(serializable))
}

/**
 * Serializes Animation store (Set -> Array)
 * @param state - The animation state to serialize.
 * @returns A JSON-serializable version of the animation state.
 */
export const serializeAnimationState = <T extends object>(state: T): Record<string, unknown> => {
  const clean = serializeState(state)
  if ('animatingPlanes' in state && state.animatingPlanes instanceof Set) {
    clean.animatingPlanes = Array.from(state.animatingPlanes)
  }
  return clean
}

/**
 * Serializes Rotation store (Map -> Object)
 * @param state - The rotation state to serialize.
 * @returns A JSON-serializable version of the rotation state.
 */
export const serializeRotationState = <T extends object>(state: T): Record<string, unknown> => {
  const clean = serializeState(state)
  if ('rotations' in state && state.rotations instanceof Map) {
    // Convert Map to Object for JSON serialization
    clean.rotations = Object.fromEntries(state.rotations as Map<string, unknown>)
  }
  return clean
}

/**
 * Serializes only the relevant extended object config for the given object type.
 * Only the config matching the active object type is included in the preset.
 *
 * @param state - The full extended object store state
 * @param objectType - The current object type being saved
 * @returns A serialized state containing only the relevant config
 */
/**
 * Strip functions and transient fields from a flat record (one level deep).
 * Used to clean nested config objects inside extended state.
 */
function stripTransientFields(record: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const key of Object.keys(record)) {
    if (typeof record[key] === 'function') continue
    if (TRANSIENT_FIELDS.has(key)) continue
    clean[key] = record[key]
  }
  return clean
}

/**
 * Filter transient fields from a config record, recursing one level into nested objects.
 */
function filterConfigFields(configRecord: Record<string, unknown>): Record<string, unknown> {
  const filtered: Record<string, unknown> = {}
  for (const key of Object.keys(configRecord)) {
    if (typeof configRecord[key] === 'function') continue
    if (TRANSIENT_FIELDS.has(key)) continue
    const val = configRecord[key]
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      filtered[key] = stripTransientFields(val as Record<string, unknown>)
    } else {
      filtered[key] = val
    }
  }
  return filtered
}

export const serializeExtendedState = <T extends object>(
  state: T,
  objectType: ObjectType
): Record<string, unknown> => {
  const configKey = OBJECT_TYPE_TO_CONFIG_KEY[objectType]
  if (!configKey) {
    logger.warn(`Unknown object type for extended config: ${objectType}`)
    return {}
  }

  const config = (state as Record<string, unknown>)[configKey]
  if (!config || typeof config !== 'object') return {}

  const filtered = filterConfigFields(config as Record<string, unknown>)
  return { [configKey]: JSON.parse(JSON.stringify(filtered)) }
}

/**
 * Strips transient/internal fields from loaded data.
 * Ensures legacy presets containing version fields don't overwrite current state.
 * @param state - The state object loaded from a preset.
 * @returns A sanitized copy with transient fields removed.
 */
export const sanitizeLoadedState = <T extends Record<string, unknown>>(state: T): T => {
  const clean: Record<string, unknown> = { ...state }
  for (const field of TRANSIENT_FIELDS) {
    delete clean[field]
  }

  // Legacy nested field removed from surface material settings.
  const shaderSettings = clean.shaderSettings as Record<string, unknown> | undefined
  const surfaceSettings = shaderSettings?.surface as Record<string, unknown> | undefined
  if (surfaceSettings && typeof surfaceSettings === 'object' && 'faceOpacity' in surfaceSettings) {
    const sanitizedShaderSettings = {
      ...shaderSettings,
      surface: {
        ...surfaceSettings,
      },
    }
    delete (sanitizedShaderSettings.surface as Record<string, unknown>).faceOpacity
    clean.shaderSettings = sanitizedShaderSettings
  }

  const sanitized = sanitizeFiniteLoadedValue(clean, 'state')
  if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
    return sanitized as T
  }

  // All values were non-finite — return the cleaned state with transient fields stripped
  // (which is at least structurally valid, unlike a bare `{}`)
  return clean as T
}

/**
 * Sanitizes extended object config, stripping transient fields from nested config objects.
 * The extended store has structure `{ schroedinger: { ...fields } }`, so we need to
 * sanitize both the top level and each nested config object.
 * @param state - The extended state object loaded from a preset.
 * @returns A sanitized copy with transient fields removed at all levels.
 */
export const sanitizeExtendedLoadedState = <T extends Record<string, unknown>>(state: T): T => {
  const clean = sanitizeLoadedState(state) as Record<string, unknown>
  // Also sanitize nested config objects (e.g., clean.schroedinger)
  for (const key of Object.keys(clean)) {
    const value = clean[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sanitized = sanitizeLoadedState(value as Record<string, unknown>)
      // Sanitize doubly-nested config objects (e.g., schroedinger.freeScalar)
      for (const innerKey of Object.keys(sanitized)) {
        const innerValue = sanitized[innerKey]
        if (innerValue && typeof innerValue === 'object' && !Array.isArray(innerValue)) {
          sanitized[innerKey] = sanitizeLoadedState(innerValue as Record<string, unknown>)
        }
      }
      clean[key] = sanitized
    }
  }
  return clean as T
}

/**
 * Recursively sanitizes all data sections of a saved style.
 * Removes transient fields from each store's data.
 * @param data - The SavedStyle data object.
 * @returns Sanitized data object.
 */
export const sanitizeStyleData = (data: SavedStyle['data']): SavedStyle['data'] => ({
  appearance: sanitizeLoadedState(data.appearance),
  lighting: sanitizeLoadedState(data.lighting),
  postProcessing: sanitizeLoadedState(data.postProcessing),
  environment: sanitizeLoadedState(data.environment),
  pbr: sanitizeLoadedState(data.pbr),
})

/**
 * Recursively sanitizes all data sections of a saved scene.
 * Removes transient fields from each store's data.
 * @param data - The SavedScene data object.
 * @returns Sanitized data object.
 */
export const sanitizeSceneData = (data: SavedScene['data']): SavedScene['data'] => ({
  appearance: sanitizeLoadedState(data.appearance),
  lighting: sanitizeLoadedState(data.lighting),
  postProcessing: sanitizeLoadedState(data.postProcessing),
  environment: sanitizeLoadedState(data.environment),
  pbr: sanitizeLoadedState(data.pbr),
  geometry: sanitizeLoadedState(data.geometry),
  extended: sanitizeExtendedLoadedState(data.extended),
  transform: sanitizeLoadedState(data.transform),
  rotation: sanitizeLoadedState(data.rotation),
  animation: sanitizeLoadedState(data.animation),
  camera: sanitizeLoadedState(data.camera),
  ui: sanitizeLoadedState(data.ui),
})
