/**
 * Tone Mapping Pass
 *
 * Converts HDR color values to LDR for display.
 * Implements all standard Three.js tone mapping algorithms in GLSL.
 *
 * Pipeline position: After all HDR effects, before film grain and AA.
 * This ensures HDR effects work in linear space, while AA/grain work on LDR.
 *
 * Algorithms:
 * - None (0): Pass-through
 * - Linear (1): Simple exposure clamp
 * - Reinhard (2): Classic HDR operator
 * - Cineon (3): Film-like response
 * - ACES Filmic (4): Industry standard
 * - AgX (6): Modern filmic (Blender 4.0 default)
 * - Neutral (7): Khronos PBR Neutral
 *
 * @module rendering/graph/passes/ToneMappingPass
 */

import * as THREE from 'three'

import { BasePass } from '../BasePass'
import type { RenderContext, RenderPassConfig } from '../types'

/**
 * Configuration for ToneMappingPass.
 */
export interface ToneMappingPassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Input HDR color resource */
  colorInput: string
  /** Output LDR color resource */
  outputResource: string
  /** Initial tone mapping mode (Three.js constant) */
  toneMapping?: number
  /** Initial exposure value */
  exposure?: number
}

/**
 * GLSL tone mapping implementations from Three.js.
 * All algorithms in a single shader with uniform-based selection.
 */
const TONEMAPPING_GLSL = /* glsl */ `
#ifndef saturate
#define saturate(a) clamp(a, 0.0, 1.0)
#endif

// Reinhard - https://www.cs.utah.edu/docs/techreports/2002/pdf/UUCS-02-001.pdf
vec3 ReinhardToneMapping(vec3 color, float exposure) {
  color *= exposure;
  return saturate(color / (vec3(1.0) + color));
}

// Cineon - http://filmicworlds.com/blog/filmic-tonemapping-operators/
vec3 CineonToneMapping(vec3 color, float exposure) {
  color *= exposure;
  color = max(vec3(0.0), color - 0.004);
  vec3 numerator = color * (6.2 * color + 0.5);
  vec3 denominator = color * (6.2 * color + 1.7) + 0.06;
  // Guard against division by zero (denominator is always >= 0.06 for non-negative color)
  return pow(numerator / max(denominator, vec3(0.0001)), vec3(2.2));
}

// ACES helper
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  // Guard against division by zero (b is always > 0.238 for non-negative v, but be safe)
  return a / max(b, vec3(0.0001));
}

// ACES Filmic - https://github.com/selfshadow/ltc_code/blob/master/webgl/shaders/ltc/ltc_blit.fs
vec3 ACESFilmicToneMapping(vec3 color, float exposure) {
  const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  const mat3 ACESOutputMat = mat3(
    vec3( 1.60475, -0.10208, -0.00327),
    vec3(-0.53108,  1.10813, -0.07276),
    vec3(-0.07367, -0.00605,  1.07602)
  );

  color *= exposure / 0.6;
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return saturate(color);
}

// AgX color space matrices
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
  vec3(0.6274, 0.0691, 0.0164),
  vec3(0.3293, 0.9195, 0.0880),
  vec3(0.0433, 0.0113, 0.8956)
);
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
  vec3( 1.6605, -0.1246, -0.0182),
  vec3(-0.5876,  1.1329, -0.1006),
  vec3(-0.0728, -0.0083,  1.1187)
);

// AgX contrast approximation - https://iolite-engine.com/blog_posts/minimal_agx_implementation
vec3 agxDefaultContrastApprox(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return + 15.5 * x4 * x2
    - 40.14 * x4 * x
    + 31.96 * x4
    - 6.868 * x2 * x
    + 0.4298 * x2
    + 0.1191 * x
    - 0.00232;
}

// AgX - https://github.com/google/filament/pull/7236
vec3 AgXToneMapping(vec3 color, float exposure) {
  const mat3 AgXInsetMatrix = mat3(
    vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
    vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
    vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859)
  );
  const mat3 AgXOutsetMatrix = mat3(
    vec3( 1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
    vec3(-0.11060664309660323,  1.157823702216272, -0.11060664309660294),
    vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405)
  );
  const float AgxMinEv = -12.47393;
  const float AgxMaxEv = 4.026069;

  color *= exposure;
  color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
  color = AgXInsetMatrix * color;

  // Log2 encoding
  color = max(color, 1e-10);
  color = log2(color);
  color = (color - AgxMinEv) / (AgxMaxEv - AgxMinEv);
  color = clamp(color, 0.0, 1.0);

  // Sigmoid
  color = agxDefaultContrastApprox(color);

  color = AgXOutsetMatrix * color;
  color = pow(max(vec3(0.0), color), vec3(2.2));
  color = LINEAR_REC2020_TO_LINEAR_SRGB * color;

  return clamp(color, 0.0, 1.0);
}

// Neutral - https://modelviewer.dev/examples/tone-mapping
vec3 NeutralToneMapping(vec3 color, float exposure) {
  const float StartCompression = 0.8 - 0.04;
  const float Desaturation = 0.15;

  color *= exposure;

  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;

  float peak = max(color.r, max(color.g, color.b));
  if (peak < StartCompression) return color;

  float d = 1.0 - StartCompression;
  // Guard against division by zero (peak + d - StartCompression is always > 0 when peak >= StartCompression)
  float denominator = peak + d - StartCompression;
  float newPeak = 1.0 - d * d / max(denominator, 0.0001);
  // Guard against peak being zero
  float safePeak = max(peak, 0.0001);
  color *= newPeak / safePeak;

  float g = 1.0 - 1.0 / (Desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}

// Main tone mapping dispatcher
vec3 applyToneMapping(vec3 color, int mode, float exposure) {
  if (mode == 0) return color; // NoToneMapping
  if (mode == 1) return saturate(exposure * color); // Linear
  if (mode == 2) return ReinhardToneMapping(color, exposure);
  if (mode == 3) return CineonToneMapping(color, exposure);
  if (mode == 4) return ACESFilmicToneMapping(color, exposure);
  if (mode == 6) return AgXToneMapping(color, exposure);
  if (mode == 7) return NeutralToneMapping(color, exposure);
  return color;
}
`

const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

in vec2 vUv;

uniform sampler2D uInput;
uniform int uToneMapping;
uniform float uExposure;

layout(location = 0) out vec4 fragColor;

${TONEMAPPING_GLSL}

void main() {
  vec4 color = texture(uInput, vUv);
  color.rgb = applyToneMapping(color.rgb, uToneMapping, uExposure);
  fragColor = color;
}
`

const VERTEX_SHADER = /* glsl */ `
out vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/**
 * Applies tone mapping to convert HDR to LDR.
 *
 * Uses uniform-based algorithm selection for efficiency (no shader recompilation).
 * Matches Three.js tone mapping constants for compatibility.
 *
 * @example
 * ```typescript
 * const toneMapping = new ToneMappingPass({
 *   id: 'toneMapping',
 *   colorInput: 'hdrColor',
 *   outputResource: 'ldrColor',
 *   toneMapping: THREE.ACESFilmicToneMapping,
 *   exposure: 1.0,
 * });
 * ```
 */
export class ToneMappingPass extends BasePass {
  private inputResourceId: string
  private outputResourceId: string

  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera

  constructor(config: ToneMappingPassConfig) {
    super({
      id: config.id,
      name: config.name,
      inputs: [{ resourceId: config.colorInput, access: 'read' }],
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
    })

    this.inputResourceId = config.colorInput
    this.outputResourceId = config.outputResource

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uInput: { value: null },
        uToneMapping: { value: config.toneMapping ?? THREE.NoToneMapping },
        uExposure: { value: config.exposure ?? 1.0 },
      },
      depthTest: false,
      depthWrite: false,
    })

    const geometry = new THREE.PlaneGeometry(2, 2)
    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.frustumCulled = false

    this.scene = new THREE.Scene()
    this.scene.add(this.mesh)

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  }

  execute(ctx: RenderContext): void {
    const { renderer } = ctx

    const inputTexture = ctx.getReadTexture(this.inputResourceId)
    if (!inputTexture) {
      console.warn(`ToneMappingPass: Input '${this.inputResourceId}' not found`)
      return
    }

    const outputTarget = ctx.getWriteTarget(this.outputResourceId)

    this.material.uniforms['uInput']!.value = inputTexture

    renderer.setRenderTarget(outputTarget)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(null)
  }

  /**
   * Set tone mapping algorithm (Three.js constant).
   * @param mode
   */
  setToneMapping(mode: number): void {
    this.material.uniforms['uToneMapping']!.value = mode
  }

  /**
   * Set exposure value.
   * @param exposure
   */
  setExposure(exposure: number): void {
    this.material.uniforms['uExposure']!.value = exposure
  }

  /**
   * Get current settings.
   * @returns Object with tone mapping and exposure settings
   */
  getSettings(): { toneMapping: number; exposure: number } {
    return {
      toneMapping: this.material.uniforms['uToneMapping']!.value as number,
      exposure: this.material.uniforms['uExposure']!.value as number,
    }
  }

  dispose(): void {
    this.material.dispose()
    this.mesh.geometry.dispose()
    // Remove mesh from scene to ensure proper cleanup
    this.scene.remove(this.mesh)
  }
}
