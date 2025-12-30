/**
 * Scene Pass
 *
 * Renders the Three.js scene to a render target.
 * This is typically the first pass in a render graph.
 *
 * Features:
 * - Optional layer filtering
 * - Clear color configuration
 * - Background rendering control
 *
 * @module rendering/graph/passes/ScenePass
 */

import * as THREE from 'three'

import { BasePass } from '../BasePass'
import { isMRTTarget } from '../MRTStateManager'
import type { RenderContext, RenderPassConfig } from '../types'

/**
 * Cached material entry for opacity forcing.
 */
interface CachedMaterialEntry {
  material: THREE.Material
  transparent: boolean
  depthWrite: boolean
  blending: THREE.Blending
}

/**
 * Render stats captured after scene render.
 */
export interface SceneRenderStats {
  /** Number of draw calls */
  calls: number
  /** Number of triangles rendered */
  triangles: number
  /** Number of points rendered */
  points: number
  /** Number of lines rendered */
  lines: number
}

/**
 * Configuration for ScenePass.
 */
export interface ScenePassConfig extends Omit<RenderPassConfig, 'inputs'> {
  /** Layers to render (null = all layers) */
  layers?: number[]

  /** Clear color (null = use renderer's clear color) */
  clearColor?: THREE.ColorRepresentation | null

  /** Clear alpha */
  clearAlpha?: number

  /** Whether to clear before rendering */
  autoClear?: boolean

  /** Whether to render background */
  renderBackground?: boolean

  /** Force materials to be opaque (useful for separate layer rendering where compositing handles alpha) */
  forceOpaque?: boolean

  /** Optional callback to receive render stats after scene render (for performance monitoring) */
  onRenderStats?: (stats: SceneRenderStats) => void
}

/**
 * Renders the scene to a render target.
 *
 * @example
 * ```typescript
 * const scenePass = new ScenePass({
 *   id: 'scene',
 *   outputs: [{ resourceId: 'sceneColor', access: 'write' }],
 *   clearColor: 0x000000,
 *   autoClear: true,
 * });
 *
 * graph.addPass(scenePass);
 * ```
 */
export class ScenePass extends BasePass {
  private layers: number[] | null
  private clearColor: THREE.Color | null
  private clearAlpha: number
  private autoClear: boolean
  private renderBackground: boolean
  private forceOpaque: boolean
  private onRenderStats: ((stats: SceneRenderStats) => void) | null

  // Saved state for restoration
  private savedClearColor = new THREE.Color()
  private savedClearAlpha = 1
  private savedAutoClear = true
  private cameraLayers = new THREE.Layers()

  // Material cache for forceOpaque
  private materialCache: CachedMaterialEntry[] = []

  constructor(config: ScenePassConfig) {
    super({
      ...config,
      inputs: [], // ScenePass has no inputs
    })

    this.layers = config.layers ?? null
    this.clearColor =
      config.clearColor !== undefined && config.clearColor !== null
        ? new THREE.Color(config.clearColor)
        : null
    this.clearAlpha = config.clearAlpha ?? 1
    this.autoClear = config.autoClear ?? true
    this.renderBackground = config.renderBackground ?? true
    this.forceOpaque = config.forceOpaque ?? false
    this.onRenderStats = config.onRenderStats ?? null
  }

  /**
   * Dynamically set the clear color.
   * @param color - The new clear color (hex, string, or THREE.Color)
   */
  setClearColor(color: THREE.ColorRepresentation): void {
    if (this.clearColor === null) {
      this.clearColor = new THREE.Color(color)
    } else {
      this.clearColor.set(color)
    }
  }

  /**
   * Rebuild material cache by traversing the scene.
   * @param scene
   * @param camera
   */
  private rebuildMaterialCache(scene: THREE.Scene, camera: THREE.Camera): void {
    this.materialCache = []

    scene.traverse((obj) => {
      // Check if object is on the target layers
      if (this.layers !== null && !obj.layers.test(camera.layers)) {
        return
      }

      if ((obj as THREE.Mesh).isMesh) {
        const mat = (obj as THREE.Mesh).material as THREE.Material
        this.materialCache.push({
          material: mat,
          transparent: mat.transparent,
          depthWrite: mat.depthWrite,
          blending: mat.blending,
        })
      }
    })
  }

  execute(ctx: RenderContext): void {
    const { renderer, scene, camera } = ctx

    // Get output target
    const outputConfig = this.config.outputs[0]
    if (!outputConfig) {
      console.warn('ScenePass: No output configured')
      return
    }

    const target = ctx.getWriteTarget(outputConfig.resourceId)

    // Save renderer state (only things we actually modify)
    this.savedClearColor.copy(renderer.getClearColor(this.savedClearColor))
    this.savedClearAlpha = renderer.getClearAlpha()
    this.savedAutoClear = renderer.autoClear

    // Save camera layers
    if (this.layers !== null) {
      this.cameraLayers.mask = camera.layers.mask
    }

    // MRT SAFETY ENFORCEMENT:
    // Three.js's internal skybox/environment shaders only output to location 0.
    // When rendering to MRT targets (multiple attachments), this causes:
    // GL_INVALID_OPERATION: Active draw buffers with missing fragment shader outputs
    //
    // Solution: Automatically disable background for MRT targets.
    // This is a structural safety measure - the render graph OWNS this decision.
    const isMRT = isMRTTarget(target)
    const shouldDisableBackground = !this.renderBackground || isMRT

    // Handle background: only modify if renderBackground is false OR target is MRT
    // IMPORTANT: Do NOT save/restore scene.background - let the scene own its state.
    // Saving and restoring can cause race conditions when React updates scene.background
    // during the frame (e.g., when skybox texture changes).
    const originalBackground = shouldDisableBackground ? scene.background : null

    try {
      // Configure renderer
      if (this.clearColor !== null) {
        renderer.setClearColor(this.clearColor, this.clearAlpha)
      }
      renderer.autoClear = this.autoClear

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

      // Force materials to be opaque if configured
      // This is useful for separate layer rendering where compositing handles alpha
      if (this.forceOpaque) {
        this.rebuildMaterialCache(scene, camera)

        // Save current state and force opaque
        for (const entry of this.materialCache) {
          entry.transparent = entry.material.transparent
          entry.depthWrite = entry.material.depthWrite
          entry.blending = entry.material.blending

          entry.material.transparent = false
          entry.material.depthWrite = true
          entry.material.blending = THREE.NoBlending
        }
      }

      // Render - MRTStateManager automatically configures drawBuffers via patched setRenderTarget
      renderer.setRenderTarget(target)

      renderer.render(scene, camera)

      // Capture render stats after scene render (for performance monitoring)
      // This captures stats BEFORE post-processing passes inflate the numbers
      if (this.onRenderStats) {
        this.onRenderStats({
          calls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          points: renderer.info.render.points,
          lines: renderer.info.render.lines,
        })
      }
    } finally {
      // Restore material properties if we forced opaque
      if (this.forceOpaque) {
        for (const entry of this.materialCache) {
          entry.material.transparent = entry.transparent
          entry.material.depthWrite = entry.depthWrite
          entry.material.blending = entry.blending
        }
      }

      // Restore renderer state - always runs even if render throws
      renderer.setClearColor(this.savedClearColor, this.savedClearAlpha)
      renderer.autoClear = this.savedAutoClear

      // Only restore background if we explicitly disabled it (for renderBackground=false or MRT)
      if (shouldDisableBackground && originalBackground !== null) {
        scene.background = originalBackground
      }

      if (this.layers !== null) {
        camera.layers.mask = this.cameraLayers.mask
      }

      // Reset render target (caller will handle final target)
      renderer.setRenderTarget(null)
    }
  }
}
