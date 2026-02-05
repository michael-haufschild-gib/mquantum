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

// ============================================
// Simplex Noise 3D (proper coherent noise)
// Port of Ashima Arts simplex noise to WGSL
// Same implementation as jet-volumetric.wgsl.ts
// ============================================

fn mod289_3(x: vec3f) -> vec3f {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn mod289_4(x: vec4f) -> vec4f {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

fn permute(x: vec4f) -> vec4f {
  return mod289_4(((x * 34.0) + 1.0) * x);
}

fn taylorInvSqrt(r: vec4f) -> vec4f {
  return 1.79284291400159 - 0.85373472095314 * r;
}

fn snoise(v: vec3f) -> f32 {
  let C = vec2f(1.0 / 6.0, 1.0 / 3.0);
  let D = vec4f(0.0, 0.5, 1.0, 2.0);

  var i = floor(v + dot(v, C.yyy));
  let x0 = v - i + dot(i, C.xxx);

  let g = step(x0.yzx, x0.xyz);
  let l = 1.0 - g;
  let i1 = min(g.xyz, l.zxy);
  let i2 = max(g.xyz, l.zxy);

  let x1 = x0 - i1 + C.xxx;
  let x2 = x0 - i2 + C.yyy;
  let x3 = x0 - D.yyy;

  i = mod289_3(i);
  let p = permute(permute(permute(
            i.z + vec4f(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4f(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4f(0.0, i1.x, i2.x, 1.0));

  let n_ = 0.142857142857;
  let ns = n_ * D.wyz - D.xzx;
  let j = p - 49.0 * floor(p * ns.z * ns.z);
  let x_ = floor(j * ns.z);
  let y_ = floor(j - 7.0 * x_);

  let x = x_ * ns.x + ns.yyyy;
  let y = y_ * ns.x + ns.yyyy;
  let h = 1.0 - abs(x) - abs(y);

  let b0 = vec4f(x.xy, y.xy);
  let b1 = vec4f(x.zw, y.zw);
  let s0 = floor(b0) * 2.0 + 1.0;
  let s1 = floor(b1) * 2.0 + 1.0;
  let sh = -step(h, vec4f(0.0));

  let a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  let a1 = b1.xzyw + s1.xzyw * sh.zzww;

  var p0 = vec3f(a0.xy, h.x);
  var p1 = vec3f(a0.zw, h.y);
  var p2 = vec3f(a1.xy, h.z);
  var p3 = vec3f(a1.zw, h.w);

  let norm = taylorInvSqrt(vec4f(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  var m = max(0.6 - vec4f(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4f(0.0));
  m = m * m;
  return 42.0 * dot(m * m, vec4f(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
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
  time: f32
) -> f32 {
  let r = diskRadius(pos3d);
  let h = diskHeight(pos3d);

  // PERF (OPT-BH-11): Use pre-computed disk radii uniforms
  let innerR = blackhole.diskInnerR;
  let outerR = blackhole.diskOuterR;

  // Radial falloff
  var radialFactor = 1.0;
  if (r < innerR) {
    radialFactor = smoothstep(innerR * (1.0 - blackhole.radialSoftnessMul), innerR, r);
  } else if (r > outerR) {
    radialFactor = 1.0 - smoothstep(outerR, outerR * (1.0 + blackhole.radialSoftnessMul), r);
  }

  // PERF (OPT-BH-13): Use pre-computed effective thickness from CPU
  let thickness = blackhole.effectiveThickness;

  // Add extra dimension contributions to height for higher D
  var effectiveH = h;
  // Note: Higher dimension handling would need paramValues array access

  // Vertical falloff
  // Guard against zero thickness and extreme exponent values
  let safeThickness = max(thickness, 0.0001);
  let safeExponent = clamp(blackhole.densityFalloff, 0.1, 10.0);
  let heightRatio = effectiveH / safeThickness;
  // Clamp the ratio before pow to prevent extreme values
  let verticalFactor = exp(-pow(min(heightRatio, 100.0), safeExponent));

  // Combine factors
  var density = radialFactor * verticalFactor;

  // PERF (OPT-BH-25): Use texture-based snoise instead of expensive noise3D
  // Add turbulence noise
  if (blackhole.noiseAmount > 0.001) {
    // Swirl in XZ plane
    let angle = atan2(pos3d.z, pos3d.x);
    let swirlOffset = blackhole.swirlAmount * r * 0.5 * sin(time);
    let noisePos = vec3f(r * 0.3, angle * 2.0 + swirlOffset, h * 0.5) * blackhole.noiseScale;

    // snoise returns [-1, 1], convert to [0, 1] for ridged calculation
    let n = snoise(noisePos + time * 0.1) * 0.5 + 0.5;

    // Ridged multifractal noise (electric/filigree look)
    // Convert [0,1] to [-1,1], then take 1 - abs()
    var ridged = 1.0 - abs(2.0 * n - 1.0);
    ridged = ridged * ridged; // PERF: Sharpen ridges (x² instead of pow)

    density *= mix(1.0, ridged, blackhole.noiseAmount);
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
  time: f32
) -> vec3f {
  let r = diskRadius(pos3d);
  // PERF (OPT-BH-11): Use pre-computed disk radii uniforms
  let innerR = blackhole.diskInnerR;
  let outerR = blackhole.diskOuterR;

  // Normalized radial position [0, 1]
  // Guard against division by zero when innerR >= outerR
  let radialRange = max(outerR - innerR, 0.001);
  let radialT = clamp((r - innerR) / radialRange, 0.0, 1.0);

  var color = blackhole.baseColor;

  // Palette modes
  if (blackhole.paletteMode == 0) {
    // Disk gradient: hot inner → cool outer
    let innerColor = vec3f(1.0, 0.9, 0.7); // Yellowish-white (hot)
    let outerColor = vec3f(1.0, 0.4, 0.1); // Orange-red (cooler)
    color = mix(innerColor, outerColor, radialT);
    color *= blackhole.baseColor; // Tint with base color
  } else if (blackhole.paletteMode == 1) {
    // Normal-based coloring
    let normal = normalize(pos3d);
    color = abs(normal) * blackhole.baseColor;
  } else if (blackhole.paletteMode == 2) {
    // Shell only - no manifold color
    color = vec3f(0.0);
  } else if (blackhole.paletteMode == 3) {
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
  if (blackhole.swirlAmount > 0.001) {
    // Angle in XZ plane
    let angle = atan2(pos3d.z, pos3d.x);

    // Keplerian rotation: inner disk rotates faster than outer
    // Skip expensive calculation only when differential is 0 (uniform rotation)
    var rotationOffset = blackhole.diskRotationAngle;
    if (blackhole.keplerianDifferential > 0.001) {
      // Guard safeR to prevent extreme keplerianFactor when r is near innerR
      let safeInnerR = max(blackhole.diskInnerR, 0.001);
      let safeR = max(r, max(safeInnerR * 0.1, 0.001));
      let ratio = safeInnerR / safeR;
      // PERF: x^1.5 = x * sqrt(x) is faster than pow(x, 1.5) on GPU
      let keplerianFactor = ratio * sqrt(ratio);
      rotationOffset *= mix(1.0, keplerianFactor, blackhole.keplerianDifferential);
    }

    let swirlPhase = angle * 3.0 + r * 0.5 + rotationOffset;
    let swirlBright = 0.5 + 0.5 * sin(swirlPhase);
    color *= mix(0.7, 1.3, swirlBright * blackhole.swirlAmount);
  }

  // Apply intensity
  color *= blackhole.manifoldIntensity * density;

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
  time: f32
) -> vec3f {
  // Analytical approach for accretion disk (XZ plane):
  // Normal is primarily vertical (Y) + radial (XZ).

  let eps = 0.01;
  let d0 = manifoldDensity(pos3d, ndRadius, time);

  // Sample only along Y to get vertical gradient
  let dy = manifoldDensity(pos3d + vec3f(0.0, eps, 0.0), ndRadius, time);
  let verticalGrad = (dy - d0) / eps;

  // Radial component follows the radial direction in XZ plane
  let r = length(pos3d.xz);
  let radialDir = select(vec3f(1.0, 0.0, 0.0), vec3f(pos3d.x / r, 0.0, pos3d.z / r), r > 1e-6);

  // Estimate radial gradient (density decreases with radius)
  let dr = manifoldDensity(pos3d + radialDir * eps, ndRadius, time);
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
