/**
 * Lighting slice for visual store
 *
 * Manages all lighting-related state including:
 * - Basic directional lighting
 * - Enhanced lighting (specular, diffuse, tone mapping)
 * - Multi-light system (array of light sources)
 */

import type { StateCreator } from 'zustand'

import type { LightSource, LightType, TransformMode } from '@/lib/lighting/lightSource'
import {
  clampConeAngle,
  clampDecay,
  clampIntensity,
  clampPenumbra,
  clampRange,
  cloneLight,
  createNewLight,
  MAX_LIGHTS,
  MIN_LIGHTS,
  normalizeRotationTupleSigned,
} from '@/lib/lighting/lightSource'
import { logger } from '@/lib/logger'
import { TONE_MAPPING_OPTIONS, type ToneMappingAlgorithm } from '@/lib/rendering/shaderTypes'

import {
  createDefaultLights,
  DEFAULT_AMBIENT_COLOR,
  DEFAULT_AMBIENT_ENABLED,
  DEFAULT_AMBIENT_INTENSITY,
  DEFAULT_EXPOSURE,
  DEFAULT_LIGHT_COLOR,
  DEFAULT_LIGHT_ENABLED,
  DEFAULT_LIGHT_HORIZONTAL_ANGLE,
  DEFAULT_LIGHT_STRENGTH,
  DEFAULT_LIGHT_VERTICAL_ANGLE,
  DEFAULT_SELECTED_LIGHT_ID,
  DEFAULT_SHOW_LIGHT_GIZMOS,
  DEFAULT_SHOW_LIGHT_INDICATOR,
  DEFAULT_TONE_MAPPING_ALGORITHM,
  DEFAULT_TONE_MAPPING_ENABLED,
  DEFAULT_TRANSFORM_MODE,
} from '../defaults/visualDefaults'

// ============================================================================
// State Interface
// ============================================================================

/**
 * Lighting slice state.
 * NOTE: specularIntensity and specularColor have been moved to the dedicated
 * pbrStore for better organization. Use usePBRStore for face PBR.
 */
export interface LightingSliceState {
  // --- Basic Lighting ---
  lightEnabled: boolean
  lightColor: string
  lightHorizontalAngle: number
  lightVerticalAngle: number
  ambientEnabled: boolean
  ambientIntensity: number
  ambientColor: string
  showLightIndicator: boolean

  // --- Enhanced Lighting ---
  lightStrength: number
  toneMappingEnabled: boolean
  toneMappingAlgorithm: ToneMappingAlgorithm
  exposure: number

  // --- Multi-Light System ---
  lights: LightSource[]
  version: number // Incremented on any light update to optimize uniform updates
  selectedLightId: string | null
  transformMode: TransformMode
  showLightGizmos: boolean
  isDraggingLight: boolean
}

/**
 * Lighting slice actions.
 */
export interface LightingSliceActions {
  // --- Basic Lighting Actions ---
  setLightEnabled: (enabled: boolean) => void
  setLightColor: (color: string) => void
  setLightHorizontalAngle: (angle: number) => void
  setLightVerticalAngle: (angle: number) => void
  setAmbientEnabled: (enabled: boolean) => void
  setAmbientIntensity: (intensity: number) => void
  setAmbientColor: (color: string) => void
  setShowLightIndicator: (show: boolean) => void

  // --- Enhanced Lighting Actions ---
  setLightStrength: (strength: number) => void
  setToneMappingEnabled: (enabled: boolean) => void
  setToneMappingAlgorithm: (algorithm: ToneMappingAlgorithm) => void
  setExposure: (exposure: number) => void

  // --- Multi-Light System Actions ---
  addLight: (type: LightType) => string | null
  removeLight: (id: string) => void
  updateLight: (id: string, updates: Partial<Omit<LightSource, 'id'>>) => void
  duplicateLight: (id: string) => string | null
  selectLight: (id: string | null) => void
  setTransformMode: (mode: TransformMode) => void
  setShowLightGizmos: (show: boolean) => void
  setIsDraggingLight: (dragging: boolean) => void

  // --- Version Bump (for preset loading) ---
  /** Manually bump version counter (used after direct setState calls) */
  bumpVersion: () => void

  reset: () => void
}

/**
 * Combined lighting slice type.
 */
export type LightingSlice = LightingSliceState & LightingSliceActions

// ============================================================================
// Initial State
// ============================================================================

/** Create a fresh lighting state so reset/load paths never share light objects. */
export function createLightingInitialState(): LightingSliceState {
  return {
    // Basic lighting
    lightEnabled: DEFAULT_LIGHT_ENABLED,
    lightColor: DEFAULT_LIGHT_COLOR,
    lightHorizontalAngle: DEFAULT_LIGHT_HORIZONTAL_ANGLE,
    lightVerticalAngle: DEFAULT_LIGHT_VERTICAL_ANGLE,
    ambientEnabled: DEFAULT_AMBIENT_ENABLED,
    ambientIntensity: DEFAULT_AMBIENT_INTENSITY,
    ambientColor: DEFAULT_AMBIENT_COLOR,
    showLightIndicator: DEFAULT_SHOW_LIGHT_INDICATOR,

    // Enhanced lighting
    lightStrength: DEFAULT_LIGHT_STRENGTH,
    toneMappingEnabled: DEFAULT_TONE_MAPPING_ENABLED,
    toneMappingAlgorithm: DEFAULT_TONE_MAPPING_ALGORITHM,
    exposure: DEFAULT_EXPOSURE,

    // Multi-light system
    lights: createDefaultLights(),
    version: 0,
    selectedLightId: DEFAULT_SELECTED_LIGHT_ID,
    transformMode: DEFAULT_TRANSFORM_MODE,
    showLightGizmos: DEFAULT_SHOW_LIGHT_GIZMOS,
    isDraggingLight: false,
  }
}

export const LIGHTING_INITIAL_STATE: LightingSliceState = createLightingInitialState()

const LIGHT_TYPES = new Set<LightType>(['point', 'directional', 'spot'])
const TRANSFORM_MODES = new Set<TransformMode>(['translate', 'rotate'])
const TONE_MAPPING_ALGORITHMS = new Set<ToneMappingAlgorithm>(
  TONE_MAPPING_OPTIONS.map((option) => option.value)
)

function isValidLightingNumber(value: number): boolean {
  return Number.isFinite(value)
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function isLightType(value: unknown): value is LightType {
  return typeof value === 'string' && LIGHT_TYPES.has(value as LightType)
}

function isTransformMode(value: unknown): value is TransformMode {
  return typeof value === 'string' && TRANSFORM_MODES.has(value as TransformMode)
}

function isToneMappingAlgorithm(value: unknown): value is ToneMappingAlgorithm {
  return typeof value === 'string' && TONE_MAPPING_ALGORITHMS.has(value as ToneMappingAlgorithm)
}

function isValidVector3Tuple(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => Number.isFinite(component))
  )
}

// ============================================================================
// Light Update Helpers
// ============================================================================

/** Numeric fields that require finite-number validation and clamping. */
type NumericLightKey = 'intensity' | 'coneAngle' | 'penumbra' | 'range' | 'decay'
const NUMERIC_LIGHT_FIELDS: ReadonlyArray<{
  key: NumericLightKey
  label: string
  clamp: (v: number) => number
}> = [
  { key: 'intensity', label: 'light intensity', clamp: clampIntensity },
  { key: 'coneAngle', label: 'cone angle', clamp: clampConeAngle },
  { key: 'penumbra', label: 'penumbra', clamp: clampPenumbra },
  { key: 'range', label: 'range', clamp: clampRange },
  { key: 'decay', label: 'decay', clamp: clampDecay },
]

function removeInvalidLightMetadata(
  sanitized: Partial<Omit<LightSource, 'id'>>,
  raw: Record<string, unknown>
): void {
  if (raw.type !== undefined && !isLightType(raw.type)) {
    logger.warn('[lightingSlice] Ignoring invalid light type update:', raw.type)
    delete sanitized.type
  }

  if (raw.enabled !== undefined && !isBoolean(raw.enabled)) {
    logger.warn('[lightingSlice] Ignoring invalid light enabled update:', raw.enabled)
    delete sanitized.enabled
  }

  if (raw.name !== undefined && typeof raw.name !== 'string') {
    logger.warn('[lightingSlice] Ignoring invalid light name update:', raw.name)
    delete sanitized.name
  }

  if (raw.color !== undefined && typeof raw.color !== 'string') {
    logger.warn('[lightingSlice] Ignoring invalid light color update:', raw.color)
    delete sanitized.color
  }
}

function removeInvalidLightScalars(sanitized: Partial<Omit<LightSource, 'id'>>): void {
  for (const { key, label } of NUMERIC_LIGHT_FIELDS) {
    const value = sanitized[key]
    if (value === undefined) continue
    if (!isValidLightingNumber(value as number)) {
      logger.warn(`[lightingSlice] Ignoring non-finite ${label} update:`, value)
      delete sanitized[key]
    }
  }
}

function removeInvalidLightVectors(sanitized: Partial<Omit<LightSource, 'id'>>): void {
  if (sanitized.position !== undefined && !isValidVector3Tuple(sanitized.position)) {
    logger.warn('[lightingSlice] Ignoring invalid position update:', sanitized.position)
    delete sanitized.position
  }

  if (sanitized.rotation !== undefined && !isValidVector3Tuple(sanitized.rotation)) {
    logger.warn('[lightingSlice] Ignoring non-finite rotation update:', sanitized.rotation)
    delete sanitized.rotation
  }
}

/**
 * Strip invalid numeric/rotation values from light updates, logging warnings.
 * @param updates - Raw partial light updates
 * @returns Sanitized updates with invalid fields removed
 */
function sanitizeLightUpdates(
  updates: Partial<Omit<LightSource, 'id'>>
): Partial<Omit<LightSource, 'id'>> {
  const sanitized: Partial<Omit<LightSource, 'id'>> = { ...updates }
  const raw = sanitized as Record<string, unknown>

  removeInvalidLightMetadata(sanitized, raw)
  removeInvalidLightScalars(sanitized)
  removeInvalidLightVectors(sanitized)

  return sanitized
}

/**
 * Merge sanitized updates into a light, clamping numeric fields.
 * @param light - Existing light source
 * @param sanitized - Sanitized partial updates
 * @returns New light object
 */
function applyLightUpdates(
  light: LightSource,
  sanitized: Partial<Omit<LightSource, 'id'>>
): LightSource {
  const merged = { ...light, ...sanitized }

  for (const { key, clamp } of NUMERIC_LIGHT_FIELDS) {
    if (sanitized[key] !== undefined) {
      ;(merged as Record<string, unknown>)[key] = clamp(sanitized[key] as number)
    }
  }

  if (sanitized.rotation !== undefined) {
    merged.rotation = normalizeRotationTupleSigned(sanitized.rotation)
  }

  return merged
}

// ============================================================================
// Slice Creator
// ============================================================================

export const createLightingSlice: StateCreator<LightingSlice, [], [], LightingSlice> = (
  set,
  get
) => ({
  ...createLightingInitialState(),

  // --- Basic Lighting Actions ---
  setLightEnabled: (enabled: boolean) => {
    if (!isBoolean(enabled)) {
      logger.warn('[lightingSlice] Ignoring invalid light enabled flag:', enabled)
      return
    }
    set({ lightEnabled: enabled })
  },

  setLightColor: (color: string) => {
    set({ lightColor: color })
  },

  setLightHorizontalAngle: (angle: number) => {
    if (!isValidLightingNumber(angle)) {
      logger.warn('[lightingSlice] Ignoring non-finite horizontal angle:', angle)
      return
    }
    const normalized = ((angle % 360) + 360) % 360
    set({ lightHorizontalAngle: normalized })
  },

  setLightVerticalAngle: (angle: number) => {
    if (!isValidLightingNumber(angle)) {
      logger.warn('[lightingSlice] Ignoring non-finite vertical angle:', angle)
      return
    }
    set({ lightVerticalAngle: Math.max(-90, Math.min(90, angle)) })
  },

  setAmbientEnabled: (enabled: boolean) => {
    if (!isBoolean(enabled)) {
      logger.warn('[lightingSlice] Ignoring invalid ambient enabled flag:', enabled)
      return
    }
    set((state) => ({
      ambientEnabled: enabled,
      version: state.version + 1,
    }))
  },

  setAmbientIntensity: (intensity: number) => {
    if (!isValidLightingNumber(intensity)) {
      logger.warn('[lightingSlice] Ignoring non-finite ambient intensity:', intensity)
      return
    }
    set((state) => ({
      ambientIntensity: Math.max(0, Math.min(1, intensity)),
      version: state.version + 1,
    }))
  },

  setAmbientColor: (color: string) => {
    set((state) => ({
      ambientColor: color,
      version: state.version + 1,
    }))
  },

  setShowLightIndicator: (show: boolean) => {
    if (!isBoolean(show)) {
      logger.warn('[lightingSlice] Ignoring invalid light indicator flag:', show)
      return
    }
    set({ showLightIndicator: show })
  },

  // --- Enhanced Lighting Actions ---
  setLightStrength: (strength: number) => {
    if (!isValidLightingNumber(strength)) {
      logger.warn('[lightingSlice] Ignoring non-finite light strength:', strength)
      return
    }
    set({ lightStrength: Math.max(0, Math.min(3, strength)) })
  },

  setToneMappingEnabled: (enabled: boolean) => {
    if (!isBoolean(enabled)) {
      logger.warn('[lightingSlice] Ignoring invalid tone mapping enabled flag:', enabled)
      return
    }
    set({ toneMappingEnabled: enabled })
  },

  setToneMappingAlgorithm: (algorithm: ToneMappingAlgorithm) => {
    if (!isToneMappingAlgorithm(algorithm)) {
      logger.warn('[lightingSlice] Ignoring invalid tone mapping algorithm:', algorithm)
      return
    }
    set({ toneMappingAlgorithm: algorithm })
  },

  setExposure: (exposure: number) => {
    if (!isValidLightingNumber(exposure)) {
      logger.warn('[lightingSlice] Ignoring non-finite exposure:', exposure)
      return
    }
    set({ exposure: Math.max(0.1, Math.min(3, exposure)) })
  },

  // --- Multi-Light System Actions ---
  addLight: (type: LightType) => {
    if (!isLightType(type)) {
      logger.warn('[lightingSlice] Ignoring invalid light type:', type)
      return null
    }
    const state = get()
    if (state.lights.length >= MAX_LIGHTS) {
      return null
    }
    const newLight = createNewLight(type, state.lights.length)
    set({
      lights: [...state.lights, newLight],
      selectedLightId: newLight.id,
      version: state.version + 1,
    })
    return newLight.id
  },

  removeLight: (id: string) => {
    const state = get()
    if (state.lights.length <= MIN_LIGHTS) {
      return
    }
    const newLights = state.lights.filter((light) => light.id !== id)
    const newSelectedId = state.selectedLightId === id ? null : state.selectedLightId
    set({ lights: newLights, selectedLightId: newSelectedId, version: state.version + 1 })
  },

  updateLight: (id: string, updates: Partial<Omit<LightSource, 'id'>>) => {
    set((state) => {
      const sanitized = sanitizeLightUpdates(updates)
      if (Object.keys(sanitized).length === 0) return state

      let updated = false
      const lights = state.lights.map((light) => {
        if (light.id !== id) return light
        updated = true
        return applyLightUpdates(light, sanitized)
      })

      if (!updated) return state
      return { version: state.version + 1, lights }
    })
  },

  duplicateLight: (id: string) => {
    const state = get()
    if (state.lights.length >= MAX_LIGHTS) {
      return null
    }
    const sourceLight = state.lights.find((light) => light.id === id)
    if (!sourceLight) {
      return null
    }
    const newLight = cloneLight(sourceLight)
    set({
      lights: [...state.lights, newLight],
      selectedLightId: newLight.id,
      version: state.version + 1,
    })
    return newLight.id
  },

  selectLight: (id: string | null) => {
    set({ selectedLightId: id })
  },

  setTransformMode: (mode: TransformMode) => {
    if (!isTransformMode(mode)) {
      logger.warn('[lightingSlice] Ignoring invalid transform mode:', mode)
      return
    }
    set({ transformMode: mode })
  },

  setShowLightGizmos: (show: boolean) => {
    if (!isBoolean(show)) {
      logger.warn('[lightingSlice] Ignoring invalid light gizmos flag:', show)
      return
    }
    set({ showLightGizmos: show })
  },

  setIsDraggingLight: (dragging: boolean) => {
    if (!isBoolean(dragging)) {
      logger.warn('[lightingSlice] Ignoring invalid dragging flag:', dragging)
      return
    }
    set({ isDraggingLight: dragging })
  },

  bumpVersion: () => {
    set((state) => ({ version: state.version + 1 }))
  },

  reset: () => {
    set(createLightingInitialState())
  },
})
