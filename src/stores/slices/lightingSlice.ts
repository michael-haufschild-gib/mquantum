/**
 * Lighting slice for visual store
 *
 * Manages all lighting-related state including:
 * - Basic directional lighting
 * - Enhanced lighting (specular, diffuse, tone mapping)
 * - Multi-light system (array of light sources)
 */

import type { StateCreator } from 'zustand'
import type { LightSource, LightType, TransformMode } from '@/rendering/lights/types'
import {
  MAX_LIGHTS,
  MIN_LIGHTS,
  clampConeAngle,
  clampIntensity,
  clampPenumbra,
  cloneLight,
  createNewLight,
  normalizeRotationTupleSigned,
} from '@/rendering/lights/types'
import type { ToneMappingAlgorithm } from '@/rendering/shaders/types'
import type { ShadowAnimationMode, ShadowQuality } from '@/rendering/shadows/types'
import { SHADOW_SOFTNESS_RANGE } from '@/rendering/shadows/constants'
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
  DEFAULT_SHADOW_ANIMATION_MODE,
  DEFAULT_SHADOW_ENABLED,
  DEFAULT_SHADOW_QUALITY,
  DEFAULT_SHADOW_SOFTNESS,
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
 * pbrStore for better organization. Use usePBRStore for face/edge/ground PBR.
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

  // --- Shadow System ---
  shadowEnabled: boolean
  shadowQuality: ShadowQuality
  shadowSoftness: number
  shadowAnimationMode: ShadowAnimationMode

  // --- Shadow Map Settings (for mesh-based objects like polytopes) ---
  /** Shadow map bias to prevent shadow acne (0-0.01 range) */
  shadowMapBias: number
  /** Shadow map blur radius for softer edges (0-10 range) */
  shadowMapBlur: number
}

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

  // --- Shadow System Actions ---
  setShadowEnabled: (enabled: boolean) => void
  setShadowQuality: (quality: ShadowQuality) => void
  setShadowSoftness: (softness: number) => void
  setShadowAnimationMode: (mode: ShadowAnimationMode) => void

  // --- Shadow Map Actions (for mesh-based objects like polytopes) ---
  setShadowMapBias: (bias: number) => void
  setShadowMapBlur: (blur: number) => void

  // --- Version Bump (for preset loading) ---
  /** Manually bump version counter (used after direct setState calls) */
  bumpVersion: () => void

  reset: () => void
}

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

  // Shadow system
  shadowEnabled: DEFAULT_SHADOW_ENABLED,
  shadowQuality: DEFAULT_SHADOW_QUALITY,
  shadowSoftness: DEFAULT_SHADOW_SOFTNESS,
  shadowAnimationMode: DEFAULT_SHADOW_ANIMATION_MODE,

  // Shadow map settings (for mesh-based objects)
  shadowMapBias: 0.001,
  shadowMapBlur: 2,
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
    const normalized = ((angle % 360) + 360) % 360
    set({ lightHorizontalAngle: normalized })
  },

  setLightVerticalAngle: (angle: number) => {
    set({ lightVerticalAngle: Math.max(-90, Math.min(90, angle)) })
  },

  setAmbientEnabled: (enabled: boolean) => {
    set((state) => ({
      ambientEnabled: enabled,
      version: state.version + 1,
    }))
  },

  setAmbientIntensity: (intensity: number) => {
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
    set({ lightStrength: Math.max(0, Math.min(3, strength)) })
  },

  setToneMappingEnabled: (enabled: boolean) => {
    set({ toneMappingEnabled: enabled })
  },

  setToneMappingAlgorithm: (algorithm: ToneMappingAlgorithm) => {
    set({ toneMappingAlgorithm: algorithm })
  },

  setExposure: (exposure: number) => {
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
        return {
          ...light,
          ...updates,
          intensity:
            updates.intensity !== undefined ? clampIntensity(updates.intensity) : light.intensity,
          coneAngle:
            updates.coneAngle !== undefined ? clampConeAngle(updates.coneAngle) : light.coneAngle,
          penumbra:
            updates.penumbra !== undefined ? clampPenumbra(updates.penumbra) : light.penumbra,
          rotation:
            updates.rotation !== undefined
              ? normalizeRotationTupleSigned(updates.rotation)
              : light.rotation,
        }
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

  // --- Shadow System Actions ---
  setShadowEnabled: (enabled: boolean) => {
    set({ shadowEnabled: enabled })
  },

  setShadowQuality: (quality: ShadowQuality) => {
    set({ shadowQuality: quality })
  },

  setShadowSoftness: (softness: number) => {
    set({
      shadowSoftness: Math.max(
        SHADOW_SOFTNESS_RANGE.min,
        Math.min(SHADOW_SOFTNESS_RANGE.max, softness)
      ),
    })
  },

  setShadowAnimationMode: (mode: ShadowAnimationMode) => {
    set({ shadowAnimationMode: mode })
  },

  // --- Shadow Map Actions (for mesh-based objects) ---
  setShadowMapBias: (bias: number) => {
    set({ shadowMapBias: Math.max(0, Math.min(0.01, bias)) })
  },

  setShadowMapBlur: (blur: number) => {
    set({ shadowMapBlur: Math.max(0, Math.min(10, blur)) })
  },

  bumpVersion: () => {
    set((state) => ({ version: state.version + 1 }))
  },

  reset: () => {
    set(LIGHTING_INITIAL_STATE)
  },
})
