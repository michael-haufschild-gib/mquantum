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
import type { ToneMappingAlgorithm } from '@/lib/rendering/shaderTypes'

import {
  DEFAULT_AMBIENT_COLOR,
  DEFAULT_AMBIENT_ENABLED,
  DEFAULT_AMBIENT_INTENSITY,
  DEFAULT_EXPOSURE,
  DEFAULT_LIGHT_COLOR,
  DEFAULT_LIGHT_ENABLED,
  DEFAULT_LIGHT_HORIZONTAL_ANGLE,
  DEFAULT_LIGHT_STRENGTH,
  DEFAULT_LIGHT_VERTICAL_ANGLE,
  DEFAULT_LIGHTS,
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

export const LIGHTING_INITIAL_STATE: LightingSliceState = {
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
  lights: DEFAULT_LIGHTS,
  version: 0,
  selectedLightId: DEFAULT_SELECTED_LIGHT_ID,
  transformMode: DEFAULT_TRANSFORM_MODE,
  showLightGizmos: DEFAULT_SHOW_LIGHT_GIZMOS,
  isDraggingLight: false,
}

function isValidLightingNumber(value: number): boolean {
  return Number.isFinite(value)
}

function isValidRotationTuple(value: [number, number, number]): boolean {
  return value.every((component) => Number.isFinite(component))
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

/**
 * Strip invalid numeric/rotation values from light updates, logging warnings.
 * @param updates - Raw partial light updates
 * @returns Sanitized updates with invalid fields removed
 */
function sanitizeLightUpdates(
  updates: Partial<Omit<LightSource, 'id'>>
): Partial<Omit<LightSource, 'id'>> {
  const sanitized: Partial<Omit<LightSource, 'id'>> = { ...updates }

  for (const { key, label } of NUMERIC_LIGHT_FIELDS) {
    const value = sanitized[key]
    if (value === undefined) continue
    if (!isValidLightingNumber(value as number)) {
      logger.warn(`[lightingSlice] Ignoring non-finite ${label} update:`, value)
      delete sanitized[key]
    }
  }

  if (sanitized.rotation !== undefined && !isValidRotationTuple(sanitized.rotation)) {
    logger.warn('[lightingSlice] Ignoring non-finite rotation update:', sanitized.rotation)
    delete sanitized.rotation
  }

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
  ...LIGHTING_INITIAL_STATE,

  // --- Basic Lighting Actions ---
  setLightEnabled: (enabled: boolean) => {
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
    set({ toneMappingEnabled: enabled })
  },

  setToneMappingAlgorithm: (algorithm: ToneMappingAlgorithm) => {
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
    set((state) => ({
      version: state.version + 1,
      lights: state.lights.map((light) => {
        if (light.id !== id) return light
        const sanitized = sanitizeLightUpdates(updates)
        return applyLightUpdates(light, sanitized)
      }),
    }))
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
    set({ transformMode: mode })
  },

  setShowLightGizmos: (show: boolean) => {
    set({ showLightGizmos: show })
  },

  setIsDraggingLight: (dragging: boolean) => {
    set({ isDraggingLight: dragging })
  },

  bumpVersion: () => {
    set((state) => ({ version: state.version + 1 }))
  },

  reset: () => {
    set(LIGHTING_INITIAL_STATE)
  },
})
