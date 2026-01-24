/**
 * Composite Pass
 *
 * Blends multiple input textures with configurable blend modes.
 * Useful for combining render layers, adding effects, etc.
 *
 * @module rendering/graph/passes/CompositePass
 */

import * as THREE from 'three'

import { BasePass } from '../BasePass'
import type { RenderContext, RenderPassConfig } from '../types'

/**
 * Blend modes for compositing.
 */
export type BlendMode = 'add' | 'multiply' | 'screen' | 'alpha' | 'overlay'

/**
 * Input configuration for compositing.
 */
export interface CompositeInput {
  /** Resource ID for the input texture */
  resourceId: string
  /** Blend mode for this input */
  blendMode: BlendMode
  /** Blend weight (0-1) */
  weight?: number
}

/**
 * Configuration for CompositePass.
 */
export interface CompositePassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Input textures to composite */
  compositeInputs: CompositeInput[]
  /** Output resource ID */
  outputResource: string
  /** Background color for the output (default: transparent black) */
  backgroundColor?: THREE.ColorRepresentation
}

/**
 * Composites multiple input textures.
 *
 * Supports various blend modes for combining textures:
 * - add: Additive blending (good for glow, lights)
 * - multiply: Multiplicative blending (shadows, masks)
 * - screen: Screen blending (lightening)
 * - alpha: Standard alpha blending
 * - overlay: Overlay blending (contrast enhancement)
 *
 * @example
 * ```typescript
 * const composite = new CompositePass({
 *   id: 'composite',
 *   compositeInputs: [
 *     { resourceId: 'sceneColor', blendMode: 'alpha', weight: 1.0 },
 *     { resourceId: 'bloom', blendMode: 'add', weight: 0.5 },
 *   ],
 *   outputResource: 'final',
 * });
 *
 * graph.addPass(composite);
 * ```
 */
export class CompositePass extends BasePass {
  private compositeInputs: CompositeInput[]
  private outputResourceId: string
  private backgroundColor: THREE.Color

  // Rendering resources
  private material: THREE.ShaderMaterial
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera

  constructor(config: CompositePassConfig) {
    // Build inputs list from compositeInputs
    const inputs = config.compositeInputs.map((input) => ({
      resourceId: input.resourceId,
      access: 'read' as const,
    }))

    super({
      id: config.id,
      name: config.name,
      inputs,
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
    })

    this.compositeInputs = config.compositeInputs
    this.outputResourceId = config.outputResource
    this.backgroundColor = new THREE.Color(config.backgroundColor ?? 0x000000)

    // Create composite material
    // Supports up to 4 input textures for simplicity
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        tInput0: { value: null },
        tInput1: { value: null },
        tInput2: { value: null },
        tInput3: { value: null },
        uWeights: { value: new THREE.Vector4(1, 1, 1, 1) },
        uBlendModes: { value: new THREE.Vector4(0, 0, 0, 0) },
        uInputCount: { value: 0 },
        uBackgroundColor: { value: this.backgroundColor },
      },
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
        layout(location = 0) out vec4 fragColor;

        uniform sampler2D tInput0;
        uniform sampler2D tInput1;
        uniform sampler2D tInput2;
        uniform sampler2D tInput3;
        uniform vec4 uWeights;
        uniform vec4 uBlendModes; // 0=add, 1=multiply, 2=screen, 3=alpha, 4=overlay
        uniform int uInputCount;
        uniform vec3 uBackgroundColor;

        // Blend functions
        vec3 blendAdd(vec3 base, vec3 blend, float weight) {
          return base + blend * weight;
        }

        vec3 blendMultiply(vec3 base, vec3 blend, float weight) {
          return mix(base, base * blend, weight);
        }

        vec3 blendScreen(vec3 base, vec3 blend, float weight) {
          vec3 screenResult = 1.0 - (1.0 - base) * (1.0 - blend);
          return mix(base, screenResult, weight);
        }

        vec3 blendAlpha(vec3 base, vec3 blend, float alpha, float weight) {
          return mix(base, blend, alpha * weight);
        }

        vec3 blendOverlay(vec3 base, vec3 blend, float weight) {
          vec3 result;
          for (int i = 0; i < 3; i++) {
            if (base[i] < 0.5) {
              result[i] = 2.0 * base[i] * blend[i];
            } else {
              result[i] = 1.0 - 2.0 * (1.0 - base[i]) * (1.0 - blend[i]);
            }
          }
          return mix(base, result, weight);
        }

        vec3 applyBlend(vec3 base, vec4 input, int blendMode, float weight) {
          if (blendMode == 0) return blendAdd(base, input.rgb, weight);
          if (blendMode == 1) return blendMultiply(base, input.rgb, weight);
          if (blendMode == 2) return blendScreen(base, input.rgb, weight);
          if (blendMode == 3) return blendAlpha(base, input.rgb, input.a, weight);
          if (blendMode == 4) return blendOverlay(base, input.rgb, weight);
          return base;
        }

        /**
         * Blend alpha values based on blend mode.
         * - add: Accumulate alpha (clamped to 1)
         * - multiply: Multiply alphas
         * - screen: Screen blend alphas
         * - alpha: Over-compositing (Porter-Duff over)
         * - overlay: Use source alpha weighted by weight
         */
        float blendAlphaValue(float baseAlpha, float inputAlpha, int blendMode, float weight) {
          if (blendMode == 0) {
            // Add: accumulate
            return min(baseAlpha + inputAlpha * weight, 1.0);
          }
          if (blendMode == 1) {
            // Multiply: multiply alphas
            return mix(baseAlpha, baseAlpha * inputAlpha, weight);
          }
          if (blendMode == 2) {
            // Screen: screen blend alphas
            float screenResult = 1.0 - (1.0 - baseAlpha) * (1.0 - inputAlpha);
            return mix(baseAlpha, screenResult, weight);
          }
          if (blendMode == 3) {
            // Alpha (over): Porter-Duff over compositing
            // Result = src.a + dst.a * (1 - src.a)
            float srcA = inputAlpha * weight;
            return srcA + baseAlpha * (1.0 - srcA);
          }
          if (blendMode == 4) {
            // Overlay: use input alpha weighted
            return mix(baseAlpha, inputAlpha, weight);
          }
          return baseAlpha;
        }

        void main() {
          vec3 result = uBackgroundColor;
          // Start alpha at 0.0 - background is transparent unless we have opaque inputs
          float alpha = 0.0;

          if (uInputCount >= 1) {
            vec4 input0 = texture(tInput0, vUv);
            result = applyBlend(result, input0, int(uBlendModes.x), uWeights.x);
            alpha = blendAlphaValue(alpha, input0.a, int(uBlendModes.x), uWeights.x);
          }

          if (uInputCount >= 2) {
            vec4 input1 = texture(tInput1, vUv);
            result = applyBlend(result, input1, int(uBlendModes.y), uWeights.y);
            alpha = blendAlphaValue(alpha, input1.a, int(uBlendModes.y), uWeights.y);
          }

          if (uInputCount >= 3) {
            vec4 input2 = texture(tInput2, vUv);
            result = applyBlend(result, input2, int(uBlendModes.z), uWeights.z);
            alpha = blendAlphaValue(alpha, input2.a, int(uBlendModes.z), uWeights.z);
          }

          if (uInputCount >= 4) {
            vec4 input3 = texture(tInput3, vUv);
            result = applyBlend(result, input3, int(uBlendModes.w), uWeights.w);
            alpha = blendAlphaValue(alpha, input3.a, int(uBlendModes.w), uWeights.w);
          }

          fragColor = vec4(result, alpha);
        }
      `,
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

    // Get output target
    const outputTarget = ctx.getWriteTarget(this.outputResourceId)

    // Set up textures and blend parameters
    // Reuse existing uniform Vector4 values to avoid per-frame allocations
    const weights = this.material.uniforms['uWeights']!.value as THREE.Vector4
    const blendModes = this.material.uniforms['uBlendModes']!.value as THREE.Vector4

    // Reset to defaults before populating
    weights.set(1, 1, 1, 1)
    blendModes.set(0, 0, 0, 0)

    const textureUniforms = ['tInput0', 'tInput1', 'tInput2', 'tInput3']
    const inputCount = Math.min(this.compositeInputs.length, 4)

    for (let i = 0; i < inputCount; i++) {
      const input = this.compositeInputs[i]!
      const texture = ctx.getReadTexture(input.resourceId)
      this.material.uniforms[textureUniforms[i]!]!.value = texture

      // Set weight
      const weight = input.weight ?? 1.0
      if (i === 0) weights.x = weight
      else if (i === 1) weights.y = weight
      else if (i === 2) weights.z = weight
      else weights.w = weight

      // Set blend mode
      const blendMode = this.blendModeToInt(input.blendMode)
      if (i === 0) blendModes.x = blendMode
      else if (i === 1) blendModes.y = blendMode
      else if (i === 2) blendModes.z = blendMode
      else blendModes.w = blendMode
    }
    this.material.uniforms['uInputCount']!.value = inputCount

    // Render composite
    renderer.setRenderTarget(outputTarget)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(null)
  }

  /**
   * Convert blend mode string to integer.
   * @param mode - The blend mode
   * @returns Integer representation of the blend mode
   */
  private blendModeToInt(mode: BlendMode): number {
    const modeMap: Record<BlendMode, number> = {
      add: 0,
      multiply: 1,
      screen: 2,
      alpha: 3,
      overlay: 4,
    }
    return modeMap[mode]
  }

  /**
   * Update input weight.
   * @param index
   * @param weight
   */
  setInputWeight(index: number, weight: number): void {
    const input = this.compositeInputs[index]
    if (input) {
      input.weight = weight
    }
  }

  /**
   * Update input blend mode.
   * @param index
   * @param mode
   */
  setInputBlendMode(index: number, mode: BlendMode): void {
    const input = this.compositeInputs[index]
    if (input) {
      input.blendMode = mode
    }
  }

  dispose(): void {
    this.material.dispose()
    this.mesh.geometry.dispose()
    // Remove mesh from scene to ensure proper cleanup
    this.scene.remove(this.mesh)
  }
}
