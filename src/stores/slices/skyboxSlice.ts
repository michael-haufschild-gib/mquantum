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

export const createSkyboxSlice: StateCreator<SkyboxSlice, [], [], SkyboxSlice> = (set) => ({
  ...SKYBOX_INITIAL_STATE,

  setSkyboxSelection: (selection: SkyboxSelection) =>
    set({
      skyboxSelection: selection,
      ...deriveStateFromSelection(selection),
    }),
  setSkyboxEnabled: (enabled: boolean) => set({ skyboxEnabled: enabled }),
  setSkyboxMode: (mode: SkyboxMode) => set({ skyboxMode: mode }),
  setSkyboxTexture: (texture: SkyboxTexture) => set({ skyboxTexture: texture }),
  setSkyboxIntensity: (intensity: number) =>
    set({ skyboxIntensity: Math.max(0, Math.min(10, intensity)) }),
  setSkyboxRotation: (rotation: number) => {
    // Normalize rotation to [0, 2π) range to prevent precision issues
    const normalized = ((rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    set({ skyboxRotation: normalized })
  },
  setSkyboxAnimationMode: (mode: SkyboxAnimationMode) => set({ skyboxAnimationMode: mode }),
  setSkyboxAnimationSpeed: (speed: number) =>
    set({ skyboxAnimationSpeed: Math.max(0, Math.min(5, speed)) }),
  setSkyboxHighQuality: (highQuality: boolean) => set({ skyboxHighQuality: highQuality }),
  setSkyboxLoading: (loading: boolean) => set({ skyboxLoading: loading }),
  setProceduralSettings: (settings: Partial<SkyboxProceduralSettings>) =>
    set((state) => ({
      proceduralSettings: { ...state.proceduralSettings, ...settings },
    })),
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
