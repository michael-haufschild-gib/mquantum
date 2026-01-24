/**
 * Custom Bokeh/Depth-of-Field Shader
 *
 * Provides depth-based blur effect with multiple blur methods:
 * - Disc: Basic circular blur pattern (17 samples)
 * - Jittered: Randomized samples for smoother result
 * - Separable: Horizontal + vertical blur (more efficient)
 * - Hexagonal: Cinematic bokeh with ring-based sampling
 *
 * Features:
 * - Focus range "dead zone" for sharp in-focus regions
 * - Multiple debug visualization modes
 * - Temporal depth buffer visualization support
 */

import * as THREE from 'three'

/**
 * Type for bokeh shader uniforms
 */
export interface BokehUniforms {
  tDiffuse: { value: THREE.Texture | null }
  tDepth: { value: THREE.DepthTexture | null }
  focus: { value: number }
  focusRange: { value: number }
  aperture: { value: number }
  maxblur: { value: number }
  nearClip: { value: number }
  farClip: { value: number }
  aspect: { value: number }
  blurMethod: { value: number }
  time: { value: number }
}

/**
 * Custom BokehShader - simplified and working with depth texture
 */
export const BokehShader = {
  name: 'BokehShader',

  // Use GLSL3 for WebGL2 - Three.js will handle the #version directive
  glslVersion: THREE.GLSL3,

  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.DepthTexture | null },
    focus: { value: 10.0 },
    focusRange: { value: 5.0 },
    aperture: { value: 0.01 },
    maxblur: { value: 0.1 },
    nearClip: { value: 0.1 },
    farClip: { value: 1000.0 },
    aspect: { value: 1.0 },
    blurMethod: { value: 3.0 }, // 0=disc, 1=jittered, 2=separable, 3=hexagonal
    time: { value: 0.0 },
  },

  vertexShader: /* glsl */ `
    out vec2 vUv;

    void main() {
      vUv = uv;
      // Use direct NDC coordinates for fullscreen quad (avoids DPR issues)
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    precision highp float;

    #include <packing>

    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float focus;
    uniform float focusRange;
    uniform float aperture;
    uniform float maxblur;
    uniform float nearClip;
    uniform float farClip;
    uniform float aspect;
    uniform float blurMethod;
    uniform float time;

    in vec2 vUv;
    layout(location = 0) out vec4 fragColor;

    // Pseudo-random function for jittered sampling
    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    float getDepth(vec2 coord) {
      return texture(tDepth, coord).x;
    }

    float getViewZ(float depth) {
      return perspectiveDepthToViewZ(depth, nearClip, farClip);
    }

    // Method 0: Basic disc blur (17 samples in circular pattern)
    vec4 discBlur(vec2 uv, vec2 blur) {
      vec4 col = vec4(0.0);
      col += texture(tDiffuse, uv);
      col += texture(tDiffuse, uv + blur * vec2(0.0, 0.4));
      col += texture(tDiffuse, uv + blur * vec2(0.15, 0.37));
      col += texture(tDiffuse, uv + blur * vec2(0.29, 0.29));
      col += texture(tDiffuse, uv + blur * vec2(-0.37, 0.15));
      col += texture(tDiffuse, uv + blur * vec2(0.4, 0.0));
      col += texture(tDiffuse, uv + blur * vec2(0.37, -0.15));
      col += texture(tDiffuse, uv + blur * vec2(0.29, -0.29));
      col += texture(tDiffuse, uv + blur * vec2(-0.15, -0.37));
      col += texture(tDiffuse, uv + blur * vec2(0.0, -0.4));
      col += texture(tDiffuse, uv + blur * vec2(-0.15, 0.37));
      col += texture(tDiffuse, uv + blur * vec2(-0.29, 0.29));
      col += texture(tDiffuse, uv + blur * vec2(0.37, 0.15));
      col += texture(tDiffuse, uv + blur * vec2(-0.4, 0.0));
      col += texture(tDiffuse, uv + blur * vec2(-0.37, -0.15));
      col += texture(tDiffuse, uv + blur * vec2(-0.29, -0.29));
      col += texture(tDiffuse, uv + blur * vec2(0.15, -0.37));
      return col / 17.0;
    }

    // Method 1: Jittered blur (randomized sample positions for smoother result)
    vec4 jitteredBlur(vec2 uv, vec2 blur) {
      vec4 col = vec4(0.0);
      float total = 0.0;

      // Use pixel position + time for varying noise
      vec2 noise = vec2(rand(uv + time), rand(uv.yx + time)) * 2.0 - 1.0;

      // 25 samples with jitter
      for (float x = -2.0; x <= 2.0; x += 1.0) {
        for (float y = -2.0; y <= 2.0; y += 1.0) {
          vec2 offset = vec2(x, y) / 2.0;
          // Add small random jitter to each sample
          vec2 jitter = vec2(rand(uv + vec2(x, y)), rand(uv + vec2(y, x))) * 0.5 - 0.25;
          offset += jitter;

          // Weight by distance from center (gaussian-like)
          float weight = 1.0 - length(offset) * 0.3;
          weight = max(weight, 0.0);

          col += texture(tDiffuse, uv + blur * offset) * weight;
          total += weight;
        }
      }
      // Guard against zero total weight (edge case)
      return col / max(total, 0.0001);
    }

    // Method 2: Separable blur (horizontal + vertical, more efficient)
    vec4 separableBlur(vec2 uv, vec2 blur) {
      vec4 col = vec4(0.0);
      float total = 0.0;

      // Gaussian weights for 9-tap filter
      float weights[5];
      weights[0] = 0.227027;
      weights[1] = 0.1945946;
      weights[2] = 0.1216216;
      weights[3] = 0.054054;
      weights[4] = 0.016216;

      // Horizontal samples
      for (int i = -4; i <= 4; i++) {
        float w = weights[int(abs(float(i)))];
        col += texture(tDiffuse, uv + vec2(blur.x * float(i) * 0.25, 0.0)) * w;
        total += w;
      }

      // Vertical samples
      for (int i = -4; i <= 4; i++) {
        float w = weights[int(abs(float(i)))];
        col += texture(tDiffuse, uv + vec2(0.0, blur.y * float(i) * 0.25)) * w;
        total += w;
      }

      // Guard against zero total weight (shouldn't happen with these fixed weights, but be safe)
      return col / max(total, 0.0001);
    }

    // Method 3: Hexagonal bokeh (cinematic look with weighted samples)
    vec4 hexagonalBlur(vec2 uv, vec2 blur) {
      vec4 col = vec4(0.0);
      float total = 0.0;

      // Hexagonal pattern with 3 rings + center
      // Ring 0: center
      col += texture(tDiffuse, uv) * 1.0;
      total += 1.0;

      // Ring 1: 6 samples at distance 0.33
      float r1 = 0.33;
      for (int i = 0; i < 6; i++) {
        float angle = float(i) * 1.0472; // 60 degrees = PI/3
        vec2 offset = vec2(cos(angle), sin(angle)) * r1;
        col += texture(tDiffuse, uv + blur * offset) * 0.9;
        total += 0.9;
      }

      // Ring 2: 12 samples at distance 0.67
      float r2 = 0.67;
      for (int i = 0; i < 12; i++) {
        float angle = float(i) * 0.5236; // 30 degrees = PI/6
        vec2 offset = vec2(cos(angle), sin(angle)) * r2;
        col += texture(tDiffuse, uv + blur * offset) * 0.7;
        total += 0.7;
      }

      // Ring 3: 18 samples at distance 1.0
      float r3 = 1.0;
      for (int i = 0; i < 18; i++) {
        float angle = float(i) * 0.349; // 20 degrees
        vec2 offset = vec2(cos(angle), sin(angle)) * r3;
        col += texture(tDiffuse, uv + blur * offset) * 0.5;
        total += 0.5;
      }

      // Guard against zero total weight (shouldn't happen, but be safe)
      return col / max(total, 0.0001);
    }

    void main() {
      float depth = getDepth(vUv);
      float viewZ = -getViewZ(depth);

      // Calculate distance from focus point
      float diff = viewZ - focus;
      float absDiff = abs(diff);

      // Calculate blur factor with focus range dead zone
      // Objects within focusRange of the focus point stay sharp
      float blurFactor = max(0.0, absDiff - focusRange) * aperture;
      blurFactor = min(blurFactor, maxblur);

      // Apply blur based on selected method
      vec2 dofblur = vec2(blurFactor);
      dofblur *= vec2(1.0, aspect);

      vec4 col;

      if (blurMethod < 0.5) {
        // Method 0: Disc
        col = discBlur(vUv, dofblur);
      } else if (blurMethod < 1.5) {
        // Method 1: Jittered
        col = jitteredBlur(vUv, dofblur);
      } else if (blurMethod < 2.5) {
        // Method 2: Separable
        col = separableBlur(vUv, dofblur);
      } else {
        // Method 3: Hexagonal
        col = hexagonalBlur(vUv, dofblur);
      }

      fragColor = col;
      fragColor.a = 1.0;
    }
  `,
}
