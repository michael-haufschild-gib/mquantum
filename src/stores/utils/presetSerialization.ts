import type { ObjectType } from '@/lib/geometry/types'
import type { SavedScene, SavedStyle } from '../presetManagerStore'

/**
 * Mapping from ObjectType to the config key in the extended object store.
 * Used to serialize only the relevant config when saving a scene,
 * and to apply only the relevant config when loading a scene.
 */
export const OBJECT_TYPE_TO_CONFIG_KEY: Record<ObjectType, string> = {
  schroedinger: 'schroedinger',
}

/**
 * Fields that should never be serialized to presets.
 * These are transient runtime states that don't represent user configuration.
 */
export const TRANSIENT_FIELDS = new Set([
  // Skybox - runtime texture object and loading state
  'classicCubeTexture',
  'skyboxLoading',
  // Lighting - UI interaction state and gizmo visibility
  'isDraggingLight',
  'showLightGizmos',
  // Camera - runtime THREE.js control objects
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
  'showDepthBuffer',
  'showNormalBuffer',
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

  // Legacy bloom fields (removed — replaced by progressive downsample/upsample bloom)
  'bloomMode',
  'bloomBands',
  'bloomConvolutionRadius',
  'bloomConvolutionResolutionScale',
  'bloomConvolutionBoost',
  'bloomConvolutionTint',

  // Free scalar field runtime trigger (not persisted in presets)
  'needsReset',

  // Second quantization educational layer — session-specific interpretive UI, not scene state
  'sqLayerEnabled',
  'sqLayerMode',
  'sqLayerSelectedModeIndex',
  'sqLayerShowOccupation',
  'sqLayerShowUncertainty',
  'sqLayerCoherentAlphaRe',
  'sqLayerCoherentAlphaIm',
  'sqLayerSqueezeR',
  'sqLayerSqueezeTheta',
])

/**
 * Deep clones state and removes functions and transient fields to ensure JSON serializability.
 * Prevents reference mutation issues where saved presets would change when store changes.
 * Also handles non-serializable THREE.js objects by excluding them.
 * @param state - The state object to serialize.
 * @returns A JSON-serializable version of the state.
 */
export const serializeState = <T extends object>(state: T): Record<string, unknown> => {
  // 1. Create a shallow copy first to filter functions and transient fields
  const clean: Record<string, unknown> = {}
  for (const key in state) {
    // Skip functions
    if (typeof state[key] === 'function') continue
    // Skip transient fields that shouldn't be persisted
    if (TRANSIENT_FIELDS.has(key)) continue
    clean[key] = state[key]
  }

  // 2. Deep clone via JSON to break references
  return JSON.parse(JSON.stringify(clean))
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
 * This prevents saving irrelevant configs (e.g., blackhole config when saving a hypercube).
 *
 * @param state - The full extended object store state
 * @param objectType - The current object type being saved
 * @returns A serialized state containing only the relevant config
 */
export const serializeExtendedState = <T extends object>(
  state: T,
  objectType: ObjectType
): Record<string, unknown> => {
  const configKey = OBJECT_TYPE_TO_CONFIG_KEY[objectType]
  if (!configKey) {
    // Unknown object type - return empty (shouldn't happen)
    console.warn(`Unknown object type for extended config: ${objectType}`)
    return {}
  }

  const stateRecord = state as Record<string, unknown>
  const config = stateRecord[configKey]

  if (!config || typeof config !== 'object') {
    return {}
  }

  // Filter transient fields from the nested config before cloning
  const configRecord = config as Record<string, unknown>
  const filtered: Record<string, unknown> = {}
  for (const key in configRecord) {
    if (typeof configRecord[key] === 'function') continue
    if (TRANSIENT_FIELDS.has(key)) continue
    const val = configRecord[key]
    // Recursively strip transient fields from nested objects (e.g., freeScalar.needsReset)
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const nested = val as Record<string, unknown>
      const cleanNested: Record<string, unknown> = {}
      for (const nk in nested) {
        if (typeof nested[nk] === 'function') continue
        if (TRANSIENT_FIELDS.has(nk)) continue
        cleanNested[nk] = nested[nk]
      }
      filtered[key] = cleanNested
    } else {
      filtered[key] = val
    }
  }

  // Return only the relevant config, keyed by its config key
  // This allows mergeExtendedObjectState to properly merge on load
  return {
    [configKey]: JSON.parse(JSON.stringify(filtered)),
  }
}

/**
 * Strips transient/internal fields from loaded data.
 * Ensures legacy presets containing version fields don't overwrite current state.
 * @param state - The state object loaded from a preset.
 * @returns A sanitized copy with transient fields removed.
 */
export const sanitizeLoadedState = <T extends Record<string, unknown>>(state: T): T => {
  const clean = { ...state }
  for (const field of TRANSIENT_FIELDS) {
    delete clean[field]
  }

  // Legacy nested field removed from surface material settings.
  const shaderSettings = clean.shaderSettings as Record<string, unknown> | undefined
  const surfaceSettings = shaderSettings?.surface as Record<string, unknown> | undefined
  if (surfaceSettings && typeof surfaceSettings === 'object' && 'faceOpacity' in surfaceSettings) {
    delete surfaceSettings.faceOpacity
  }

  return clean
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
