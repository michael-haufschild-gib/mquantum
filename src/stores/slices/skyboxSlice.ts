import type { StateCreator } from 'zustand'
import {
  type SkyboxAnimationMode,
  type SkyboxMode,
  type SkyboxProceduralSettings,
  type SkyboxSelection,
  type SkyboxTexture,
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

/** All procedural mode prefixes */
const PROCEDURAL_MODES = [
  'procedural_aurora',
  'procedural_nebula',
  'procedural_crystalline',
  'procedural_horizon',
  'procedural_ocean',
  'procedural_twilight',
] as const

function isFiniteSkyboxNumericInput(value: number): boolean {
  return Number.isFinite(value)
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function warnInvalidProceduralSetting(path: string, value: unknown): void {
  if (import.meta.env.DEV) {
    console.warn(`[skyboxSlice] Ignoring invalid procedural setting "${path}":`, value)
  }
}

function sanitizeProceduralValue(value: unknown, schema: unknown, path: string): unknown | undefined {
  if (typeof schema === 'number') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    warnInvalidProceduralSetting(path, value)
    return undefined
  }

  if (Array.isArray(schema)) {
    if (!Array.isArray(value) || value.length !== schema.length) {
      warnInvalidProceduralSetting(path, value)
      return undefined
    }

    if (schema.every((item) => typeof item === 'number')) {
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

    return value
  }

  if (!isObjectRecord(schema)) {
    return undefined
  }

  if (!isObjectRecord(value)) {
    warnInvalidProceduralSetting(path, value)
    return undefined
  }

  const schemaRecord = schema as Record<string, unknown>
  const sanitized: Record<string, unknown> = {}
  for (const [key, candidateValue] of Object.entries(value)) {
    if (!(key in schemaRecord)) {
      warnInvalidProceduralSetting(`${path}.${key}`, candidateValue)
      continue
    }

    const sanitizedChild = sanitizeProceduralValue(
      candidateValue,
      schemaRecord[key],
      `${path}.${key}`
    )
    if (sanitizedChild !== undefined) {
      sanitized[key] = sanitizedChild
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

function sanitizeProceduralSettingsPatch(
  settings: Partial<SkyboxProceduralSettings>
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

function mergeProceduralSettings(
  base: SkyboxProceduralSettings,
  patch: Partial<SkyboxProceduralSettings>
): SkyboxProceduralSettings {
  return deepMergeRecord(
    base as Record<string, unknown>,
    patch as Record<string, unknown>
  ) as SkyboxProceduralSettings
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
  if (PROCEDURAL_MODES.includes(selection as (typeof PROCEDURAL_MODES)[number])) {
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

  setSkyboxSelection: (selection: SkyboxSelection) =>
    set({
      skyboxSelection: selection,
      ...deriveStateFromSelection(selection),
    }),
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
  setSkyboxMode: (mode: SkyboxMode) =>
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
    }),
  setSkyboxTexture: (texture: SkyboxTexture) => {
    const nextSelection: SkyboxSelection = texture === 'none' ? 'none' : texture
    set({
      skyboxSelection: nextSelection,
      ...deriveStateFromSelection(nextSelection),
    })
  },
  setSkyboxIntensity: (intensity: number) => {
    if (!isFiniteSkyboxNumericInput(intensity)) {
      if (import.meta.env.DEV) {
        console.warn('[skyboxSlice] Ignoring non-finite skybox intensity:', intensity)
      }
      return
    }
    set({ skyboxIntensity: Math.max(0, Math.min(10, intensity)) })
  },
  setSkyboxRotation: (rotation: number) => {
    if (!isFiniteSkyboxNumericInput(rotation)) {
      if (import.meta.env.DEV) {
        console.warn('[skyboxSlice] Ignoring non-finite skybox rotation:', rotation)
      }
      return
    }
    // Normalize rotation to [0, 2π) range to prevent precision issues
    const normalized = ((rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    set({ skyboxRotation: normalized })
  },
  setSkyboxAnimationMode: (mode: SkyboxAnimationMode) => set({ skyboxAnimationMode: mode }),
  setSkyboxAnimationSpeed: (speed: number) => {
    if (!isFiniteSkyboxNumericInput(speed)) {
      if (import.meta.env.DEV) {
        console.warn('[skyboxSlice] Ignoring non-finite skybox animation speed:', speed)
      }
      return
    }
    set({ skyboxAnimationSpeed: Math.max(0, Math.min(5, speed)) })
  },
  setSkyboxHighQuality: (highQuality: boolean) => set({ skyboxHighQuality: highQuality }),
  setSkyboxLoading: (loading: boolean) => set({ skyboxLoading: loading }),
  setProceduralSettings: (settings: Partial<SkyboxProceduralSettings>) =>
    set((state) => {
      const sanitizedSettings = sanitizeProceduralSettingsPatch(settings)
      if (Object.keys(sanitizedSettings).length === 0) {
        return {}
      }

      return {
        proceduralSettings: mergeProceduralSettings(state.proceduralSettings, sanitizedSettings),
      }
    }),
  setClassicCubeTexture: (texture: unknown | null) =>
    set({ classicCubeTexture: texture }),
  setBackgroundColor: (color: string) => set({ backgroundColor: color }),
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
