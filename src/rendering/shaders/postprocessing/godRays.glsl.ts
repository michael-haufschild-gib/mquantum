/**
 * God Rays (Light Scattering) Shader - Enhanced for Dramatic Effect
 *
 * GPU Gems 3 style radial blur for volumetric light scattering effect.
 * Creates light shafts emanating from the black hole center by sampling
 * along rays toward the light source.
 *
 * ENHANCEMENTS:
 * - Improved color preservation to maintain jet color saturation
 * - Better exposure curve for HDR content
 * - Reduced banding with blue noise dithering
 * - Soft vignette for focus on center
 * - Enhanced blending for more dramatic composite
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
  const float PI = 3.14159265359;

  // High-quality noise for dithering
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  // Blue noise approximation for smoother dithering
  float blueNoise(vec2 uv) {
    float noise = hash12(uv * 1000.0);
    noise += hash12(uv * 1000.0 + 0.5) * 0.5;
    noise += hash12(uv * 1000.0 + 0.25) * 0.25;
    return fract(noise);
  }

  void main() {
    // Calculate ray direction: from current pixel TOWARD light source
    vec2 deltaTexCoord = (vUv - uLightPosition);

    // Distance from light source for intensity falloff
    float distFromLight = length(deltaTexCoord);

    // Scale by density and number of samples
    float sampleCount = float(min(uSamples, MAX_SAMPLES));
    deltaTexCoord *= uDensity / sampleCount;

    // Start at current pixel
    vec2 texCoord = vUv;

    // Apply blue noise dithering to reduce banding
    float jitter = blueNoise(gl_FragCoord.xy);
    texCoord -= deltaTexCoord * jitter;

    // Accumulate samples with color preservation
    vec3 color = vec3(0.0);
    float totalWeight = 0.0;
    float illuminationDecay = 1.0;

    // Track peak luminance for HDR handling
    float peakLuminance = 0.0;

    for (int i = 0; i < MAX_SAMPLES; i++) {
      if (i >= uSamples) break;

      // Step toward light source
      texCoord -= deltaTexCoord;

      // Clamp to valid UV range
      vec2 sampleCoord = clamp(texCoord, vec2(0.0), vec2(1.0));

      // Sample the jet buffer
      vec4 sampleColor = texture(tInput, sampleCoord);

      // Calculate luminance
      float luminance = dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));

      // Only accumulate visible samples
      if (luminance > 0.005) {
        // Preserve color saturation while controlling brightness
        // Use soft knee compression to handle HDR values
        float knee = 0.5;
        float compressed = luminance / (1.0 + luminance * knee);

        // Scale the sample while preserving hue
        vec3 normalizedColor = sampleColor.rgb / max(luminance, 0.001);
        vec3 processedSample = normalizedColor * compressed;

        float sampleWeight = illuminationDecay * uWeight;
        color += processedSample * sampleWeight;
        totalWeight += sampleWeight;

        peakLuminance = max(peakLuminance, luminance);
      }

      // Exponential decay
      illuminationDecay *= uDecay;
    }

    // Normalize by total weight
    if (totalWeight > 0.001) {
      color /= totalWeight;
    }

    // Apply exposure with HDR-aware curve
    // Higher exposure near light source for more dramatic effect
    float distanceFalloff = 1.0 - smoothstep(0.0, 1.5, distFromLight);
    float effectiveExposure = uExposure * (1.0 + distanceFalloff * 0.5);

    color *= effectiveExposure * 2.5;

    // Boost saturation slightly to counteract any desaturation from blending
    float colorLum = dot(color, vec3(0.299, 0.587, 0.114));
    if (colorLum > 0.01) {
      vec3 gray = vec3(colorLum);
      color = mix(gray, color, 1.15);
    }

    // Apply soft radial fade (stronger at edges of screen)
    float radialFade = 1.0 - smoothstep(0.3, 1.8, distFromLight);
    color *= mix(0.3, 1.0, radialFade);

    fragColor = vec4(color, 1.0);
  }
`

/**
 * God Rays Composite Shader - Enhanced Blending
 * Combine with scene using improved additive blend
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

  // Soft light blend mode for more natural integration
  vec3 softLight(vec3 base, vec3 blend) {
    return mix(
      sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend),
      2.0 * base * blend + base * base * (1.0 - 2.0 * blend),
      step(base, vec3(0.5))
    );
  }

  void main() {
    vec4 sceneColor = texture(tScene, vUv);
    vec4 godRaysColor = texture(tGodRays, vUv);

    // Apply intensity to god rays
    vec3 godRays = godRaysColor.rgb * uIntensity;

    // Calculate luminance for adaptive blending
    float rayLum = dot(godRays, vec3(0.299, 0.587, 0.114));
    float sceneLum = dot(sceneColor.rgb, vec3(0.299, 0.587, 0.114));

    // Soft compress god rays to prevent harsh blowout
    // Use gentler compression for more visible rays
    vec3 godRaysCompressed = godRays / (1.0 + godRays * 0.03);

    // Mix between pure additive and soft light for more natural look
    // More soft light in brighter areas to prevent wash-out
    float blendMode = smoothstep(0.3, 0.8, sceneLum);

    vec3 additive = sceneColor.rgb + godRaysCompressed;
    vec3 softLightBlend = softLight(sceneColor.rgb, godRaysCompressed * 0.5 + 0.5);

    vec3 combined = mix(additive, softLightBlend, blendMode * 0.3);

    // Subtle bloom-like glow in ray areas
    float glowMask = smoothstep(0.1, 0.5, rayLum);
    combined += godRaysCompressed * glowMask * 0.2;

    fragColor = vec4(combined, sceneColor.a);
  }
`
