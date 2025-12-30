/**
 * Main Object MRT Pass
 *
 * Renders the main object layer into an MRT render target so shaders
 * can output both color and normal buffers in a single pass.
 *
 * This pass forces materials to be opaque for correct normal output
 * and writes depth for depth-aware compositing.
 *
 * Performance: Material cache is built lazily on first render and
 * reused for subsequent frames. Call invalidateCache() when the scene
 * structure changes (e.g., object type change, geometry recreation).
 *
 * @module rendering/graph/passes/MainObjectMRTPass
 */

import * as THREE from 'three'

import { BasePass } from '../BasePass'
import { isMRTTarget } from '../MRTStateManager'
import type { RenderContext, RenderPassConfig } from '../types'

/**
 * Cached material entry with original properties for restoration.
 */
interface CachedMaterialEntry {
  material: THREE.Material
  transparent: boolean
  depthWrite: boolean
  blending: THREE.Blending
}

/**
 * Configuration for MainObjectMRTPass.
 */
export interface MainObjectMRTPassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Output MRT resource ID */
  outputResource: string
  /** Layers to render (null = all layers) */
  layers?: number[]
  /** Clear color (default: black) */
  clearColor?: THREE.ColorRepresentation
  /** Clear alpha (default: 0) */
  clearAlpha?: number
  /** Whether to clear before rendering */
  clear?: boolean
  /** Whether to render scene background */
  renderBackground?: boolean
  /** Force materials to be opaque for MRT output */
  forceOpaque?: boolean
}

/**
 * Renders the main object layer into an MRT target.
 */
export class MainObjectMRTPass extends BasePass {
  private outputId: string
  private layers: number[] | null
  private clearColor: THREE.Color
  private clearAlpha: number
  private clear: boolean
  private renderBackground: boolean
  private forceOpaque: boolean
  private cameraLayers = new THREE.Layers()

  /**
   * Cached materials that need opacity forcing.
   * Built lazily on first render, invalidated via invalidateCache().
   * null means cache needs to be rebuilt.
   */
  private materialCache: CachedMaterialEntry[] | null = null

  constructor(config: MainObjectMRTPassConfig) {
    super({
      id: config.id,
      name: config.name ?? 'Main Object MRT Pass',
      inputs: [],
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
    })

    this.outputId = config.outputResource
    this.layers = config.layers ?? null
    this.clearColor = new THREE.Color(config.clearColor ?? 0x000000)
    this.clearAlpha = config.clearAlpha ?? 0
    this.clear = config.clear ?? true
    this.renderBackground = config.renderBackground ?? false
    this.forceOpaque = config.forceOpaque ?? true
  }

  execute(ctx: RenderContext): void {
    const { renderer, scene, camera } = ctx

    const target = ctx.getWriteTarget(this.outputId)
    if (!target) {
      console.warn('MainObjectMRTPass: Output target not found')
      return
    }

    const savedAutoClear = renderer.autoClear
    const savedClearColor = renderer.getClearColor(new THREE.Color())
    const savedClearAlpha = renderer.getClearAlpha()

    // Save camera layers if filtering
    if (this.layers !== null) {
      this.cameraLayers.mask = camera.layers.mask
    }

    // MRT SAFETY: Always disable background when rendering to MRT targets.
    // Three.js's internal skybox shader only outputs to location 0, causing
    // GL_INVALID_OPERATION when drawBuffers expects multiple outputs.
    const isMRT = isMRTTarget(target)
    const shouldDisableBackground = !this.renderBackground || isMRT
    const savedBackground = shouldDisableBackground ? scene.background : null
    if (shouldDisableBackground) {
      scene.background = null
    }

    // Configure layers
    if (this.layers !== null) {
      camera.layers.disableAll()
      for (const layer of this.layers) {
        camera.layers.enable(layer)
      }
    }

    try {
      // Force materials to be opaque for MRT outputs
      if (this.forceOpaque) {
        // Always rebuild cache because:
        // 1. Mesh layers may be set AFTER first render (via ref callbacks)
        // 2. Materials may change at runtime
        // 3. Transparency state may change dynamically
        // The traversal is O(N) but N is typically small for main objects
        this.rebuildMaterialCache(scene, camera)

        // Save CURRENT material state before forcing opaque
        for (const entry of this.materialCache!) {
          entry.transparent = entry.material.transparent
          entry.depthWrite = entry.material.depthWrite
          entry.blending = entry.material.blending
        }

        // Apply opacity forcing
        for (const entry of this.materialCache!) {
          entry.material.transparent = false
          entry.material.depthWrite = true
          entry.material.blending = THREE.NoBlending
        }
      }

      // MRTStateManager automatically configures drawBuffers via patched setRenderTarget
      renderer.setRenderTarget(target)

      if (this.clear) {
        renderer.autoClear = false
        renderer.setClearColor(this.clearColor, this.clearAlpha)
        renderer.clear(true, true, false)
      }

      renderer.render(scene, camera)
    } finally {
      // Restore material props to their state before this pass - O(M)
      if (this.forceOpaque && this.materialCache) {
        for (const entry of this.materialCache) {
          entry.material.transparent = entry.transparent
          entry.material.depthWrite = entry.depthWrite
          entry.material.blending = entry.blending
        }
      }

      // Restore background (only if we disabled it)
      if (shouldDisableBackground && savedBackground !== null) {
        scene.background = savedBackground
      }

      // Restore camera layers
      if (this.layers !== null) {
        camera.layers.mask = this.cameraLayers.mask
      }

      renderer.autoClear = savedAutoClear
      renderer.setClearColor(savedClearColor, savedClearAlpha)
      renderer.setRenderTarget(null)
    }
  }

  /**
   * Rebuild the material cache by traversing the scene.
   * Only called on first render or after invalidateCache().
   *
   * Caches ALL materials on the target layers so we can force them opaque
   * during MRT rendering, even if they become transparent at runtime
   * (e.g., when opacity is changed from 1.0 to < 1.0).
   *
   * @param scene - The scene to traverse
   * @param camera - The camera with layer mask to test against
   */
  private rebuildMaterialCache(scene: THREE.Scene, camera: THREE.Camera): void {
    this.materialCache = []

    scene.traverse((obj) => {
      // Check if object is on the target layers
      // Note: We check against camera.layers which has already been configured
      // to only have the target layers enabled
      if (this.layers !== null && !obj.layers.test(camera.layers)) {
        return
      }

      if ((obj as THREE.Mesh).isMesh) {
        const mat = (obj as THREE.Mesh).material as THREE.Material

        // Cache ALL materials so we can force opaque even if they become
        // transparent at runtime (e.g., opacity slider changed)
        this.materialCache!.push({
          material: mat,
          transparent: mat.transparent,
          depthWrite: mat.depthWrite,
          blending: mat.blending,
        })
      }
    })
  }

  /**
   * Invalidate the material cache.
   * Call this when scene structure changes (object type change, geometry recreation).
   * The cache will be rebuilt on the next execute() call.
   *
   * @returns Nothing
   */
  invalidateCache(): void {
    this.materialCache = null
  }

  /**
   * Update which layers are rendered.
   * Also invalidates the material cache since layer filtering affects cached materials.
   *
   * @param layers - The layers to render (null for all layers)
   */
  setLayers(layers: number[] | null): void {
    this.layers = layers
    this.invalidateCache()
  }

  dispose(): void {
    this.materialCache = null
  }
}
