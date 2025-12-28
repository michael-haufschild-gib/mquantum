/**
 * Paper Texture Shader (GLSL ES 3.00)
 *
 * Applies a realistic paper/cardboard texture overlay to the scene.
 * Features multiple noise layers: fiber, crumples, folds, drops, and roughness.
 *
 * Adapted from paper-design/shaders for use as a post-processing effect.
 *
 * @module rendering/shaders/postprocessing/PaperTextureShader
 */

import * as THREE from 'three';

export const PaperTextureShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tNoiseTexture: { value: null as THREE.Texture | null },
    uTime: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uPixelRatio: { value: 1.0 },

    // Colors (vec4 RGBA, premultiplied)
    uColorFront: { value: new THREE.Vector4(0.96, 0.96, 0.86, 1.0) }, // #f5f5dc beige
    uColorBack: { value: new THREE.Vector4(1.0, 1.0, 1.0, 1.0) }, // white

    // Texture parameters
    uContrast: { value: 0.5 },
    uRoughness: { value: 0.3 },

    // Fiber parameters
    uFiber: { value: 0.4 },
    uFiberSize: { value: 0.5 },

    // Crumple parameters
    uCrumples: { value: 0.2 },
    uCrumpleSize: { value: 0.5 },

    // Fold parameters
    uFolds: { value: 0.1 },
    uFoldCount: { value: 5.0 },

    // Detail parameters
    uDrops: { value: 0.0 },
    uFade: { value: 0.0 },
    uSeed: { value: 42.0 },

    // Quality (0 = low, 1 = medium, 2 = high)
    uQuality: { value: 1.0 },

    // Blend intensity (0 = no effect, 1 = full effect)
    uIntensity: { value: 1.0 },
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

    uniform sampler2D tDiffuse;
    uniform sampler2D tNoiseTexture;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uPixelRatio;

    uniform vec4 uColorFront;
    uniform vec4 uColorBack;

    uniform float uContrast;
    uniform float uRoughness;
    uniform float uFiber;
    uniform float uFiberSize;
    uniform float uCrumples;
    uniform float uCrumpleSize;
    uniform float uFolds;
    uniform float uFoldCount;
    uniform float uDrops;
    uniform float uFade;
    uniform float uSeed;
    uniform float uQuality;
    uniform float uIntensity;

    in vec2 vUv;
    layout(location = 0) out vec4 fragColor;

    // ============================================================================
    // Constants
    // ============================================================================

    #define PI 3.14159265358979323846
    #define TWO_PI 6.28318530718

    // ============================================================================
    // Utility Functions
    // ============================================================================

    vec2 rotate(vec2 uv, float th) {
      float c = cos(th);
      float s = sin(th);
      return mat2(c, s, -s, c) * uv;
    }

    // Texture-based random using R channel
    float randomR(vec2 p) {
      vec2 uv = floor(p) / 100.0 + 0.5;
      return texture(tNoiseTexture, fract(uv)).r;
    }

    // Texture-based random using G and B channels
    vec2 randomGB(vec2 p) {
      vec2 uv = floor(p) / 50.0 + 0.5;
      return texture(tNoiseTexture, fract(uv)).gb;
    }

    // ============================================================================
    // Value Noise
    // ============================================================================

    float valueNoise(vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);

      float a = randomR(i);
      float b = randomR(i + vec2(1.0, 0.0));
      float c = randomR(i + vec2(0.0, 1.0));
      float d = randomR(i + vec2(1.0, 1.0));

      vec2 u = f * f * (3.0 - 2.0 * f);
      float x1 = mix(a, b, u.x);
      float x2 = mix(c, d, u.x);
      return mix(x1, x2, u.y);
    }

    float fbm(vec2 n) {
      float total = 0.0;
      float amplitude = 0.4;
      for (int i = 0; i < 3; i++) {
        total += valueNoise(n) * amplitude;
        n *= 1.99;
        amplitude *= 0.65;
      }
      return total;
    }

    // ============================================================================
    // Roughness Noise (screen-space)
    // ============================================================================

    float randomG(vec2 p) {
      vec2 uv = floor(p) / 50.0 + 0.5;
      return texture(tNoiseTexture, fract(uv)).g;
    }

    float roughnessNoise(vec2 p) {
      p *= 0.1;
      float o = 0.0;
      for (float i = 0.0; i < 4.0; i += 1.0) {
        vec4 w = vec4(floor(p), ceil(p));
        vec2 f = fract(p);
        o += mix(
          mix(randomG(w.xy), randomG(w.xw), f.y),
          mix(randomG(w.zy), randomG(w.zw), f.y),
          f.x
        );
        o += 0.2 / exp(2.0 * abs(sin(0.2 * p.x + 0.5 * p.y)));
        p *= 2.1;
      }
      return o / 3.0;
    }

    // ============================================================================
    // Fiber Noise (FBM-based)
    // ============================================================================

    float fiberRandom(vec2 p) {
      vec2 uv = floor(p) / 100.0;
      return texture(tNoiseTexture, fract(uv)).b;
    }

    float fiberValueNoise(vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);

      float a = fiberRandom(i);
      float b = fiberRandom(i + vec2(1.0, 0.0));
      float c = fiberRandom(i + vec2(0.0, 1.0));
      float d = fiberRandom(i + vec2(1.0, 1.0));

      vec2 u = f * f * (3.0 - 2.0 * f);
      float x1 = mix(a, b, u.x);
      float x2 = mix(c, d, u.x);
      return mix(x1, x2, u.y);
    }

    float fiberNoiseFbm(vec2 n, vec2 seedOffset) {
      float total = 0.0;
      float amplitude = 1.0;
      for (int i = 0; i < 4; i++) {
        n = rotate(n, 0.7);
        total += fiberValueNoise(n + seedOffset) * amplitude;
        n *= 2.0;
        amplitude *= 0.6;
      }
      return total;
    }

    float fiberNoise(vec2 uv, vec2 seedOffset) {
      float epsilon = 0.001;
      float n1 = fiberNoiseFbm(uv + vec2(epsilon, 0.0), seedOffset);
      float n2 = fiberNoiseFbm(uv - vec2(epsilon, 0.0), seedOffset);
      float n3 = fiberNoiseFbm(uv + vec2(0.0, epsilon), seedOffset);
      float n4 = fiberNoiseFbm(uv - vec2(0.0, epsilon), seedOffset);
      return length(vec2(n1 - n2, n3 - n4)) / (2.0 * epsilon);
    }

    // ============================================================================
    // Crumple Pattern
    // ============================================================================

    float crumpledNoise(vec2 t, float pw) {
      vec2 p = floor(t);
      float wsum = 0.0;
      float cl = 0.0;

      for (int y = -1; y < 2; y++) {
        for (int x = -1; x < 2; x++) {
          vec2 b = vec2(float(x), float(y));
          vec2 q = b + p;
          vec2 q2 = q - floor(q / 8.0) * 8.0;
          vec2 c = q + randomGB(q2);
          vec2 r = c - t;
          float w = pow(smoothstep(0.0, 1.0, 1.0 - abs(r.x)), pw) *
                    pow(smoothstep(0.0, 1.0, 1.0 - abs(r.y)), pw);
          cl += (0.5 + 0.5 * sin((q2.x + q2.y * 5.0) * 8.0)) * w;
          wsum += w;
        }
      }
      return pow(wsum != 0.0 ? cl / wsum : 0.0, 0.5) * 2.0;
    }

    float crumplesShape(vec2 uv) {
      return crumpledNoise(uv * 0.25, 16.0) * crumpledNoise(uv * 0.5, 2.0);
    }

    // ============================================================================
    // Folds Pattern
    // ============================================================================

    vec2 folds(vec2 uv) {
      vec3 pp = vec3(0.0);
      float l = 9.0;
      int maxFolds = int(uFoldCount);

      for (int i = 0; i < 15; i++) {
        if (i >= maxFolds) break;
        vec2 rand = randomGB(vec2(float(i), float(i) * uSeed));
        float an = rand.x * TWO_PI;
        vec2 p = vec2(cos(an), sin(an)) * rand.y;
        float dist = distance(uv, p);
        l = min(l, dist);

        if (l == dist) {
          pp.xy = uv - p;
          pp.z = dist;
        }
      }
      return mix(pp.xy, vec2(0.0), pow(pp.z, 0.25));
    }

    // ============================================================================
    // Drops Pattern
    // ============================================================================

    float drops(vec2 uv) {
      vec2 iDropsUV = floor(uv);
      vec2 fDropsUV = fract(uv);
      float dropsMinDist = 1.0;

      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 neighbor = vec2(float(i), float(j));
          vec2 offset = randomGB(iDropsUV + neighbor);
          offset = 0.5 + 0.5 * sin(10.0 * uSeed + TWO_PI * offset);
          vec2 pos = neighbor + offset - fDropsUV;
          float dist = length(pos);
          dropsMinDist = min(dropsMinDist, dropsMinDist * dist);
        }
      }
      return 1.0 - smoothstep(0.05, 0.09, pow(dropsMinDist, 0.5));
    }

    // ============================================================================
    // Main
    // ============================================================================

    void main() {
      // Sample input texture
      vec4 inputColor = texture(tDiffuse, vUv);

      // Early exit if effect is disabled
      if (uIntensity < 0.001) {
        fragColor = inputColor;
        return;
      }

      // Pattern UV (centered, aspect-corrected)
      float aspect = uResolution.x / uResolution.y;
      vec2 patternUV = (vUv - 0.5) * 5.0 * vec2(aspect, 1.0);

      // Screen-space UV for roughness
      vec2 roughnessUv = 1.5 * (gl_FragCoord.xy - 0.5 * uResolution) / uPixelRatio;

      // Initialize normal accumulator
      vec2 normal = vec2(0.0);
      vec2 normalImage = vec2(0.0);

      // ========== Roughness (skip if disabled) ==========
      float roughness = 0.0;
      if (uRoughness > 0.001) {
        roughness = roughnessNoise(roughnessUv + vec2(1.0, 0.0)) -
                    roughnessNoise(roughnessUv - vec2(1.0, 0.0));
      }

      // ========== Fiber (skip if disabled) ==========
      float fiber = 0.0;
      if (uFiber > 0.001) {
        vec2 fiberUV = 2.0 / max(0.1, uFiberSize) * patternUV;
        fiber = fiberNoise(fiberUV, vec2(0.0));
        fiber = 0.5 * uFiber * (fiber - 1.0);
      }

      // ========== Crumples (medium+ quality) ==========
      float crumples = 0.0;
      if (uQuality >= 1.0 && uCrumples > 0.001) {
        vec2 crumplesUV = fract(patternUV * 0.02 / max(0.1, uCrumpleSize) - uSeed) * 32.0;
        crumples = uCrumples * (crumplesShape(crumplesUV + vec2(0.05, 0.0)) -
                                crumplesShape(crumplesUV));
      }

      // ========== Folds (medium+ quality) ==========
      vec2 w = vec2(0.0);
      vec2 w2 = vec2(0.0);
      if (uQuality >= 1.0 && uFolds > 0.001) {
        vec2 foldsUV = patternUV * 0.12;
        foldsUV = rotate(foldsUV, 4.0 * uSeed);
        w = folds(foldsUV);
        foldsUV = rotate(foldsUV + 0.007 * cos(uSeed), 0.01 * sin(uSeed));
        w2 = folds(foldsUV);
      }

      // ========== Drops (high quality only) ==========
      float dropsVal = 0.0;
      if (uQuality >= 2.0 && uDrops > 0.001) {
        dropsVal = uDrops * drops(patternUV * 2.0);
      }

      // ========== Fade mask ==========
      float fade = 0.0;
      if (uFade > 0.001) {
        fade = uFade * fbm(0.17 * patternUV + 10.0 * uSeed);
        fade = clamp(8.0 * fade * fade * fade, 0.0, 1.0);

        // Apply fade to all effects
        w = mix(w, vec2(0.0), fade);
        w2 = mix(w2, vec2(0.0), fade);
        crumples = mix(crumples, 0.0, fade);
        dropsVal = mix(dropsVal, 0.0, fade);
        fiber *= mix(1.0, 0.5, fade);
        roughness *= mix(1.0, 0.5, fade);
      }

      // ========== Accumulate normals ==========
      normal.xy += uFolds * min(5.0 * uContrast, 1.0) * 4.0 * max(vec2(0.0), w + w2);
      normalImage.xy += uFolds * 2.0 * w;

      normal.xy += crumples;
      normalImage.xy += 1.5 * crumples;

      normal.xy += 3.0 * dropsVal;
      normalImage.xy += 0.2 * dropsVal;

      normal.xy += uRoughness * 1.5 * roughness;
      normal.xy += fiber;

      normalImage += uRoughness * 0.75 * roughness;
      normalImage += 0.2 * fiber;

      // ========== Lighting calculation ==========
      vec3 lightPos = vec3(1.0, 2.0, 1.0);
      float res = dot(
        normalize(vec3(normal, 9.5 - 9.0 * pow(uContrast, 0.1))),
        normalize(lightPos)
      );

      // ========== Color blending ==========
      vec3 fgColor = uColorFront.rgb * uColorFront.a;
      float fgOpacity = uColorFront.a;
      vec3 bgColor = uColorBack.rgb * uColorBack.a;
      float bgOpacity = uColorBack.a;

      // Paper texture color
      vec3 paperColor = fgColor * res;
      float paperOpacity = fgOpacity * res;

      paperColor += bgColor * (1.0 - paperOpacity);
      paperOpacity += bgOpacity * (1.0 - paperOpacity);

      // Apply drops darkening
      paperColor -= 0.007 * dropsVal;

      // Blend with input based on intensity
      // Use multiply blend for paper texture effect
      vec3 blendedColor = mix(inputColor.rgb, inputColor.rgb * paperColor, uIntensity);

      // Add subtle normal displacement to image
      vec2 displacedUV = vUv + 0.01 * normalImage * uIntensity;
      displacedUV = clamp(displacedUV, vec2(0.0), vec2(1.0));
      vec3 displacedColor = texture(tDiffuse, displacedUV).rgb;

      // Final blend
      vec3 finalColor = mix(blendedColor, displacedColor * paperColor, 0.3 * uIntensity);

      fragColor = vec4(finalColor, inputColor.a);
    }
  `,
};

export type PaperTextureUniforms = {
  tDiffuse: THREE.Uniform<THREE.Texture | null>;
  tNoiseTexture: THREE.Uniform<THREE.Texture | null>;
  uTime: THREE.Uniform<number>;
  uResolution: THREE.Uniform<THREE.Vector2>;
  uPixelRatio: THREE.Uniform<number>;
  uColorFront: THREE.Uniform<THREE.Vector4>;
  uColorBack: THREE.Uniform<THREE.Vector4>;
  uContrast: THREE.Uniform<number>;
  uRoughness: THREE.Uniform<number>;
  uFiber: THREE.Uniform<number>;
  uFiberSize: THREE.Uniform<number>;
  uCrumples: THREE.Uniform<number>;
  uCrumpleSize: THREE.Uniform<number>;
  uFolds: THREE.Uniform<number>;
  uFoldCount: THREE.Uniform<number>;
  uDrops: THREE.Uniform<number>;
  uFade: THREE.Uniform<number>;
  uSeed: THREE.Uniform<number>;
  uQuality: THREE.Uniform<number>;
  uIntensity: THREE.Uniform<number>;
};
