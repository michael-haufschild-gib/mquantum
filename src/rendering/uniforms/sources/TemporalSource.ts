/**
 * Temporal Uniform Source
 *
 * Provides temporal reprojection uniforms for accumulation-based rendering.
 * Tracks previous frame's view/projection matrices for temporal coherence.
 *
 * @module rendering/uniforms/sources/TemporalSource
 */

import { Matrix4, Vector2 } from 'three'

import { usePerformanceStore } from '@/stores/performanceStore'

import { BaseUniformSource, type IUniform, type UniformUpdateState } from '../UniformSource'

/**
 * Configuration for TemporalSource.
 */
export interface TemporalSourceConfig {
  /** Whether temporal reprojection is enabled */
  enabled: boolean
  /** Safety margin for temporal hints (0.5-1.0, default 0.95) */
  safetyMargin?: number
  /** Depth buffer resolution */
  depthBufferResolution?: { width: number; height: number }
}

/**
 * Temporal uniform source for frame-to-frame coherence.
 *
 * Manages temporal reprojection uniforms:
 * - uTemporalEnabled: Whether temporal reprojection is active
 * - uPrevViewProjectionMatrix: Previous frame's view-projection
 * - uPrevInverseViewProjectionMatrix: Inverse of the above
 * - uDepthBufferResolution: Resolution for depth sampling
 * - uTemporalSafetyMargin: How far back to step from temporal hint
 *
 * @example
 * ```typescript
 * const temporalSource = new TemporalSource();
 *
 * // In useFrame
 * temporalSource.update({ camera, ... });
 *
 * // Apply to material
 * temporalSource.applyToMaterial(material);
 * ```
 */
export class TemporalSource extends BaseUniformSource {
  readonly id = 'temporal'

  private temporalUniforms = {
    uTemporalEnabled: { value: false },
    uPrevViewProjectionMatrix: { value: new Matrix4() },
    uPrevInverseViewProjectionMatrix: { value: new Matrix4() },
    uDepthBufferResolution: { value: new Vector2(1920, 1080) },
    uTemporalSafetyMargin: { value: 0.5 },
  }

  // Current frame matrices (to become previous next frame)
  private currentViewProjection = new Matrix4()
  private currentInverseViewProjection = new Matrix4()

  // State tracking
  private enabled = false
  private isFirstFrame = true

  /**
   * Update from store state.
   *
   * @param config - Temporal configuration
   */
  updateFromStore(config: TemporalSourceConfig): void {
    let changed = false

    if (this.enabled !== config.enabled) {
      this.enabled = config.enabled
      this.temporalUniforms.uTemporalEnabled.value = config.enabled
      changed = true

      // Reset on disable->enable transition
      if (config.enabled) {
        this.isFirstFrame = true
      }
    }

    if (config.safetyMargin !== undefined) {
      const current = this.temporalUniforms.uTemporalSafetyMargin.value
      if (Math.abs(current - config.safetyMargin) > 0.001) {
        this.temporalUniforms.uTemporalSafetyMargin.value = config.safetyMargin
        changed = true
      }
    }

    if (config.depthBufferResolution) {
      const res = this.temporalUniforms.uDepthBufferResolution.value
      if (
        res.x !== config.depthBufferResolution.width ||
        res.y !== config.depthBufferResolution.height
      ) {
        res.set(config.depthBufferResolution.width, config.depthBufferResolution.height)
        changed = true
      }
    }

    if (changed) {
      this.incrementVersion()
    }
  }

  /**
   * Get all temporal uniforms.
   * @returns Record of temporal uniforms
   */
  getUniforms(): Record<string, IUniform> {
    return this.temporalUniforms as unknown as Record<string, IUniform>
  }

  /**
   * Frame update - automatically pulls from performanceStore and updates matrices.
   *
   * This method accesses the store directly to update temporal uniforms,
   * eliminating the need for renderers to manually call updateFromStore().
   * @param state
   */
  update(state: UniformUpdateState): void {
    // Access store directly - this is the standard pattern in the codebase
    const perfState = usePerformanceStore.getState()

    // Update enabled state from store
    this.updateFromStore({
      enabled: perfState.temporalReprojectionEnabled,
      depthBufferResolution: { width: state.size.width, height: state.size.height },
    })

    if (!this.enabled) {
      return
    }

    const { camera } = state

    // Copy current to previous
    this.temporalUniforms.uPrevViewProjectionMatrix.value.copy(this.currentViewProjection)
    this.temporalUniforms.uPrevInverseViewProjectionMatrix.value.copy(
      this.currentInverseViewProjection
    )

    // Compute new current matrices
    this.currentViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    this.currentInverseViewProjection.copy(this.currentViewProjection).invert()

    // On first frame, copy current to previous to avoid invalid reprojection
    if (this.isFirstFrame) {
      this.temporalUniforms.uPrevViewProjectionMatrix.value.copy(this.currentViewProjection)
      this.temporalUniforms.uPrevInverseViewProjectionMatrix.value.copy(
        this.currentInverseViewProjection
      )
      this.isFirstFrame = false
    }

    // Always increment version since matrices change every frame
    this.incrementVersion()
  }

  /**
   * Mark for reset on next frame (e.g., after camera teleport).
   */
  resetHistory(): void {
    this.isFirstFrame = true
  }

  /**
   * Check if temporal reprojection is enabled.
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Reset to initial state.
   */
  reset(): void {
    this.temporalUniforms.uTemporalEnabled.value = false
    this.temporalUniforms.uPrevViewProjectionMatrix.value.identity()
    this.temporalUniforms.uPrevInverseViewProjectionMatrix.value.identity()
    this.temporalUniforms.uTemporalSafetyMargin.value = 0.95
    this.currentViewProjection.identity()
    this.currentInverseViewProjection.identity()
    this.enabled = false
    this.isFirstFrame = true
    this._version = 0
  }
}
