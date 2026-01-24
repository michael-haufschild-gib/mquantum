/**
 * State Barrier
 *
 * Systematically saves and restores Three.js renderer, scene, and camera state
 * around pass execution. This prevents cross-pass state leakage and ensures
 * each pass sees the expected initial state.
 *
 * ## Industry Pattern
 * Based on Frostbite's approach of explicit state capture/restore at pass boundaries.
 * This ensures passes can modify state freely without affecting subsequent passes.
 *
 * @module rendering/graph/StateBarrier
 */

import * as THREE from 'three'

/**
 * Captured renderer state.
 */
interface RendererState {
  renderTarget: THREE.WebGLRenderTarget | null
  clearColor: THREE.Color
  clearAlpha: number
  autoClear: boolean
  autoClearColor: boolean
  autoClearDepth: boolean
  autoClearStencil: boolean
}

/**
 * Captured scene state.
 */
interface SceneState {
  background: THREE.Color | THREE.Texture | THREE.CubeTexture | null
  environment: THREE.Texture | null
  overrideMaterial: THREE.Material | null
}

/**
 * Captured camera state.
 */
interface CameraState {
  layersMask: number
}

/**
 * State barrier for saving/restoring Three.js state around pass execution.
 *
 * ## Usage
 * ```typescript
 * const barrier = new StateBarrier();
 *
 * for (const pass of passes) {
 *   barrier.capture(renderer, scene, camera);
 *   try {
 *     pass.execute(context);
 *   } finally {
 *     barrier.restore(renderer, scene, camera);
 *   }
 * }
 * ```
 *
 * ## State Captured
 * - **Renderer**: render target, clear color/alpha, autoClear flags
 * - **Scene**: background, environment, override material
 * - **Camera**: layer mask
 */
export class StateBarrier {
  // Captured state (null if not captured)
  private rendererState: RendererState | null = null
  private sceneState: SceneState | null = null
  private cameraState: CameraState | null = null

  // Reusable objects to avoid per-frame allocation
  // OPTIMIZATION: Reuse Color objects instead of cloning
  private tempColor = new THREE.Color()
  private cachedClearColor = new THREE.Color()

  // ==========================================================================
  // Capture
  // ==========================================================================

  /**
   * Capture current state before pass execution.
   *
   * @param renderer - Three.js WebGL renderer
   * @param scene - Current scene
   * @param camera - Current camera
   */
  capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    // Capture renderer state
    // OPTIMIZATION: Copy to cached color instead of cloning
    this.cachedClearColor.copy(renderer.getClearColor(this.tempColor))
    this.rendererState = {
      renderTarget: renderer.getRenderTarget(),
      clearColor: this.cachedClearColor,
      clearAlpha: renderer.getClearAlpha(),
      autoClear: renderer.autoClear,
      autoClearColor: renderer.autoClearColor,
      autoClearDepth: renderer.autoClearDepth,
      autoClearStencil: renderer.autoClearStencil,
    }

    // Capture scene state
    this.sceneState = {
      background: scene.background,
      environment: scene.environment,
      overrideMaterial: scene.overrideMaterial,
    }

    // Capture camera state
    this.cameraState = {
      layersMask: camera.layers.mask,
    }
  }

  /**
   * Restore state after pass execution.
   *
   * @param renderer - Three.js WebGL renderer
   * @param scene - Current scene
   * @param camera - Current camera
   */
  restore(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    // Restore renderer state
    if (this.rendererState) {
      renderer.setRenderTarget(this.rendererState.renderTarget)
      renderer.setClearColor(this.rendererState.clearColor, this.rendererState.clearAlpha)
      renderer.autoClear = this.rendererState.autoClear
      renderer.autoClearColor = this.rendererState.autoClearColor
      renderer.autoClearDepth = this.rendererState.autoClearDepth
      renderer.autoClearStencil = this.rendererState.autoClearStencil
    }

    // Restore scene state
    if (this.sceneState) {
      scene.background = this.sceneState.background
      scene.environment = this.sceneState.environment
      scene.overrideMaterial = this.sceneState.overrideMaterial
    }

    // Restore camera state
    if (this.cameraState) {
      camera.layers.mask = this.cameraState.layersMask
    }
  }

  // ==========================================================================
  // State Access (for debugging)
  // ==========================================================================

  /**
   * Check if state has been captured.
   * @returns True if state has been captured
   */
  hasCapturedState(): boolean {
    return this.rendererState !== null
  }

  /**
   * Get captured renderer state (for debugging).
   * @returns Captured renderer state or null
   */
  getRendererState(): RendererState | null {
    return this.rendererState ? { ...this.rendererState } : null
  }

  /**
   * Get captured scene state (for debugging).
   * @returns Captured scene state or null
   */
  getSceneState(): SceneState | null {
    return this.sceneState ? { ...this.sceneState } : null
  }

  /**
   * Get captured camera state (for debugging).
   * @returns Captured camera state or null
   */
  getCameraState(): CameraState | null {
    return this.cameraState ? { ...this.cameraState } : null
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  /**
   * Clear captured state.
   */
  clear(): void {
    this.rendererState = null
    this.sceneState = null
    this.cameraState = null
  }
}
