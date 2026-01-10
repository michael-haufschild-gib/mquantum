/**
 * Gravitational Lensing Pass
 *
 * Applies gravitational lensing distortion to the environment layer only.
 * The gravity well is assumed to be at world origin (0,0,0), projected to screen space.
 * This pass is independent of the black hole's internal ray-marched lensing.
 *
 * Unlike ScreenSpaceLensingPass, this pass:
 * - Only distorts the environment (walls, skybox)
 * - Uses global gravity settings from the post-processing store
 * - Has no inner region protection (not needed for environment-only rendering)
 *
 * @module rendering/graph/passes/GravitationalLensingPass
 */

import * as THREE from 'three'

import {
  gravitationalLensingFragmentShader,
  gravitationalLensingVertexShader,
} from '@/rendering/shaders/postprocessing/gravitationalLensing.glsl'
import { BasePass } from '../BasePass'
import type { FrozenFrameContext } from '../FrameContext'
import type { RenderContext, RenderPassConfig } from '../types'

/**
 * Configuration for GravitationalLensingPass.
 */
export interface GravitationalLensingPassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Input environment color texture resource ID */
  environmentInput: string

  /** Output resource ID */
  outputResource: string
}

/**
 * Gravitational lensing pass for environment layer.
 *
 * Reads gravity settings from the frozen frame context and applies
 * gravitational distortion to the environment buffer.
 *
 * @example
 * ```typescript
 * const lensing = new GravitationalLensingPass({
 *   id: 'envLensing',
 *   environmentInput: 'environmentColor',
 *   outputResource: 'lensedEnvironment',
 *   enabled: (frame) => frame?.stores.postProcessing.gravityEnabled ?? false,
 * });
 *
 * graph.addPass(lensing);
 * ```
 */
export class GravitationalLensingPass extends BasePass {
  private inputResourceId: string
  private outputResourceId: string

  // Gravity center in UV space (calculated from world origin projection)
  private gravityCenter: THREE.Vector2
  private worldOrigin: THREE.Vector3

  // Rendering resources
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera

  constructor(config: GravitationalLensingPassConfig) {
    super({
      id: config.id,
      name: config.name,
      inputs: [{ resourceId: config.environmentInput, access: 'read' }],
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
    })

    this.inputResourceId = config.environmentInput
    this.outputResourceId = config.outputResource

    // Gravity well is always at world origin
    this.gravityCenter = new THREE.Vector2(0.5, 0.5)
    this.worldOrigin = new THREE.Vector3(0, 0, 0)

    // Create lensing material with default values
    // Actual values come from frozen frame context during execute()
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tEnvironment: { value: null },
        uGravityCenter: { value: this.gravityCenter },
        uStrength: { value: 1.0 },
        uDistortionScale: { value: 1.0 },
        uFalloff: { value: 1.5 },
        uChromaticAberration: { value: 0.0 },
        // N-Dimensional physics: scale factor to compensate for faster falloff in higher dimensions
        uNDScale: { value: 1.0 },
        // Apparent horizon radius in UV space (scales with camera zoom)
        uApparentHorizonRadius: { value: 0.1 },
        // Black hole gravity multiplier (from blackHole.gravityStrength * blackHole.bendScale)
        uBlackHoleGravity: { value: 1.0 },
        // Aspect ratio (width / height) for circular lensing correction
        uAspectRatio: { value: 1.0 },
      },
      vertexShader: gravitationalLensingVertexShader,
      fragmentShader: gravitationalLensingFragmentShader,
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

    // Get input texture
    const environmentTexture = ctx.getReadTexture(this.inputResourceId)
    if (!environmentTexture) {
      console.warn(`GravitationalLensingPass: Environment texture '${this.inputResourceId}' not found`)
      return
    }

    // Get output target
    const outputTarget = ctx.getWriteTarget(this.outputResourceId)

    // Read gravity settings from frozen frame context
    const frame = ctx.frame as FrozenFrameContext | null
    const pp = frame?.stores.postProcessing
    const geo = frame?.stores.geometry
    const bh = frame?.stores.blackHole

    // Post-processing gravity settings (user-controllable global effect)
    const strength = pp?.gravityStrength ?? 1.0
    const distortionScale = pp?.gravityDistortionScale ?? 1.0
    const chromaticAberration = pp?.gravityChromaticAberration ?? 0.0

    // Black hole gravity settings
    const horizonRadius = bh?.horizonRadius ?? 1.0
    const bhGravityStrength = bh?.gravityStrength ?? 1.0
    const bhBendScale = bh?.bendScale ?? 1.0
    // Combined black hole gravity multiplier
    const blackHoleGravity = bhGravityStrength * bhBendScale

    // N-Dimensional physics: compute proper falloff and scale from dimension
    // In N dimensions, gravity falls off as 1/r^(N-1) (Tangherlini metric)
    const dimension = geo?.dimension ?? 3
    const ndFalloff = dimension - 1 // N-D gravity falloff exponent
    // Scale factor compensates for faster falloff in higher dimensions
    // This ensures lensing remains visible as dimension increases
    const ndScale = dimension > 3 ? Math.pow(3.0, dimension - 3) : 1.0

    // Compute apparent horizon radius in UV space based on camera zoom
    let apparentHorizonRadiusUV = 0.1 // default fallback

    // Project world origin to screen space for gravity center
    if (camera instanceof THREE.PerspectiveCamera) {
      const projected = this.worldOrigin.clone().project(camera)
      // Convert from NDC (-1 to 1) to UV (0 to 1)
      this.gravityCenter.set(
        (projected.x + 1) * 0.5,
        (projected.y + 1) * 0.5
      )

      // Calculate apparent horizon radius for zoom scaling
      // For perspective camera: apparent size = actual size / distance * projection factor
      const cameraDistance = camera.position.length()
      if (cameraDistance > 0.001) {
        const vFov = camera.fov * (Math.PI / 180)
        // Apparent radius as fraction of screen height
        // Factor of 2 because NDC goes from -1 to 1 (height = 2)
        apparentHorizonRadiusUV = horizonRadius / (cameraDistance * Math.tan(vFov / 2))
      }
    } else if (camera instanceof THREE.OrthographicCamera) {
      const projected = this.worldOrigin.clone().project(camera)
      this.gravityCenter.set(
        (projected.x + 1) * 0.5,
        (projected.y + 1) * 0.5
      )

      // For ortho camera: apparent size = actual size / view height
      const viewHeight = camera.top - camera.bottom
      if (viewHeight > 0.001) {
        apparentHorizonRadiusUV = horizonRadius / viewHeight
      }
    }

    // Clamp apparent radius to reasonable range (prevent extreme values)
    apparentHorizonRadiusUV = Math.max(0.005, Math.min(0.8, apparentHorizonRadiusUV))

    // Compute aspect ratio for circular lensing (prevents elliptical distortion)
    let aspectRatio = 1.0
    if (outputTarget) {
      aspectRatio = outputTarget.width / outputTarget.height
    }

    // Update uniforms
    this.material.uniforms['tEnvironment']!.value = environmentTexture
    this.material.uniforms['uGravityCenter']!.value = this.gravityCenter
    this.material.uniforms['uStrength']!.value = strength
    this.material.uniforms['uDistortionScale']!.value = distortionScale
    // Use N-D physics falloff instead of user-configured value for proper dimension-aware lensing
    this.material.uniforms['uFalloff']!.value = ndFalloff
    this.material.uniforms['uChromaticAberration']!.value = chromaticAberration
    this.material.uniforms['uNDScale']!.value = ndScale
    // New uniforms for black hole integration and zoom scaling
    this.material.uniforms['uApparentHorizonRadius']!.value = apparentHorizonRadiusUV
    this.material.uniforms['uBlackHoleGravity']!.value = blackHoleGravity
    this.material.uniforms['uAspectRatio']!.value = aspectRatio

    // Render
    renderer.setRenderTarget(outputTarget)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(null)
  }

  /**
   * Manually set gravity center (for testing or special cases).
   * @param x
   * @param y
   */
  setGravityCenter(x: number, y: number): void {
    this.gravityCenter.set(x, y)
  }

  dispose(): void {
    this.material.dispose()
    this.mesh.geometry.dispose()
    this.scene.remove(this.mesh)
  }
}
