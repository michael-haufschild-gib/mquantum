/**
 * Cinematic Pass
 *
 * Render graph pass for cinematic effects.
 * Applies chromatic aberration, vignette, and film grain.
 *
 * @module rendering/graph/passes/CinematicPass
 */

import * as THREE from 'three'

import { BasePass } from '../BasePass'
import type { RenderContext, RenderPassConfig } from '../types'
import { CinematicShader } from '@/rendering/shaders/postprocessing/CinematicShader'

/**
 * Configuration for CinematicPass.
 */
export interface CinematicPassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Input color resource */
  colorInput: string
  /** Output resource */
  outputResource: string

  /** Chromatic aberration distortion amount */
  aberration?: number
  /** Vignette darkness (0 = none, 2 = strong) */
  vignette?: number
  /** Film grain intensity */
  grain?: number
}

/**
 * Cinematic effects pass.
 *
 * @example
 * ```typescript
 * const cinematicPass = new CinematicPass({
 *   id: 'cinematic',
 *   colorInput: 'sceneColor',
 *   outputResource: 'cinematicOutput',
 *   aberration: 0.005,
 *   vignette: 1.2,
 *   grain: 0.05,
 * });
 * ```
 */
export class CinematicPass extends BasePass {
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera

  private colorInputId: string
  private outputId: string

  constructor(config: CinematicPassConfig) {
    super({
      id: config.id,
      name: config.name ?? 'Cinematic Pass',
      inputs: [{ resourceId: config.colorInput, access: 'read' }],
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
      skipPassthrough: config.skipPassthrough,
    })

    this.colorInputId = config.colorInput
    this.outputId = config.outputResource

    // Create material from CinematicShader
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: CinematicShader.vertexShader,
      fragmentShader: CinematicShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(CinematicShader.uniforms),
      depthTest: false,
      depthWrite: false,
    })

    // Set initial parameters
    this.material.uniforms['uDistortion']!.value = config.aberration ?? 0.005
    this.material.uniforms['uVignetteDarkness']!.value = config.vignette ?? 1.2
    this.material.uniforms['uNoiseIntensity']!.value = config.grain ?? 0.05

    // Create fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2)
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.frustumCulled = false

    this.scene = new THREE.Scene()
    this.scene.add(this.mesh)

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  }

  execute(ctx: RenderContext): void {
    const { renderer, time, size } = ctx

    // Get textures
    const colorTex = ctx.getReadTexture(this.colorInputId)
    const outputTarget = ctx.getWriteTarget(this.outputId)

    if (!colorTex) {
      return
    }

    // Update uniforms
    this.material.uniforms['tDiffuse']!.value = colorTex
    this.material.uniforms['uTime']!.value = time
    this.material.uniforms['uResolution']!.value.set(size.width, size.height)

    // Render
    renderer.setRenderTarget(outputTarget)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(null)
  }

  /**
   * Set chromatic aberration
   * @param value
   */
  setAberration(value: number): void {
    this.material.uniforms['uDistortion']!.value = value
  }

  /**
   * Set vignette darkness
   * @param value
   */
  setVignette(value: number): void {
    this.material.uniforms['uVignetteDarkness']!.value = value
  }

  /**
   * Set film grain intensity
   * @param value
   */
  setGrain(value: number): void {
    this.material.uniforms['uNoiseIntensity']!.value = value
  }

  dispose(): void {
    this.material.dispose()
    this.mesh.geometry.dispose()
    // Remove mesh from scene to ensure proper cleanup
    this.scene.remove(this.mesh)
  }
}
