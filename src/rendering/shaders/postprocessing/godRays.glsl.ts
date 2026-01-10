/**
 * God Rays (Light Scattering) Shader
 *
 * GPU Gems 3 style radial blur for volumetric light scattering effect.
 * Creates light shafts emanating from the black hole center by sampling
 * along rays toward the light source.
 *
 * The key insight: sample TOWARD the light source (black hole center),
 * accumulating light with exponential decay. This creates the classic
 * volumetric god rays effect where bright areas "bleed" toward the viewer.
 *
 * @see https://developer.nvidia.com/gpugems/gpugems3/part-ii-light-and-shadows/chapter-13-volumetric-light-scattering-post-process
 * @module rendering/shaders/postprocessing/godRays
 */

export const godRaysVertexShader = /* glsl */ `
  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const godRaysFragmentShader = /* glsl */ `
  precision highp float;

  in vec2 vUv;
  layout(location = 0) out vec4 fragColor;

  uniform sampler2D tInput;
  uniform vec2 uLightPosition; // Black hole center in screen space (0-1)
  uniform float uDensity;      // Controls ray length (default: 1.0)
  uniform float uWeight;       // Initial sample weight (default: 1.0)
  uniform float uDecay;        // Decay factor per sample (default: 0.96)
  uniform float uExposure;     // Final exposure multiplier (default: 0.3)
  uniform int uSamples;        // Number of samples (default: 64)

  const int MAX_SAMPLES = 128;

  void main() {
    // Calculate ray direction: from current pixel TOWARD light source
    vec2 deltaTexCoord = (vUv - uLightPosition);

    // Scale by density and number of samples
    float sampleCount = float(min(uSamples, MAX_SAMPLES));
    deltaTexCoord *= uDensity / sampleCount;

    // Start at current pixel
    vec2 texCoord = vUv;

    // Accumulate samples with proper normalization
    vec3 color = vec3(0.0);
    float totalWeight = 0.0;
    float illuminationDecay = 1.0;

    for (int i = 0; i < MAX_SAMPLES; i++) {
      if (i >= uSamples) break;

      // Step toward light source
      texCoord -= deltaTexCoord;

      // Clamp to valid UV range
      vec2 sampleCoord = clamp(texCoord, vec2(0.0), vec2(1.0));

      // Sample the jet buffer
      vec4 sampleColor = texture(tInput, sampleCoord);

      // Only accumulate non-zero samples (skip empty space)
      float luminance = dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
      if (luminance > 0.01) {
        // Soft-clamp the sample to prevent white blowout
        // Map bright values through a smooth curve
        vec3 softClamped = sampleColor.rgb / (1.0 + sampleColor.rgb * 0.5);

        float sampleWeight = illuminationDecay * uWeight;
        color += softClamped * sampleWeight;
        totalWeight += sampleWeight;
      }

      // Exponential decay
      illuminationDecay *= uDecay;
    }

    // Normalize by total weight to prevent accumulation blowout
    if (totalWeight > 0.001) {
      color /= totalWeight;
    }

    // Apply exposure (much lower since we normalized)
    color *= uExposure * 2.0;

    // Preserve color saturation - don't let it wash out to white
    float colorLum = dot(color, vec3(0.299, 0.587, 0.114));
    if (colorLum > 0.01) {
      // Boost saturation slightly to counteract any desaturation
      vec3 gray = vec3(colorLum);
      color = mix(gray, color, 1.2);
    }

    fragColor = vec4(color, 1.0);
  }
`

/**
 * God rays composite shader - combines god rays with scene.
 * Uses soft additive blending with tone mapping.
 */
export const godRaysCompositeVertexShader = /* glsl */ `
  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const godRaysCompositeFragmentShader = /* glsl */ `
  precision highp float;

  in vec2 vUv;
  layout(location = 0) out vec4 fragColor;

  uniform sampler2D tScene;
  uniform sampler2D tGodRays;
  uniform float uIntensity;

  void main() {
    vec4 sceneColor = texture(tScene, vUv);
    vec4 godRaysColor = texture(tGodRays, vUv);

    // Apply intensity to god rays
    vec3 godRays = godRaysColor.rgb * uIntensity;

    // Soft compress only the god rays contribution to prevent blowout
    // IMPORTANT: Do NOT compress the scene color - it contains HDR values
    // that bloom needs to extract bright areas. Compressing the entire
    // combined result was causing bloom to appear weaker.
    vec3 godRaysCompressed = godRays / (1.0 + godRays * 0.1);

    // Additive blend: preserve scene HDR, add compressed god rays
    vec3 combined = sceneColor.rgb + godRaysCompressed;

    fragColor = vec4(combined, sceneColor.a);
  }
`
