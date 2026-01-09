/**
 * Gravitational Lensing Shader
 *
 * Applies gravitational lensing distortion to the environment layer only.
 * The gravity well is assumed to be at the world origin (0,0,0).
 * This effect is independent of the black hole's internal ray-marched lensing.
 *
 * @module rendering/shaders/postprocessing/gravitationalLensing
 */

export const gravitationalLensingVertexShader = /* glsl */ `
  out vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

export const gravitationalLensingFragmentShader = /* glsl */ `
  precision highp float;

  in vec2 vUv;
  layout(location = 0) out vec4 fragColor;

  uniform sampler2D tEnvironment;
  uniform vec2 uGravityCenter;      // Gravity well center in UV space (projected from 0,0,0)
  uniform float uStrength;          // Gravity strength (0.1-10)
  uniform float uDistortionScale;   // Distortion scale (0.1-5)
  uniform float uFalloff;           // Distance falloff exponent (N-1 in N dimensions, Tangherlini metric)
  uniform float uChromaticAberration; // Chromatic aberration amount (0-1)
  uniform float uNDScale;           // N-D scale factor to compensate for faster falloff in higher dimensions

  // Early-exit threshold: deflection below this value is sub-pixel and imperceptible
  const float DEFLECTION_THRESHOLD = 0.001;
  // Minimum effective strength to process lensing at all
  const float MIN_EFFECTIVE_STRENGTH = 0.01;

  /**
   * Compute displacement vector for a UV coordinate toward the gravity center.
   * Uses pre-computed magnitude to avoid redundant calculation.
   *
   * @param toCenter Vector from UV to gravity center
   * @param r Distance from UV to gravity center
   * @param magnitude Pre-computed lensing magnitude
   * @return Displacement vector toward gravity center
   */
  vec2 computeLensingDisplacementOptimized(vec2 toCenter, float r, float magnitude) {
    if (r < 0.001) {
      return vec2(0.0);
    }
    vec2 dir = toCenter / r; // normalize without extra length() call
    return dir * magnitude;
  }

  /**
   * Apply chromatic aberration to lensing by sampling RGB at different offsets.
   */
  vec3 applyLensingChromatic(vec2 uv, vec2 displacement) {
    float rScale = 1.0 - uChromaticAberration * 0.02;
    float gScale = 1.0;
    float bScale = 1.0 + uChromaticAberration * 0.02;

    float r = texture(tEnvironment, uv + displacement * rScale).r;
    float g = texture(tEnvironment, uv + displacement * gScale).g;
    float b = texture(tEnvironment, uv + displacement * bScale).b;

    return vec3(r, g, b);
  }

  /**
   * Compute Einstein ring brightness boost near the photon sphere.
   */
  float einsteinRingBoost(float r, float ringRadius) {
    float ringWidth = ringRadius * 0.3;
    float diff = abs(r - ringRadius);
    float safeWidth = max(ringWidth, 0.001);
    float falloff = exp(-diff * diff / (safeWidth * safeWidth * 2.0));
    return 1.0 + falloff * 0.3;
  }

  void main() {
    // Compute effective strength for early-exit checks
    float effectiveStrength = uStrength * uDistortionScale;

    // Early exit 1: Effect globally disabled or negligible
    if (effectiveStrength < MIN_EFFECTIVE_STRENGTH) {
      fragColor = texture(tEnvironment, vUv);
      return;
    }

    // Compute distance from gravity center (reused for deflection and Einstein ring)
    vec2 toCenter = uGravityCenter - vUv;
    float r = length(toCenter);
    float safeR = max(r, 0.001);

    // Compute lensing magnitude (deflection) for early-exit check
    // Formula: deflection = (strength * distortionScale * ndScale * 0.02) / r^falloff
    // uNDScale compensates for faster falloff in higher dimensions (Tangherlini metric)
    float deflection = (effectiveStrength * uNDScale * 0.02) / pow(safeR, uFalloff);
    deflection = min(deflection, 0.5); // Clamp to prevent extreme distortion

    // Early exit 2: Deflection is sub-pixel, no visible effect
    if (deflection < DEFLECTION_THRESHOLD) {
      fragColor = texture(tEnvironment, vUv);
      return;
    }

    // Full lensing computation using pre-computed magnitude
    vec2 displacement = computeLensingDisplacementOptimized(toCenter, r, deflection);
    vec2 distortedUV = vUv + displacement;

    // Clamp to valid UV range
    distortedUV = clamp(distortedUV, vec2(0.0), vec2(1.0));

    vec3 color;

    if (uChromaticAberration > 0.01) {
      color = applyLensingChromatic(vUv, displacement);
    } else {
      color = texture(tEnvironment, distortedUV).rgb;
    }

    // Apply subtle Einstein ring boost (reuses r computed above)
    float ringRadius = 0.15 * uStrength * 0.1; // Dynamic ring radius based on strength
    float boost = einsteinRingBoost(r, ringRadius);
    color *= boost;

    // Preserve alpha from original texture
    float alpha = texture(tEnvironment, vUv).a;
    fragColor = vec4(color, alpha);
  }
`
