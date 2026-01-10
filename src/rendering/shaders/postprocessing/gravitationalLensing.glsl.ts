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
  uniform float uStrength;          // Gravity strength (0.1-10) from post-processing settings
  uniform float uDistortionScale;   // Distortion scale (0.1-5)
  uniform float uFalloff;           // Distance falloff exponent (N-1 in N dimensions, Tangherlini metric)
  uniform float uChromaticAberration; // Chromatic aberration amount (0-1)
  uniform float uNDScale;           // N-D scale factor to compensate for faster falloff in higher dimensions
  uniform float uApparentHorizonRadius; // Apparent horizon radius in UV space (scales with camera zoom)
  uniform float uBlackHoleGravity;  // Black hole gravity multiplier (gravityStrength * bendScale)
  uniform float uAspectRatio;       // Screen aspect ratio (width / height) for circular lensing

  // Early-exit threshold: deflection below this value is sub-pixel and imperceptible
  const float DEFLECTION_THRESHOLD = 0.001;
  // Minimum effective strength to process lensing at all
  const float MIN_EFFECTIVE_STRENGTH = 0.01;

  /**
   * Compute displacement vector for a UV coordinate toward the gravity center.
   * Uses pre-computed magnitude to avoid redundant calculation.
   * Returns displacement in UV space (aspect-corrected direction, UV-space magnitude).
   *
   * @param toCenter Vector from UV to gravity center (uncorrected UV space)
   * @param toCenterCorrected Aspect-corrected vector (for direction calculation)
   * @param r Distance in corrected space
   * @param magnitude Pre-computed lensing magnitude
   * @param aspectRatio Screen aspect ratio for converting back to UV space
   * @return Displacement vector toward gravity center in UV space
   */
  vec2 computeLensingDisplacementOptimized(vec2 toCenter, vec2 toCenterCorrected, float r, float magnitude, float aspectRatio) {
    if (r < 0.001) {
      return vec2(0.0);
    }
    // Compute direction in corrected (square) space
    vec2 dirCorrected = toCenterCorrected / r;
    // Convert displacement back to UV space by dividing X by aspect ratio
    vec2 dirUV = vec2(dirCorrected.x / aspectRatio, dirCorrected.y);
    return dirUV * magnitude;
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
    
    // PERF: Lorentzian approximation 1/(1+x^2) instead of expensive exp()
    // This provides a similar bell curve shape but is much faster
    float x = diff / safeWidth;
    float falloff = 1.0 / (1.0 + x * x);
    
    return 1.0 + falloff * 0.3;
  }

  void main() {
    // Compute effective strength combining post-processing and black hole gravity settings
    // uStrength: post-processing global gravity strength
    // uBlackHoleGravity: black hole's own gravity (gravityStrength * bendScale)
    float effectiveStrength = uStrength * uDistortionScale;

    // Early exit 1: Effect globally disabled or negligible
    if (effectiveStrength < MIN_EFFECTIVE_STRENGTH) {
      fragColor = texture(tEnvironment, vUv);
      return;
    }

    // Compute distance from gravity center (reused for deflection and Einstein ring)
    // Apply aspect ratio correction so lensing is circular, not elliptical
    // Scale X by aspect ratio to convert from UV space to square coordinate space
    vec2 toCenter = uGravityCenter - vUv;
    vec2 toCenterCorrected = vec2(toCenter.x * uAspectRatio, toCenter.y);
    float r = length(toCenterCorrected);
    float safeR = max(r, 0.001);

    // Compute lensing magnitude (deflection) for early-exit check
    //
    // Base coefficient (0.02) preserves original artistic tuning.
    // Additional modifiers provide subtle physical scaling:
    // - uBlackHoleGravity: black hole gravity influence (sqrt for subtlety)
    // - uApparentHorizonRadius: zoom scaling (uses sqrt relative to reference 0.1)
    // - uNDScale: compensates for faster falloff in higher dimensions
    //
    // The sqrt functions ensure smooth, non-aggressive scaling:
    // - Zooming 4x closer = 2x stronger effect (not 4x)
    // - Doubling black hole gravity = 1.4x stronger effect (not 2x)
    float baseCoeff = 0.02;
    float gravityMod = sqrt(max(uBlackHoleGravity, 0.1)); // sqrt for subtle BH gravity influence
    float zoomMod = sqrt(uApparentHorizonRadius / 0.1);   // sqrt zoom scaling, 0.1 = reference
    zoomMod = clamp(zoomMod, 0.5, 2.0);                   // limit zoom effect range

    float deflection = effectiveStrength * baseCoeff * gravityMod * zoomMod * uNDScale;

    // PERF: Avoid expensive pow() for common integer falloff values (1.0 and 2.0)
    if (abs(uFalloff - 2.0) < 0.01) {
      deflection /= (safeR * safeR);
    } else if (abs(uFalloff - 1.0) < 0.01) {
      deflection /= safeR;
    } else {
      deflection /= pow(safeR, uFalloff);
    }

    deflection = min(deflection, 0.5); // Clamp to prevent extreme distortion

    // Early exit 2: Deflection is sub-pixel, no visible effect
    if (deflection < DEFLECTION_THRESHOLD) {
      fragColor = texture(tEnvironment, vUv);
      return;
    }

    // Full lensing computation using pre-computed magnitude
    // Pass both original and corrected vectors for proper aspect ratio handling
    vec2 displacement = computeLensingDisplacementOptimized(toCenter, toCenterCorrected, r, deflection, uAspectRatio);
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
    // Ring radius scales subtly with apparent horizon (photon sphere ≈ 1.5x horizon)
    // Use sqrt scaling for gentler zoom response, with 0.15 as base artistic value
    float ringRadius = 0.15 * sqrt(uApparentHorizonRadius / 0.1);
    ringRadius = clamp(ringRadius, 0.05, 0.4);
    float boost = einsteinRingBoost(r, ringRadius);
    color *= boost;

    // Preserve alpha from original texture
    float alpha = texture(tEnvironment, vUv).a;
    fragColor = vec4(color, alpha);
  }
`
