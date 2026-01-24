/**
 * Bokeh Pass (Depth of Field)
 *
 * Render graph pass for depth-of-field blur effect.
 * Uses depth buffer to blur out-of-focus areas.
 *
 * @module rendering/graph/passes/BokehPass
 */

import * as THREE from 'three'

import { BasePass } from '../BasePass'
import type { RenderContext, RenderPassConfig } from '../types'
import { BokehShader, type BokehUniforms } from '@/rendering/shaders/postprocessing/BokehShader'

/**
 * Configuration for BokehPass.
 */
export interface BokehPassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Scene color input resource */
  colorInput: string
  /** Depth buffer input resource */
  depthInput: string
  /** Depth input attachment (for depth textures on render targets) */
  depthInputAttachment?: number | 'depth'
  /** Alternate depth input resource (optional) */
  alternateDepthInput?: string
  /** Alternate depth input attachment */
  alternateDepthInputAttachment?: number | 'depth'
  /** Tertiary depth input resource (optional, for temporal cloud depth) */
  tertiaryDepthInput?: string
  /** Tertiary depth input attachment */
  tertiaryDepthInputAttachment?: number | 'depth'
  /** Optional selector for choosing depth input at runtime */
  depthInputSelector?: () => string
  /** Output resource */
  outputResource: string

  /** Focus distance in world units */
  focus?: number
  /** Focus range (depth of focus area) */
  focusRange?: number
  /** Aperture size (affects blur intensity) */
  aperture?: number
  /** Maximum blur amount */
  maxBlur?: number
  /** Blur method: 0=disc, 1=jittered, 2=separable, 3=hexagonal */
  blurMethod?: number
}

/**
 * Depth of field pass using bokeh blur.
 *
 * @example
 * ```typescript
 * const bokehPass = new BokehPass({
 *   id: 'bokeh',
 *   colorInput: 'sceneColor',
 *   depthInput: 'objectDepth',
 *   outputResource: 'bokehOutput',
 *   focus: 5,
 *   focusRange: 3,
 *   aperture: 0.025,
 * });
 * ```
 */
export class BokehPass extends BasePass {
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera

  // Copy material for passthrough
  private copyMaterial: THREE.ShaderMaterial
  private copyMesh: THREE.Mesh
  private copyScene: THREE.Scene

  private colorInputId: string
  private depthInputId: string
  private depthInputAttachment?: number | 'depth'
  private alternateDepthInputId?: string
  private alternateDepthInputAttachment?: number | 'depth'
  private tertiaryDepthInputId?: string
  private tertiaryDepthInputAttachment?: number | 'depth'
  private depthInputSelector?: () => string
  private outputId: string

  // Current parameters
  private focus: number
  private focusRange: number
  private aperture: number
  private maxBlur: number
  private blurMethod: number

  constructor(config: BokehPassConfig) {
    const inputs = [
      { resourceId: config.colorInput, access: 'read' as const },
      {
        resourceId: config.depthInput,
        access: 'read' as const,
        attachment: config.depthInputAttachment,
      },
    ]

    if (config.alternateDepthInput && config.alternateDepthInput !== config.depthInput) {
      inputs.push({
        resourceId: config.alternateDepthInput,
        access: 'read' as const,
        attachment: config.alternateDepthInputAttachment,
      })
    }

    if (
      config.tertiaryDepthInput &&
      config.tertiaryDepthInput !== config.depthInput &&
      config.tertiaryDepthInput !== config.alternateDepthInput
    ) {
      inputs.push({
        resourceId: config.tertiaryDepthInput,
        access: 'read' as const,
        attachment: config.tertiaryDepthInputAttachment,
      })
    }

    super({
      id: config.id,
      name: config.name ?? 'Bokeh Pass',
      inputs,
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
      skipPassthrough: config.skipPassthrough,
    })

    this.colorInputId = config.colorInput
    this.depthInputId = config.depthInput
    this.depthInputAttachment = config.depthInputAttachment
    this.alternateDepthInputId = config.alternateDepthInput
    this.alternateDepthInputAttachment = config.alternateDepthInputAttachment
    this.tertiaryDepthInputId = config.tertiaryDepthInput
    this.tertiaryDepthInputAttachment = config.tertiaryDepthInputAttachment
    this.depthInputSelector = config.depthInputSelector
    this.outputId = config.outputResource

    this.focus = config.focus ?? 5
    this.focusRange = config.focusRange ?? 3
    this.aperture = config.aperture ?? 0.025
    this.maxBlur = config.maxBlur ?? 0.02
    this.blurMethod = config.blurMethod ?? 3

    // Create material from BokehShader
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: BokehShader.vertexShader,
      fragmentShader: BokehShader.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(BokehShader.uniforms),
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

    // Create copy material for passthrough
    this.copyMaterial = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: { tDiffuse: { value: null } },
      vertexShader: /* glsl */ `
        out vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        in vec2 vUv;
        uniform sampler2D tDiffuse;
        layout(location = 0) out vec4 fragColor;
        void main() {
          fragColor = texture(tDiffuse, vUv);
        }
      `,
      depthTest: false,
      depthWrite: false,
    })
    this.copyMesh = new THREE.Mesh(geometry.clone(), this.copyMaterial)
    this.copyMesh.frustumCulled = false
    this.copyScene = new THREE.Scene()
    this.copyScene.add(this.copyMesh)
  }

  execute(ctx: RenderContext): void {
    const { renderer, camera, size } = ctx

    // Get textures
    const colorTex = ctx.getReadTexture(this.colorInputId)
    const outputTarget = ctx.getWriteTarget(this.outputId)

    // Passthrough if camera is not perspective or required inputs missing
    if (!(camera instanceof THREE.PerspectiveCamera)) {
      this.copyToOutput(renderer, colorTex, outputTarget)
      return
    }

    const depthResourceId = this.depthInputSelector ? this.depthInputSelector() : this.depthInputId
    const depthAttachment =
      depthResourceId === this.depthInputId
        ? this.depthInputAttachment
        : depthResourceId === this.alternateDepthInputId
          ? this.alternateDepthInputAttachment
          : depthResourceId === this.tertiaryDepthInputId
            ? this.tertiaryDepthInputAttachment
            : undefined
    const depthTex = ctx.getReadTexture(depthResourceId, depthAttachment)

    // Passthrough if required inputs missing
    if (!colorTex || !depthTex) {
      this.copyToOutput(renderer, colorTex, outputTarget)
      return
    }

    // Update uniforms
    const uniforms = this.material.uniforms as unknown as BokehUniforms
    uniforms.tDiffuse.value = colorTex
    uniforms.tDepth.value = depthTex as unknown as THREE.DepthTexture
    uniforms.focus.value = this.focus
    uniforms.focusRange.value = this.focusRange
    uniforms.aperture.value = this.aperture
    uniforms.maxblur.value = this.maxBlur
    uniforms.nearClip.value = camera.near
    uniforms.farClip.value = camera.far
    uniforms.aspect.value = size.height / size.width
    uniforms.blurMethod.value = this.blurMethod
    uniforms.time.value = ctx.time

    // Render
    renderer.setRenderTarget(outputTarget)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(null)
  }

  /**
   * Set focus distance
   * @param value
   */
  setFocus(value: number): void {
    this.focus = value
  }

  /**
   * Set focus range
   * @param value
   */
  setFocusRange(value: number): void {
    this.focusRange = value
  }

  /**
   * Set aperture
   * @param value
   */
  setAperture(value: number): void {
    this.aperture = value
  }

  /**
   * Set max blur
   * @param value
   */
  setMaxBlur(value: number): void {
    this.maxBlur = value
  }

  /**
   * Set blur method
   * @param value
   */
  setBlurMethod(value: number): void {
    this.blurMethod = value
  }

  /**
   * Copy input texture directly to output (passthrough)
   * @param renderer
   * @param inputTex
   * @param outputTarget
   */
  private copyToOutput(
    renderer: THREE.WebGLRenderer,
    inputTex: THREE.Texture | null,
    outputTarget: THREE.WebGLRenderTarget | null
  ): void {
    if (!inputTex) return

    this.copyMaterial.uniforms['tDiffuse']!.value = inputTex
    renderer.setRenderTarget(outputTarget)
    renderer.render(this.copyScene, this.camera)
    renderer.setRenderTarget(null)
  }

  dispose(): void {
    this.material.dispose()
    this.mesh.geometry.dispose()
    this.copyMaterial.dispose()
    this.copyMesh.geometry.dispose()
    // Remove meshes from scenes to ensure proper cleanup
    this.scene.remove(this.mesh)
    this.copyScene.remove(this.copyMesh)
  }
}
