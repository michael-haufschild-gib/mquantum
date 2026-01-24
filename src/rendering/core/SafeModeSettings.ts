/**
 * Safe Mode Settings
 *
 * Applies reduced quality settings to minimize GPU memory usage
 * when WebGL context recovery fails repeatedly.
 *
 * @module rendering/core/SafeModeSettings
 */

import { useLightingStore } from '@/stores/lightingStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { usePostProcessingStore } from '@/stores/postProcessingStore'

/** localStorage key for safe mode persistence */
const SAFE_MODE_KEY = 'mdim_safe_mode'

/**
 * Settings that get disabled in safe mode.
 * Stored for potential future restoration.
 */
export interface SafeModeSnapshot {
  renderResolutionScale: number
  bloomEnabled: boolean
  ssaoEnabled: boolean
  ssrEnabled: boolean
  bokehEnabled: boolean
  shadowEnabled: boolean
  temporalReprojectionEnabled: boolean
  progressiveRefinementEnabled: boolean
}

/**
 * Apply safe mode settings to reduce GPU memory usage.
 *
 * This function:
 * - Reduces render resolution to 50%
 * - Disables expensive post-processing effects (bloom, SSAO, SSR, bokeh)
 * - Disables shadows
 * - Disables temporal features (reprojection, progressive refinement)
 *
 * These changes can reduce VRAM usage by 93%+ by:
 * - Shrinking all render targets (25% resolution = 93.75% fewer pixels)
 * - Eliminating effect-specific buffers
 * - Removing temporal buffer chains
 */
export function applySafeModeSettings(): void {
  // Resolution - reduces all buffer sizes by ~93.75% (quarter resolution)
  usePerformanceStore.getState().setRenderResolutionScale(0.25)

  // Disable expensive post-processing effects
  usePostProcessingStore.getState().setBloomEnabled(false)
  usePostProcessingStore.getState().setSSAOEnabled(false) // GTAO pass
  usePostProcessingStore.getState().setSSREnabled(false)
  usePostProcessingStore.getState().setBokehEnabled(false)

  // Disable lighting features
  useLightingStore.getState().setShadowEnabled(false)

  // Disable temporal features (frees 3+ screen-sized MRTs)
  usePerformanceStore.getState().setTemporalReprojectionEnabled(false)
  usePerformanceStore.getState().setProgressiveRefinementEnabled(false)

  // Persist safe mode flag
  try {
    localStorage.setItem(SAFE_MODE_KEY, 'true')
  } catch {
    // Silent fail - persistence is best-effort
  }
}

/**
 * Check if safe mode is currently active.
 */
export function isSafeModeActive(): boolean {
  try {
    return localStorage.getItem(SAFE_MODE_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Clear safe mode flag.
 * Call this when user manually adjusts settings or on next session.
 */
export function clearSafeMode(): void {
  try {
    localStorage.removeItem(SAFE_MODE_KEY)
  } catch {
    // Silent fail
  }
}

/**
 * Capture current settings before applying safe mode.
 * Can be used to restore settings later.
 */
export function captureCurrentSettings(): SafeModeSnapshot {
  const perf = usePerformanceStore.getState()
  const pp = usePostProcessingStore.getState()
  const lighting = useLightingStore.getState()

  return {
    renderResolutionScale: perf.renderResolutionScale,
    bloomEnabled: pp.bloomEnabled,
    ssaoEnabled: pp.ssaoEnabled,
    ssrEnabled: pp.ssrEnabled,
    bokehEnabled: pp.bokehEnabled,
    shadowEnabled: lighting.shadowEnabled,
    temporalReprojectionEnabled: perf.temporalReprojectionEnabled,
    progressiveRefinementEnabled: perf.progressiveRefinementEnabled,
  }
}

/**
 * Restore settings from a snapshot.
 */
export function restoreSettings(snapshot: SafeModeSnapshot): void {
  usePerformanceStore.getState().setRenderResolutionScale(snapshot.renderResolutionScale)
  usePostProcessingStore.getState().setBloomEnabled(snapshot.bloomEnabled)
  usePostProcessingStore.getState().setSSAOEnabled(snapshot.ssaoEnabled)
  usePostProcessingStore.getState().setSSREnabled(snapshot.ssrEnabled)
  usePostProcessingStore.getState().setBokehEnabled(snapshot.bokehEnabled)
  useLightingStore.getState().setShadowEnabled(snapshot.shadowEnabled)
  usePerformanceStore
    .getState()
    .setTemporalReprojectionEnabled(snapshot.temporalReprojectionEnabled)
  usePerformanceStore
    .getState()
    .setProgressiveRefinementEnabled(snapshot.progressiveRefinementEnabled)

  clearSafeMode()
}
