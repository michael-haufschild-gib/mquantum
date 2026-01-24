/**
 * Environment Composite Pass
 *
 * Composites the lensed environment layer behind the main object layer.
 * Uses alpha blending to show the environment through transparent objects.
 *
 * @module rendering/graph/passes/EnvironmentCompositePass
 */

import * as THREE from 'three'

import {
  environmentCompositeFragmentShader,
  environmentCompositeVertexShader,
} from '@/rendering/shaders/postprocessing/environmentComposite.glsl'
import { BasePass } from '../BasePass'
import type { RenderContext, RenderPassConfig } from '../types'

/**
 * Shell glow configuration for screen-space edge detection.
 */
export interface ShellGlowConfig {
  enabled: boolean
  color: THREE.Color
  strength: number
}

/**
 * Configuration for EnvironmentCompositePass.
 */
export interface EnvironmentCompositePassConfig extends Omit<
  RenderPassConfig,
  'inputs' | 'outputs'
> {
  /** Lensed environment color texture resource ID */
  lensedEnvironmentInput: string

  /** Main object color texture resource ID */
  mainObjectInput: string

  /** Main object depth texture resource ID */
  mainObjectDepthInput: string

  /** Main object depth input attachment (for depth textures on render targets) */
  mainObjectDepthInputAttachment?: number | 'depth'

  /** Output resource ID */
  outputResource: string
}

/**
 * Composites lensed environment behind the main object.
 *
 * @example
 * ```typescript
 * const composite = new EnvironmentCompositePass({
 *   id: 'envComposite',
 *   lensedEnvironmentInput: 'lensedEnvironment',
 *   mainObjectInput: 'mainObjectColor',
 *   mainObjectDepthInput: 'mainObjectDepth',
 *   outputResource: 'compositedScene',
 * });
 *
 * graph.addPass(composite);
 * ```
 */
export class EnvironmentCompositePass extends BasePass {
  private lensedEnvResourceId: string
  private mainObjectResourceId: string
  private mainObjectDepthResourceId: string
  private mainObjectDepthInputAttachment?: number | 'depth'
  private outputResourceId: string

  // Shell glow configuration
  private shellConfig: ShellGlowConfig = {
    enabled: false,
    color: new THREE.Color(1, 1, 1),
    strength: 0,
  }

  // Rendering resources
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera

  constructor(config: EnvironmentCompositePassConfig) {
    super({
      id: config.id,
      name: config.name,
      inputs: [
        { resourceId: config.lensedEnvironmentInput, access: 'read' },
        { resourceId: config.mainObjectInput, access: 'read' },
        {
          resourceId: config.mainObjectDepthInput,
          access: 'read',
          attachment: config.mainObjectDepthInputAttachment,
        },
      ],
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
    })

    this.lensedEnvResourceId = config.lensedEnvironmentInput
    this.mainObjectResourceId = config.mainObjectInput
    this.mainObjectDepthResourceId = config.mainObjectDepthInput
    this.mainObjectDepthInputAttachment = config.mainObjectDepthInputAttachment
    this.outputResourceId = config.outputResource

    // Create composite material
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tLensedEnvironment: { value: null },
        tMainObject: { value: null },
        tMainObjectDepth: { value: null },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        // Shell glow uniforms
        uShellEnabled: { value: false },
        uShellGlowColor: { value: new THREE.Color(1, 1, 1) },
        uShellGlowStrength: { value: 0.0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: environmentCompositeVertexShader,
      fragmentShader: environmentCompositeFragmentShader,
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
    const { renderer, camera } = ctx

    // Get input textures
    const lensedEnvTexture = ctx.getReadTexture(this.lensedEnvResourceId)
    const mainObjectTexture = ctx.getReadTexture(this.mainObjectResourceId)
    const mainObjectDepthTexture = ctx.getReadTexture(
      this.mainObjectDepthResourceId,
      this.mainObjectDepthInputAttachment
    )

    if (!lensedEnvTexture || !mainObjectTexture || !mainObjectDepthTexture) {
      console.warn('EnvironmentCompositePass: Missing input textures')
      return
    }

    // Get output target
    const outputTarget = ctx.getWriteTarget(this.outputResourceId)

    // Get camera near/far for depth linearization
    let near = 0.1
    let far = 100
    if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
      near = camera.near
      far = camera.far
    }

    // Update uniforms
    this.material.uniforms['tLensedEnvironment']!.value = lensedEnvTexture
    this.material.uniforms['tMainObject']!.value = mainObjectTexture
    this.material.uniforms['tMainObjectDepth']!.value = mainObjectDepthTexture
    this.material.uniforms['uNear']!.value = near
    this.material.uniforms['uFar']!.value = far

    // Update shell glow uniforms
    this.material.uniforms['uShellEnabled']!.value = this.shellConfig.enabled
    this.material.uniforms['uShellGlowColor']!.value = this.shellConfig.color
    this.material.uniforms['uShellGlowStrength']!.value = this.shellConfig.strength

    // Update resolution from output target or renderer size
    const size = new THREE.Vector2()
    if (outputTarget) {
      size.set(outputTarget.width, outputTarget.height)
    } else {
      renderer.getSize(size)
    }
    this.material.uniforms['uResolution']!.value = size

    // Render
    renderer.setRenderTarget(outputTarget)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(null)
  }

  /**
   * Update shell glow configuration.
   * Call this before rendering to control the photon shell appearance.
   * @param config - Partial shell glow configuration to apply
   */
  setShellConfig(config: Partial<ShellGlowConfig>): void {
    if (config.enabled !== undefined) {
      this.shellConfig.enabled = config.enabled
    }
    if (config.color !== undefined) {
      this.shellConfig.color.copy(config.color)
    }
    if (config.strength !== undefined) {
      this.shellConfig.strength = config.strength
    }
  }

  /**
   * Get current shell glow configuration.
   * @returns Current shell glow configuration
   */
  getShellConfig(): ShellGlowConfig {
    return {
      enabled: this.shellConfig.enabled,
      color: this.shellConfig.color.clone(),
      strength: this.shellConfig.strength,
    }
  }

  dispose(): void {
    this.material.dispose()
    this.mesh.geometry.dispose()
    this.scene.remove(this.mesh)
  }
}
