/**
 * Temporal Depth State
 *
 * State class for temporal depth management - separated from React components
 * to support Fast Refresh and enable clean imports.
 *
 * @module rendering/core/TemporalDepthState
 */

import * as THREE from 'three'

import { usePerformanceStore } from '@/stores/performanceStore'
import { useWebGLContextStore } from '@/stores/webglContextStore'

// =============================================================================
// Temporal Depth Uniforms Interface
// =============================================================================

export interface TemporalDepthUniforms {
  /** Previous frame's ray distance texture (unnormalized world-space ray distances) */
  uPrevDepthTexture: THREE.Texture | null
  /** Previous frame's view-projection matrix */
  uPrevViewProjectionMatrix: THREE.Matrix4
  /** Previous frame's inverse view-projection matrix */
  uPrevInverseViewProjectionMatrix: THREE.Matrix4
  /** Whether temporal reprojection is enabled and valid */
  uTemporalEnabled: boolean
  /** Depth buffer resolution for UV calculation */
  uDepthBufferResolution: THREE.Vector2
}

// =============================================================================
// Global Registry for Store-Based Invalidation
// =============================================================================

/** Registry of all active TemporalDepthState instances for global invalidation */
const instanceRegistry = new Set<TemporalDepthState>()

/**
 * Invalidate all registered TemporalDepthState instances.
 * Called by stores (e.g., geometryStore) when global state changes require
 * resetting temporal data across all viewports.
 *
 * @returns Nothing
 */
export function invalidateAllTemporalDepth(): void {
  instanceRegistry.forEach((instance) => {
    instance.invalidate()
  })
}

// =============================================================================
// TemporalDepthState Class
// =============================================================================

/**
 * Temporal depth state holder for raymarching acceleration.
 *
 * Manages previous frame's depth texture and camera matrices for
 * temporal reprojection in fractal renderers.
 *
 * This class is instantiated per-viewport/scene via the TemporalDepthProvider.
 *
 * @example
 * ```tsx
 * // In a React component
 * const temporalDepth = useTemporalDepth();
 * const uniforms = temporalDepth.getUniforms();
 * material.uniforms.uPrevDepthTexture.value = uniforms.uPrevDepthTexture;
 * ```
 */
export class TemporalDepthState {
  private isValid = false
  private _resolution = new THREE.Vector2(1, 1)

  // Texture from previous frame (supplied by RenderGraph)
  private prevDepthTexture: THREE.Texture | null = null

  // Camera matrices from previous frame
  private prevViewProjectionMatrix = new THREE.Matrix4()
  private prevInverseViewProjectionMatrix = new THREE.Matrix4()

  // Current frame camera matrices (will become prev after update)
  private currentViewProjectionMatrix = new THREE.Matrix4()
  private currentInverseProjectionMatrix = new THREE.Matrix4()

  constructor() {
    // Register this instance for global invalidation
    instanceRegistry.add(this)
  }

  /**
   * Update camera matrices for the current frame.
   * Call this at the START of each frame before rendering.
   *
   * @param camera - The current camera to extract matrices from
   * @returns Nothing
   */
  updateCameraMatrices(camera: THREE.Camera): void {
    // Store current as will become previous after swap
    this.currentViewProjectionMatrix
      .copy(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse)

    // Store inverse projection matrix for viewZ → ray distance conversion
    this.currentInverseProjectionMatrix.copy(camera.projectionMatrix).invert()
  }

  /**
   * Update the temporal state with the latest depth texture from the Render Graph.
   * Call this at the END of the frame (after graph execution/swap).
   *
   * @param texture - The texture that will be read in the NEXT frame
   * @param width - Buffer width
   * @param height - Buffer height
   * @returns Nothing
   */
  updateState(texture: THREE.Texture | null, width: number, height: number): void {
    if (!this.isEnabled()) {
      this.isValid = false
      this.prevDepthTexture = null
      return
    }

    this.prevDepthTexture = texture
    this._resolution.set(width, height)

    // Current matrices become previous
    this.prevViewProjectionMatrix.copy(this.currentViewProjectionMatrix)
    this.prevInverseViewProjectionMatrix.copy(this.currentViewProjectionMatrix).invert()

    // Mark valid if we have a texture
    this.isValid = !!texture
  }

  /**
   * Invalidate temporal data.
   * Call when scene changes drastically (dimension change, object type change, etc.)
   *
   * @returns Nothing
   */
  invalidate(): void {
    this.isValid = false
    this.prevDepthTexture = null

    // Reset matrices
    this.prevViewProjectionMatrix.identity()
    this.prevInverseViewProjectionMatrix.identity()
    this.currentViewProjectionMatrix.identity()
    this.currentInverseProjectionMatrix.identity()
  }

  /**
   * Invalidate for WebGL context loss.
   *
   * @returns Nothing
   */
  invalidateForContextLoss(): void {
    this.invalidate()
  }

  /**
   * Check if temporal reprojection is enabled in settings.
   *
   * @returns True if temporal reprojection is enabled
   */
  isEnabled(): boolean {
    return usePerformanceStore.getState().temporalReprojectionEnabled
  }

  /**
   * Get the uniforms to pass to fractal shaders.
   *
   * @param forceTexture - Force texture even if temporal is disabled
   * @returns Object containing all temporal depth uniforms
   */
  getUniforms(forceTexture = false): TemporalDepthUniforms {
    // Warn if temporal is enabled but texture is missing (and valid was expected)
    const contextStatus = useWebGLContextStore.getState().status
    if (this.isEnabled() && this.isValid && !this.prevDepthTexture && contextStatus === 'active') {
      console.warn('[TemporalDepthState] Temporal enabled/valid but texture is null.')
    }

    const enabled = this.isEnabled() && this.isValid && this.prevDepthTexture !== null
    const hasTexture = (enabled || forceTexture) && this.prevDepthTexture !== null

    return {
      uPrevDepthTexture: hasTexture ? this.prevDepthTexture : null,
      uPrevViewProjectionMatrix: this.prevViewProjectionMatrix,
      uPrevInverseViewProjectionMatrix: this.prevInverseViewProjectionMatrix,
      uTemporalEnabled: enabled,
      uDepthBufferResolution: this._resolution,
    }
  }

  /**
   * Get the current resolution dimensions.
   *
   * @returns Object with width and height
   */
  getDimensions(): { width: number; height: number } {
    return { width: this._resolution.x, height: this._resolution.y }
  }

  /**
   * Dispose this instance and unregister from global registry.
   *
   * @returns Nothing
   */
  dispose(): void {
    this.prevDepthTexture = null
    this.isValid = false
    instanceRegistry.delete(this)
  }
}
