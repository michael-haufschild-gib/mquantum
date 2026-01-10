/**
 * Jets Composite Pass
 *
 * Composites the rendered jet buffer over the scene with additive blending.
 * This pass takes the jet color output from JetsRenderPass and blends it
 * with the scene color to create the final result.
 *
 * @module rendering/graph/passes/JetsCompositePass
 */

import * as THREE from 'three'

import {
  jetCompositeFragmentShader,
  jetCompositeVertexShader,
} from '@/rendering/shaders/postprocessing/jetVolumetric.glsl'
import { BasePass } from '../BasePass'
import type { FrozenFrameContext } from '../FrameContext'
import type { RenderContext, RenderPassConfig } from '../types'

/**
 * Configuration for JetsCompositePass.
 */
export interface JetsCompositePassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Scene color input resource ID */
  sceneInput: string

  /** Jets color input resource ID */
  jetsInput: string

  /** Output resource ID */
  outputResource: string
}

/**
 * Composite pass for black hole jets.
 *
 * Uses additive blending to overlay the emissive jet buffer on top of
 * the scene. The jet opacity can be controlled via blackhole config.
 *
 * @example
 * ```typescript
 * const jetsComposite = new JetsCompositePass({
 *   id: 'jetsComposite',
 *   sceneInput: 'sceneColor',
 *   jetsInput: 'jetsColor',
 *   outputResource: 'sceneWithJets',
 *   enabled: (frame) => frame?.stores.blackHole.jetsEnabled ?? false,
 * });
 * graph.addPass(jetsComposite);
 * ```
 */
export class JetsCompositePass extends BasePass {
  private sceneInputId: string
  private jetsInputId: string
  private outputResourceId: string

  // Rendering resources
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera

  constructor(config: JetsCompositePassConfig) {
    super({
      id: config.id,
      name: config.name ?? 'Jets Composite',
      inputs: [
        { resourceId: config.sceneInput, access: 'read' },
        { resourceId: config.jetsInput, access: 'read' },
      ],
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
    })

    this.sceneInputId = config.sceneInput
    this.jetsInputId = config.jetsInput
    this.outputResourceId = config.outputResource

    // Create composite material
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tScene: { value: null },
        tJets: { value: null },
        uJetOpacity: { value: 1.0 },
      },
      vertexShader: jetCompositeVertexShader,
      fragmentShader: jetCompositeFragmentShader,
      depthTest: false,
      depthWrite: false,
    })

    // Create fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2)
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.frustumCulled = false

    this.scene = new THREE.Scene()
    this.scene.add(this.mesh)

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  }

  execute(ctx: RenderContext): void {
    const { renderer } = ctx

    // Get input textures
    const sceneTexture = ctx.getReadTexture(this.sceneInputId)
    const jetsTexture = ctx.getReadTexture(this.jetsInputId)

    if (!sceneTexture) {
      console.warn(`JetsCompositePass: Scene texture '${this.sceneInputId}' not found`)
      return
    }

    // Get output target
    const outputTarget = ctx.getWriteTarget(this.outputResourceId)

    // Read jet intensity from frozen frame context
    const frame = ctx.frame as FrozenFrameContext | null
    const blackhole = frame?.stores.blackHole
    const jetIntensity = blackhole?.jetsIntensity ?? 1.0

    // Update uniforms
    this.material.uniforms['tScene']!.value = sceneTexture
    this.material.uniforms['tJets']!.value = jetsTexture
    // Jet opacity scales with intensity - allow full brightness
    // The shader uses additive blending so we don't need to cap at 1.0
    const opacity = jetsTexture ? jetIntensity * 0.8 : 0.0
    this.material.uniforms['uJetOpacity']!.value = opacity

    // Render
    renderer.setRenderTarget(outputTarget)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(null)
  }

  dispose(): void {
    this.material.dispose()
    this.mesh.geometry.dispose()
  }
}
