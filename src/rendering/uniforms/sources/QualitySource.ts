/**
 * Quality Uniform Source
 *
 * Provides quality-related uniforms for adaptive rendering.
 * Tracks fast mode (during animation playback) and quality multiplier.
 *
 * @module rendering/uniforms/sources/QualitySource
 */

import { useAnimationStore } from '@/stores/animationStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { BaseUniformSource, type IUniform, type UniformUpdateState } from '../UniformSource'

/**
 * Configuration for QualitySource.
 */
export interface QualitySourceConfig {
  /** Quality multiplier from performance store (0-1) */
  qualityMultiplier: number
  /** Whether fast mode is active (during animation playback) */
  fastMode: boolean
  /** Debug visualization mode (0=off, 1=iterations, 2=depth, 3=normals) */
  debugMode: number
}

/**
 * Quality uniform source for adaptive rendering.
 *
 * Manages quality-related uniforms:
 * - uQualityMultiplier: Progressive refinement quality (0-1)
 * - uFastMode: Whether to use reduced quality during interaction
 *
 * @example
 * ```typescript
 * const qualitySource = new QualitySource();
 *
 * // Update from performance state
 * qualitySource.updateFromStore({
 *   qualityMultiplier: 0.75,
 *   fastMode: false,
 * });
 *
 * // Apply to material
 * if (qualitySource.version !== lastVersion) {
 *   qualitySource.applyToMaterial(material);
 * }
 * ```
 */
export class QualitySource extends BaseUniformSource {
  readonly id = 'quality'

  private qualityUniforms = {
    uQualityMultiplier: { value: 1.0 },
    uFastMode: { value: false },
    uDebugMode: { value: 0 },
  }

  // Cached values for change detection
  private cachedQualityMultiplier = 1.0
  private cachedFastMode = false
  private cachedDebugMode = 0

  /**
   * Update from store state.
   *
   * @param config - Quality configuration from store
   */
  updateFromStore(config: QualitySourceConfig): void {
    let changed = false

    if (this.cachedQualityMultiplier !== config.qualityMultiplier) {
      this.qualityUniforms.uQualityMultiplier.value = config.qualityMultiplier
      this.cachedQualityMultiplier = config.qualityMultiplier
      changed = true
    }

    if (this.cachedFastMode !== config.fastMode) {
      this.qualityUniforms.uFastMode.value = config.fastMode
      this.cachedFastMode = config.fastMode
      changed = true
    }

    if (this.cachedDebugMode !== config.debugMode) {
      this.qualityUniforms.uDebugMode.value = config.debugMode
      this.cachedDebugMode = config.debugMode
      changed = true
    }

    if (changed) {
      this.incrementVersion()
    }
  }

  /**
   * Get all quality uniforms.
   * @returns Record of quality uniforms
   */
  getUniforms(): Record<string, IUniform> {
    return this.qualityUniforms as unknown as Record<string, IUniform>
  }

  /**
   * Frame update - automatically pulls from stores and handles fast mode logic.
   * @param _state
   */
  update(_state: UniformUpdateState): void {
    const perfState = usePerformanceStore.getState()
    const animState = useAnimationStore.getState()

    // Fast mode is simply: animation is playing AND low quality animation is enabled
    // This applies to all object types - rotation planes selection doesn't matter
    const fastMode = perfState.fractalAnimationLowQuality && animState.isPlaying

    this.updateFromStore({
      qualityMultiplier: perfState.qualityMultiplier,
      fastMode: fastMode,
      debugMode: perfState.debugMode,
    })
  }

  /**
   * Get current quality multiplier.
   * @returns Current quality multiplier
   */
  getQualityMultiplier(): number {
    return this.cachedQualityMultiplier
  }

  /**
   * Get current fast mode state.
   * @returns True if in fast mode
   */
  isFastMode(): boolean {
    return this.cachedFastMode
  }

  /**
   * Reset to initial state.
   */
  reset(): void {
    this.qualityUniforms.uQualityMultiplier.value = 1.0
    this.qualityUniforms.uFastMode.value = false
    this.qualityUniforms.uDebugMode.value = 0
    this.cachedQualityMultiplier = 1.0
    this.cachedFastMode = false
    this.cachedDebugMode = 0
    this._version = 0
  }
}
