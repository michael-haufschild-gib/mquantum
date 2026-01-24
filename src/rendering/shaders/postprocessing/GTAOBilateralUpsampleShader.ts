/**
 * GTAO Bilateral Upsample Shader
 *
 * OPTIMIZATION: Depth-aware upsampling for half-resolution GTAO.
 * Preserves edges by comparing depth values, preventing blur across depth discontinuities.
 *
 * Key differences from SSR BilateralUpsampleShader:
 * - Samples AO values (grayscale) instead of reflection colors
 * - Uses multiplicative blending (color * aoFactor) instead of alpha blending
 * - AO darkens the scene rather than adding reflections
 *
 * CRITICAL BUG PREVENTION:
 * - Bilinear weights are calculated from cellPos (position within 2x2 cell), NOT from offsets
 * - The old SSR bug calculated weights from offsets which always produced 0
 * - Sample UVs are aligned to the half-res grid using floor() + snap
 *
 * @module rendering/shaders/postprocessing/GTAOBilateralUpsampleShader
 */

import * as THREE from 'three'

export const GTAOBilateralUpsampleShader = {
  uniforms: {
    tAO: { value: null as THREE.Texture | null }, // Half-res AO texture
    tColor: { value: null as THREE.Texture | null }, // Full-res scene color
    tDepth: { value: null as THREE.Texture | null }, // Full-res depth
    uResolution: { value: new THREE.Vector2(1, 1) }, // Full resolution
    uDepthThreshold: { value: 0.02 }, // Depth discontinuity threshold
    uNearClip: { value: 0.1 },
    uFarClip: { value: 1000 },
    uAOIntensity: { value: 1.0 }, // GTAO-specific: blend intensity
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

    uniform sampler2D tAO;
    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform vec2 uResolution;     // Full resolution
    uniform float uDepthThreshold;
    uniform float uNearClip;
    uniform float uFarClip;
    uniform float uAOIntensity;

    in vec2 vUv;
    layout(location = 0) out vec4 fragColor;

    // Convert raw depth to linear depth
    float linearizeDepth(float rawDepth) {
      return (2.0 * uNearClip * uFarClip) / 
             (uFarClip + uNearClip - rawDepth * (uFarClip - uNearClip));
    }

    void main() {
      vec2 texelSize = 1.0 / uResolution;
      vec2 halfResTexelSize = texelSize * 2.0;  // Half-res texel in full-res UV space

      // Sample full-res depth at current pixel
      float centerDepth = linearizeDepth(texture(tDepth, vUv).r);

      // ============================================================
      // CRITICAL: Calculate position within the 2x2 half-res cell
      // This is a value from 0-1 representing where in the cell we are
      // ============================================================
      vec2 cellPos = fract(vUv / halfResTexelSize);

      // ============================================================
      // CRITICAL: Align to half-res grid by snapping to cell boundaries
      // Then sample the 4 corners of this cell
      // baseUv is the center of the current half-res cell
      // ============================================================
      vec2 baseUv = floor(vUv / halfResTexelSize) * halfResTexelSize + halfResTexelSize * 0.5;

      // Offsets to the 4 corners of the 2x2 cell
      vec2 offsets[4];
      offsets[0] = vec2(0.0, 0.0);
      offsets[1] = vec2(halfResTexelSize.x, 0.0);
      offsets[2] = vec2(0.0, halfResTexelSize.y);
      offsets[3] = vec2(halfResTexelSize.x, halfResTexelSize.y);

      // ============================================================
      // CRITICAL: Bilinear weights from cellPos, NOT from offsets!
      // The old SSR bug calculated this from offsets which always gave 0
      // cellPos varies from 0 to 1, giving proper interpolation weights
      // ============================================================
      float wx0 = 1.0 - cellPos.x;
      float wx1 = cellPos.x;
      float wy0 = 1.0 - cellPos.y;
      float wy1 = cellPos.y;
      float bilinearWeights[4];
      bilinearWeights[0] = wx0 * wy0;  // Top-left corner
      bilinearWeights[1] = wx1 * wy0;  // Top-right corner
      bilinearWeights[2] = wx0 * wy1;  // Bottom-left corner
      bilinearWeights[3] = wx1 * wy1;  // Bottom-right corner

      float aoSamples[4];
      float weights[4];
      float totalWeight = 0.0;

      for (int i = 0; i < 4; i++) {
        // Sample at the 4 half-res texel centers that form the 2x2 neighborhood
        // baseUv is the center of the current half-res cell
        // Subtract half to get to the bottom-left texel center, then add offset
        // This samples the 4 nearest half-res texels for proper bilinear interpolation
        vec2 sampleUv = baseUv - halfResTexelSize * 0.5 + offsets[i];
        
        // Sample AO value - GTAOPass outputs denoised AO as vec4(ao, ao, ao, 1.0)
        // where ao is the ambient occlusion value (0 = fully occluded, 1 = not occluded)
        aoSamples[i] = texture(tAO, sampleUv).r;
        
        // Sample depth for bilateral weight
        float sampleDepth = linearizeDepth(texture(tDepth, sampleUv).r);

        // Calculate bilateral weight based on depth similarity
        float depthDiff = abs(sampleDepth - centerDepth);
        float depthWeight = exp(-depthDiff / (uDepthThreshold * max(centerDepth, 0.001)));

        // Combine bilinear and depth weights
        weights[i] = bilinearWeights[i] * depthWeight;
        totalWeight += weights[i];
      }

      // Normalize and compute final AO
      float ao = 1.0;  // Default: no occlusion (white = unoccluded)
      if (totalWeight > 0.001) {
        ao = 0.0;
        for (int i = 0; i < 4; i++) {
          ao += aoSamples[i] * (weights[i] / totalWeight);
        }
      }

      // ============================================================
      // GTAO-specific: Multiplicative blending (NOT additive or alpha)
      // AO darkens the scene: result = color * lerp(1.0, ao, intensity)
      // When intensity=0: aoFactor=1.0 (no darkening)
      // When intensity=1: aoFactor=ao (full AO effect)
      // ============================================================
      vec4 sceneColor = texture(tColor, vUv);
      float aoFactor = mix(1.0, ao, uAOIntensity);
      fragColor = vec4(sceneColor.rgb * aoFactor, sceneColor.a);
    }
  `,
}

/**
 * Type definition for GTAOBilateralUpsampleShader uniforms.
 */
export type GTAOBilateralUpsampleUniforms = {
  tAO: THREE.Uniform<THREE.Texture | null>
  tColor: THREE.Uniform<THREE.Texture | null>
  tDepth: THREE.Uniform<THREE.Texture | null>
  uResolution: THREE.Uniform<THREE.Vector2>
  uDepthThreshold: THREE.Uniform<number>
  uNearClip: THREE.Uniform<number>
  uFarClip: THREE.Uniform<number>
  uAOIntensity: THREE.Uniform<number>
}
