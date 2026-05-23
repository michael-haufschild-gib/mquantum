/**
 * Performance state management using Zustand
 *
 * Manages performance optimization settings for rendering.
 * These settings are device-specific and NOT included in share URLs.
 *
 */

import { create } from 'zustand'

import type { DeviceCapabilities, GPUTier } from '@/lib/deviceCapabilities'
import { DEFAULT_CAPABILITIES, DESKTOP_DEFAULT_RESOLUTION_SCALE } from '@/lib/deviceCapabilities'
import { logger } from '@/lib/logger'
import type { ShaderDebugInfo } from '@/types/shaderDebug'

import { DEFAULT_MAX_FPS, MAX_MAX_FPS, MIN_MAX_FPS } from '../defaults/visualDefaults'

// ============================================================================
// Constants
// ============================================================================

/** localStorage key for persisting render resolution scale */
const RESOLUTION_SCALE_KEY = 'mdim_render_resolution_scale'

/** localStorage key for persisting max FPS */
const MAX_FPS_KEY = 'mdim_max_fps'

/** localStorage key for persisting density grid resolution */
const DENSITY_GRID_RESOLUTION_KEY = 'mdim_density_grid_resolution'

/**
 * Throttled diagnostic for localStorage failures.
 *
 * Private browsing, exhausted quota, or storage-blocking extensions can make
 * every read/write throw. We log the first occurrence per key with the error
 * detail so it shows up in DevTools, then suppress further messages for that
 * key to avoid spamming the console on every persist.
 */
const reportedStorageFailures = new Set<string>()
function reportStorageFailure(op: 'read' | 'write', key: string, err: unknown): void {
  const tag = `${op}:${key}`
  if (reportedStorageFailures.has(tag)) return
  reportedStorageFailures.add(tag)
  const message = err instanceof Error ? err.message : String(err)
  logger.warn(
    `[performanceStore] localStorage ${op} failed for key "${key}" (${message}). ` +
      `Persistence disabled for this preference; defaults will be used. ` +
      `Common causes: private browsing, full quota, extension blocking storage.`
  )
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/** Valid density grid resolution options. */
export type DensityGridResolution = 64 | 96 | 128 | 256

const VALID_DENSITY_GRID_RESOLUTIONS = new Set<number>([64, 96, 128, 256])

/** Default density grid resolution. */
export const DEFAULT_DENSITY_GRID_RESOLUTION: DensityGridResolution = 96

/**
 * Parse persisted numeric strings without accepting partial prefixes.
 * Rejects malformed payloads such as `0.75junk` or `45fps`.
 */
function parseStrictPersistedNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    return null
  }
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

/**
 * Load persisted render resolution scale from localStorage.
 * @returns The persisted value, or null if not set
 */
export function loadPersistedResolutionScale(): number | null {
  try {
    const stored = localStorage.getItem(RESOLUTION_SCALE_KEY)
    if (stored !== null) {
      const value = parseStrictPersistedNumber(stored)
      if (value !== null && value >= 0.1 && value <= 1.0) {
        return value
      }
    }
  } catch (err) {
    reportStorageFailure('read', RESOLUTION_SCALE_KEY, err)
  }
  return null
}

/**
 * Persist render resolution scale to localStorage.
 * @param scale - The resolution scale to persist
 */
function persistResolutionScale(scale: number): void {
  try {
    localStorage.setItem(RESOLUTION_SCALE_KEY, scale.toString())
  } catch (err) {
    reportStorageFailure('write', RESOLUTION_SCALE_KEY, err)
  }
}

/**
 * Check if user has previously set a resolution preference.
 * Used by useDeviceCapabilities to avoid overriding user preferences.
 */
export function hasPersistedResolutionScale(): boolean {
  return loadPersistedResolutionScale() !== null
}

/**
 * Load persisted max FPS from localStorage.
 * @returns The persisted value, or null if not set
 */
export function loadPersistedMaxFps(): number | null {
  try {
    const stored = localStorage.getItem(MAX_FPS_KEY)
    if (stored !== null) {
      const value = parseStrictPersistedNumber(stored)
      if (value !== null && value >= MIN_MAX_FPS && value <= MAX_MAX_FPS) {
        return value
      }
    }
  } catch (err) {
    reportStorageFailure('read', MAX_FPS_KEY, err)
  }
  return null
}

/**
 * Persist max FPS to localStorage.
 * @param fps - The max FPS to persist
 */
function persistMaxFps(fps: number): void {
  try {
    localStorage.setItem(MAX_FPS_KEY, fps.toString())
  } catch (err) {
    reportStorageFailure('write', MAX_FPS_KEY, err)
  }
}

/**
 * Check if user has previously set a max FPS preference.
 * Used by useDeviceCapabilities to avoid overriding user preferences.
 */
export function hasPersistedMaxFps(): boolean {
  return loadPersistedMaxFps() !== null
}

function loadPersistedDensityGridResolution(): DensityGridResolution | null {
  try {
    const stored = localStorage.getItem(DENSITY_GRID_RESOLUTION_KEY)
    if (stored !== null) {
      const value = parseStrictPersistedNumber(stored)
      if (value !== null && VALID_DENSITY_GRID_RESOLUTIONS.has(value)) {
        return value as DensityGridResolution
      }
    }
  } catch (err) {
    reportStorageFailure('read', DENSITY_GRID_RESOLUTION_KEY, err)
  }
  return null
}

function persistDensityGridResolution(resolution: DensityGridResolution): void {
  try {
    localStorage.setItem(DENSITY_GRID_RESOLUTION_KEY, resolution.toString())
  } catch (err) {
    reportStorageFailure('write', DENSITY_GRID_RESOLUTION_KEY, err)
  }
}

// ============================================================================
// Types
// ============================================================================

/** Performance state interface */
interface PerformanceState {
  // -------------------------------------------------------------------------
  // Device Capabilities (detected once at startup)
  // -------------------------------------------------------------------------

  /** GPU performance tier (0=fallback, 1=low, 2=medium, 3=high) */
  gpuTier: GPUTier

  /** Whether device has a mobile GPU */
  isMobileGPU: boolean

  /** GPU name/identifier (for debugging) */
  gpuName: string

  /** Whether device capability detection has completed */
  deviceCapabilitiesDetected: boolean

  // -------------------------------------------------------------------------
  // Scene Loading State
  // -------------------------------------------------------------------------

  /** Whether a scene/style preset is being loaded (pauses animation) */
  sceneTransitioning: boolean

  /** Whether a scene preset is currently being loaded (semantic flag for hooks to skip automatic behavior) */
  isLoadingScene: boolean

  /** Counter incremented on each scene/style preset load. Used to trigger material recreation. */
  presetLoadVersion: number

  // -------------------------------------------------------------------------
  // Temporal Reprojection (Schroedinger raymarching)
  // -------------------------------------------------------------------------

  /** Whether temporal reprojection is enabled */
  temporalReprojectionEnabled: boolean

  /** Whether camera has teleported (disables reprojection for 1 frame) */
  cameraTeleported: boolean

  /** Whether eigenfunction caching is enabled (compile-time shader specialization) */
  eigenfunctionCacheEnabled: boolean

  /** Whether cached analytical gradient path is enabled for harmonic oscillator rendering */
  analyticalGradientEnabled: boolean

  /** Whether fast eigencache interpolation is enabled (faster, lower-fidelity path). */
  fastEigenInterpolationEnabled: boolean

  // -------------------------------------------------------------------------
  // Render Resolution Scale
  // -------------------------------------------------------------------------

  /** Base render resolution scale (0.5 = half res, 1.0 = full res) */
  renderResolutionScale: number

  // -------------------------------------------------------------------------
  // FPS Limiting
  // -------------------------------------------------------------------------

  /** Maximum frames per second (device-specific preference) */
  maxFps: number

  /** 3D density grid resolution per axis (compile-time shader constant). */
  densityGridResolution: DensityGridResolution

  // Shader Debugging
  shaderDebugInfos: Record<string, ShaderDebugInfo>
  shaderOverrides: string[]

  // -------------------------------------------------------------------------
  // Shader Compilation State
  // -------------------------------------------------------------------------

  /** Set of shader names currently being compiled (supports multiple simultaneous compilations) */
  compilingShaders: Set<string>

  /** Whether any shader is currently being compiled (derived from compilingShaders.size > 0) */
  isShaderCompiling: boolean

  /** Message to display during shader compilation */
  shaderCompilationMessage: string

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  // Device Capabilities
  setDeviceCapabilities: (capabilities: DeviceCapabilities) => void

  // Scene Loading State
  setSceneTransitioning: (transitioning: boolean) => void
  setIsLoadingScene: (loading: boolean) => void
  incrementPresetLoadVersion: () => void

  // Temporal Reprojection
  setTemporalReprojectionEnabled: (enabled: boolean) => void
  setCameraTeleported: (teleported: boolean) => void

  // Eigenfunction Cache
  setEigenfunctionCacheEnabled: (enabled: boolean) => void
  setAnalyticalGradientEnabled: (enabled: boolean) => void
  setFastEigenInterpolationEnabled: (enabled: boolean) => void

  // Render Resolution Scale
  setRenderResolutionScale: (scale: number) => void

  // Density Grid Resolution
  setDensityGridResolution: (resolution: DensityGridResolution) => void

  // FPS Limiting
  setMaxFps: (fps: number) => void

  // Shader Debugging
  setShaderDebugInfo: (key: string, info: ShaderDebugInfo | null) => void
  toggleShaderModule: (moduleName: string) => void
  resetShaderOverrides: () => void

  // Shader Compilation
  setShaderCompiling: (shaderName: string, compiling: boolean) => void

  // General
  reset: () => void
}

// ============================================================================
// Store
// ============================================================================

/**
 * Performance optimization store.
 *
 * IMPORTANT: This store is excluded from URL serialization.
 * Performance settings are device-specific and should not be shared.
 */
export const usePerformanceStore = create<PerformanceState>((set) => ({
  // -------------------------------------------------------------------------
  // Initial State
  // -------------------------------------------------------------------------

  // Device Capabilities (defaults until detection completes)
  gpuTier: DEFAULT_CAPABILITIES.gpuTier,
  isMobileGPU: DEFAULT_CAPABILITIES.isMobileGPU,
  gpuName: DEFAULT_CAPABILITIES.gpuName,
  deviceCapabilitiesDetected: false,

  // Scene Loading State
  sceneTransitioning: false,
  isLoadingScene: false,
  presetLoadVersion: 0,

  // Temporal Reprojection
  temporalReprojectionEnabled: true,
  cameraTeleported: false,

  // Eigenfunction Cache
  eigenfunctionCacheEnabled: true,
  analyticalGradientEnabled: true,
  fastEigenInterpolationEnabled: true,

  // Render Resolution Scale (load from localStorage, default to desktop default)
  renderResolutionScale: loadPersistedResolutionScale() ?? DESKTOP_DEFAULT_RESOLUTION_SCALE,

  // FPS Limiting (load from localStorage, default to DEFAULT_MAX_FPS)
  maxFps: loadPersistedMaxFps() ?? DEFAULT_MAX_FPS,

  // Density Grid Resolution (load from localStorage, default 96)
  densityGridResolution: loadPersistedDensityGridResolution() ?? DEFAULT_DENSITY_GRID_RESOLUTION,

  // Shader Debugging
  shaderDebugInfos: {},
  shaderOverrides: [],

  // Shader Compilation State
  compilingShaders: new Set<string>(),
  isShaderCompiling: false,
  shaderCompilationMessage: '',

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  // Device Capabilities
  setDeviceCapabilities: (capabilities: DeviceCapabilities) => {
    set({
      gpuTier: capabilities.gpuTier,
      isMobileGPU: capabilities.isMobileGPU,
      gpuName: capabilities.gpuName,
      deviceCapabilitiesDetected: true,
    })
  },

  // Scene Loading State
  setSceneTransitioning: (transitioning: boolean) => {
    set({ sceneTransitioning: transitioning })
  },

  setIsLoadingScene: (loading: boolean) => {
    set({ isLoadingScene: loading })
  },

  incrementPresetLoadVersion: () => {
    set((state) => ({ presetLoadVersion: state.presetLoadVersion + 1 }))
  },

  // Temporal Reprojection
  setTemporalReprojectionEnabled: (enabled: boolean) => {
    if (!isBoolean(enabled)) return
    set({ temporalReprojectionEnabled: enabled })
  },

  setCameraTeleported: (teleported: boolean) => {
    set({ cameraTeleported: teleported })
  },

  // Eigenfunction Cache
  setEigenfunctionCacheEnabled: (enabled: boolean) => {
    if (!isBoolean(enabled)) return
    set({ eigenfunctionCacheEnabled: enabled })
  },

  setAnalyticalGradientEnabled: (enabled: boolean) => {
    if (!isBoolean(enabled)) return
    set({ analyticalGradientEnabled: enabled })
  },

  setFastEigenInterpolationEnabled: (enabled: boolean) => {
    if (!isBoolean(enabled)) return
    set({ fastEigenInterpolationEnabled: enabled })
  },

  // Render Resolution Scale
  setRenderResolutionScale: (scale: number) => {
    if (!Number.isFinite(scale)) {
      logger.warn('[performanceStore] Ignoring non-finite render resolution scale:', scale)
      return
    }
    const clampedScale = Math.max(0.1, Math.min(1.0, scale))
    set({ renderResolutionScale: clampedScale })
    persistResolutionScale(clampedScale)
  },

  // Density Grid Resolution
  setDensityGridResolution: (resolution: DensityGridResolution) => {
    if (!VALID_DENSITY_GRID_RESOLUTIONS.has(resolution)) {
      logger.warn('[performanceStore] Invalid density grid resolution:', resolution)
      return
    }
    set({ densityGridResolution: resolution })
    persistDensityGridResolution(resolution)
  },

  // FPS Limiting
  setMaxFps: (fps: number) => {
    if (!Number.isFinite(fps)) {
      logger.warn('[performanceStore] Ignoring non-finite max FPS:', fps)
      return
    }
    // 0 = uncapped (transient, not persisted). Used by benchmarks/profiling.
    if (fps === 0) {
      set({ maxFps: 0 })
      return
    }
    const clampedFps = Math.max(MIN_MAX_FPS, Math.min(MAX_MAX_FPS, fps))
    set({ maxFps: clampedFps })
    persistMaxFps(clampedFps)
  },

  // Shader Debugging
  setShaderDebugInfo: (key: string, info: ShaderDebugInfo | null) => {
    set((state) => {
      const newInfos = { ...state.shaderDebugInfos }
      if (info === null) {
        delete newInfos[key]
      } else {
        newInfos[key] = info
      }
      return { shaderDebugInfos: newInfos }
    })
  },

  toggleShaderModule: (moduleName: string) => {
    set((state) => {
      const overrides = new Set(state.shaderOverrides)
      if (overrides.has(moduleName)) {
        overrides.delete(moduleName)
      } else {
        overrides.add(moduleName)
      }
      return { shaderOverrides: Array.from(overrides) }
    })
  },

  resetShaderOverrides: () => {
    set({ shaderOverrides: [] })
  },

  // Shader Compilation
  setShaderCompiling: (shaderName: string, compiling: boolean) => {
    set((state) => {
      const newSet = new Set(state.compilingShaders)
      if (compiling) {
        newSet.add(shaderName)
      } else {
        newSet.delete(shaderName)
      }

      const isCompiling = newSet.size > 0
      let message = ''
      if (isCompiling) {
        const shaders = Array.from(newSet)
        message =
          shaders.length === 1
            ? `Building ${shaders[0]} shader...`
            : `Building ${shaders.length} shaders...`
      }

      return {
        compilingShaders: newSet,
        isShaderCompiling: isCompiling,
        shaderCompilationMessage: message,
      }
    })
  },

  // General
  reset: () => {
    set({
      gpuTier: DEFAULT_CAPABILITIES.gpuTier,
      isMobileGPU: DEFAULT_CAPABILITIES.isMobileGPU,
      gpuName: DEFAULT_CAPABILITIES.gpuName,
      deviceCapabilitiesDetected: false,
      sceneTransitioning: false,
      isLoadingScene: false,
      presetLoadVersion: 0,
      temporalReprojectionEnabled: true,
      cameraTeleported: false,
      eigenfunctionCacheEnabled: true,
      analyticalGradientEnabled: true,
      fastEigenInterpolationEnabled: true,
      renderResolutionScale: DESKTOP_DEFAULT_RESOLUTION_SCALE,
      densityGridResolution: DEFAULT_DENSITY_GRID_RESOLUTION,
      maxFps: DEFAULT_MAX_FPS,
      shaderDebugInfos: {},
      shaderOverrides: [],
      compilingShaders: new Set<string>(),
      isShaderCompiling: false,
      shaderCompilationMessage: '',
    })
    persistResolutionScale(DESKTOP_DEFAULT_RESOLUTION_SCALE)
    persistMaxFps(DEFAULT_MAX_FPS)
    persistDensityGridResolution(DEFAULT_DENSITY_GRID_RESOLUTION)
  },
}))
