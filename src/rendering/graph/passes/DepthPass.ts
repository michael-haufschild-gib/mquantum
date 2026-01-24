/**
 * Depth Pass
 *
 * Renders scene depth to a depth texture for use in post-processing.
 * Uses depth material override to render only depth values.
 *
 * @module rendering/graph/passes/DepthPass
 */

import * as THREE from 'three'

import { BasePass } from '../BasePass'
import type { RenderContext, RenderPassConfig } from '../types'

/**
 * Configuration for DepthPass.
 */
export interface DepthPassConfig extends Omit<RenderPassConfig, 'inputs'> {
  /** Camera near plane (for depth linearization if needed) */
  cameraNear?: number
  /** Camera far plane */
  cameraFar?: number
  /** Layers to render (null = all layers) */
  layers?: number[]
  /** Rendering mode: override (MeshDepthMaterial) or material (use scene materials) */
  mode?: 'override' | 'material'
  /** Force depthWrite on materials: 'all', 'opaque', or 'none' */
  forceDepthWrite?: 'all' | 'opaque' | 'none'
  /** Disable color writes for depth-only rendering (default: true) */
  disableColorWrites?: boolean
  /** Clear render target before rendering */
  clear?: boolean
  /** Clear color (default: black) */
  clearColor?: THREE.ColorRepresentation
  /** Clear alpha (default: 0) */
  clearAlpha?: number
}

/**
 * Renders scene depth to a render target.
 *
 * This pass overrides all scene materials with a depth material
 * to capture only depth information. Useful for:
 * - Screen-space effects (SSAO, SSR)
 * - Depth-based post-processing
 * - Gravitational lensing depth modulation
 *
 * @example
 * ```typescript
 * const depthPass = new DepthPass({
 *   id: 'depth',
 *   outputs: [{ resourceId: 'sceneDepth', access: 'write' }],
 * });
 *
 * graph.addPass(depthPass);
 * ```
 */
export class DepthPass extends BasePass {
  private depthMaterial: THREE.MeshDepthMaterial
  private layers: number[] | null
  private cameraLayers = new THREE.Layers()
  private mode: 'override' | 'material'
  private forceDepthWrite: 'all' | 'opaque' | 'none'
  private disableColorWrites: boolean
  private clear: boolean
  private clearColor: THREE.Color
  private clearAlpha: number
  private savedDepthWrite = new Map<THREE.Material, boolean>()
  private savedClearColor = new THREE.Color()

  constructor(config: DepthPassConfig) {
    super({
      ...config,
      inputs: [], // DepthPass has no inputs
    })

    this.layers = config.layers ?? null
    this.mode = config.mode ?? 'material'
    this.forceDepthWrite = config.forceDepthWrite ?? 'none'
    this.disableColorWrites = config.disableColorWrites ?? true
    this.clear = config.clear ?? true
    this.clearColor = new THREE.Color(config.clearColor ?? 0x000000)
    this.clearAlpha = config.clearAlpha ?? 0

    // Create depth material for override rendering
    this.depthMaterial = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
    })
  }

  execute(ctx: RenderContext): void {
    const { renderer, scene, camera } = ctx

    // Get output target
    const outputConfig = this.config.outputs[0]
    if (!outputConfig) {
      console.warn('DepthPass: No output configured')
      return
    }

    const target = ctx.getWriteTarget(outputConfig.resourceId)

    // Save scene state
    const savedOverrideMaterial = scene.overrideMaterial
    const savedAutoClear = renderer.autoClear
    const savedClearColor = renderer.getClearColor(this.savedClearColor)
    const savedClearAlpha = renderer.getClearAlpha()
    const glContext = renderer.getContext()

    // Save camera layers if filtering
    if (this.layers !== null) {
      this.cameraLayers.mask = camera.layers.mask
    }

    // Configure layers
    if (this.layers !== null) {
      camera.layers.disableAll()
      for (const layer of this.layers) {
        camera.layers.enable(layer)
      }
    }

    // Override with depth material if requested
    scene.overrideMaterial = this.mode === 'override' ? this.depthMaterial : null

    // Force depthWrite if requested
    if (this.forceDepthWrite !== 'none') {
      this.savedDepthWrite.clear()
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mat = (obj as THREE.Mesh).material as THREE.Material
          this.savedDepthWrite.set(mat, mat.depthWrite)
          if (this.forceDepthWrite === 'all') {
            mat.depthWrite = true
          } else if (this.forceDepthWrite === 'opaque') {
            if (!mat.transparent) {
              mat.depthWrite = true
            }
          }
        }
      })
    }

    // Disable color writes for depth-only pass
    if (this.disableColorWrites) {
      glContext.colorMask(false, false, false, false)
    }

    // Render depth - MRTStateManager automatically configures drawBuffers via patched setRenderTarget
    renderer.setRenderTarget(target)
    if (this.clear) {
      renderer.autoClear = false
      renderer.setClearColor(this.clearColor, this.clearAlpha)
      renderer.clear(true, true, false)
    }
    renderer.render(scene, camera)

    // Restore state
    scene.overrideMaterial = savedOverrideMaterial
    renderer.autoClear = savedAutoClear
    renderer.setClearColor(savedClearColor, savedClearAlpha)

    if (this.disableColorWrites) {
      glContext.colorMask(true, true, true, true)
    }

    if (this.forceDepthWrite !== 'none') {
      this.savedDepthWrite.forEach((value, mat) => {
        mat.depthWrite = value
      })
    }

    if (this.layers !== null) {
      camera.layers.mask = this.cameraLayers.mask
    }

    renderer.setRenderTarget(null)
  }

  /**
   * Set which layers to render.
   * @param layers
   */
  setLayers(layers: number[] | null): void {
    this.layers = layers
  }

  /**
   * Update depth pass mode.
   * @param mode
   */
  setMode(mode: 'override' | 'material'): void {
    this.mode = mode
  }

  /**
   * Update force depth write behavior.
   * @param mode
   */
  setForceDepthWrite(mode: 'all' | 'opaque' | 'none'): void {
    this.forceDepthWrite = mode
  }

  dispose(): void {
    this.depthMaterial.dispose()
  }
}
