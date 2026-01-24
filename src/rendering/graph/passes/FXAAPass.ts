/**
 * FXAA Pass
 *
 * Render graph pass for Fast Approximate Anti-Aliasing.
 * Provides edge smoothing with minimal performance cost.
 *
 * Uses FXAA 3.11 algorithm (Nvidia) with GLSL ES 3.00 for WebGL2 compliance.
 * Based on Timothy Lottes' original implementation.
 *
 * @module rendering/graph/passes/FXAAPass
 */

import * as THREE from 'three'

import { BasePass } from '../BasePass'
import type { RenderContext, RenderPassConfig } from '../types'

/** Typed uniforms interface for FXAA shader material */
interface FXAAUniforms {
  [uniform: string]: THREE.IUniform<unknown>
  tDiffuse: THREE.IUniform<THREE.Texture | null>
  resolution: THREE.IUniform<THREE.Vector2>
}

// =============================================================================
// FXAA 3.11 Shader (GLSL ES 3.00)
// =============================================================================

/**
 * FXAA 3.11 Quality Settings
 *
 * Configurable quality presets that balance performance vs anti-aliasing quality.
 */
const FXAA_QUALITY = {
  /** Minimum edge contrast threshold (ignores very low contrast edges) */
  EDGE_THRESHOLD_MIN: 0.0312,
  /** Maximum edge threshold relative to luma max */
  EDGE_THRESHOLD_MAX: 0.125,
  /** Number of edge search iterations (more = better quality, slower) */
  ITERATIONS: 12,
  /** Subpixel anti-aliasing quality (0 = off, 1 = max) */
  SUBPIXEL_QUALITY: 0.75,
}

/**
 * FXAA Vertex Shader (GLSL ES 3.00)
 *
 * Simple fullscreen quad vertex shader with direct NDC output.
 */
const fxaaVertexShader = /* glsl */ `
  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

/**
 * FXAA 3.11 Fragment Shader (GLSL ES 3.00)
 *
 * Fast Approximate Anti-Aliasing algorithm:
 * 1. Detect high-contrast edges using luma
 * 2. Determine edge orientation (horizontal/vertical)
 * 3. Search along edge to find endpoints
 * 4. Blend along edge direction based on position
 * 5. Apply subpixel anti-aliasing for small details
 *
 * Based on Timothy Lottes' FXAA 3.11 implementation.
 * @see https://gist.github.com/kosua20/0c506b81b3812ac900048059d2383126
 */
const fxaaFragmentShader = /* glsl */ `
  precision highp float;

  in vec2 vUv;
  layout(location = 0) out vec4 fragColor;

  uniform sampler2D tDiffuse;
  uniform vec2 resolution; // 1.0 / screenSize

  // FXAA quality settings (can be modified for performance tuning)
  #define EDGE_THRESHOLD_MIN ${FXAA_QUALITY.EDGE_THRESHOLD_MIN}
  #define EDGE_THRESHOLD_MAX ${FXAA_QUALITY.EDGE_THRESHOLD_MAX}
  #define ITERATIONS ${FXAA_QUALITY.ITERATIONS}
  #define SUBPIXEL_QUALITY ${FXAA_QUALITY.SUBPIXEL_QUALITY}

  // Quality lookup for edge search step sizes
  // Pattern: small steps near center, larger steps further out
  float getQuality(int i) {
    if (i < 5) return 1.0;
    if (i == 5) return 1.5;
    if (i < 10) return 2.0;
    if (i == 10) return 4.0;
    return 8.0;
  }

  // Calculate perceptual luma from RGB (Rec. 601 coefficients for gamma-corrected input)
  float rgb2luma(vec3 rgb) {
    return dot(rgb, vec3(0.299, 0.587, 0.114));
  }

  void main() {
    vec3 colorCenter = texture(tDiffuse, vUv).rgb;
    float lumaCenter = rgb2luma(colorCenter);

    // Sample the 4 direct neighbors
    float lumaDown = rgb2luma(textureOffset(tDiffuse, vUv, ivec2(0, -1)).rgb);
    float lumaUp = rgb2luma(textureOffset(tDiffuse, vUv, ivec2(0, 1)).rgb);
    float lumaLeft = rgb2luma(textureOffset(tDiffuse, vUv, ivec2(-1, 0)).rgb);
    float lumaRight = rgb2luma(textureOffset(tDiffuse, vUv, ivec2(1, 0)).rgb);

    // Find luma range in local neighborhood
    float lumaMin = min(lumaCenter, min(min(lumaDown, lumaUp), min(lumaLeft, lumaRight)));
    float lumaMax = max(lumaCenter, max(max(lumaDown, lumaUp), max(lumaLeft, lumaRight)));
    float lumaRange = lumaMax - lumaMin;

    // Early exit: skip low-contrast areas (no visible aliasing)
    if (lumaRange < max(EDGE_THRESHOLD_MIN, lumaMax * EDGE_THRESHOLD_MAX)) {
      fragColor = vec4(colorCenter, 1.0);
      return;
    }

    // Sample the 4 corner neighbors for edge detection
    float lumaDownLeft = rgb2luma(textureOffset(tDiffuse, vUv, ivec2(-1, -1)).rgb);
    float lumaUpRight = rgb2luma(textureOffset(tDiffuse, vUv, ivec2(1, 1)).rgb);
    float lumaUpLeft = rgb2luma(textureOffset(tDiffuse, vUv, ivec2(-1, 1)).rgb);
    float lumaDownRight = rgb2luma(textureOffset(tDiffuse, vUv, ivec2(1, -1)).rgb);

    // Compute edge direction using Sobel-like filter
    float lumaDownUp = lumaDown + lumaUp;
    float lumaLeftRight = lumaLeft + lumaRight;
    float lumaLeftCorners = lumaDownLeft + lumaUpLeft;
    float lumaDownCorners = lumaDownLeft + lumaDownRight;
    float lumaRightCorners = lumaDownRight + lumaUpRight;
    float lumaUpCorners = lumaUpRight + lumaUpLeft;

    float edgeHorizontal = abs(-2.0 * lumaLeft + lumaLeftCorners) +
                           abs(-2.0 * lumaCenter + lumaDownUp) * 2.0 +
                           abs(-2.0 * lumaRight + lumaRightCorners);
    float edgeVertical = abs(-2.0 * lumaUp + lumaUpCorners) +
                         abs(-2.0 * lumaCenter + lumaLeftRight) * 2.0 +
                         abs(-2.0 * lumaDown + lumaDownCorners);

    // Determine edge orientation
    bool isHorizontal = edgeHorizontal >= edgeVertical;
    float stepLength = isHorizontal ? resolution.y : resolution.x;

    // Select the two neighbors perpendicular to edge
    float luma1 = isHorizontal ? lumaDown : lumaLeft;
    float luma2 = isHorizontal ? lumaUp : lumaRight;
    float gradient1 = luma1 - lumaCenter;
    float gradient2 = luma2 - lumaCenter;

    // Determine which side has steeper gradient
    bool is1Steepest = abs(gradient1) >= abs(gradient2);
    float gradientScaled = 0.25 * max(abs(gradient1), abs(gradient2));

    // Move in the direction of the steeper gradient
    float lumaLocalAverage;
    if (is1Steepest) {
      stepLength = -stepLength;
      lumaLocalAverage = 0.5 * (luma1 + lumaCenter);
    } else {
      lumaLocalAverage = 0.5 * (luma2 + lumaCenter);
    }

    // Shift UV in perpendicular direction
    vec2 currentUv = vUv;
    if (isHorizontal) {
      currentUv.y += stepLength * 0.5;
    } else {
      currentUv.x += stepLength * 0.5;
    }

    // Edge search: find edge endpoints in both directions
    vec2 offset = isHorizontal ? vec2(resolution.x, 0.0) : vec2(0.0, resolution.y);
    vec2 uv1 = currentUv - offset * getQuality(0);
    vec2 uv2 = currentUv + offset * getQuality(0);

    float lumaEnd1 = rgb2luma(texture(tDiffuse, uv1).rgb) - lumaLocalAverage;
    float lumaEnd2 = rgb2luma(texture(tDiffuse, uv2).rgb) - lumaLocalAverage;

    bool reached1 = abs(lumaEnd1) >= gradientScaled;
    bool reached2 = abs(lumaEnd2) >= gradientScaled;
    bool reachedBoth = reached1 && reached2;

    if (!reached1) uv1 -= offset * getQuality(1);
    if (!reached2) uv2 += offset * getQuality(1);

    // Continue searching if endpoints not found
    if (!reachedBoth) {
      for (int i = 2; i < ITERATIONS; i++) {
        if (!reached1) {
          lumaEnd1 = rgb2luma(texture(tDiffuse, uv1).rgb) - lumaLocalAverage;
          reached1 = abs(lumaEnd1) >= gradientScaled;
        }
        if (!reached2) {
          lumaEnd2 = rgb2luma(texture(tDiffuse, uv2).rgb) - lumaLocalAverage;
          reached2 = abs(lumaEnd2) >= gradientScaled;
        }
        reachedBoth = reached1 && reached2;

        if (!reached1) uv1 -= offset * getQuality(i);
        if (!reached2) uv2 += offset * getQuality(i);
        if (reachedBoth) break;
      }
    }

    // Calculate distances to edge endpoints
    float distance1 = isHorizontal ? (vUv.x - uv1.x) : (vUv.y - uv1.y);
    float distance2 = isHorizontal ? (uv2.x - vUv.x) : (uv2.y - vUv.y);

    bool isDirection1 = distance1 < distance2;
    float distanceFinal = min(distance1, distance2);
    float edgeThickness = distance1 + distance2;

    // Check if luma at center is smaller than average
    bool isLumaCenterSmaller = lumaCenter < lumaLocalAverage;

    // Verify edge detection was correct
    bool correctVariation1 = (lumaEnd1 < 0.0) != isLumaCenterSmaller;
    bool correctVariation2 = (lumaEnd2 < 0.0) != isLumaCenterSmaller;
    bool correctVariation = isDirection1 ? correctVariation1 : correctVariation2;

    // Calculate final offset based on edge position
    float pixelOffset = -distanceFinal / edgeThickness + 0.5;
    float finalOffset = correctVariation ? pixelOffset : 0.0;

    // Subpixel anti-aliasing for fine details
    float lumaAverage = (1.0 / 12.0) * (2.0 * (lumaDownUp + lumaLeftRight) + lumaLeftCorners + lumaRightCorners);
    float subPixelOffset1 = clamp(abs(lumaAverage - lumaCenter) / lumaRange, 0.0, 1.0);
    float subPixelOffset2 = (-2.0 * subPixelOffset1 + 3.0) * subPixelOffset1 * subPixelOffset1;
    float subPixelOffsetFinal = subPixelOffset2 * subPixelOffset2 * SUBPIXEL_QUALITY;

    // Use the larger of edge or subpixel offset
    finalOffset = max(finalOffset, subPixelOffsetFinal);

    // Apply offset and sample
    vec2 finalUv = vUv;
    if (isHorizontal) {
      finalUv.y += finalOffset * stepLength;
    } else {
      finalUv.x += finalOffset * stepLength;
    }

    fragColor = vec4(texture(tDiffuse, finalUv).rgb, 1.0);
  }
`

/**
 * Configuration for FXAAPass.
 */
export interface FXAAPassConfig extends Omit<RenderPassConfig, 'inputs' | 'outputs'> {
  /** Input color resource */
  colorInput: string
  /** Output resource */
  outputResource: string
}

/**
 * Fast Approximate Anti-Aliasing pass.
 *
 * @example
 * ```typescript
 * const fxaaPass = new FXAAPass({
 *   id: 'fxaa',
 *   colorInput: 'sceneColor',
 *   outputResource: 'antialiasedOutput',
 * });
 * ```
 */
export class FXAAPass extends BasePass {
  private material: THREE.ShaderMaterial
  private uniforms: FXAAUniforms
  private mesh: THREE.Mesh
  private scene: THREE.Scene
  private camera: THREE.OrthographicCamera

  private colorInputId: string
  private outputId: string
  private disposed = false

  constructor(config: FXAAPassConfig) {
    super({
      id: config.id,
      name: config.name ?? 'FXAA Pass',
      inputs: [{ resourceId: config.colorInput, access: 'read' }],
      outputs: [{ resourceId: config.outputResource, access: 'write' }],
      enabled: config.enabled,
      priority: config.priority,
      skipPassthrough: config.skipPassthrough,
    })

    this.colorInputId = config.colorInput
    this.outputId = config.outputResource

    // Create typed uniforms for type-safe access
    this.uniforms = {
      tDiffuse: { value: null },
      resolution: { value: new THREE.Vector2() },
    }

    // Create FXAA material with GLSL ES 3.00 (WebGL2 compliant)
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: fxaaVertexShader,
      fragmentShader: fxaaFragmentShader,
      uniforms: this.uniforms,
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
    const { renderer, size } = ctx

    // Skip if invalid size (prevents division by zero)
    if (size.width <= 0 || size.height <= 0) {
      return
    }

    // Get textures
    const colorTex = ctx.getReadTexture(this.colorInputId)
    const outputTarget = ctx.getWriteTarget(this.outputId)

    // Skip if no color input (output target can be null for screen render)
    if (!colorTex) {
      return
    }

    // Update uniforms (type-safe access via stored reference)
    this.uniforms.tDiffuse.value = colorTex
    this.uniforms.resolution.value.set(1 / size.width, 1 / size.height)

    // Render (outputTarget null = render to screen)
    renderer.setRenderTarget(outputTarget)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(null)
  }

  dispose(): void {
    // Idempotent disposal
    if (this.disposed) {
      return
    }
    this.disposed = true

    this.material.dispose()
    this.mesh.geometry.dispose()
    // Remove mesh from scene to ensure proper cleanup
    this.scene.remove(this.mesh)
  }
}
