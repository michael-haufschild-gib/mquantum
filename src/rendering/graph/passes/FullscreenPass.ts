/**
 * Fullscreen Pass
 *
 * Renders a fullscreen quad with a custom shader.
 * Used for post-processing effects that sample from input textures.
 *
 * Features:
 * - Automatic input texture binding
 * - Custom uniform support
 * - GLSL 3.0 compatible
 *
 * @module rendering/graph/passes/FullscreenPass
 */

import * as THREE from 'three'

import { BasePass } from '../BasePass'
import type { RenderContext, RenderPassConfig } from '../types'

/**
 * Configuration for FullscreenPass.
 */
export interface FullscreenPassConfig extends RenderPassConfig {
  /** Fragment shader source (GLSL 3.0) */
  fragmentShader: string

  /** Vertex shader source (optional, uses default fullscreen quad) */
  vertexShader?: string

  /** Additional uniforms */
  uniforms?: Record<string, THREE.IUniform>

  /** Whether to clear the output before rendering */
  clear?: boolean

  /** Blending mode */
  blending?: THREE.Blending

  /** Whether to use depth test */
  depthTest?: boolean

  /** Whether to write depth */
  depthWrite?: boolean
}

/**
 * Default vertex shader for fullscreen quad.
 * Uses direct NDC coordinates for PlaneGeometry(2, 2).
 * Note: With glslVersion: GLSL3, Three.js auto-injects attribute declarations
 * for position, uv, etc. We must NOT redeclare them.
 */
const DEFAULT_VERTEX_SHADER = `
out vec2 vUv;

void main() {
  vUv = uv;
  // Direct NDC - no camera matrices needed for fullscreen quad
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/**
 * Renders a fullscreen quad with a custom shader.
 *
 * Input textures are automatically bound based on the pass's input configuration.
 * The binding name defaults to the resource ID prefixed with 'u'.
 *
 * @example
 * ```typescript
 * const blurPass = new FullscreenPass({
 *   id: 'blur',
 *   inputs: [{ resourceId: 'sceneColor', access: 'read' }],
 *   outputs: [{ resourceId: 'blurred', access: 'write' }],
 *   fragmentShader: `
 *     in vec2 vUv;
 *     uniform sampler2D uSceneColor;
 *     uniform vec2 uResolution;
 *     out vec4 fragColor;
 *
 *     void main() {
 *       // Blur implementation...
 *       fragColor = texture(uSceneColor, vUv);
 *     }
 *   `,
 *   uniforms: {
 *     uResolution: { value: new THREE.Vector2() },
 *   },
 * });
 * ```
 */
export class FullscreenPass extends BasePass {
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera
  private clearOutput: boolean

  constructor(config: FullscreenPassConfig) {
    super(config)

    this.clearOutput = config.clear ?? false

    // Build uniforms with input texture placeholders
    const uniforms: Record<string, THREE.IUniform> = {
      ...config.uniforms,
    }

    // Add placeholders for input textures
    for (const input of config.inputs) {
      const uniformName = input.binding ?? `u${this.capitalizeFirst(input.resourceId)}`
      if (!uniforms[uniformName]) {
        uniforms[uniformName] = { value: null }
      }
    }

    // Add common uniforms
    if (!uniforms['uTime']) {
      uniforms['uTime'] = { value: 0 }
    }
    if (!uniforms['uResolution']) {
      uniforms['uResolution'] = { value: new THREE.Vector2(1, 1) }
    }

    // Create material
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: config.vertexShader ?? DEFAULT_VERTEX_SHADER,
      fragmentShader: config.fragmentShader,
      uniforms,
      depthTest: config.depthTest ?? false,
      depthWrite: config.depthWrite ?? false,
      blending: config.blending ?? THREE.NoBlending,
    })

    // Create fullscreen quad
    const geometry = new THREE.PlaneGeometry(2, 2)
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.frustumCulled = false

    // Create dedicated scene and camera
    this.scene = new THREE.Scene()
    this.scene.add(this.mesh)

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  }

  execute(ctx: RenderContext): void {
    const { renderer, time, size } = ctx

    // Get output target
    const outputConfig = this.config.outputs[0]
    const target = outputConfig ? ctx.getWriteTarget(outputConfig.resourceId) : null

    // Bind input textures
    for (const input of this.config.inputs) {
      const texture = ctx.getReadTexture(input.resourceId, input.attachment)
      const uniformName = input.binding ?? `u${this.capitalizeFirst(input.resourceId)}`

      if (this.material.uniforms[uniformName]) {
        this.material.uniforms[uniformName].value = texture
      }
    }

    // Update common uniforms
    if (this.material.uniforms['uTime']) {
      this.material.uniforms['uTime'].value = time
    }
    if (this.material.uniforms['uResolution']) {
      this.material.uniforms['uResolution'].value.set(size.width, size.height)
    }

    // Render
    const savedAutoClear = renderer.autoClear
    renderer.autoClear = this.clearOutput

    // MRTStateManager automatically configures drawBuffers via patched setRenderTarget
    renderer.setRenderTarget(target)
    if (this.clearOutput) {
      renderer.clear()
    }
    renderer.render(this.scene, this.camera)

    renderer.autoClear = savedAutoClear
    renderer.setRenderTarget(null)
  }

  /**
   * Get the material for external uniform updates.
   * @returns The shader material
   */
  getMaterial(): THREE.ShaderMaterial {
    return this.material
  }

  /**
   * Update a uniform value.
   * @param name
   * @param value
   */
  setUniform(name: string, value: unknown): void {
    if (this.material.uniforms[name]) {
      this.material.uniforms[name].value = value
    }
  }

  dispose(): void {
    this.material.dispose()
    this.mesh.geometry.dispose()
    // Remove mesh from scene to ensure proper cleanup
    this.scene.remove(this.mesh)
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }
}
