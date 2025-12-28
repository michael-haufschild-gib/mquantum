/**
 * Performance state management using Zustand
 *
 * Manages performance optimization settings for rendering.
 * These settings are device-specific and NOT included in share URLs.
 *
 * @see docs/prd/mandelbulb_performance.md
 */

import type { ShaderDebugInfo } from '@/types/shaderDebug'
import { create } from 'zustand'

// ============================================================================
// Constants
// ============================================================================

/** Delay before restoring full quality after interaction stops (ms) */
export const INTERACTION_RESTORE_DELAY = 150

/** Progressive refinement stages */
export const REFINEMENT_STAGES = ['low', 'medium', 'high', 'final'] as const

/** Time to reach each refinement stage after interaction stops (ms) */
export const REFINEMENT_STAGE_TIMING: Record<RefinementStage, number> = {
  low: 0,
  medium: 100,
  high: 300,
  final: 500,
}

/** Quality multiplier for each refinement stage */
export const REFINEMENT_STAGE_QUALITY: Record<RefinementStage, number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  final: 1.0,
}

// ============================================================================
// Types
// ============================================================================

/** Progressive refinement stage type */
export type RefinementStage = (typeof REFINEMENT_STAGES)[number]

/** Performance state interface */
interface PerformanceState {
  // -------------------------------------------------------------------------
  // Interaction State
  // -------------------------------------------------------------------------

  /** Whether user is currently interacting (camera movement, dragging, etc.) */
  isInteracting: boolean

  /** Whether a scene/style preset is being loaded (pauses animation, low quality) */
  sceneTransitioning: boolean

  /** Whether a scene preset is currently being loaded (semantic flag for hooks to skip automatic behavior) */
  isLoadingScene: boolean

  // -------------------------------------------------------------------------
  // Progressive Refinement (ALL objects)
  // -------------------------------------------------------------------------

  /** Whether progressive refinement is enabled */
  progressiveRefinementEnabled: boolean

  /** Current refinement stage */
  refinementStage: RefinementStage

  /** Current refinement progress (0-100) */
  refinementProgress: number

  /** Current quality multiplier based on refinement stage */
  qualityMultiplier: number

  // -------------------------------------------------------------------------
  // Temporal Reprojection (Fractals only)
  // -------------------------------------------------------------------------

  /** Whether temporal reprojection is enabled */
  temporalReprojectionEnabled: boolean

  /** Whether camera has teleported (disables reprojection for 1 frame) */
  cameraTeleported: boolean

  // -------------------------------------------------------------------------
  // Fractal Animation Quality (Fractals only)
  // -------------------------------------------------------------------------

  /** Whether to use lower quality during fractal animation for smoother interaction */
  fractalAnimationLowQuality: boolean

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

  // Interaction State
  setIsInteracting: (interacting: boolean) => void
  setSceneTransitioning: (transitioning: boolean) => void
  setIsLoadingScene: (loading: boolean) => void

  // Progressive Refinement
  setProgressiveRefinementEnabled: (enabled: boolean) => void
  setRefinementStage: (stage: RefinementStage) => void
  setRefinementProgress: (progress: number) => void
  resetRefinement: () => void

  // Temporal Reprojection
  setTemporalReprojectionEnabled: (enabled: boolean) => void
  setCameraTeleported: (teleported: boolean) => void

  // Fractal Animation Quality
  setFractalAnimationLowQuality: (enabled: boolean) => void

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
export const usePerformanceStore = create<PerformanceState>((set, get) => ({
  // -------------------------------------------------------------------------
  // Initial State
  // -------------------------------------------------------------------------

  // Interaction State
  isInteracting: false,
  sceneTransitioning: false,
  isLoadingScene: false,

  // Progressive Refinement
  progressiveRefinementEnabled: true,
  refinementStage: 'final',
  refinementProgress: 100,
  qualityMultiplier: 1.0,

  // Temporal Reprojection
  temporalReprojectionEnabled: true,
  cameraTeleported: false,

  // Fractal Animation Quality
  fractalAnimationLowQuality: true,

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

  // Interaction State
  setIsInteracting: (interacting: boolean) => {
    set({ isInteracting: interacting })
  },

  setSceneTransitioning: (transitioning: boolean) => {
    set({ sceneTransitioning: transitioning })
  },

  setIsLoadingScene: (loading: boolean) => {
    set({ isLoadingScene: loading })
  },

  // Progressive Refinement
  setProgressiveRefinementEnabled: (enabled: boolean) => {
    set({ progressiveRefinementEnabled: enabled })
    if (!enabled) {
      set({
        refinementStage: 'final',
        refinementProgress: 100,
        qualityMultiplier: 1.0,
      })
    }
  },

  setRefinementStage: (stage: RefinementStage) => {
    const progress = REFINEMENT_STAGES.indexOf(stage) * 25 + 25
    const quality = REFINEMENT_STAGE_QUALITY[stage]
    set({
      refinementStage: stage,
      refinementProgress: Math.min(100, progress),
      qualityMultiplier: quality,
    })
  },

  setRefinementProgress: (progress: number) => {
    set({ refinementProgress: Math.max(0, Math.min(100, progress)) })
  },

  resetRefinement: () => {
    if (get().progressiveRefinementEnabled) {
      set({
        refinementStage: 'low',
        refinementProgress: 0,
        qualityMultiplier: REFINEMENT_STAGE_QUALITY.low,
      })
    }
  },

  // Temporal Reprojection
  setTemporalReprojectionEnabled: (enabled: boolean) => {
    set({ temporalReprojectionEnabled: enabled })
  },

  setCameraTeleported: (teleported: boolean) => {
    set({ cameraTeleported: teleported })
  },

  // Fractal Animation Quality
  setFractalAnimationLowQuality: (enabled: boolean) => {
    set({ fractalAnimationLowQuality: enabled })
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
      isInteracting: false,
      sceneTransitioning: false,
      isLoadingScene: false,
      progressiveRefinementEnabled: true,
      refinementStage: 'final',
      refinementProgress: 100,
      qualityMultiplier: 1.0,
      temporalReprojectionEnabled: true,
      cameraTeleported: false,
      fractalAnimationLowQuality: true,
      shaderDebugInfos: {},
      shaderOverrides: [],
      compilingShaders: new Set<string>(),
      isShaderCompiling: false,
      shaderCompilationMessage: '',
    })
  },
}))

// ============================================================================
// Selectors (for performance optimization with useShallow)
// ============================================================================

/**
 * Select progressive refinement settings
 * @param state
 * @returns Object containing progressive refinement state properties
 */
export const selectProgressiveRefinement = (state: PerformanceState) => ({
  enabled: state.progressiveRefinementEnabled,
  stage: state.refinementStage,
  progress: state.refinementProgress,
  qualityMultiplier: state.qualityMultiplier,
})

/**
 * Select temporal reprojection settings
 * @param state
 * @returns Object containing temporal reprojection state properties
 */
export const selectTemporalReprojection = (state: PerformanceState) => ({
  enabled: state.temporalReprojectionEnabled,
  cameraTeleported: state.cameraTeleported,
})

// ============================================================================
// Quality Interpolation Utilities
// ============================================================================

/**
 * Quality level orderings for discrete quality settings.
 * Used to interpolate between lowest and user's target quality.
 */
const SSR_QUALITY_ORDER = ['low', 'medium', 'high'] as const
const SHADOW_QUALITY_ORDER = ['low', 'medium', 'high', 'ultra'] as const
const SAMPLE_QUALITY_ORDER = ['low', 'medium', 'high'] as const

export type SSRQualityLevel = (typeof SSR_QUALITY_ORDER)[number]
export type ShadowQualityLevel = (typeof SHADOW_QUALITY_ORDER)[number]
export type SampleQualityLevel = (typeof SAMPLE_QUALITY_ORDER)[number]

/**
 * Compute effective quality level based on quality multiplier and user's target.
 *
 * Progressive refinement scales from lowest quality (at multiplier=0.25)
 * up to the user's target setting (at multiplier=1.0).
 *
 * Examples (SSR with target='high'):
 * - multiplier=0.25 → 'low'
 * - multiplier=0.5  → 'medium'
 * - multiplier=1.0  → 'high'
 *
 * Examples (SSR with target='medium'):
 * - multiplier=0.25 → 'low'
 * - multiplier=1.0  → 'medium'
 *
 * @param qualityOrder - Ordered array of quality levels (lowest to highest)
 * @param targetQuality - User's target quality setting
 * @param qualityMultiplier - Current quality multiplier (0.25-1.0)
 * @returns Effective quality level for current refinement stage
 */
function computeEffectiveQuality<T extends string>(
  qualityOrder: readonly T[],
  targetQuality: T,
  qualityMultiplier: number
): T {
  const targetIndex = qualityOrder.indexOf(targetQuality)
  if (targetIndex === -1) return targetQuality // Unknown quality, return as-is

  // If target is lowest, always return lowest (can't go lower)
  if (targetIndex === 0) return qualityOrder[0]!

  // Normalize multiplier from 0.25-1.0 to 0-1
  const normalizedMultiplier = Math.max(0, Math.min(1, (qualityMultiplier - 0.25) / 0.75))

  // Interpolate from index 0 to targetIndex
  const effectiveIndex = Math.round(normalizedMultiplier * targetIndex)
  return qualityOrder[effectiveIndex]!
}

/**
 * Get effective SSR quality based on progressive refinement state.
 *
 * @param targetQuality - User's SSR quality setting
 * @param qualityMultiplier - Current quality multiplier (0.25-1.0)
 * @returns Effective SSR quality level
 */
export function getEffectiveSSRQuality(
  targetQuality: SSRQualityLevel,
  qualityMultiplier: number
): SSRQualityLevel {
  return computeEffectiveQuality(SSR_QUALITY_ORDER, targetQuality, qualityMultiplier)
}

/**
 * Get effective shadow quality based on progressive refinement state.
 *
 * @param targetQuality - User's shadow quality setting
 * @param qualityMultiplier - Current quality multiplier (0.25-1.0)
 * @returns Effective shadow quality level
 */
export function getEffectiveShadowQuality(
  targetQuality: ShadowQualityLevel,
  qualityMultiplier: number
): ShadowQualityLevel {
  return computeEffectiveQuality(SHADOW_QUALITY_ORDER, targetQuality, qualityMultiplier)
}

/**
 * Get effective volumetric sample quality based on progressive refinement state.
 *
 * @param targetQuality - User's sample quality setting
 * @param qualityMultiplier - Current quality multiplier (0.25-1.0)
 * @returns Effective sample quality level
 */
export function getEffectiveSampleQuality(
  targetQuality: SampleQualityLevel,
  qualityMultiplier: number
): SampleQualityLevel {
  return computeEffectiveQuality(SAMPLE_QUALITY_ORDER, targetQuality, qualityMultiplier)
}
