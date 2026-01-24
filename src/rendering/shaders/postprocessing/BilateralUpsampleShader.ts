/**
 * Bilateral Upsample Shader
 *
 * OPTIMIZATION: Depth-aware upsampling for half-resolution effects.
 * Preserves edges by comparing depth values, preventing blur across depth discontinuities.
 *
 * Used for upsampling SSR, GTAO, and other effects rendered at half resolution.
 *
 * @module rendering/shaders/postprocessing/BilateralUpsampleShader
 */

import * as THREE from 'three'

export const BilateralUpsampleShader = {
  uniforms: {
    tInput: { value: null as THREE.Texture | null },
    tColor: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uDepthThreshold: { value: 0.01 }, // Depth discontinuity threshold
    uNearClip: { value: 0.1 },
    uFarClip: { value: 1000 },
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

    uniform sampler2D tInput;     // Half-res effect (e.g., SSR)
    uniform sampler2D tColor;     // Full-res scene color
    uniform sampler2D tDepth;     // Full-res depth
    uniform vec2 uResolution;     // Full resolution
    uniform float uDepthThreshold;
    uniform float uNearClip;
    uniform float uFarClip;

    in vec2 vUv;
    layout(location = 0) out vec4 fragColor;

    // Convert raw depth to linear depth
    float linearizeDepth(float rawDepth) {
      return (2.0 * uNearClip * uFarClip) / 
             (uFarClip + uNearClip - rawDepth * (uFarClip - uNearClip));
    }

    void main() {
      vec2 texelSize = 1.0 / uResolution;
      vec2 halfResTexelSize = texelSize * 2.0; // Half-res texel size in full-res UV space

      // Sample full-res depth at current pixel
      float centerDepth = linearizeDepth(texture(tDepth, vUv).r);

      // Calculate position within the 2x2 half-res cell (0-1 range)
      vec2 cellPos = fract(vUv / halfResTexelSize);

      // Sample the 4 corners of the half-res cell
      // Align to half-res grid by snapping to cell boundaries
      vec2 baseUv = floor(vUv / halfResTexelSize) * halfResTexelSize + halfResTexelSize * 0.5;

      vec2 offsets[4];
      offsets[0] = vec2(0.0, 0.0);
      offsets[1] = vec2(halfResTexelSize.x, 0.0);
      offsets[2] = vec2(0.0, halfResTexelSize.y);
      offsets[3] = vec2(halfResTexelSize.x, halfResTexelSize.y);

      // Bilinear weights based on position within cell
      float wx0 = 1.0 - cellPos.x;
      float wx1 = cellPos.x;
      float wy0 = 1.0 - cellPos.y;
      float wy1 = cellPos.y;
      float bilinearWeights[4];
      bilinearWeights[0] = wx0 * wy0;
      bilinearWeights[1] = wx1 * wy0;
      bilinearWeights[2] = wx0 * wy1;
      bilinearWeights[3] = wx1 * wy1;

      vec4 samples[4];
      float weights[4];
      float totalWeight = 0.0;

      for (int i = 0; i < 4; i++) {
        vec2 sampleUv = baseUv - halfResTexelSize * 0.5 + offsets[i];
        samples[i] = texture(tInput, sampleUv);
        float sampleDepth = linearizeDepth(texture(tDepth, sampleUv).r);

        // Calculate bilateral weight based on depth similarity
        float depthDiff = abs(sampleDepth - centerDepth);
        float depthWeight = exp(-depthDiff / (uDepthThreshold * max(centerDepth, 0.001)));

        // Combine bilinear and depth weights
        weights[i] = bilinearWeights[i] * depthWeight;
        totalWeight += weights[i];
      }

      // Normalize and blend
      if (totalWeight > 0.001) {
        vec4 result = vec4(0.0);
        for (int i = 0; i < 4; i++) {
          result += samples[i] * (weights[i] / totalWeight);
        }

        // Properly composite SSR with scene color
        // SSR outputs: RGB = reflection color, A = blend strength
        // Use alpha blending: mix(sceneColor, reflectionColor, alpha)
        vec4 sceneColor = texture(tColor, vUv);
        vec3 blended = mix(sceneColor.rgb, result.rgb, result.a);
        fragColor = vec4(blended, sceneColor.a);
      } else {
        // Fallback to original color if no valid samples
        fragColor = texture(tColor, vUv);
      }
    }
  `,
}

export type BilateralUpsampleUniforms = {
  tInput: THREE.Uniform<THREE.Texture | null>
  tColor: THREE.Uniform<THREE.Texture | null>
  tDepth: THREE.Uniform<THREE.Texture | null>
  uResolution: THREE.Uniform<THREE.Vector2>
  uDepthThreshold: THREE.Uniform<number>
  uNearClip: THREE.Uniform<number>
  uFarClip: THREE.Uniform<number>
}
