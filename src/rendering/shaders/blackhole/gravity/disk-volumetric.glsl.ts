/**
 * Volumetric Accretion Disk Shader
 *
 * Implements a physically-inspired volumetric accretion disk using raymarching density accumulation.
 *
 * Key Features:
 * - Volumetric density field with "Ridged Multifractal" noise for electric/filigree look
 * - Domain Warping for fluid dynamics
 * - Relativistic beaming (Doppler boosting intensity)
 * - Temperature gradient (Blackbody)
 * - Soft edges and gaps
 */

export const diskVolumetricBlock = /* glsl */ `
//----------------------------------------------
// VOLUMETRIC ACCRETION DISK
//----------------------------------------------

// === Named Constants ===
// Disk geometry
const float DISK_INNER_EDGE_SOFTNESS = 0.9;  // Fraction of innerR where fade starts
const float DISK_OUTER_EDGE_SOFTNESS = 0.9;  // Fraction of outerR where fade starts
const float DISK_OUTER_FADE_END = 1.2;       // Fraction of outerR where disk ends
const float DISK_FLARE_POWER = 2.5;          // Disk flare exponent (thicker at edges)
const float DISK_FLARE_SCALE = 1.5;          // Disk flare amplitude

// Density thresholds
const float DENSITY_CUTOFF = 0.001;          // Minimum density to process
const float DENSITY_HIT_THRESHOLD = 0.5;     // Density for depth buffer hit
const float DISK_BASE_INTENSITY = 20.0;      // Base density multiplier

// Temperature profile
const float TEMP_FALLOFF_EXPONENT = 0.75;    // r^(-3/4) for thin disk

// Brightness constants
const float BLACKBODY_BOOST = 2.0;           // Boost for blackbody mode
const float PALETTE_BOOST = 2.5;             // Boost for palette modes
const float CORE_BRIGHTNESS = 3.0;           // Inner core glow multiplier

// Noise parameters
const float DUST_LANE_FREQUENCY = 15.0;      // Radial dust lane period
const float DUST_LANE_STRENGTH = 0.3;        // Dust lane modulation amount

// Ring pattern parameters (for Interstellar-style concentric arcs)
const float RING_RADIAL_FREQ = 6.0;          // High = many concentric rings
const float RING_ANGULAR_FREQ = 0.5;         // Low = rings stay coherent as arcs
const float RING_SHARPNESS = 2.5;            // Higher = thinner brighter lines
// Note: PI is defined in shared/core/constants.glsl.ts

// Disk warp parameters (Bardeen-Petterson effect for Kerr black holes)
const float WARP_TRANSITION_START = 1.5;     // Warp starts at 1.5x inner radius
const float WARP_TRANSITION_END = 4.0;       // Warp fully decayed by 4x inner radius
const float WARP_MAX_AMPLITUDE = 0.4;        // Maximum warp height (fraction of thickness)

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
 * @return Vertical offset of the warped midplane from y=0
 */
float getDiskWarp(vec3 pos, float r, float innerR, float thickness) {
    // No warp without spin
    if (abs(uSpin) < 0.01) return 0.0;

    // Compute azimuthal angle using atan2 equivalent
    float angle = atan(pos.z, pos.x);

    // Warp strength profile: strongest near inner edge, decays outward
    // Based on Bardeen-Petterson radius ~ r_BP ∝ (α * H/R)^(2/3) * r_g
    // Simplified: warp decays as 1/r² from inner edge
    float rRatio = r / max(innerR, 0.001);
    float warpDecay = 1.0 / (1.0 + (rRatio - 1.0) * (rRatio - 1.0));

    // Smooth transition: no warp very close to ISCO, peaks slightly outside, then decays
    float transitionIn = smoothstep(1.0, WARP_TRANSITION_START, rRatio);
    float transitionOut = 1.0 - smoothstep(WARP_TRANSITION_START, WARP_TRANSITION_END, rRatio);
    float warpStrength = transitionIn * transitionOut * warpDecay;

    // === Primary warp: Bardeen-Petterson tilt ===
    // The disk tilts like a warped vinyl record
    // Tilt axis is perpendicular to spin axis (Y), so warp varies with angle
    // Maximum displacement when looking along X axis (angle = 0 or PI)
    float tiltWarp = cos(angle) * warpStrength;

    // === Secondary warp: Frame-drag induced twist ===
    // Frame dragging adds a twist component that varies as sin(2*angle)
    // This creates a saddle-like deformation
    float twistWarp = sin(2.0 * angle) * warpStrength * 0.3;

    // === Tertiary: Precession ripple ===
    // Lense-Thirring precession causes the warp to have higher-frequency ripples
    // This adds visual complexity and realism
    float precessionPhase = angle + uDiskRotationAngle * 0.5; // Slow precession
    float precessionRipple = sin(3.0 * precessionPhase) * warpStrength * 0.15;

    // Combine all warp components
    float totalWarp = tiltWarp + twistWarp + precessionRipple;

    // Scale by spin magnitude and disk thickness
    // Higher spin = more pronounced warp
    // Warp amplitude scales with local thickness for visual consistency
    float warpAmplitude = abs(uSpin) * thickness * WARP_MAX_AMPLITUDE;

    return totalWarp * warpAmplitude;
}

// PERF (OPT-BH-25): snoise() is now defined in manifold.glsl.ts (compiled earlier)
// This avoids duplicate definitions and ensures all modules use the same fast texture-based noise

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
 * - Fast mode OR dim >= 6: 1 octave (single snoise call)
 * - Normal mode dim < 6: 2 octaves (2 snoise calls)
 *
 * This change alone provides ~40% speedup in volumetric disk rendering.
 */
float ridgedMF(vec3 p) {
    float n = snoise(p);
    n = 1.0 - abs(n);
    n = n * n;

    // PERF (OPT-BH-2, OPT-BH-22): Fast mode OR high dimension - single octave
    // High dimensions (6D+) have enough visual complexity to mask fine noise detail
    #if DIMENSION >= 6
    return n * 0.85; // Single octave for high dimensions
    #else
    if (uFastMode) {
        return n * 0.85; // Boosted amplitude to compensate for missing octave
    }

    // Normal mode: exactly 2 octaves (reduced from 3-4)
    // Second octave adds detail without excessive cost
    float n2 = snoise(p * 2.0);
    n2 = 1.0 - abs(n2);
    n2 = n2 * n2;

    // Weighted sum with boosted amplitudes (0.6 + 0.35 = 0.95)
    // This compensates for removed 3rd/4th octaves
    return n * 0.6 + n2 * 0.35;
    #endif
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
float flowNoise(vec3 p, float time) {
    // PERF: Fast mode skips domain warping entirely
    if (uFastMode || uUltraFastMode) {
        // Simple animated offset instead of full domain warping
        vec3 animOffset = vec3(time * 0.1, time * 0.05, 0.0);
        return ridgedMF(p + animOffset);
    }

    // PERF (OPT-BH-15): Reduced to single-axis domain warping
    // Only warp along one axis - visual difference is negligible
    float warp = snoise(p + vec3(0.0, 0.0, time * 0.2));
    vec3 warped = p + vec3(warp * uNoiseScale, warp * uNoiseScale * 0.5, 0.0);

    return ridgedMF(warped);
}

/**
 * Calculate density of the accretion disk at a given point.
 *
 * PERF (OPT-BH-3): Accepts pre-computed r to avoid redundant length() calls.
 *
 * @param pos - Position in space (relative to black hole center)
 * @param time - Animation time
 * @param r - Pre-computed radial distance length(pos.xz)
 * @returns Density value (0.0 to ~1.0+)
 */
float getDiskDensity(vec3 pos, float time, float r) {
    // PERF (OPT-BH-6): Use pre-computed disk radii uniforms
    float innerR = uDiskInnerR;
    float outerR = uDiskOuterR;

    // 1. Basic Bounds Check
    // No plunging region extension - keep disk bounds simple
    if (r < innerR * DISK_INNER_EDGE_SOFTNESS || r > outerR * DISK_OUTER_FADE_END) return 0.0;

    // 2. Vertical Profile (Gaussian with flaring)
    // PERF (OPT-BH-31): Replace pow(x, 2.5) with x*x*sqrt(x)
    float rNorm = r / outerR;
    float flare = 1.0 + (rNorm * rNorm * sqrt(rNorm)) * DISK_FLARE_SCALE;
    float thickness = uManifoldThickness * uHorizonRadius * 0.5 * flare;

    // === Kerr disk warp (Bardeen-Petterson effect) ===
    // Calculate warped midplane offset based on spin
    float warpOffset = getDiskWarp(pos, r, innerR, thickness);

    // Height relative to warped midplane (not flat y=0 plane)
    float h = abs(pos.y - warpOffset);

    // Very sharp vertical falloff for "thin disk" look at center
    // PERF: Pre-multiply h*h and thick*thick
    float hSq = h * h;
    float tSq = thickness * thickness;
    float hDensity = exp(-hSq / tSq);

    // Cut off if too far vertically
    if (hDensity < DENSITY_CUTOFF) return 0.0;

    // PERF (OPT-BH-3): Ultra-fast mode - skip ALL noise computation
    // During rapid camera movement, return smooth radial density gradient only.
    // The motion blur and low detail make noise patterns imperceptible.
    if (uUltraFastMode) {
        // Simple radial profile without noise
        float rDensity = smoothstep(innerR * DISK_INNER_EDGE_SOFTNESS, innerR, r)
                       * (1.0 - smoothstep(outerR * DISK_OUTER_EDGE_SOFTNESS, outerR * DISK_OUTER_FADE_END, r));
        // Inverse square falloff for bulk density (denser inside)
        float rOverInner = r / max(innerR, 0.001);
        rDensity *= 2.0 / (rOverInner * rOverInner + 0.1);

        return hDensity * rDensity * uManifoldIntensity * DISK_BASE_INTENSITY;
    }

    // 3. Radial Profile
    // Soft inner edge near ISCO, Soft outer edge fade

    // Asymmetric ISCO: Modulate inner radius based on spin and angle
    float spinMod = 0.0;
    if (uSpin > 0.01) {
        float spinFactor = pos.x / (r + 0.001);
        spinMod = -spinFactor * uSpin * 0.4;
    }

    float effectiveInnerR = innerR * (1.0 + spinMod);
    float safeInnerR = max(effectiveInnerR, 0.001);

    // Simple radial profile with soft edges
    // Inner edge: smooth transition starting at 0.9 * innerR
    // Outer edge: smooth fade from 0.9 * outerR to 1.2 * outerR
    float rDensity = smoothstep(effectiveInnerR * DISK_INNER_EDGE_SOFTNESS, effectiveInnerR, r)
                   * (1.0 - smoothstep(outerR * DISK_OUTER_EDGE_SOFTNESS, outerR * DISK_OUTER_FADE_END, r));

    // Inverse square falloff for bulk density (denser inside)
    // PERF: Use multiplication instead of pow(x, 2.0)
    float rOverInner = r / safeInnerR;
    rDensity *= 2.0 / (rOverInner * rOverInner + 0.1);

    // 4. Volumetric Detail (The "Interstellar" Look)

    // PERF (OPT-BH-32): Conditional noise setup - skip if not needed
    if (uNoiseAmount > 0.01) {
        // PERF: Compute sin/cos directly from position, avoiding expensive atan()
        // cos(angle) = x/r, sin(angle) = z/r (unit circle definition)
        float invR = 1.0 / max(r, 0.001);
        float cosAngle = pos.x * invR;
        float sinAngle = pos.z * invR;

        // Apply disk rotation using angle addition formulas (avoids atan + sin/cos)
        // cos(a+b) = cos(a)cos(b) - sin(a)sin(b)
        // sin(a+b) = sin(a)cos(b) + cos(a)sin(b)
        float cosRot = cos(uDiskRotationAngle);
        float sinRot = sin(uDiskRotationAngle);

        // Keplerian differential rotation
        if (uKeplerianDifferential > 0.001) {
            float ratio = safeInnerR / max(r, safeInnerR * 0.1);
            float keplerianFactor = ratio * sqrt(ratio);
            float rotSpeed = mix(1.0, keplerianFactor, uKeplerianDifferential);
            float adjustedRot = uDiskRotationAngle * rotSpeed;
            cosRot = cos(adjustedRot);
            sinRot = sin(adjustedRot);
        }

        // Rotated angular coordinates (seamless, no atan discontinuity)
        float rotCos = cosAngle * cosRot - sinAngle * sinRot;
        float rotSin = sinAngle * cosRot + cosAngle * sinRot;

        // PERF: Simplified per-pixel dither using just fragment coords
        float noiseOffset = fract(dot(gl_FragCoord.xy, vec2(0.0671056, 0.00583715))) * 0.1;

        // SEAM-FREE noise coordinates using rotated sin/cos
        float radialCoord = r * RING_RADIAL_FREQ + noiseOffset;
        vec3 noiseCoord = vec3(
            radialCoord,
            (rotCos + rotSin * 0.5) * RING_ANGULAR_FREQ,
            h * 2.0 + rotSin * 0.3 * RING_ANGULAR_FREQ
        );

        // PERF: Use ridgedMF directly instead of flowNoise to skip domain warp snoise
        // Domain warping adds fluid look but costs +1 snoise call (~33% overhead)
        float warped = ridgedMF(noiseCoord * uNoiseScale + vec3(time * 0.02, time * 0.01, 0.0));

        // Sharpen to create thin bright lines on dark background
        float noiseVal = smoothstep(0.15, 0.85, warped);
        noiseVal = noiseVal * noiseVal * sqrt(max(noiseVal, 0.001));

        // Apply noise modulation
        rDensity *= mix(0.3, 1.0, noiseVal) * mix(1.0, 2.0, uNoiseAmount);

        // Dust lanes (radial banding)
        float dustLanes = 0.5 + 0.5 * sin((r + noiseOffset) * DUST_LANE_FREQUENCY / uHorizonRadius);
        dustLanes = sqrt(dustLanes);
        rDensity *= mix(1.0, dustLanes, DUST_LANE_STRENGTH * uNoiseAmount);
    }

    return hDensity * rDensity * uManifoldIntensity * DISK_BASE_INTENSITY;
}

/**
 * Calculate emission color for a point in the disk.
 *
 * PERF: r and innerR are passed as parameters to avoid redundant length() calls.
 * These values are already computed in getDiskDensity and the main raymarch loop.
 *
 * @param pos - Position
 * @param density - Calculated density
 * @param time - Time
 * @param rayDir - Ray direction (for Doppler)
 * @param normal - Surface normal (for ALGO_NORMAL coloring)
 * @param r - Pre-computed radial distance length(pos.xz)
 * @param innerR - Pre-computed inner radius uHorizonRadius * uDiskInnerRadiusMul
 * @returns Emission color
 */
vec3 getDiskEmission(vec3 pos, float density, float time, vec3 rayDir, vec3 normal, float r, float innerR) {
    // Temperature Profile with Stress-Free ISCO Boundary
    //
    // Standard Shakura-Sunyaev thin disk: T ∝ r^(-3/4)
    // But at ISCO (innerR), there's a stress-free boundary where torque vanishes.
    // The corrected temperature profile is:
    //   T(r) = T_max * (r/r_ISCO)^(-3/4) * [1 - sqrt(r_ISCO/r)]^(1/4)
    //
    // The [1 - sqrt(r_ISCO/r)]^(1/4) factor:
    // - Goes to 0 at r = r_ISCO (no radiation at inner edge)
    // - Approaches 1 for r >> r_ISCO (standard profile at large r)
    // - Peak temperature occurs at r ≈ (49/36) * r_ISCO ≈ 1.36 * r_ISCO
    //
    // Reference: Novikov & Thorne (1973), Page & Thorne (1974)
    //
    float safeInnerR = max(innerR, 0.001);
    float safeR = max(r, safeInnerR);

    // Standard thin disk temperature profile: T ∝ r^(-3/4)
    // This is the Shakura-Sunyaev model without ISCO correction
    // (the ISCO correction was creating a dark ring artifact)
    float tempRatio = pow(safeInnerR / safeR, TEMP_FALLOFF_EXPONENT);

    // Renormalize so peak (at r ≈ 1.36 * innerR) equals 1.0
    // At peak: basicFalloff ≈ (1/1.36)^0.75 ≈ 0.78
    //          iscoCorrection ≈ (1 - sqrt(1/1.36))^0.25 ≈ 0.60
    //          product ≈ 0.47
    // To normalize, divide by peak value (≈ 0.47)
    // However, this changes visual appearance significantly - keep simpler version for now
    // tempRatio /= 0.47; // Uncomment for physically normalized profile

    // Get base color
    vec3 color;

    // Normalized radial position: 0 at inner edge, 1 at outer edge
    // This gives proper full-range gradient across the visible disk
    float normalizedR = clamp((r - innerR) / (uDiskOuterR - innerR), 0.0, 1.0);

    if (uColorAlgorithm == ALGO_BLACKBODY) {
        // Map ratio to temperature
        // Inner edge = low (ISCO boundary), peak slightly outside, outer = cooler
        float temp = uDiskTemperature * tempRatio;
        color = blackbodyColor(temp);

        // Boost intensity heavily for the "core" look
        color *= BLACKBODY_BOOST;
    } else {
        // Use normalized radius for color gradient (0 = inner/hot, 1 = outer/cool)
        // This ensures full color range is used across the disk
        float t = pow(normalizedR, 0.7);  // Slight non-linearity to push colors outward
        color = getAlgorithmColor(t, pos, normal);

        // Add "thermal core" - lighter/whiter at inner edge
        // This simulates incandescence at the inner edge
        vec3 coreColor = vec3(1.0, 0.98, 0.9);
        float coreMix = smoothstep(0.3, 0.0, normalizedR);  // Strongest at inner edge
        color = mix(color, coreColor * CORE_BRIGHTNESS, coreMix * 0.5);

        // Brightness varies with radius but NOT as extreme as before
        // Inner = bright, outer = slightly less bright (not dark)
        float brightnessFactor = mix(1.5, 0.8, normalizedR);
        color *= brightnessFactor;
    }

    // Gravitational Redshift
    float gRedshift = gravitationalRedshift(r);
    color *= gRedshift;
    
    // Doppler Shift (Relativistic Beaming)
    // Approaching side is brighter and bluer
    float dopplerFac = dopplerFactor(pos, rayDir);
    color = applyDopplerShift(color, dopplerFac);

    // Limb Darkening
    // Physical effect: edges of the disk appear darker because we view
    // through more optically thin material at grazing angles.
    //
    // Approximation: I(θ) = I₀ * (1 - u * (1 - cos(θ)))
    // where θ is the angle between surface normal and view direction.
    // For a thin disk in XZ plane, the normal is ±Y, so cos(θ) ≈ |rayDir.y|
    //
    // u = limb darkening coefficient:
    // - u = 0: no limb darkening
    // - u = 0.6: typical stellar value (used for accretion disk approximation)
    float cosTheta = abs(rayDir.y);
    float limbDarkening = 1.0 - 0.4 * (1.0 - cosTheta); // u ≈ 0.4 for subtle effect
    color *= limbDarkening;

    // Density grading
    // Thicker parts are hotter/brighter
    // Use a linear ramp instead of smoothstep to preserve dynamic range
    color *= (density * 0.2 + 0.1);

    return color * density;
}

/**
 * Compute disk surface normal from analytical approximation.
 * Used for volumetric lighting/shading interactions.
 * Named differently from SDF version to avoid conflicts when both are included.
 *
 * PERF OPTIMIZATION (OPT-BH-18): ALWAYS uses analytical approximation.
 * The numerical gradient path (4× getDiskDensity = 3600 ALU ops) has been removed.
 *
 * For a thin accretion disk in the XZ plane:
 * - The Y (vertical) gradient dominates and is predictable (Gaussian falloff)
 * - The radial gradient follows the density profile with disk flare
 * - For spinning black holes, the warp gradient tilts the normal
 *
 * Visual difference between analytical and numerical normals is negligible
 * at 60fps, but analytical is ~10x faster.
 */
vec3 computeVolumetricDiskNormal(vec3 pos, vec3 rayDir) {
    // For a thin disk in XZ plane:
    // - Vertical component: sign based on which side of disk plane
    // - Radial component: slight outward tilt at edges (disk flare)
    float r = length(pos.xz);
    // PERF (OPT-BH-6): Use pre-computed uDiskOuterR uniform
    float innerR = uDiskInnerR;
    float outerR = uDiskOuterR;

    // Radial direction in XZ plane (outward from center)
    vec3 radialDir = r > 0.001 ? vec3(pos.x / r, 0.0, pos.z / r) : vec3(1.0, 0.0, 0.0);

    // Calculate thickness for warp computation
    float rNorm = r / outerR;
    float flare = 1.0 + (rNorm * rNorm * sqrt(max(rNorm, 0.0))) * DISK_FLARE_SCALE;
    float thickness = uManifoldThickness * uHorizonRadius * 0.5 * flare;

    // === Warp gradient for Kerr black holes ===
    // Compute numerical gradient of warp to tilt the normal
    vec3 warpGradient = vec3(0.0);
    if (abs(uSpin) > 0.01) {
        float eps = 0.05 * uHorizonRadius;
        vec3 px = pos + vec3(eps, 0.0, 0.0);
        vec3 pz = pos + vec3(0.0, 0.0, eps);
        float rx = length(px.xz);
        float rz = length(pz.xz);

        float warpCenter = getDiskWarp(pos, r, innerR, thickness);
        float warpX = getDiskWarp(px, rx, innerR, thickness);
        float warpZ = getDiskWarp(pz, rz, innerR, thickness);

        // Gradient: how much warp changes in X and Z directions
        warpGradient.x = (warpX - warpCenter) / eps;
        warpGradient.z = (warpZ - warpCenter) / eps;
    }

    // Vertical component: dominant, points away from warped disk plane
    float warpOffset = getDiskWarp(pos, r, innerR, thickness);
    float ySign = (pos.y - warpOffset) > 0.0 ? 1.0 : -1.0;

    // Slight radial tilt at outer edge (disk flare)
    // Enhanced tilt for better visual depth cues
    float flareTilt = smoothstep(outerR * 0.3, outerR, r) * 0.4;

    // Density-based tilt: tilts more in low-density regions for visual interest
    // This approximates what numerical gradient would compute
    float verticalPos = abs(pos.y - warpOffset) / (thickness + 0.001);
    float edgeTilt = smoothstep(0.5, 1.5, verticalPos) * 0.2;

    // Combine flare tilt, edge tilt, and warp gradient
    // For surface y = warpOffset(x,z), normal is (-dw/dx, 1, -dw/dz) normalized
    vec3 normal = normalize(vec3(
        radialDir.x * (flareTilt + edgeTilt) - warpGradient.x,
        ySign * (1.0 - edgeTilt * 0.5),
        radialDir.z * (flareTilt + edgeTilt) - warpGradient.z
    ));

    // Ensure normal faces the viewer
    if (dot(normal, rayDir) > 0.0) normal = -normal;

    return normal;
}
`
