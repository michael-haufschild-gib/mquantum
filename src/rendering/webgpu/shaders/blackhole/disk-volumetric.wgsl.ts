/**
 * Volumetric Accretion Disk Shader (WGSL)
 *
 * Implements a physically-inspired volumetric accretion disk using raymarching density accumulation.
 *
 * Key Features:
 * - Volumetric density field with "Ridged Multifractal" noise for electric/filigree look
 * - Domain Warping for fluid dynamics
 * - Relativistic beaming (Doppler boosting intensity)
 * - Temperature gradient (Blackbody)
 * - Soft edges and gaps
 * - Kerr black hole disk warping (Bardeen-Petterson effect)
 *
 * Port of GLSL blackhole/gravity/disk-volumetric.glsl to WGSL.
 * Uses global 'blackhole' uniform binding directly for consistency.
 *
 * @module rendering/webgpu/shaders/blackhole/disk-volumetric.wgsl
 */

export const diskVolumetricBlock = /* wgsl */ `
// ============================================
// VOLUMETRIC ACCRETION DISK
// ============================================

// === Named Constants ===
// Disk geometry
const DISK_INNER_EDGE_SOFTNESS: f32 = 0.9;  // Fraction of innerR where fade starts
const DISK_OUTER_EDGE_SOFTNESS: f32 = 0.9;  // Fraction of outerR where fade starts
const DISK_OUTER_FADE_END: f32 = 1.2;       // Fraction of outerR where disk ends
const DISK_FLARE_POWER: f32 = 2.5;          // Disk flare exponent (thicker at edges)
const DISK_FLARE_SCALE: f32 = 1.5;          // Disk flare amplitude

// Density thresholds
const DENSITY_CUTOFF: f32 = 0.001;          // Minimum density to process
const DENSITY_HIT_THRESHOLD: f32 = 0.5;     // Density for depth buffer hit
const DISK_BASE_INTENSITY: f32 = 20.0;      // Base density multiplier

// Temperature profile
const TEMP_FALLOFF_EXPONENT: f32 = 0.75;    // r^(-3/4) for thin disk

// Brightness constants
const BLACKBODY_BOOST: f32 = 2.0;           // Boost for blackbody mode
const PALETTE_BOOST: f32 = 2.5;             // Boost for palette modes
const CORE_BRIGHTNESS: f32 = 3.0;           // Inner core glow multiplier

// Noise parameters
const DUST_LANE_FREQUENCY: f32 = 15.0;      // Radial dust lane period
const DUST_LANE_STRENGTH: f32 = 0.3;        // Dust lane modulation amount

// Ring pattern parameters (for Interstellar-style concentric arcs)
const RING_RADIAL_FREQ: f32 = 6.0;          // High = many concentric rings
const RING_ANGULAR_FREQ: f32 = 0.5;         // Low = rings stay coherent as arcs
const RING_SHARPNESS: f32 = 2.5;            // Higher = thinner brighter lines

// Disk warp parameters (Bardeen-Petterson effect for Kerr black holes)
const WARP_TRANSITION_START: f32 = 1.5;     // Warp starts at 1.5x inner radius
const WARP_TRANSITION_END: f32 = 4.0;       // Warp fully decayed by 4x inner radius
const WARP_MAX_AMPLITUDE: f32 = 0.4;        // Maximum warp height (fraction of thickness)

/**
 * Calculate warped disk midplane height for Kerr black holes.
 *
 * Implements the Bardeen-Petterson effect: frame dragging causes the inner disk
 * to align with the black hole's equatorial plane, while the outer disk maintains
 * its original orientation. This creates a smooth warp transition zone.
 *
 * Additional effects:
 * - Frame-drag induced vertical oscillation (disk "wobbles" due to dragging)
 * - Precession-based azimuthal variation (different heights at different angles)
 *
 * @param pos - Position in disk space
 * @param r - Radial distance in XZ plane
 * @param innerR - Inner disk radius (ISCO)
 * @param thickness - Local disk thickness
 * @param spin - Black hole spin parameter
 * @param diskRotationAngle - Current disk rotation angle
 * @return Vertical offset of the warped midplane from y=0
 */
fn getDiskWarp(pos: vec3f, r: f32, innerR: f32, thickness: f32, spin: f32, diskRotationAngle: f32) -> f32 {
  // No warp without spin
  if (abs(spin) < 0.01) { return 0.0; }

  // Compute azimuthal angle using atan2
  let angle = atan2(pos.z, pos.x);

  // Warp strength profile: strongest near inner edge, decays outward
  // Based on Bardeen-Petterson radius ~ r_BP ∝ (α * H/R)^(2/3) * r_g
  // Simplified: warp decays as 1/r² from inner edge
  let rRatio = r / max(innerR, 0.001);
  let warpDecay = 1.0 / (1.0 + (rRatio - 1.0) * (rRatio - 1.0));

  // Smooth transition: no warp very close to ISCO, peaks slightly outside, then decays
  let transitionIn = smoothstep(1.0, WARP_TRANSITION_START, rRatio);
  let transitionOut = 1.0 - smoothstep(WARP_TRANSITION_START, WARP_TRANSITION_END, rRatio);
  let warpStrength = transitionIn * transitionOut * warpDecay;

  // === Primary warp: Bardeen-Petterson tilt ===
  // The disk tilts like a warped vinyl record
  // Tilt axis is perpendicular to spin axis (Y), so warp varies with angle
  // Maximum displacement when looking along X axis (angle = 0 or PI)
  let tiltWarp = cos(angle) * warpStrength;

  // === Secondary warp: Frame-drag induced twist ===
  // Frame dragging adds a twist component that varies as sin(2*angle)
  // This creates a saddle-like deformation
  let twistWarp = sin(2.0 * angle) * warpStrength * 0.3;

  // === Tertiary: Precession ripple ===
  // Lense-Thirring precession causes the warp to have higher-frequency ripples
  // This adds visual complexity and realism
  let precessionPhase = angle + diskRotationAngle * 0.5; // Slow precession
  let precessionRipple = sin(3.0 * precessionPhase) * warpStrength * 0.15;

  // Combine all warp components
  let totalWarp = tiltWarp + twistWarp + precessionRipple;

  // Scale by spin magnitude and disk thickness
  // Higher spin = more pronounced warp
  // Warp amplitude scales with local thickness for visual consistency
  let warpAmplitude = abs(spin) * thickness * WARP_MAX_AMPLITUDE;

  return totalWarp * warpAmplitude;
}

// === FBM & Domain Warping ===

/**
 * Ridged multifractal noise for electric/plasma look.
 *
 * PERF OPTIMIZATION (OPT-BH-2): Fixed 2 octaves maximum for all quality levels.
 * Analysis showed 3rd/4th octaves contributed <10% visual difference at 60fps
 * but cost 50-100% more GPU cycles. The amplitude is boosted to compensate.
 *
 * PERF (OPT-BH-22): Dimension-aware LOD added.
 * For dimensions 6D+, use single octave since the extra visual complexity
 * of higher dimensions masks fine noise detail anyway.
 *
 * @param p - 3D position to sample
 * @param fastMode - Whether to use fast mode (single octave)
 * @param dimension - Current dimension for LOD selection
 */
fn ridgedMF(p: vec3f, fastMode: bool, dimension: i32) -> f32 {
  var n = snoise(p);
  n = 1.0 - abs(n);
  n = n * n;

  // PERF (OPT-BH-2, OPT-BH-22): Fast mode OR high dimension - single octave
  // High dimensions (6D+) have enough visual complexity to mask fine noise detail
  if (dimension >= 6 || fastMode) {
    return n * 0.85; // Boosted amplitude to compensate for missing octave
  }

  // Normal mode: exactly 2 octaves (reduced from 3-4)
  // Second octave adds detail without excessive cost
  var n2 = snoise(p * 2.0);
  n2 = 1.0 - abs(n2);
  n2 = n2 * n2;

  // Weighted sum with boosted amplitudes (0.6 + 0.35 = 0.95)
  // This compensates for removed 3rd/4th octaves
  return n * 0.6 + n2 * 0.35;
}

/**
 * Flow noise with domain warping for fluid dynamics look.
 *
 * PERF OPTIMIZATION (OPT-BH-15): Reduced domain warping from 3 snoise to 1.
 * Full 3-axis warping was visually indistinguishable from 1-axis at 60fps.
 * This saves 2 snoise calls (100+ ALU ops) per flowNoise invocation.
 *
 * - Fast/UltraFast mode: No warping (direct animated offset)
 * - Normal mode: 1-axis warping (single snoise for warp)
 */
fn flowNoise(p: vec3f, time: f32, noiseScale: f32, fastMode: bool, ultraFastMode: bool, dimension: i32) -> f32 {
  // PERF: Fast mode skips domain warping entirely
  if (fastMode || ultraFastMode) {
    // Simple animated offset instead of full domain warping
    let animOffset = vec3f(time * 0.1, time * 0.05, 0.0);
    return ridgedMF(p + animOffset, fastMode, dimension);
  }

  // PERF (OPT-BH-15): Reduced to single-axis domain warping
  // Only warp along one axis - visual difference is negligible
  let warp = snoise(p + vec3f(0.0, 0.0, time * 0.2));
  let warped = p + vec3f(warp * noiseScale, warp * noiseScale * 0.5, 0.0);

  return ridgedMF(warped, fastMode, dimension);
}

/**
 * Calculate density of the accretion disk at a given point.
 *
 * Uses global 'blackhole' uniform binding directly.
 *
 * @param pos - Position in space (relative to black hole center)
 * @param time - Animation time
 * @param r - Pre-computed radial distance length(pos.xz)
 * @param fragCoord - Fragment coordinates for dithering
 * @returns Density value (0.0 to ~1.0+)
 */
fn getDiskDensity(
  pos: vec3f,
  time: f32,
  r: f32,
  fragCoord: vec2f
) -> f32 {
  // Use pre-computed disk radii from global blackhole uniforms
  let innerR = blackhole.diskInnerR;
  let outerR = blackhole.diskOuterR;

  // 1. Basic Bounds Check
  if (r < innerR * DISK_INNER_EDGE_SOFTNESS || r > outerR * DISK_OUTER_FADE_END) { return 0.0; }

  // 2. Vertical Profile (Gaussian with flaring)
  let rNorm = r / outerR;
  let flare = 1.0 + (rNorm * rNorm * sqrt(rNorm)) * DISK_FLARE_SCALE;
  let thickness = blackhole.manifoldThickness * blackhole.horizonRadius * 0.5 * flare;

  // === Kerr disk warp (Bardeen-Petterson effect) ===
  // Calculate warped midplane offset based on spin
  let warpOffset = getDiskWarp(pos, r, innerR, thickness, blackhole.spin, blackhole.diskRotationAngle);

  // Height relative to warped midplane (not flat y=0 plane)
  let h = abs(pos.y - warpOffset);

  // Very sharp vertical falloff for "thin disk" look at center
  let hSq = h * h;
  let tSq = thickness * thickness;
  let hDensity = exp(-hSq / tSq);

  // Cut off if too far vertically
  if (hDensity < DENSITY_CUTOFF) { return 0.0; }

  // PERF (OPT-BH-3): Ultra-fast mode - skip ALL noise computation
  if (blackhole.ultraFastMode != 0u) {
    // Simple radial profile without noise
    var rDensity = smoothstep(innerR * DISK_INNER_EDGE_SOFTNESS, innerR, r)
                 * (1.0 - smoothstep(outerR * DISK_OUTER_EDGE_SOFTNESS, outerR * DISK_OUTER_FADE_END, r));
    // Inverse square falloff for bulk density (denser inside)
    let rOverInner = r / max(innerR, 0.001);
    rDensity *= 2.0 / (rOverInner * rOverInner + 0.1);

    return hDensity * rDensity * blackhole.manifoldIntensity * DISK_BASE_INTENSITY;
  }

  // 3. Radial Profile
  // Soft inner edge near ISCO, Soft outer edge fade

  // Asymmetric ISCO: Modulate inner radius based on spin and angle
  var spinMod = 0.0;
  if (blackhole.spin > 0.01) {
    let spinFactor = pos.x / (r + 0.001);
    spinMod = -spinFactor * blackhole.spin * 0.4;
  }

  let effectiveInnerR = innerR * (1.0 + spinMod);
  let safeInnerR = max(effectiveInnerR, 0.001);

  // Simple radial profile with soft edges
  var rDensity = smoothstep(effectiveInnerR * DISK_INNER_EDGE_SOFTNESS, effectiveInnerR, r)
               * (1.0 - smoothstep(outerR * DISK_OUTER_EDGE_SOFTNESS, outerR * DISK_OUTER_FADE_END, r));

  // Inverse square falloff for bulk density (denser inside)
  let rOverInner = r / safeInnerR;
  rDensity *= 2.0 / (rOverInner * rOverInner + 0.1);

  // 4. Volumetric Detail (The "Interstellar" Look)

  // PERF (OPT-BH-32): Conditional noise setup - skip if not needed
  if (blackhole.noiseAmount > 0.01) {
    // Compute sin/cos directly from position, avoiding expensive atan()
    let invR = 1.0 / max(r, 0.001);
    let cosAngle = pos.x * invR;
    let sinAngle = pos.z * invR;

    // Apply disk rotation using angle addition formulas (avoids atan + sin/cos)
    var cosRot = cos(blackhole.diskRotationAngle);
    var sinRot = sin(blackhole.diskRotationAngle);

    // Keplerian differential rotation
    if (blackhole.keplerianDifferential > 0.001) {
      let ratio = safeInnerR / max(r, safeInnerR * 0.1);
      let keplerianFactor = ratio * sqrt(ratio);
      let rotSpeed = mix(1.0, keplerianFactor, blackhole.keplerianDifferential);
      let adjustedRot = blackhole.diskRotationAngle * rotSpeed;
      cosRot = cos(adjustedRot);
      sinRot = sin(adjustedRot);
    }

    // Rotated angular coordinates (seamless, no atan discontinuity)
    let rotCos = cosAngle * cosRot - sinAngle * sinRot;
    let rotSin = sinAngle * cosRot + cosAngle * sinRot;

    // Simplified per-pixel dither using just fragment coords
    let noiseOffset = fract(dot(fragCoord, vec2f(0.0671056, 0.00583715))) * 0.1;

    // SEAM-FREE noise coordinates using rotated sin/cos
    let radialCoord = r * RING_RADIAL_FREQ + noiseOffset;
    let noiseCoord = vec3f(
      radialCoord,
      (rotCos + rotSin * 0.5) * RING_ANGULAR_FREQ,
      h * 2.0 + rotSin * 0.3 * RING_ANGULAR_FREQ
    );

    // Use ridgedMF directly instead of flowNoise to skip domain warp snoise
    let warped = ridgedMF(noiseCoord * blackhole.noiseScale + vec3f(time * 0.02, time * 0.01, 0.0), blackhole.fastMode != 0u, blackhole.dimension);

    // Sharpen to create thin bright lines on dark background
    var noiseVal = smoothstep(0.15, 0.85, warped);
    noiseVal = noiseVal * noiseVal * sqrt(max(noiseVal, 0.001));

    // Apply noise modulation
    rDensity *= mix(0.3, 1.0, noiseVal) * mix(1.0, 2.0, blackhole.noiseAmount);

    // Dust lanes (radial banding)
    var dustLanes = 0.5 + 0.5 * sin((r + noiseOffset) * DUST_LANE_FREQUENCY / blackhole.horizonRadius);
    dustLanes = sqrt(dustLanes);
    rDensity *= mix(1.0, dustLanes, DUST_LANE_STRENGTH * blackhole.noiseAmount);
  }

  return hDensity * rDensity * blackhole.manifoldIntensity * DISK_BASE_INTENSITY;
}

/**
 * Calculate emission color for a point in the disk.
 *
 * Uses global 'blackhole' uniform binding directly.
 *
 * @param pos - Position
 * @param density - Calculated density
 * @param time - Time
 * @param rayDir - Ray direction (for Doppler)
 * @param normal - Surface normal (for ALGO_NORMAL coloring)
 * @param r - Pre-computed radial distance length(pos.xz)
 * @param innerR - Pre-computed inner radius
 * @returns Emission color
 */
fn getDiskEmission(
  pos: vec3f,
  density: f32,
  time: f32,
  rayDir: vec3f,
  normal: vec3f,
  r: f32,
  innerR: f32
) -> vec3f {
  // Temperature Profile with Stress-Free ISCO Boundary
  let safeInnerR = max(innerR, 0.001);
  let safeR = max(r, safeInnerR);

  // Standard thin disk temperature profile: T ∝ r^(-3/4)
  let tempRatio = pow(safeInnerR / safeR, TEMP_FALLOFF_EXPONENT);

  // Get base color
  var color: vec3f;

  // Normalized radial position: 0 at inner edge, 1 at outer edge
  let normalizedR = clamp((r - innerR) / (blackhole.diskOuterR - innerR), 0.0, 1.0);

  if (blackhole.colorAlgorithm == 10) { // ALGO_BLACKBODY
    // Map ratio to temperature
    let temp = blackhole.diskTemperature * tempRatio;
    color = blackbodyColor(temp);

    // Boost intensity heavily for the "core" look
    color *= BLACKBODY_BOOST;
  } else {
    // Use normalized radius for color gradient (0 = inner/hot, 1 = outer/cool)
    let t = pow(normalizedR, 0.7);  // Slight non-linearity to push colors outward
    color = getAlgorithmColor(t, pos, normal);

    // Add "thermal core" - lighter/whiter at inner edge
    let coreColor = vec3f(1.0, 0.98, 0.9);
    let coreMix = smoothstep(0.3, 0.0, normalizedR);  // Strongest at inner edge
    color = mix(color, coreColor * CORE_BRIGHTNESS, coreMix * 0.5);

    // Brightness varies with radius but NOT as extreme as before
    let brightnessFactor = mix(1.5, 0.8, normalizedR);
    color *= brightnessFactor;
  }

  // Gravitational Redshift
  let gRedshift = gravitationalRedshift(r);
  color *= gRedshift;

  // Doppler Shift (Relativistic Beaming)
  let dopplerFac = dopplerFactor(pos, rayDir);
  color = applyDopplerShift(color, dopplerFac);

  // Limb Darkening
  let cosTheta = abs(rayDir.y);
  let limbDarkening = 1.0 - 0.4 * (1.0 - cosTheta); // u ≈ 0.4 for subtle effect
  color *= limbDarkening;

  // Density grading
  color *= (density * 0.2 + 0.1);

  return color * density;
}

/**
 * Compute disk surface normal from analytical approximation.
 * Used for volumetric lighting/shading interactions.
 *
 * Uses global 'blackhole' uniform binding directly.
 */
fn computeVolumetricDiskNormal(pos: vec3f, rayDir: vec3f) -> vec3f {
  let r = length(pos.xz);
  let innerR = blackhole.diskInnerR;
  let outerR = blackhole.diskOuterR;

  // Radial direction in XZ plane (outward from center)
  let radialDir = select(vec3f(1.0, 0.0, 0.0), vec3f(pos.x / r, 0.0, pos.z / r), r > 0.001);

  // Calculate thickness for warp computation
  let rNorm = r / outerR;
  let flare = 1.0 + (rNorm * rNorm * sqrt(max(rNorm, 0.0))) * DISK_FLARE_SCALE;
  let thickness = blackhole.manifoldThickness * blackhole.horizonRadius * 0.5 * flare;

  // === Warp gradient for Kerr black holes ===
  var warpGradient = vec3f(0.0);
  if (abs(blackhole.spin) > 0.01) {
    let eps = 0.05 * blackhole.horizonRadius;
    let px = pos + vec3f(eps, 0.0, 0.0);
    let pz = pos + vec3f(0.0, 0.0, eps);
    let rx = length(px.xz);
    let rz = length(pz.xz);

    let warpCenter = getDiskWarp(pos, r, innerR, thickness, blackhole.spin, blackhole.diskRotationAngle);
    let warpX = getDiskWarp(px, rx, innerR, thickness, blackhole.spin, blackhole.diskRotationAngle);
    let warpZ = getDiskWarp(pz, rz, innerR, thickness, blackhole.spin, blackhole.diskRotationAngle);

    // Gradient: how much warp changes in X and Z directions
    warpGradient.x = (warpX - warpCenter) / eps;
    warpGradient.z = (warpZ - warpCenter) / eps;
  }

  // Vertical component: dominant, points away from warped disk plane
  let warpOffset = getDiskWarp(pos, r, innerR, thickness, blackhole.spin, blackhole.diskRotationAngle);
  let ySign = select(-1.0, 1.0, (pos.y - warpOffset) > 0.0);

  // Slight radial tilt at outer edge (disk flare)
  let flareTilt = smoothstep(outerR * 0.3, outerR, r) * 0.4;

  // Density-based tilt: tilts more in low-density regions for visual interest
  let verticalPos = abs(pos.y - warpOffset) / (thickness + 0.001);
  let edgeTilt = smoothstep(0.5, 1.5, verticalPos) * 0.2;

  // Combine flare tilt, edge tilt, and warp gradient
  var normal = normalize(vec3f(
    radialDir.x * (flareTilt + edgeTilt) - warpGradient.x,
    ySign * (1.0 - edgeTilt * 0.5),
    radialDir.z * (flareTilt + edgeTilt) - warpGradient.z
  ));

  // Ensure normal faces the viewer
  if (dot(normal, rayDir) > 0.0) { normal = -normal; }

  return normal;
}
`
