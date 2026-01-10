/**
 * God Rays Pass
 *
 * Applies volumetric light scattering (god rays) effect to the jet buffer.
 * Uses GPU Gems 3 radial blur technique to create light shafts emanating
 * from the black hole center.
 *
 * This pass:
 * 1. Renders radial blur from jet buffer toward black hole center
 * 2. Composites result over scene with additive blending
 *
 * @module rendering/graph/passes/GodRaysPass
 */

import * as THREE from 'three'

import {
  godRaysCompositeFragmentShader,
  godRaysCompositeVertexShader,
  godRaysFragmentShader,
  godRaysVertexShader,
} from '@/rendering/shaders/postprocessing/godRays.glsl'
import { BasePass } from '../BasePass'
import type { FrozenFrameContext } from '../FrameContext'
import type { RenderContext, RenderPassConfig } from '../types'

/**
 * Configuration for GodRaysPass.
 */
export interface GodRaysPassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Input jet color texture resource ID */
  jetsInput: string

  /** Scene color texture resource ID (for composite) */
  sceneInput: string

  /** Output resource ID */
  outputResource: string
}

/**
 * God rays pass for black hole jets.
 *
 * Creates volumetric light scattering effect radiating from the black hole
 * center. The effect enhances the jet visibility and creates an ethereal
 * appearance.
 *
 * @example
 * ```typescript
 * const godRaysPass = new GodRaysPass({
 *   id: 'godRays',
 *   jetsInput: 'jetsColor',
 *   sceneInput: 'sceneColor',
 *   outputResource: 'sceneWithGodRays',
 *   enabled: (frame) => {
 *     const bh = frame?.stores.blackHole;
 *     return bh?.jetsEnabled && bh?.jetsGodRaysEnabled;
 *   },
 * });
 * graph.addPass(godRaysPass);
 * ```
 */
export class GodRaysPass extends BasePass {
  private jetsInputId: string
  private sceneInputId: string
  private outputResourceId: string

  // Rendering resources
  private godRaysMaterial: THREE.ShaderMaterial
  private compositeMaterial: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera

  // Intermediate render target for god rays
  private godRaysTarget: THREE.WebGLRenderTarget | null = null
  private lastWidth = 0
  private lastHeight = 0

  // Light position in screen space (black hole center)
  private lightPosition: THREE.Vector2

  constructor(config: GodRaysPassConfig) {
    // IMPORTANT: sceneInput must be first for passthrough to work correctly.
    // When god rays are disabled but jets are enabled, the render graph's
    // automatic passthrough copies the first input to the output.
    // The first input is sceneInput (jets composite result), which needs to
    // be copied to outputResource (SCENE_COLOR) when god rays are disabled.
    super({
      id: config.id,
      name: config.name ?? 'God Rays',
      inputs: [
        { resourceId: config.sceneInput, access: 'read' },   // First for passthrough
        { resourceId: config.jetsInput, access: 'read' },
      ],
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
      // skipPassthrough: false (default) - enables automatic passthrough when disabled
    })

    this.jetsInputId = config.jetsInput
    this.sceneInputId = config.sceneInput
    this.outputResourceId = config.outputResource
    this.lightPosition = new THREE.Vector2(0.5, 0.5)

    // Create god rays material - GPU Gems 3 radial blur
    // Samples along rays toward the light source with exponential decay
    this.godRaysMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tInput: { value: null },
        uLightPosition: { value: this.lightPosition },
        uDensity: { value: 1.0 },      // Ray length (1.0 = sample to light source)
        uWeight: { value: 1.0 },       // Initial sample weight
        uDecay: { value: 0.96 },       // Exponential decay per sample
        uExposure: { value: 0.3 },     // Low exposure to prevent blowout
        uSamples: { value: 64 },       // Samples along ray
      },
      vertexShader: godRaysVertexShader,
      fragmentShader: godRaysFragmentShader,
      depthTest: false,
      depthWrite: false,
    })

    // Create composite material - blends god rays over scene
    this.compositeMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tScene: { value: null },
        tGodRays: { value: null },
        uIntensity: { value: 1.0 },   // Moderate blend
      },
      vertexShader: godRaysCompositeVertexShader,
      fragmentShader: godRaysCompositeFragmentShader,
      depthTest: false,
      depthWrite: false,
    })

    // Create fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2)
    this.mesh = new THREE.Mesh(geometry, this.godRaysMaterial)
    this.mesh.frustumCulled = false

    this.scene = new THREE.Scene()
    this.scene.add(this.mesh)

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  }

  /**
   * Ensure intermediate render target exists with correct size.
   * @param width
   * @param height
   */
  private ensureTarget(width: number, height: number): void {
    if (this.godRaysTarget && this.lastWidth === width && this.lastHeight === height) {
      return
    }

    this.godRaysTarget?.dispose()

    // Use half resolution for god rays (performance optimization)
    const halfWidth = Math.max(1, Math.floor(width / 2))
    const halfHeight = Math.max(1, Math.floor(height / 2))

    this.godRaysTarget = new THREE.WebGLRenderTarget(halfWidth, halfHeight, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
      depthBuffer: false,
    })

    this.lastWidth = width
    this.lastHeight = height
  }

  execute(ctx: RenderContext): void {
    const { renderer, camera, size } = ctx

    // Get input textures
    const jetsTexture = ctx.getReadTexture(this.jetsInputId)
    const sceneTexture = ctx.getReadTexture(this.sceneInputId)

    if (!jetsTexture || !sceneTexture) {
      return
    }

    // Get output target
    const outputTarget = ctx.getWriteTarget(this.outputResourceId)

    // Ensure intermediate target
    this.ensureTarget(size.width, size.height)
    if (!this.godRaysTarget) return

    // Read god rays settings from frozen frame context
    const frame = ctx.frame as FrozenFrameContext | null
    const blackhole = frame?.stores.blackHole
    const intensity = blackhole?.jetsGodRaysIntensity ?? 0.8
    const samples = blackhole?.jetsGodRaysSamples ?? 64
    const decay = blackhole?.jetsGodRaysDecay ?? 0.96

    // Project black hole center (origin) to screen space
    // Ensure camera matrices are current before projection
    if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
      camera.updateMatrixWorld()
      camera.updateProjectionMatrix()

      // Project origin to NDC, then convert to UV
      const origin = new THREE.Vector3(0, 0, 0)
      origin.project(camera)

      // Convert from NDC (-1 to 1) to UV (0 to 1)
      this.lightPosition.set(
        (origin.x + 1) * 0.5,
        (origin.y + 1) * 0.5
      )
    }

    // === Pass 1: Render god rays to intermediate target ===
    this.mesh.material = this.godRaysMaterial
    this.godRaysMaterial.uniforms['tInput']!.value = jetsTexture
    this.godRaysMaterial.uniforms['uLightPosition']!.value = this.lightPosition
    this.godRaysMaterial.uniforms['uSamples']!.value = samples
    this.godRaysMaterial.uniforms['uDecay']!.value = decay

    renderer.setRenderTarget(this.godRaysTarget)
    renderer.render(this.scene, this.camera)

    // === Pass 2: Composite god rays with scene ===
    this.mesh.material = this.compositeMaterial
    this.compositeMaterial.uniforms['tScene']!.value = sceneTexture
    this.compositeMaterial.uniforms['tGodRays']!.value = this.godRaysTarget.texture
    this.compositeMaterial.uniforms['uIntensity']!.value = intensity

    renderer.setRenderTarget(outputTarget)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(null)
  }

  dispose(): void {
    this.godRaysMaterial.dispose()
    this.compositeMaterial.dispose()
    this.mesh.geometry.dispose()
    this.godRaysTarget?.dispose()
  }
}
