/**
 * Jets Render Pass
 *
 * Renders black hole polar jets as volumetric cones to a separate render target.
 * Uses John Chapman's "Good Enough Volumetrics" technique for soft, realistic jets.
 *
 * The jets are rendered on RENDER_LAYERS.JETS and composited with additive blending
 * over the scene via JetsCompositePass.
 *
 * @module rendering/graph/passes/JetsRenderPass
 */

import * as THREE from 'three'

import { computeKerrRadii } from '@/lib/geometry/extended/kerr-physics'
import { RENDER_LAYERS } from '@/rendering/core/layers'
import {
  jetVolumetricFragmentShader,
  jetVolumetricVertexShader,
} from '@/rendering/shaders/postprocessing/jetVolumetric.glsl'
import { BasePass } from '../BasePass'
import type { FrozenBlackHoleState, FrozenFrameContext } from '../FrameContext'
import type { RenderContext, RenderPassConfig } from '../types'

/**
 * Configuration for JetsRenderPass.
 */
export interface JetsRenderPassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Scene depth texture for soft depth intersections */
  sceneDepthInput: string

  /** Output resource ID for jet color buffer */
  outputResource: string
}

/**
 * Render pass for black hole polar jets.
 *
 * Creates two cone meshes (top and bottom jets) and renders them with
 * volumetric shading. Jets use the JETS render layer so they can be
 * selectively rendered.
 *
 * @example
 * ```typescript
 * const jetsPass = new JetsRenderPass({
 *   id: 'jetsRender',
 *   sceneDepthInput: 'objectDepth',
 *   outputResource: 'jetsColor',
 *   enabled: (frame) => frame?.stores.blackHole.jetsEnabled ?? false,
 * });
 * graph.addPass(jetsPass);
 * ```
 */
export class JetsRenderPass extends BasePass {
  private sceneDepthInputId: string
  private outputResourceId: string

  // Rendering resources
  private jetScene: THREE.Scene
  private topJetMesh: THREE.Mesh
  private bottomJetMesh: THREE.Mesh
  private jetMaterial: THREE.ShaderMaterial

  // Reusable vectors to avoid allocations
  private tempColor: THREE.Color

  constructor(config: JetsRenderPassConfig) {
    // IMPORTANT: This pass should always run to ensure JETS_COLOR is properly
    // initialized. When jets are disabled, we just clear to black.
    // Using skipPassthrough because the depth input should NOT be copied to
    // the color output (different formats/purposes).
    super({
      id: config.id,
      name: config.name ?? 'Jets Render',
      inputs: [{ resourceId: config.sceneDepthInput, access: 'read' }],
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      // Always enabled - we check jetsEnabled internally and clear to black if disabled
      enabled: () => true,
      priority: config.priority,
      skipPassthrough: true, // Don't passthrough depth to color buffer
    })

    this.sceneDepthInputId = config.sceneDepthInput
    this.outputResourceId = config.outputResource
    this.tempColor = new THREE.Color()

    // Create jet material - PLASMA ENERGY BEAM
    this.jetMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uJetColor: { value: new THREE.Color(0x4488ff) },  // Bright blue
        uJetIntensity: { value: 5.0 },      // High intensity for glow
        uJetHeight: { value: 25.0 },
        uJetWidth: { value: 0.35 },         // Moderate width
        uJetFalloff: { value: 1.2 },        // Gradual falloff
        uJetNoiseAmount: { value: 0.7 },    // Strong turbulence
        uJetPulsation: { value: 0.6 },      // Visible pulsation
        uJetSign: { value: 1.0 },
        uTime: { value: 0 },
        tSceneDepth: { value: null },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uSoftDepthRange: { value: 0.8 },    // Softer depth blending
        uDepthAvailable: { value: 0.0 },
      },
      vertexShader: jetVolumetricVertexShader,
      fragmentShader: jetVolumetricFragmentShader,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    })

    // High-detail cone geometry for smooth plasma gradients
    // ConeGeometry creates: tip at y=+0.5, base at y=-0.5 (centered at origin)
    // We want: NARROW end (tip) at black hole, WIDE end (base) extending away
    //
    // For TOP JET: tip near BH (small y), base far (large y)
    //   - Flip cone 180° so base is at top
    //   - Translate so tip is at origin
    //
    // For BOTTOM JET: tip near BH (small negative y), base far (large negative y)
    //   - Keep cone orientation (tip at top = near BH after positioning)
    //   - Translate so tip is at origin

    // TOP JET geometry: flip and position tip at origin
    const topConeGeometry = new THREE.ConeGeometry(1, 1, 64, 128, true)
    topConeGeometry.rotateX(Math.PI) // Flip: tip now at y=-0.5, base at y=+0.5
    topConeGeometry.translate(0, 0.5, 0) // Move tip to origin, base at y=+1

    this.topJetMesh = new THREE.Mesh(topConeGeometry, this.jetMaterial.clone())
    this.topJetMesh.layers.set(RENDER_LAYERS.JETS)
    this.topJetMesh.frustumCulled = false
    ;(this.topJetMesh.material as THREE.ShaderMaterial).uniforms['uJetSign']!.value = 1.0

    // BOTTOM JET geometry: keep orientation, position tip at origin
    const bottomConeGeometry = new THREE.ConeGeometry(1, 1, 64, 128, true)
    bottomConeGeometry.translate(0, -0.5, 0) // Move tip to origin, base at y=-1

    this.bottomJetMesh = new THREE.Mesh(bottomConeGeometry, this.jetMaterial.clone())
    this.bottomJetMesh.layers.set(RENDER_LAYERS.JETS)
    this.bottomJetMesh.frustumCulled = false
    ;(this.bottomJetMesh.material as THREE.ShaderMaterial).uniforms['uJetSign']!.value = -1.0

    // Create scene for jets only
    this.jetScene = new THREE.Scene()
    this.jetScene.add(this.topJetMesh)
    this.jetScene.add(this.bottomJetMesh)
  }

  /**
   * Update jet mesh scale based on configuration.
   */
  private updateJetGeometry(height: number, width: number): void {
    const radius = height * width
    this.topJetMesh.scale.set(radius, height, radius)
    this.bottomJetMesh.scale.set(radius, height, radius)
  }

  /**
   * Update shader uniforms from blackhole config.
   * @param material
   * @param config
   * @param depthTexture
   * @param resolution
   * @param near
   * @param far
   * @param time
   */
  private updateUniforms(
    material: THREE.ShaderMaterial,
    config: Pick<
      FrozenBlackHoleState,
      | 'jetsColor'
      | 'jetsIntensity'
      | 'jetsHeight'
      | 'jetsWidth'
      | 'jetsFalloff'
      | 'jetsNoiseAmount'
      | 'jetsPulsation'
    >,
    depthTexture: THREE.Texture | null,
    resolution: THREE.Vector2,
    near: number,
    far: number,
    time: number
  ): void {
    this.tempColor.set(config.jetsColor)
    material.uniforms['uJetColor']!.value.copy(this.tempColor)
    material.uniforms['uJetIntensity']!.value = config.jetsIntensity
    material.uniforms['uJetHeight']!.value = config.jetsHeight
    material.uniforms['uJetWidth']!.value = config.jetsWidth
    material.uniforms['uJetFalloff']!.value = config.jetsFalloff
    material.uniforms['uJetNoiseAmount']!.value = config.jetsNoiseAmount
    material.uniforms['uJetPulsation']!.value = config.jetsPulsation
    material.uniforms['uTime']!.value = time
    material.uniforms['tSceneDepth']!.value = depthTexture
    // Set uDepthAvailable to 1.0 if depth texture is bound, 0.0 otherwise
    // This allows the shader to skip depth intersection when depth is unavailable
    material.uniforms['uDepthAvailable']!.value = depthTexture ? 1.0 : 0.0
    material.uniforms['uResolution']!.value.copy(resolution)
    material.uniforms['uNear']!.value = near
    material.uniforms['uFar']!.value = far
  }

  execute(ctx: RenderContext): void {
    const { renderer, camera, size } = ctx

    // Get output target first - always needed to clear
    const outputTarget = ctx.getWriteTarget(this.outputResourceId)

    // Clear to black (transparent) - this is the default when jets are disabled
    renderer.setRenderTarget(outputTarget)
    renderer.setClearColor(0x000000, 0)
    renderer.clear()

    // Get frozen frame context for blackhole config
    const frame = ctx.frame as FrozenFrameContext | null
    const blackhole = frame?.stores.blackHole
    const objectType = frame?.stores.geometry?.objectType

    // Only render jets if blackhole type AND jets enabled
    if (!blackhole || objectType !== 'blackhole' || !blackhole.jetsEnabled) {
      renderer.setRenderTarget(null)
      return
    }

    // Get scene depth for soft intersections
    const depthTexture = ctx.getReadTexture(this.sceneDepthInputId)

    // Update jet geometry and position based on config
    this.updateJetGeometry(blackhole.jetsHeight, blackhole.jetsWidth)

    // Compute shadow radius using Kerr physics
    // The shadow radius is the visual boundary of the black hole (where rays are absorbed)
    // Formula: shadowRadius = 3√3 * M * sqrt(1 - chi²/4) ≈ 5.196 * M for Schwarzschild
    //
    // The photon shell (bright ring) is rendered at:
    //   - Center: shadowRadius * 1.15
    //   - Width: shadowRadius * photonShellWidth (default 0.1)
    //   - Outer edge: shadowRadius * (1.15 + photonShellWidth)
    //
    // Jets must start OUTSIDE the photon shell outer edge
    const M = blackhole.horizonRadius / 2
    const kerr = computeKerrRadii(M, blackhole.spin)

    // Calculate the photon shell outer edge and add large margin
    // photonShellWidth can be up to 0.3, so shell edge is at shadowRadius * (1.15 + 0.3) = 1.45
    // Using 2.0 multiplier ensures jets are clearly visible outside the black hole
    const jetStartRadius = kerr.shadowRadius * 2.0
    this.topJetMesh.position.y = jetStartRadius
    this.bottomJetMesh.position.y = -jetStartRadius

    // Get camera near/far
    let near = 0.1
    let far = 1000
    if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
      near = camera.near
      far = camera.far
    }

    // Animation time
    const time = performance.now() * 0.001 * blackhole.timeScale

    // Resolution for depth sampling
    const resolution = new THREE.Vector2(size.width, size.height)

    // Update both jet materials
    this.updateUniforms(
      this.topJetMesh.material as THREE.ShaderMaterial,
      blackhole,
      depthTexture,
      resolution,
      near,
      far,
      time
    )
    this.updateUniforms(
      this.bottomJetMesh.material as THREE.ShaderMaterial,
      blackhole,
      depthTexture,
      resolution,
      near,
      far,
      time
    )

    // Render jets (target already set and cleared above)
    // Enable only JETS layer for camera
    camera.layers.set(RENDER_LAYERS.JETS)
    renderer.render(this.jetScene, camera)

    // Restore camera layers (will be restored by next pass anyway)
    camera.layers.enableAll()

    renderer.setRenderTarget(null)
  }

  dispose(): void {
    this.jetMaterial.dispose()
    ;(this.topJetMesh.material as THREE.ShaderMaterial).dispose()
    ;(this.bottomJetMesh.material as THREE.ShaderMaterial).dispose()
    this.topJetMesh.geometry.dispose()
    // bottomJetMesh shares geometry, no need to dispose again
  }
}
