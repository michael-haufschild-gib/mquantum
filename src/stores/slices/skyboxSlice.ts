import type { StateCreator } from 'zustand'

import { normalizeOpaqueHexColor } from '@/lib/colors/colorUtils'
import { logger } from '@/lib/logger'

import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_SKYBOX_ANIMATION_MODE,
  DEFAULT_SKYBOX_ANIMATION_SPEED,
  DEFAULT_SKYBOX_ENABLED,
  DEFAULT_SKYBOX_HIGH_QUALITY,
  DEFAULT_SKYBOX_INTENSITY,
  DEFAULT_SKYBOX_MODE,
  DEFAULT_SKYBOX_PROCEDURAL_SETTINGS,
  DEFAULT_SKYBOX_ROTATION,
  DEFAULT_SKYBOX_SELECTION,
  DEFAULT_SKYBOX_TEXTURE,
  PROCEDURAL_SKYBOX_MODES,
  SKYBOX_ANIMATION_MODES,
  SKYBOX_MODES,
  SKYBOX_SELECTIONS,
  SKYBOX_TEXTURES,
  type SkyboxAnimationMode,
  type SkyboxMode,
  type SkyboxProceduralSettings,
  type SkyboxSelection,
  type SkyboxTexture,
} from '../defaults/visualDefaults'

/**
 * Skybox slice state fields.
 */
export interface SkyboxSliceState {
  /** Unified skybox selection - the single source of truth for what's displayed */
  skyboxSelection: SkyboxSelection
  /** Derived: whether skybox is enabled (selection !== 'none') */
  skyboxEnabled: boolean
  /** Derived: current mode based on selection */
  skyboxMode: SkyboxMode
  /** Derived: current texture for classic mode */
  skyboxTexture: SkyboxTexture
  skyboxIntensity: number
  skyboxRotation: number
  skyboxAnimationMode: SkyboxAnimationMode
  skyboxAnimationSpeed: number
  skyboxHighQuality: boolean
  /** Whether skybox texture is currently loading */
  skyboxLoading: boolean
  /** Procedural settings for new modes */
  proceduralSettings: SkyboxProceduralSettings
  /**
   * Loaded CubeTexture for classic skybox mode.
   * Set by SkyboxLoader when KTX2 texture finishes loading.
   * Used by CubemapCapturePass to set scene.background and generate PMREM.
   */
  classicCubeTexture: unknown | null
  /** Background color shown behind skybox */
  backgroundColor: string
}

/**
 * Skybox slice actions.
 */
export interface SkyboxSliceActions {
  /** Set unified skybox selection - updates enabled, mode, and texture automatically */
  setSkyboxSelection: (selection: SkyboxSelection) => void
  setSkyboxEnabled: (enabled: boolean) => void
  setSkyboxMode: (mode: SkyboxMode) => void
  setSkyboxTexture: (texture: SkyboxTexture) => void
  setSkyboxIntensity: (intensity: number) => void
  setSkyboxRotation: (rotation: number) => void
  setSkyboxAnimationMode: (mode: SkyboxAnimationMode) => void
  setSkyboxAnimationSpeed: (speed: number) => void
  setSkyboxHighQuality: (highQuality: boolean) => void
  setSkyboxLoading: (loading: boolean) => void
  setProceduralSettings: (settings: Partial<SkyboxProceduralSettings>) => void
  /** Set the loaded CubeTexture for classic skybox mode (used by render graph) */
  setClassicCubeTexture: (texture: unknown | null) => void
  /** Set background color */
  setBackgroundColor: (color: string) => void
  resetSkyboxSettings: () => void
}

/**
 * Combined skybox slice type.
 */
export type SkyboxSlice = SkyboxSliceState & SkyboxSliceActions

export const SKYBOX_INITIAL_STATE: SkyboxSliceState = {
  skyboxSelection: DEFAULT_SKYBOX_SELECTION,
  skyboxEnabled: DEFAULT_SKYBOX_ENABLED,
  skyboxMode: DEFAULT_SKYBOX_MODE,
  skyboxTexture: DEFAULT_SKYBOX_TEXTURE,
  skyboxIntensity: DEFAULT_SKYBOX_INTENSITY,
  skyboxRotation: DEFAULT_SKYBOX_ROTATION,
  skyboxAnimationMode: DEFAULT_SKYBOX_ANIMATION_MODE,
  skyboxAnimationSpeed: DEFAULT_SKYBOX_ANIMATION_SPEED,
  skyboxHighQuality: DEFAULT_SKYBOX_HIGH_QUALITY,
  skyboxLoading: false,
  proceduralSettings: DEFAULT_SKYBOX_PROCEDURAL_SETTINGS,
  classicCubeTexture: null,
  backgroundColor: DEFAULT_BACKGROUND_COLOR,
}

const PROCEDURAL_MODE_SET = new Set<SkyboxMode>(PROCEDURAL_SKYBOX_MODES)
const SKYBOX_SELECTION_SET = new Set<SkyboxSelection>(SKYBOX_SELECTIONS)
const SKYBOX_MODE_SET = new Set<SkyboxMode>(SKYBOX_MODES)
const SKYBOX_TEXTURE_SET = new Set<SkyboxTexture>(SKYBOX_TEXTURES)
const SKYBOX_ANIMATION_MODE_SET = new Set<SkyboxAnimationMode>(SKYBOX_ANIMATION_MODES)

function isSkyboxSelection(value: unknown): value is SkyboxSelection {
  return typeof value === 'string' && SKYBOX_SELECTION_SET.has(value as SkyboxSelection)
}

function isSkyboxMode(value: unknown): value is SkyboxMode {
  return typeof value === 'string' && SKYBOX_MODE_SET.has(value as SkyboxMode)
}

function isSkyboxTexture(value: unknown): value is SkyboxTexture {
  return typeof value === 'string' && SKYBOX_TEXTURE_SET.has(value as SkyboxTexture)
}

function isSkyboxAnimationMode(value: unknown): value is SkyboxAnimationMode {
  return typeof value === 'string' && SKYBOX_ANIMATION_MODE_SET.has(value as SkyboxAnimationMode)
}

function isFiniteSkyboxNumericInput(value: number): boolean {
  return Number.isFinite(value)
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function warnInvalidProceduralSetting(path: string, value: unknown): void {
  logger.warn(`[skyboxSlice] Ignoring invalid procedural setting "${path}":`, value)
}

function warnInvalidSkyboxSetting(path: string, value: unknown): void {
  logger.warn(`[skyboxSlice] Ignoring invalid ${path}:`, value)
}

/** Validate a numeric value against a numeric schema entry. */
function sanitizeNumericValue(value: unknown, path: string): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  warnInvalidProceduralSetting(path, value)
  return undefined
}

/** Validate an array value against an array schema entry. */
function sanitizeArrayValue(
  value: unknown,
  schema: unknown[],
  path: string
): unknown[] | undefined {
  if (!Array.isArray(value) || value.length !== schema.length) {
    warnInvalidProceduralSetting(path, value)
    return undefined
  }

  if (!schema.every((item) => typeof item === 'number')) return value

  const finiteNumberTuple: number[] = []
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index]
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      warnInvalidProceduralSetting(`${path}[${index}]`, item)
      return undefined
    }
    finiteNumberTuple.push(item)
  }
  return finiteNumberTuple
}

/** Validate an object value against an object schema entry. */
function sanitizeObjectValue(
  value: unknown,
  schema: Record<string, unknown>,
  path: string
): Record<string, unknown> | undefined {
  if (!isObjectRecord(value)) {
    warnInvalidProceduralSetting(path, value)
    return undefined
  }

  const sanitized: Record<string, unknown> = {}
  for (const [key, candidateValue] of Object.entries(value)) {
    if (!(key in schema)) {
      warnInvalidProceduralSetting(`${path}.${key}`, candidateValue)
      continue
    }
    const sanitizedChild = sanitizeProceduralValue(candidateValue, schema[key], `${path}.${key}`)
    if (sanitizedChild !== undefined) {
      sanitized[key] = sanitizedChild
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

function sanitizeProceduralValue(
  value: unknown,
  schema: unknown,
  path: string
): unknown | undefined {
  if (typeof schema === 'number') return sanitizeNumericValue(value, path)
  if (Array.isArray(schema)) return sanitizeArrayValue(value, schema, path)
  if (isObjectRecord(schema)) return sanitizeObjectValue(value, schema, path)
  return undefined
}

/** Validate a procedural skybox settings patch against the default settings schema. */
export function sanitizeSkyboxProceduralSettingsPatch(
  settings: unknown
): Partial<SkyboxProceduralSettings> {
  const sanitized = sanitizeProceduralValue(
    settings,
    DEFAULT_SKYBOX_PROCEDURAL_SETTINGS,
    'proceduralSettings'
  )

  if (!isObjectRecord(sanitized)) {
    return {}
  }

  return sanitized as Partial<SkyboxProceduralSettings>
}

function deepMergeRecord(
  base: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base }

  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = merged[key]
    if (isObjectRecord(baseValue) && isObjectRecord(patchValue)) {
      merged[key] = deepMergeRecord(baseValue, patchValue)
      continue
    }
    merged[key] = patchValue
  }

  return merged
}

/** Deep-merge a sanitized procedural skybox patch into existing/default settings. */
export function mergeSkyboxProceduralSettings(
  base: SkyboxProceduralSettings,
  patch: Partial<SkyboxProceduralSettings>
): SkyboxProceduralSettings {
  const baseRecord: Record<string, unknown> = { ...base }
  const patchRecord: Record<string, unknown> = { ...patch }
  return deepMergeRecord(baseRecord, patchRecord) as unknown as SkyboxProceduralSettings
}

/**
 * Helper to derive state from a skybox selection
 * @param selection - The skybox selection to derive state from
 * @returns Derived state object with enabled, mode, and texture
 */
function deriveStateFromSelection(selection: SkyboxSelection): {
  skyboxEnabled: boolean
  skyboxMode: SkyboxMode
  skyboxTexture: SkyboxTexture
} {
  if (selection === 'none') {
    return {
      skyboxEnabled: false,
      skyboxMode: 'classic',
      skyboxTexture: 'none',
    }
  }

  // Check if it's any procedural mode
  if (PROCEDURAL_MODE_SET.has(selection as SkyboxMode)) {
    return {
      skyboxEnabled: true,
      skyboxMode: selection as SkyboxMode,
      skyboxTexture: 'space_blue', // Keep a valid texture for potential mode switch
    }
  }

  // Classic texture selection
  return {
    skyboxEnabled: true,
    skyboxMode: 'classic',
    skyboxTexture: selection as SkyboxTexture,
  }
}

function deriveSelectionFromModeAndTexture(
  mode: SkyboxMode,
  texture: SkyboxTexture
): SkyboxSelection {
  if (mode !== 'classic') {
    return mode
  }
  if (texture !== 'none') {
    return texture
  }
  return 'none'
}

export const createSkyboxSlice: StateCreator<SkyboxSlice, [], [], SkyboxSlice> = (set) => ({
  ...SKYBOX_INITIAL_STATE,

  setSkyboxSelection: (selection: SkyboxSelection) => {
    if (!isSkyboxSelection(selection)) {
      warnInvalidSkyboxSetting('skybox selection', selection)
      return
    }
    set({
      skyboxSelection: selection,
      ...deriveStateFromSelection(selection),
    })
  },
  setSkyboxEnabled: (enabled: boolean) =>
    set((state) => {
      const nextSelection = enabled
        ? (() => {
            const candidate = deriveSelectionFromModeAndTexture(
              state.skyboxMode,
              state.skyboxTexture
            )
            return candidate === 'none' ? 'space_blue' : candidate
          })()
        : 'none'

      return {
        skyboxSelection: nextSelection,
        ...deriveStateFromSelection(nextSelection),
      }
    }),
  setSkyboxMode: (mode: SkyboxMode) => {
    if (!isSkyboxMode(mode)) {
      warnInvalidSkyboxSetting('skybox mode', mode)
      return
    }
    set((state) => {
      const nextSelection: SkyboxSelection =
        mode === 'classic'
          ? state.skyboxTexture === 'none'
            ? 'space_blue'
            : state.skyboxTexture
          : mode

      return {
        skyboxSelection: nextSelection,
        ...deriveStateFromSelection(nextSelection),
      }
    })
  },
  setSkyboxTexture: (texture: SkyboxTexture) => {
    if (!isSkyboxTexture(texture)) {
      warnInvalidSkyboxSetting('skybox texture', texture)
      return
    }
    const nextSelection: SkyboxSelection = texture === 'none' ? 'none' : texture
    set({
      skyboxSelection: nextSelection,
      ...deriveStateFromSelection(nextSelection),
    })
  },
  setSkyboxIntensity: (intensity: number) => {
    if (!isFiniteSkyboxNumericInput(intensity)) {
      logger.warn('[skyboxSlice] Ignoring non-finite skybox intensity:', intensity)
      return
    }
    set({ skyboxIntensity: Math.max(0, Math.min(10, intensity)) })
  },
  setSkyboxRotation: (rotation: number) => {
    if (!isFiniteSkyboxNumericInput(rotation)) {
      logger.warn('[skyboxSlice] Ignoring non-finite skybox rotation:', rotation)
      return
    }
    // Normalize rotation to [0, 2π) range to prevent precision issues
    const normalized = ((rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    set({ skyboxRotation: normalized })
  },
  setSkyboxAnimationMode: (mode: SkyboxAnimationMode) => {
    if (!isSkyboxAnimationMode(mode)) {
      warnInvalidSkyboxSetting('skybox animation mode', mode)
      return
    }
    set({ skyboxAnimationMode: mode })
  },
  setSkyboxAnimationSpeed: (speed: number) => {
    if (!isFiniteSkyboxNumericInput(speed)) {
      logger.warn('[skyboxSlice] Ignoring non-finite skybox animation speed:', speed)
      return
    }
    set({ skyboxAnimationSpeed: Math.max(0, Math.min(5, speed)) })
  },
  setSkyboxHighQuality: (highQuality: boolean) => set({ skyboxHighQuality: highQuality }),
  setSkyboxLoading: (loading: boolean) => set({ skyboxLoading: loading }),
  setProceduralSettings: (settings: Partial<SkyboxProceduralSettings>) =>
    set((state) => {
      const sanitizedSettings = sanitizeSkyboxProceduralSettingsPatch(settings)
      if (Object.keys(sanitizedSettings).length === 0) {
        return {}
      }

      return {
        proceduralSettings: mergeSkyboxProceduralSettings(
          state.proceduralSettings,
          sanitizedSettings
        ),
      }
    }),
  setClassicCubeTexture: (texture: unknown | null) => set({ classicCubeTexture: texture }),
  setBackgroundColor: (color: string) => {
    const normalized = normalizeOpaqueHexColor(color)
    if (!normalized) {
      logger.warn('[skyboxSlice] Ignoring invalid background color:', color)
      return
    }
    set({ backgroundColor: normalized })
  },
  resetSkyboxSettings: () =>
    set({
      skyboxSelection: DEFAULT_SKYBOX_SELECTION,
      ...deriveStateFromSelection(DEFAULT_SKYBOX_SELECTION),
      skyboxIntensity: DEFAULT_SKYBOX_INTENSITY,
      skyboxRotation: DEFAULT_SKYBOX_ROTATION,
      skyboxAnimationMode: DEFAULT_SKYBOX_ANIMATION_MODE,
      skyboxAnimationSpeed: DEFAULT_SKYBOX_ANIMATION_SPEED,
      skyboxHighQuality: DEFAULT_SKYBOX_HIGH_QUALITY,
      proceduralSettings: DEFAULT_SKYBOX_PROCEDURAL_SETTINGS,
      classicCubeTexture: null,
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
    }),
})
