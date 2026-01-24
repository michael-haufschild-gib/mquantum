/**
 * Luminous Manifold (Accretion Disk) - WGSL
 *
 * N-dimensional accretion structure:
 * - 3D: Classic thin disk in XZ plane (Y is vertical)
 * - 4D: Sheet (disk with thickness in W)
 * - 5D+: Slab/field with increasing volume
 *
 * The manifold emits light and can be optionally absorption-enabled.
 *
 * Port of GLSL blackhole/gravity/manifold.glsl to WGSL.
 *
 * @module rendering/webgpu/shaders/blackhole/manifold.wgsl
 */

export const manifoldBlock = /* wgsl */ `
// ============================================
// LUMINOUS MANIFOLD (ACCRETION)
// ============================================

// Manifold type constants
const MANIFOLD_AUTO: i32 = 0;
const MANIFOLD_DISK: i32 = 1;
const MANIFOLD_SHEET: i32 = 2;
const MANIFOLD_SLAB: i32 = 3;
const MANIFOLD_FIELD: i32 = 4;

/**
 * PERF (OPT-BH-25): Unified texture-based noise for all black hole modules.
 *
 * This replaces the old noise3D() which used 8 sin() calls (~80 ALU ops).
 * Single texture fetch is ~4 cycles vs ~80 cycles for procedural.
 *
 * Defined here in manifold because it compiles before disk-volumetric
 * and disk-sdf, making snoise() available to all modules.
 *
 * @param v - 3D position to sample noise at
 * @param noiseTexture - 3D noise texture (optional, use hash fallback if not bound)
 * @returns Noise value in [-1, 1] range
 */
fn snoise(v: vec3f) -> f32 {
  // PERF: Ultra-fast hash-based noise
  // This is ~10x faster than procedural simplex but lower quality
  let p = fract(v * 0.1031);
  let p2 = p + dot(p, p.zyx + 31.32);
  let n = fract((p2.x + p2.y) * p2.z);
  return n * 2.0 - 1.0;
}

/**
 * Texture-based snoise when noise texture is available.
 *
 * @param v - 3D position to sample noise at
 * @param noiseTexture - 3D noise texture
 * @param noiseSampler - Texture sampler
 * @returns Noise value in [-1, 1] range
 */
fn snoiseTextured(v: vec3f, noiseTexture: texture_3d<f32>, noiseSampler: sampler) -> f32 {
  // Scale factor matches the frequency used in texture generation (freqMul = 4.0)
  // We use fract() for seamless tiling
  let uv = fract(v * 0.25);
  // Sample texture and remap from [0,1] to [-1,1]
  return textureSample(noiseTexture, noiseSampler, uv).r * 2.0 - 1.0;
}

/**
 * Convenience wrapper returning [0, 1] range for legacy compatibility.
 * @param p - 3D position to sample
 * @returns Noise value in [0, 1] range
 */
fn noise01(p: vec3f) -> f32 {
  return snoise(p) * 0.5 + 0.5;
}

/**
 * Get effective manifold type based on dimension.
 * 0=auto, 1=disk, 2=sheet, 3=slab, 4=field
 */
fn getManifoldType(dimension: i32, manifoldType: i32) -> i32 {
  if (manifoldType != MANIFOLD_AUTO) { return manifoldType; }

  // Auto mode: select based on dimension
  if (dimension <= 3) {
    return MANIFOLD_DISK;
  } else if (dimension == 4) {
    return MANIFOLD_SHEET;
  } else if (dimension <= 6) {
    return MANIFOLD_SLAB;
  } else {
    return MANIFOLD_FIELD;
  }
}

/**
 * Calculate radial coordinate in the disk plane.
 */
fn diskRadius(pos3d: vec3f) -> f32 {
  // XZ plane is the disk plane (horizontal like Saturn's rings)
  return length(pos3d.xz);
}

/**
 * Calculate vertical distance from disk plane.
 */
fn diskHeight(pos3d: vec3f) -> f32 {
  // Y is the vertical axis
  return abs(pos3d.y);
}

/**
 * Get effective manifold thickness scale based on dimension.
 * Higher dimensions have thicker manifolds.
 */
fn getManifoldThicknessScale(dimension: i32, manifoldType: i32, thicknessPerDimMax: f32) -> f32 {
  let effectiveType = getManifoldType(dimension, manifoldType);

  if (effectiveType == MANIFOLD_DISK) {
    // Disk: very thin
    return 1.0;
  } else if (effectiveType == MANIFOLD_SHEET) {
    // Sheet: moderate thickness
    return 2.0;
  } else if (effectiveType == MANIFOLD_SLAB) {
    // Slab: thick
    return min(f32(dimension - 2), thicknessPerDimMax);
  } else {
    // Field: volumetric
    return min(f32(dimension), thicknessPerDimMax);
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
fn manifoldDensity(
  pos3d: vec3f,
  ndRadius: f32,
  time: f32,
  uniforms: BlackHoleUniforms
) -> f32 {
  let r = diskRadius(pos3d);
  let h = diskHeight(pos3d);

  // PERF (OPT-BH-11): Use pre-computed disk radii uniforms
  let innerR = uniforms.diskInnerR;
  let outerR = uniforms.diskOuterR;

  // Radial falloff
  var radialFactor = 1.0;
  if (r < innerR) {
    radialFactor = smoothstep(innerR * (1.0 - uniforms.radialSoftnessMul), innerR, r);
  } else if (r > outerR) {
    radialFactor = 1.0 - smoothstep(outerR, outerR * (1.0 + uniforms.radialSoftnessMul), r);
  }

  // PERF (OPT-BH-13): Use pre-computed effective thickness from CPU
  let thickness = uniforms.effectiveThickness;

  // Add extra dimension contributions to height for higher D
  var effectiveH = h;
  // Note: Higher dimension handling would need paramValues array access

  // Vertical falloff
  // Guard against zero thickness and extreme exponent values
  let safeThickness = max(thickness, 0.0001);
  let safeExponent = clamp(uniforms.densityFalloff, 0.1, 10.0);
  let heightRatio = effectiveH / safeThickness;
  // Clamp the ratio before pow to prevent extreme values
  let verticalFactor = exp(-pow(min(heightRatio, 100.0), safeExponent));

  // Combine factors
  var density = radialFactor * verticalFactor;

  // PERF (OPT-BH-25): Use texture-based snoise instead of expensive noise3D
  // Add turbulence noise
  if (uniforms.noiseAmount > 0.001) {
    // Swirl in XZ plane
    let angle = atan2(pos3d.z, pos3d.x);
    let swirlOffset = uniforms.swirlAmount * r * 0.5 * sin(time);
    let noisePos = vec3f(r * 0.3, angle * 2.0 + swirlOffset, h * 0.5) * uniforms.noiseScale;

    // snoise returns [-1, 1], convert to [0, 1] for ridged calculation
    let n = snoise(noisePos + time * 0.1) * 0.5 + 0.5;

    // Ridged multifractal noise (electric/filigree look)
    // Convert [0,1] to [-1,1], then take 1 - abs()
    var ridged = 1.0 - abs(2.0 * n - 1.0);
    ridged = ridged * ridged; // PERF: Sharpen ridges (x² instead of pow)

    density *= mix(1.0, ridged, uniforms.noiseAmount);
  }

  return max(density, 0.0);
}

/**
 * Get manifold emission color based on position and mode.
 */
fn manifoldColor(
  pos3d: vec3f,
  ndRadius: f32,
  density: f32,
  time: f32,
  uniforms: BlackHoleUniforms
) -> vec3f {
  let r = diskRadius(pos3d);
  // PERF (OPT-BH-11): Use pre-computed disk radii uniforms
  let innerR = uniforms.diskInnerR;
  let outerR = uniforms.diskOuterR;

  // Normalized radial position [0, 1]
  // Guard against division by zero when innerR >= outerR
  let radialRange = max(outerR - innerR, 0.001);
  let radialT = clamp((r - innerR) / radialRange, 0.0, 1.0);

  var color = uniforms.baseColor;

  // Palette modes
  if (uniforms.paletteMode == 0) {
    // Disk gradient: hot inner → cool outer
    let innerColor = vec3f(1.0, 0.9, 0.7); // Yellowish-white (hot)
    let outerColor = vec3f(1.0, 0.4, 0.1); // Orange-red (cooler)
    color = mix(innerColor, outerColor, radialT);
    color *= uniforms.baseColor; // Tint with base color
  } else if (uniforms.paletteMode == 1) {
    // Normal-based coloring
    let normal = normalize(pos3d);
    color = abs(normal) * uniforms.baseColor;
  } else if (uniforms.paletteMode == 2) {
    // Shell only - no manifold color
    color = vec3f(0.0);
  } else if (uniforms.paletteMode == 3) {
    // Heatmap based on density
    let cold = vec3f(0.1, 0.0, 0.3);
    let mid = vec3f(1.0, 0.3, 0.0);
    let hot = vec3f(1.0, 1.0, 0.8);
    if (density < 0.5) {
      color = mix(cold, mid, density * 2.0);
    } else {
      color = mix(mid, hot, (density - 0.5) * 2.0);
    }
  }

  // Add swirl pattern with Keplerian rotation from animation system
  if (uniforms.swirlAmount > 0.001) {
    // Angle in XZ plane
    let angle = atan2(pos3d.z, pos3d.x);

    // Keplerian rotation: inner disk rotates faster than outer
    // Skip expensive calculation only when differential is 0 (uniform rotation)
    var rotationOffset = uniforms.diskRotationAngle;
    if (uniforms.keplerianDifferential > 0.001) {
      // Guard safeR to prevent extreme keplerianFactor when r is near innerR
      let safeInnerR = max(uniforms.diskInnerR, 0.001);
      let safeR = max(r, max(safeInnerR * 0.1, 0.001));
      let ratio = safeInnerR / safeR;
      // PERF: x^1.5 = x * sqrt(x) is faster than pow(x, 1.5) on GPU
      let keplerianFactor = ratio * sqrt(ratio);
      rotationOffset *= mix(1.0, keplerianFactor, uniforms.keplerianDifferential);
    }

    let swirlPhase = angle * 3.0 + r * 0.5 + rotationOffset;
    let swirlBright = 0.5 + 0.5 * sin(swirlPhase);
    color *= mix(0.7, 1.3, swirlBright * uniforms.swirlAmount);
  }

  // Apply intensity
  color *= uniforms.manifoldIntensity * density;

  return color;
}

/**
 * Calculate absorption for volumetric mode.
 */
fn manifoldAbsorption(density: f32, stepSize: f32, absorption: f32, enableAbsorption: bool) -> f32 {
  if (!enableAbsorption) { return 1.0; }

  let sigma = density * absorption;
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
 * @param uniforms - BlackHole uniforms struct
 * @returns Normalized gradient direction (pseudo-normal)
 */
fn computeManifoldNormal(
  pos3d: vec3f,
  ndRadius: f32,
  time: f32,
  uniforms: BlackHoleUniforms
) -> vec3f {
  // Analytical approach for accretion disk (XZ plane):
  // Normal is primarily vertical (Y) + radial (XZ).

  let eps = 0.01;
  let d0 = manifoldDensity(pos3d, ndRadius, time, uniforms);

  // Sample only along Y to get vertical gradient
  let dy = manifoldDensity(pos3d + vec3f(0.0, eps, 0.0), ndRadius, time, uniforms);
  let verticalGrad = (dy - d0) / eps;

  // Radial component follows the radial direction in XZ plane
  let r = length(pos3d.xz);
  let radialDir = select(vec3f(1.0, 0.0, 0.0), vec3f(pos3d.x / r, 0.0, pos3d.z / r), r > 1e-6);

  // Estimate radial gradient (density decreases with radius)
  let dr = manifoldDensity(pos3d + radialDir * eps, ndRadius, time, uniforms);
  let radialGrad = (dr - d0) / eps;

  // Combine vertical (Y) and radial (XZ) components
  let normal = radialDir * radialGrad + vec3f(0.0, verticalGrad, 0.0);

  let normalLen = length(normal);
  if (normalLen > 0.0001) {
    return normalize(-normal); // Point toward higher density
  }

  // Fallback: use up vector
  return vec3f(0.0, 1.0, 0.0);
}
`
