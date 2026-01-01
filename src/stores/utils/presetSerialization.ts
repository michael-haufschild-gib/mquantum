import type { SavedScene, SavedStyle } from '../presetManagerStore'

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
  'gravityVersion',
  'pbrVersion',
  'polytopeVersion',
  'blackholeVersion',
  'schroedingerVersion',
  'mandelbulbVersion',
  'quaternionJuliaVersion',
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
  return clean
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
  extended: sanitizeLoadedState(data.extended),
  transform: sanitizeLoadedState(data.transform),
  rotation: sanitizeLoadedState(data.rotation),
  animation: sanitizeLoadedState(data.animation),
  camera: sanitizeLoadedState(data.camera),
  ui: sanitizeLoadedState(data.ui),
})
