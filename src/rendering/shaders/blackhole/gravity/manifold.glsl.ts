/**
 * Luminous Manifold (Accretion Disk)
 *
 * N-dimensional accretion structure:
 * - 3D: Classic thin disk in XZ plane (Y is vertical)
 * - 4D: Sheet (disk with thickness in W)
 * - 5D+: Slab/field with increasing volume
 *
 * The manifold emits light and can be optionally absorption-enabled.
 */

export const manifoldBlock = /* glsl */ `
//----------------------------------------------
// LUMINOUS MANIFOLD (ACCRETION)
//----------------------------------------------

/**
 * PERF (OPT-BH-25): Unified texture-based noise for all black hole modules.
 *
 * This replaces the old noise3D() which used 8 sin() calls (~80 ALU ops).
 * Single texture fetch is ~4 cycles vs ~80 cycles for procedural.
 *
 * Defined here in manifold.glsl.ts because it compiles before disk-volumetric
 * and disk-sdf, making snoise() available to all modules.
 *
 * @param v - 3D position to sample noise at
 * @returns Noise value in [-1, 1] range
 */
float snoise(vec3 v) {
#ifdef USE_NOISE_TEXTURE
    // Scale factor matches the frequency used in texture generation (freqMul = 4.0)
    // We use fract() for seamless tiling
    vec3 uv = fract(v * 0.25); // 1/4 = 0.25 to match the 4.0 frequency in generator
    // Sample texture and remap from [0,1] to [-1,1]
    return texture(tDiskNoise, uv).r * 2.0 - 1.0;
#else
    // PERF: Ultra-fast hash-based noise fallback when texture unavailable
    // This is ~10x faster than procedural simplex but lower quality
    vec3 p = fract(v * 0.1031);
    p += dot(p, p.zyx + 31.32);
    float n = fract((p.x + p.y) * p.z);
    return n * 2.0 - 1.0;
#endif
}

/**
 * Convenience wrapper returning [0, 1] range for legacy compatibility.
 * @param p - 3D position to sample
 * @returns Noise value in [0, 1] range
 */
float noise01(vec3 p) {
    return snoise(p) * 0.5 + 0.5;
}

/**
 * Get effective manifold type based on dimension.
 * 0=auto, 1=disk, 2=sheet, 3=slab, 4=field
 */
int getManifoldType() {
  if (uManifoldType != 0) return uManifoldType;

  // Auto mode: select based on dimension
  #if DIMENSION <= 3
    return 1; // disk
  #elif DIMENSION == 4
    return 2; // sheet
  #elif DIMENSION <= 6
    return 3; // slab
  #else
    return 4; // field
  #endif
}

/**
 * Calculate radial coordinate in the disk plane.
 */
float diskRadius(vec3 pos3d) {
  // XZ plane is the disk plane (horizontal like Saturn's rings)
  return length(pos3d.xz);
}

/**
 * Calculate vertical distance from disk plane.
 */
float diskHeight(vec3 pos3d) {
  // Y is the vertical axis
  return abs(pos3d.y);
}

/**
 * Get effective manifold thickness based on dimension.
 * Higher dimensions have thicker manifolds.
 */
float getManifoldThicknessScale() {
  int manifoldType = getManifoldType();

  if (manifoldType == 1) {
    // Disk: very thin
    return 1.0;
  } else if (manifoldType == 2) {
    // Sheet: moderate thickness
    return 2.0;
  } else if (manifoldType == 3) {
    // Slab: thick
    return min(float(DIMENSION - 2), uThicknessPerDimMax);
  } else {
    // Field: volumetric
    return min(float(DIMENSION), uThicknessPerDimMax);
  }
}

/**
 * Calculate manifold density at given position.
 *
 * Returns density value [0, 1+] where:
 * - 0 = outside manifold
 * - 1 = peak density
 * - >1 = multiple intersections (gain applied)
 */
float manifoldDensity(vec3 pos3d, float ndRadius, float time) {
  float r = diskRadius(pos3d);
  float h = diskHeight(pos3d);

  // PERF (OPT-BH-11): Use pre-computed disk radii uniforms
  float innerR = uDiskInnerR;
  float outerR = uDiskOuterR;

  // Radial falloff
  float radialFactor = 1.0;
  if (r < innerR) {
    radialFactor = smoothstep(innerR * (1.0 - uRadialSoftnessMul), innerR, r);
  } else if (r > outerR) {
    radialFactor = 1.0 - smoothstep(outerR, outerR * (1.0 + uRadialSoftnessMul), r);
  }

  // PERF (OPT-BH-13): Use pre-computed effective thickness from CPU
  float thickness = uEffectiveThickness;

  // Add extra dimension contributions to height for higher D
  float effectiveH = h;
  #if DIMENSION > 3
    for (int i = 0; i < DIMENSION - 3; i++) {
      float w = uParamValues[i];
      effectiveH += abs(w) * uHighDimWScale;
    }
  #endif

  // Vertical falloff
  // Guard against zero thickness and extreme exponent values
  float safeThickness = max(thickness, 0.0001);
  float safeExponent = clamp(uDensityFalloff, 0.1, 10.0);
  float heightRatio = effectiveH / safeThickness;
  // Clamp the ratio before pow to prevent extreme values
  float verticalFactor = exp(-pow(min(heightRatio, 100.0), safeExponent));

  // Combine factors
  float density = radialFactor * verticalFactor;

  // PERF (OPT-BH-25): Use texture-based snoise instead of expensive noise3D
  // Add turbulence noise
  if (uNoiseAmount > 0.001) {
    // Swirl in XZ plane
    float angle = atan(pos3d.z, pos3d.x);
    float swirlOffset = uSwirlAmount * r * 0.5 * sin(time);
    vec3 noisePos = vec3(r * 0.3, angle * 2.0 + swirlOffset, h * 0.5) * uNoiseScale;

    // snoise returns [-1, 1], convert to [0, 1] for ridged calculation
    float n = snoise(noisePos + time * 0.1) * 0.5 + 0.5;

    // Ridged multifractal noise (electric/filigree look)
    // Convert [0,1] to [-1,1], then take 1 - abs()
    float ridged = 1.0 - abs(2.0 * n - 1.0);
    ridged = ridged * ridged; // PERF: Sharpen ridges (x² instead of pow)

    density *= mix(1.0, ridged, uNoiseAmount);
  }

  return max(density, 0.0);
}

/**
 * Get manifold emission color based on position and mode.
 */
vec3 manifoldColor(vec3 pos3d, float ndRadius, float density, float time) {
  float r = diskRadius(pos3d);
  // PERF (OPT-BH-11): Use pre-computed disk radii uniforms
  float innerR = uDiskInnerR;
  float outerR = uDiskOuterR;

  // Normalized radial position [0, 1]
  // Guard against division by zero when innerR >= outerR
  float radialRange = max(outerR - innerR, 0.001);
  float radialT = clamp((r - innerR) / radialRange, 0.0, 1.0);

  vec3 color = uBaseColor;

  // Palette modes
  if (uPaletteMode == 0) {
    // Disk gradient: hot inner → cool outer
    vec3 innerColor = vec3(1.0, 0.9, 0.7); // Yellowish-white (hot)
    vec3 outerColor = vec3(1.0, 0.4, 0.1); // Orange-red (cooler)
    color = mix(innerColor, outerColor, radialT);
    color *= uBaseColor; // Tint with base color
  } else if (uPaletteMode == 1) {
    // Normal-based coloring
    vec3 normal = normalize(pos3d);
    color = abs(normal) * uBaseColor;
  } else if (uPaletteMode == 2) {
    // Shell only - no manifold color
    color = vec3(0.0);
  } else if (uPaletteMode == 3) {
    // Heatmap based on density
    vec3 cold = vec3(0.1, 0.0, 0.3);
    vec3 mid = vec3(1.0, 0.3, 0.0);
    vec3 hot = vec3(1.0, 1.0, 0.8);
    if (density < 0.5) {
      color = mix(cold, mid, density * 2.0);
    } else {
      color = mix(mid, hot, (density - 0.5) * 2.0);
    }
  }

  // Add swirl pattern with Keplerian rotation from animation system
  if (uSwirlAmount > 0.001) {
    // Angle in XZ plane
    float angle = atan(pos3d.z, pos3d.x);

    // Keplerian rotation: inner disk rotates faster than outer
    // Skip expensive calculation only when differential is 0 (uniform rotation)
    float rotationOffset = uDiskRotationAngle;
    if (uKeplerianDifferential > 0.001) {
      // Guard safeR to prevent extreme keplerianFactor when r is near innerR
      float innerR = max(uDiskInnerR, 0.001);
      float safeR = max(r, max(innerR * 0.1, 0.001));
      float ratio = innerR / safeR;
      // PERF: x^1.5 = x * sqrt(x) is faster than pow(x, 1.5) on GPU
      float keplerianFactor = ratio * sqrt(ratio);
      rotationOffset *= mix(1.0, keplerianFactor, uKeplerianDifferential);
    }

    float swirlPhase = angle * 3.0 + r * 0.5 + rotationOffset;
    float swirlBright = 0.5 + 0.5 * sin(swirlPhase);
    color *= mix(0.7, 1.3, swirlBright * uSwirlAmount);
  }

  // Apply intensity
  color *= uManifoldIntensity * density;

  return color;
}

/**
 * Calculate absorption for volumetric mode.
 */
float manifoldAbsorption(float density, float stepSize) {
  if (!uEnableAbsorption) return 1.0;

  float sigma = density * uAbsorption;
  return exp(-sigma * stepSize);
}

/**
 * Compute manifold pseudo-normal from density gradient.
 *
 * Used for FakeLit lighting mode to approximate surface orientation
 * from the volumetric density field.
 *
 * Optimized version: Uses analytical gradient for the vertical component
 * and radial direction for the horizontal component, requiring only 1 extra sample.
 *
 * @param pos3d - Current 3D position
 * @param ndRadius - N-dimensional radius
 * @param time - Animation time
 * @returns Normalized gradient direction (pseudo-normal)
 */
vec3 computeManifoldNormal(vec3 pos3d, float ndRadius, float time) {
  // Analytical approach for accretion disk (XZ plane):
  // Normal is primarily vertical (Y) + radial (XZ).
  
  float eps = 0.01;
  float d0 = manifoldDensity(pos3d, ndRadius, time);
  
  // Sample only along Y to get vertical gradient
  float dy = manifoldDensity(pos3d + vec3(0.0, eps, 0.0), ndRadius, time);
  float verticalGrad = (dy - d0) / eps;
  
  // Radial component follows the radial direction in XZ plane
  float r = length(pos3d.xz);
  vec3 radialDir = r > 1e-6 ? vec3(pos3d.x / r, 0.0, pos3d.z / r) : vec3(1.0, 0.0, 0.0);
  
  // Estimate radial gradient (density decreases with radius)
  float dr = manifoldDensity(pos3d + radialDir * eps, ndRadius, time);
  float radialGrad = (dr - d0) / eps;
  
  // Combine vertical (Y) and radial (XZ) components
  vec3 normal = radialDir * radialGrad + vec3(0.0, verticalGrad, 0.0);

  float normalLen = length(normal);
  if (normalLen > 0.0001) {
    return normalize(-normal); // Point toward higher density
  }

  // Fallback: use up vector
  return vec3(0.0, 1.0, 0.0);
}
`
