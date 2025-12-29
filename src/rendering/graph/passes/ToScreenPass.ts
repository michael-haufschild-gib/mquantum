/**
 * To Screen Pass
 *
 * Copies a texture to the screen (null render target).
 * Typically the final pass in a render graph.
 *
 * Features:
 * - Simple copy shader (no modifications)
 * - Gamma correction option
 * - Tone mapping option
 * - CAS (Contrast Adaptive Sharpening) for upscaled content
 *
 * @module rendering/graph/passes/ToScreenPass
 */

import * as THREE from 'three'

import { BasePass } from '../BasePass'
import type { RenderContext, RenderPassConfig } from '../types'

/**
 * Configuration for ToScreenPass.
 */
export interface ToScreenPassConfig extends Omit<RenderPassConfig, 'outputs'> {
  /** Apply gamma correction (sRGB output) */
  gammaCorrection?: boolean

  /** Apply simple tone mapping */
  toneMapping?: boolean

  /** Exposure for tone mapping */
  exposure?: number
}

/**
 * Fragment shader for screen output with CAS sharpening.
 */
const FRAGMENT_SHADER = `
precision highp float;

in vec2 vUv;

uniform sampler2D uInput;
uniform bool uGammaCorrection;
uniform bool uToneMapping;
uniform float uExposure;
uniform float uSharpness;

layout(location = 0) out vec4 fragColor;

// Simple Reinhard tone mapping
vec3 toneMap(vec3 color) {
  color *= uExposure;
  return color / (1.0 + color);
}

// Linear to sRGB
vec3 linearToSRGB(vec3 color) {
  return pow(color, vec3(1.0 / 2.2));
}

/**
 * CAS (Contrast Adaptive Sharpening) - adapted from AMD FidelityFX
 *
 * This is a simplified 3x3 version that provides good quality sharpening
 * with minimal artifacts. The algorithm adapts sharpening strength based
 * on local contrast to prevent halo artifacts in high-contrast areas.
 *
 * Returns vec4 to avoid extra texture fetch for alpha channel.
 */
vec4 casFilter(vec2 uv) {
  // Sample center pixel once (reuse for both sharpening and alpha)
  vec4 center = texture(uInput, uv);
  vec3 e = center.rgb;

  // Sample 4 cardinal neighbors using textureOffset (DPR-safe, uses integer texel offsets)
  vec3 b = textureOffset(uInput, uv, ivec2( 0, -1)).rgb;
  vec3 d = textureOffset(uInput, uv, ivec2(-1,  0)).rgb;
  vec3 f = textureOffset(uInput, uv, ivec2( 1,  0)).rgb;
  vec3 h = textureOffset(uInput, uv, ivec2( 0,  1)).rgb;

  // Soft min/max across 4 cardinal neighbors + center
  vec3 minRGB = min(min(min(d, e), min(f, b)), h);
  vec3 maxRGB = max(max(max(d, e), max(f, b)), h);

  // Calculate adaptive sharpening amount per channel
  // Higher local contrast = less sharpening (prevents halo artifacts)
  vec3 rcpM = 1.0 / (maxRGB - minRGB + 0.001);
  vec3 amp = clamp(min(minRGB, 2.0 - maxRGB) * rcpM, 0.0, 1.0);
  amp = sqrt(amp);  // Soft curve for smoother transition

  // Sharpening kernel weight (negative Laplacian-like filter)
  // Peak controls maximum sharpening strength
  float peak = -1.0 / (8.0 - 3.0 * uSharpness);
  vec3 w = amp * peak;

  // Apply sharpening: weighted sum of cardinal neighbors + center
  // Normalized to preserve overall brightness
  vec3 sharpened = (b + d + f + h) * w + e;
  sharpened /= (1.0 + 4.0 * w);

  return vec4(sharpened, center.a);
}

void main() {
  vec4 color;

  // Apply CAS sharpening if enabled (sharpness > 0)
  if (uSharpness > 0.001) {
    color = casFilter(vUv);
  } else {
    color = texture(uInput, vUv);
  }

  if (uToneMapping) {
    color.rgb = toneMap(color.rgb);
  }

  if (uGammaCorrection) {
    color.rgb = linearToSRGB(color.rgb);
  }

  fragColor = color;
}
`

/**
 * Vertex shader for fullscreen quad.
 * Note: With glslVersion: GLSL3, Three.js auto-injects attribute declarations
 * for position, uv, etc. We must NOT redeclare them.
 */
const VERTEX_SHADER = `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/**
 * Copies a texture to the screen.
 *
 * @example
 * ```typescript
 * const toScreen = new ToScreenPass({
 *   id: 'toScreen',
 *   inputs: [{ resourceId: 'finalColor', access: 'read' }],
 *   gammaCorrection: true,
 * });
 *
 * graph.addPass(toScreen);
 * ```
 */
export class ToScreenPass extends BasePass {
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera

  constructor(config: ToScreenPassConfig) {
    super({
      ...config,
      outputs: [], // ToScreenPass writes to screen (null target)
    })

    // Create material
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uInput: { value: null },
        uGammaCorrection: { value: config.gammaCorrection ?? false },
        uToneMapping: { value: config.toneMapping ?? false },
        uExposure: { value: config.exposure ?? 1.0 },
        uSharpness: { value: 0.0 },
      },
      depthTest: false,
      depthWrite: false,
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
    const { renderer } = ctx

    // Get input texture
    const inputConfig = this.config.inputs[0]
    if (!inputConfig) {
      console.warn('ToScreenPass: No input configured')
      return
    }

    const texture = ctx.getReadTexture(inputConfig.resourceId)
    if (!texture) {
      console.warn('ToScreenPass: Input texture not found:', inputConfig.resourceId)
      return
    }

    this.material.uniforms['uInput']!.value = texture

    // Render to screen
    renderer.setRenderTarget(null)
    renderer.render(this.scene, this.camera)
  }

  /**
   * Set gamma correction.
   * @param enabled
   */
  setGammaCorrection(enabled: boolean): void {
    this.material.uniforms['uGammaCorrection']!.value = enabled
  }

  /**
   * Set tone mapping.
   * @param enabled
   */
  setToneMapping(enabled: boolean): void {
    this.material.uniforms['uToneMapping']!.value = enabled
  }

  /**
   * Set exposure.
   * @param exposure
   */
  setExposure(exposure: number): void {
    this.material.uniforms['uExposure']!.value = exposure
  }

  /**
   * Set CAS sharpening intensity.
   *
   * @param sharpness - Sharpening intensity (0-1, 0 = disabled)
   */
  setSharpness(sharpness: number): void {
    this.material.uniforms['uSharpness']!.value = Math.max(0, Math.min(1, sharpness))
  }

  /**
   * Get current sharpness value.
   */
  getSharpness(): number {
    return this.material.uniforms['uSharpness']!.value as number
  }

  dispose(): void {
    this.material.dispose()
    this.mesh.geometry.dispose()
    // Remove mesh from scene to ensure proper cleanup
    this.scene.remove(this.mesh)
  }
}
