/**
 * Gravitational Lensing
 *
 * Implements N-dimensional ray bending based on simplified gravitational field.
 * Uses the formula: d = -k * (N^α) * r_hat / |r|^β
 */

export const lensingBlock = /* glsl */ `
//----------------------------------------------
// GRAVITATIONAL LENSING
//----------------------------------------------

/**
 * Safely normalize a vector, returning a fallback if near zero.
 * Prevents NaN artifacts.
 */
vec3 safeNormalize(vec3 v, vec3 fallback) {
  float len = length(v);
  return len > 1e-6 ? v / len : fallback;
}

/**
 * Compute N-dimensional distance to origin.
 *
 * Mathematically, for a 3D slice defined by orthonormal basis vectors
 * and an origin offset, the distance squared to the N-D origin is:
 *   Radius^2 = worldX^2 + worldY^2 + worldZ^2 + |OriginOffset|^2
 *
 * @param pos3d - 3D world position in the slice
 * @returns N-dimensional radius
 */
float ndDistance(vec3 pos3d) {
  // Compute distance squared in the 3D slice
  float dist3dSq = dot(pos3d, pos3d);

  // Add the pre-calculated squared length of the N-D origin offset
  float sumSq = dist3dSq + uOriginOffsetLengthSq;

  return sqrt(max(sumSq, 1e-10));
}

/**
 * Compute gravitational lensing strength.
 *
 * Uses the N-dimensional lensing formula:
 *   G(r,N) = k * N^α / (r + ε)^β
 *
 * Where:
 * - k = uGravityStrength (overall gravity intensity)
 * - N = DIMENSION (number of dimensions)
 * - α = uDimensionEmphasis (dimension scaling exponent)
 * - r = ndRadius (N-dimensional distance from center)
 * - ε = uEpsilonMul (numerical stability term)
 * - β = uDistanceFalloff (distance falloff exponent)
 *
 * This formula provides:
 * - Smooth scaling across dimensions via N^α
 * - Proper falloff with distance via (r+ε)^β
 * - No singularity at origin due to ε term
 */
float computeDeflectionAngle(float ndRadius) {
  // N-dimensional lensing formula: G(r,N) = k * N^α / (r + ε)^β
  // N^α is pre-calculated on CPU as uDimPower
  float k = uGravityStrength;
  float r = ndRadius;
  float epsilon = uEpsilonMul;
  float beta = uDistanceFalloff;

  float denominator;
  if (abs(beta - 2.0) < 0.01) {
    float re = r + epsilon;
    denominator = re * re;
  } else {
    denominator = pow(r + epsilon, beta);
  }

  float deflectionAngle = k * uDimPower / denominator;

  // Scale by horizon radius for physical units
  deflectionAngle *= uHorizonRadius;

  // Clamp to prevent extreme bending per step
  deflectionAngle = min(deflectionAngle, uBendMaxPerStep);

  return deflectionAngle;
}

/**
 * Apply ray bending for one raymarch step using "Magic Potential" approach
 * with Kerr frame dragging and N-dimensional scaling.
 *
 * Base algorithm (from Starless raytracer):
 *   acceleration = -1.5 * h² * pos / |pos|^5
 *
 * Optimization:
 *   h² = |pos|^2 - (pos . rayDir)^2  (Lagrange's identity for |pos x rayDir|^2)
 *   This avoids computing the cross product.
 *
 * N-Dimensional Scaling:
 *   We scale the 3D force by: N^α * r^(2-β)
 *   - N^α: Dimension emphasis (uDimPower)
 *   - r^(2-β): Falloff correction. 3D is 1/r^2. If β=3, we want 1/r^3, so we multiply by 1/r.
 *
 * Kerr frame dragging addition:
 *   The spacetime is "dragged" by the spinning black hole.
 *   This adds an azimuthal component to the acceleration that
 *   pulls light rays in the direction of the black hole's rotation.
 *
 *   Frame dragging acceleration ∝ (a/r³) × (spin_axis × r_hat)
 *   where a = chi * M is the spin parameter.
 *
 * Reference: https://rantonels.github.io/starless/
 *
 * @param rayDir - Current normalized ray direction
 * @param pos3d - Current 3D position
 * @param stepSize - Integration step size
 * @param ndRadius - N-dimensional radius for gravity strength scaling (passed in optimization)
 */
vec3 bendRay(vec3 rayDir, vec3 pos3d, float stepSize, float ndRadius) {
  float rs = uHorizonRadius;

  // N-Dimensional radius (already computed and passed in)
  float r = max(ndRadius, uEpsilonMul);
  float r2 = r * r;

  // Optimization: Compute h² without cross product
  // h² = |pos|^2 - (pos . rayDir)^2
  // Note: using 3D dot product here because ray is in 3D slice
  float p_dot_d = dot(pos3d, rayDir);
  // PERF (OPT-BH-9): Derive pos3dLenSq from ndRadius instead of recomputing dot product.
  // From ndDistance(): ndRadius = sqrt(pos3dLenSq + uOriginOffsetLengthSq)
  // Therefore: pos3dLenSq = ndRadius² - uOriginOffsetLengthSq
  // Saves 5 ALU ops (3 muls + 2 adds) per raymarch step (~200 steps/pixel).
  float pos3dLenSq = max(1e-10, ndRadius * ndRadius - uOriginOffsetLengthSq);
  float h2 = pos3dLenSq - p_dot_d * p_dot_d;

  // If h² ≈ 0, ray is purely radial - no bending possible
  if (h2 < 1e-10) {
    return rayDir;
  }

  // === Photon Sphere Proximity Factor ===
  // ⚠️ ARTISTIC DEPARTURE FROM PHYSICS ⚠️
  //
  // This factor intentionally reduces lensing for rays far from the photon sphere.
  // It is NOT physically accurate but provides a more visually appealing result.
  //
  // PERF (OPT-BH-26): Use pre-computed uniforms instead of per-step computation.
  // uLensingFalloffStart, uLensingFalloffEnd, and uHorizonRadiusInv are computed
  // once per frame on CPU, eliminating ~10 ALU ops per ray step.
  //
  // NOTE: Shadow radius ≈ 2.6 * rs, so we must maintain full lensing up to ~3 * rs
  const float minLensingFactor = 0.1;     // Keep 10% for far rays

  // PERF: Single smoothstep + mix using pre-computed boundaries
  float proximityT = smoothstep(uLensingFalloffStart, uLensingFalloffEnd, r);
  float proximityFactor = mix(1.0, minLensingFactor, proximityT);

  // PERF: Simplified far falloff using pre-computed rsInv
  float farExcess = max(0.0, r - uLensingFalloffStart);
  proximityFactor *= max(0.2, 1.0 - farExcess * 0.03 * uHorizonRadiusInv);

  // === Schwarzschild component ===
  // F_schwarzschild = -1.5 * h² * r_hat / r^5
  // r^5 = r^2 * r^2 * r
  float r5 = r2 * r2 * r;
  float forceMagnitude = 1.5 * h2 / r5;

  // === N-Dimensional Scaling ===
  // Scale factor = N^α * r^(2-β)
  // Optimize: avoid pow if falloff is standard 2.0 (Newtonian/Schwarzschild-like)
  float ndScale = uDimPower;
  if (abs(uDistanceFalloff - 2.0) > 0.01) {
    ndScale *= pow(r, 2.0 - uDistanceFalloff);
  }

  forceMagnitude *= ndScale;

  // Apply gravity strength for artistic control
  // Also apply photon sphere proximity factor to reduce lensing far from BH
  forceMagnitude *= uGravityStrength * uBendScale * proximityFactor;
  
  // Apply clamping
  forceMagnitude = min(forceMagnitude, uLensingClamp);
  forceMagnitude = min(forceMagnitude, uBendMaxPerStep / stepSize);

  // Radial acceleration (toward origin)
  // vec3 radialDir = pos3d / r; (Using 3D pos for direction)
  // acceleration = -forceMagnitude * radialDir;
  // PERF (OPT-BH-10): Use inversesqrt instead of division by sqrt.
  // Mathematically identical: 1/sqrt(x) ≡ inversesqrt(x)
  // Division is ~4x slower than multiply on GPU.
  vec3 acceleration = -(forceMagnitude * inversesqrt(pos3dLenSq)) * pos3d;

  // === Kerr frame dragging component ===
  // Frame dragging causes spacetime to rotate with the black hole.
  if (uSpin > 0.001) {
    // Spin axis is Y-axis (vertical)
    // Frame dragging strength falls off as 1/r³
    // a = chi * M, and M = rs/2, so a = chi * rs/2
    float a = uSpin * rs * 0.5;

    // Azimuthal direction (perpendicular to both spin axis and radial)
    // spinAxis = (0,1,0), radialDir = pos/r
    // cross((0,1,0), pos) = (-pos.z, 0, pos.x)
    vec3 azimuthalDirRaw = vec3(-pos3d.z, 0.0, pos3d.x);
    float azLenSq = dot(azimuthalDirRaw, azimuthalDirRaw);

    if (azLenSq > 1e-6) {
      // Normalize azimuthal direction
      // float azimuthalMag = sqrt(azLenSq);
      // azimuthalDir = azimuthalDirRaw / azimuthalMag;

      // Frame dragging acceleration: ~ 2*a/r³ in the azimuthal direction
      float r3 = r2 * r;
      float frameDragMag = 2.0 * a / r3;

      // Scale by gravity strength, ND scale, and proximity factor
      // Use physical 1.0 scaling - visual asymmetry comes from the accretion disk ISCO
      frameDragMag *= uGravityStrength * uBendScale * ndScale * proximityFactor;
      
      // acceleration += frameDragMag * azimuthalDir
      acceleration += (frameDragMag * inversesqrt(azLenSq)) * azimuthalDirRaw;
    }
  }

  // Velocity Verlet integration (semi-implicit Euler)
  vec3 newDir = rayDir + acceleration * stepSize;

  // Renormalize to maintain unit direction (light travels at c)
  return normalize(newDir);
}
`
