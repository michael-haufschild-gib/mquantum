import * as THREE from 'three'

/**
 * Cinematic Shader (GLSL ES 3.00)
 * Combines Chromatic Aberration, Vignette, and Film Grain in a single pass.
 */
export const CinematicShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0.0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uDistortion: { value: 0.005 }, // Chromatic aberration intensity
    uVignetteDarkness: { value: 1.2 }, // Vignette intensity
    uVignetteOffset: { value: 1.0 }, // Vignette falloff
    uNoiseIntensity: { value: 0.05 }, // Film grain intensity
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
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uDistortion;
    uniform float uVignetteDarkness;
    uniform float uVignetteOffset;
    uniform float uNoiseIntensity;

    in vec2 vUv;
    layout(location = 0) out vec4 fragColor;

    // High-quality hash for film grain
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 uv = vUv;

      // -- Chromatic Aberration --
      // Calculate distance from center (0.5, 0.5)
      vec2 dist = uv - 0.5;

      // Distort UVs for each channel
      // R moves out, B moves in (or vice versa)
      vec2 offset = dist * uDistortion;

      float r = texture(tDiffuse, uv - offset).r;
      float g = texture(tDiffuse, uv).g;
      float b = texture(tDiffuse, uv + offset).b;

      vec3 color = vec3(r, g, b);

      // -- Vignette --
      // Distance from center
      float d = length(dist);
      // Smooth interpolation for vignette
      float vignette = smoothstep(uVignetteOffset, uVignetteOffset - 0.6, d * uVignetteDarkness);

      color = mix(color, color * vignette, 1.0);

      // -- Film Grain --
      if (uNoiseIntensity > 0.001) {
        // Temporal noise that changes each frame
        float t = fract(uTime * 10.0);
        vec2 p = floor(vUv * uResolution);
        float noise = hash(p + t * 100.0) - 0.5;
        color += noise * uNoiseIntensity;
      }

      // Preserve HDR values for tone mapping - only prevent negative
      color = max(color, vec3(0.0));

      fragColor = vec4(color, 1.0);
    }
  `,
}

export type CinematicUniforms = {
  tDiffuse: THREE.Uniform<THREE.Texture | null>
  uTime: THREE.Uniform<number>
  uResolution: THREE.Uniform<THREE.Vector2>
  uDistortion: THREE.Uniform<number>
  uVignetteDarkness: THREE.Uniform<number>
  uVignetteOffset: THREE.Uniform<number>
  uNoiseIntensity: THREE.Uniform<number>
}
