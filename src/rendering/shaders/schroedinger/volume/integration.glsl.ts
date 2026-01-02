/**
 * Volume integration loop for Schrödinger density field
 *
 * Performs front-to-back compositing along rays through the volume.
 * Uses Beer-Lambert absorption and emission accumulation.
 *
 * Key optimizations:
 * - Early ray termination when transmittance is low
 * - Adaptive step size based on density
 * - Gaussian bounds allow aggressive culling
 */
export const volumeIntegrationBlock = `
// ============================================
// Volume Integration (Beer-Lambert Compositing)
// ============================================

// Global iteration counters for debug visualization
// Set by volumeRaymarch/volumeRaymarchHQ, read by main shader for heatmap
int g_volumeIterations = 0;
int g_volumeMaxIterations = 0;

// Maximum samples per ray
#define MAX_VOLUME_SAMPLES 128

// Minimum transmittance before early exit
#define MIN_TRANSMITTANCE 0.01

// Minimum density to consider for accumulation
#define MIN_DENSITY 1e-8

// Threshold for considering a sample as "entry" into the volume
#define ENTRY_ALPHA_THRESHOLD 0.01

// Result structure for volume raymarching
// Includes weighted center for temporal reprojection (more stable than entry point)
struct VolumeResult {
    vec3 color;
    float alpha;
    float entryT;         // Distance to first meaningful contribution (-1 if none)
    vec3 weightedCenter;  // Density-weighted center position (for stable reprojection)
    float centerWeight;   // Weight sum for center (0 if no valid center)
};

// Compute time value for animation
float getVolumeTime() {
    return uTime * uTimeScale;
}

// ============================================
// Tetrahedral Gradient Sampling
// ============================================
// Uses symmetric 4-point stencil for combined density+gradient computation
// More accurate than forward differences (O(h^2) vs O(h)) with same sample count

// Tetrahedral stencil vertices (regular tetrahedron, equidistant from origin)
// Normalized to unit distance: each vertex is 1/sqrt(3) from origin
const vec3 TETRA_V0 = vec3(+1.0, +1.0, -1.0) * 0.5773503;
const vec3 TETRA_V1 = vec3(+1.0, -1.0, +1.0) * 0.5773503;
const vec3 TETRA_V2 = vec3(-1.0, +1.0, +1.0) * 0.5773503;
const vec3 TETRA_V3 = vec3(-1.0, -1.0, -1.0) * 0.5773503;

// Result structure for combined density+gradient sampling
struct TetraSample {
    float rho;      // Probability density (averaged from 4 samples)
    float s;        // Log-density (averaged)
    float phase;    // Spatial phase (averaged)
    vec3 gradient;  // Gradient of log-density
};

// Combined density+gradient via tetrahedral finite differences
// Samples 4 points in symmetric tetrahedral pattern
// Returns: averaged density/phase at center + O(h^2) accurate gradient
TetraSample sampleWithTetrahedralGradient(vec3 pos, float t, float delta) {
    // Sample at 4 tetrahedral vertices
    vec3 d0 = sampleDensityWithPhase(pos + TETRA_V0 * delta, t);
    vec3 d1 = sampleDensityWithPhase(pos + TETRA_V1 * delta, t);
    vec3 d2 = sampleDensityWithPhase(pos + TETRA_V2 * delta, t);
    vec3 d3 = sampleDensityWithPhase(pos + TETRA_V3 * delta, t);
    
    // Average for center approximation
    float rho = (d0.x + d1.x + d2.x + d3.x) * 0.25;
    float s = (d0.y + d1.y + d2.y + d3.y) * 0.25;
    float phase = (d0.z + d1.z + d2.z + d3.z) * 0.25;
    
    // Gradient from tetrahedral stencil (scale factor: 3/(4*delta) = 0.75/delta)
    vec3 grad = (TETRA_V0 * d0.y + TETRA_V1 * d1.y + 
                 TETRA_V2 * d2.y + TETRA_V3 * d3.y) * (0.75 / delta);
    
    return TetraSample(rho, s, phase, grad);
}

// Convenience function: gradient-only (for cold path where density already known)
// Still uses 4 tetrahedral samples for symmetric O(h^2) accuracy
vec3 computeGradientTetrahedral(vec3 pos, float t, float delta) {
    float s0 = sFromRho(sampleDensity(pos + TETRA_V0 * delta, t));
    float s1 = sFromRho(sampleDensity(pos + TETRA_V1 * delta, t));
    float s2 = sFromRho(sampleDensity(pos + TETRA_V2 * delta, t));
    float s3 = sFromRho(sampleDensity(pos + TETRA_V3 * delta, t));
    
    return (TETRA_V0 * s0 + TETRA_V1 * s1 + TETRA_V2 * s2 + TETRA_V3 * s3) * (0.75 / delta);
}

// OPTIMIZED (E1): Gradient at pre-flowed position WITHOUT erosion
// - Skips 4 redundant applyFlow calls (already computed)
// - Skips 4 expensive erosion noise evaluations (gradient shape unchanged)
// This reduces erosion calls by ~80% with zero visual impact on lighting.
vec3 computeGradientTetrahedralAtFlowedPos(vec3 flowedPos, float t, float delta) {
    float s0 = sFromRho(sampleDensityAtFlowedPosNoErosion(flowedPos + TETRA_V0 * delta, t));
    float s1 = sFromRho(sampleDensityAtFlowedPosNoErosion(flowedPos + TETRA_V1 * delta, t));
    float s2 = sFromRho(sampleDensityAtFlowedPosNoErosion(flowedPos + TETRA_V2 * delta, t));
    float s3 = sFromRho(sampleDensityAtFlowedPosNoErosion(flowedPos + TETRA_V3 * delta, t));

    return (TETRA_V0 * s0 + TETRA_V1 * s1 + TETRA_V2 * s2 + TETRA_V3 * s3) * (0.75 / delta);
}

// Main volume raymarching function (Fast Mode)
// Now supports lighting (matched to Mandelbulb behavior) but with reduced sample count
// When dispersion is enabled, uses vec3 transmittance for proper per-channel absorption
// Returns: VolumeResult with color, alpha, entry distance, and density-weighted centroid
//
// Fixed sample counts: 64 for HQ, 32 for fast mode
VolumeResult volumeRaymarch(vec3 rayOrigin, vec3 rayDir, float tNear, float tFar) {
    vec3 accColor = vec3(0.0);
    float entryT = -1.0;  // Track first meaningful contribution

    // Centroid accumulation for stable temporal reprojection
    vec3 centroidSum = vec3(0.0);
    float centroidWeight = 0.0;

    // Fixed sample count: 64 for HQ, 32 for fast mode
    int sampleCount = uFastMode ? 32 : 64;

    // Set global max iterations for debug heatmap
    g_volumeMaxIterations = sampleCount;
    g_volumeIterations = 0;

    float stepLen = (tFar - tNear) / float(sampleCount);
    float t = tNear;

    // Time for animation
    float animTime = getVolumeTime();
    vec3 viewDir = -rayDir;

#ifdef USE_DISPERSION
    // Dispersion requires per-channel transmittance for proper wavelength-dependent absorption
    vec3 transmittance3 = vec3(1.0);
    vec3 dispOffsetR = vec3(0.0);
    vec3 dispOffsetB = vec3(0.0);
    bool dispersionActive = uDispersionEnabled && uDispersionStrength > 0.0;

    if (dispersionActive) {
        float dispAmount = uDispersionStrength * 0.15;

        if (uDispersionDirection == 1) { // View-aligned
            // Use alternative up vector when rayDir is nearly vertical to avoid NaN from zero cross product
            vec3 up = abs(rayDir.y) > 0.999 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
            vec3 right = normalize(cross(rayDir, up));
            dispOffsetR = right * dispAmount;
            dispOffsetB = -right * dispAmount;
        }
        // Radial mode: offset updated inside loop
    }
#else
    // Without dispersion, use scalar transmittance for better performance
    float transmittance = 1.0;
#endif

    // Consecutive low-density samples (for early exit)
    int lowDensityCount = 0;
    bool allowEarlyExit = (uQuantumMode == QUANTUM_MODE_HARMONIC);

    for (int i = 0; i < MAX_VOLUME_SAMPLES; i++) {
        if (i >= sampleCount) break;

        // Track iterations for debug visualization
        g_volumeIterations = i + 1;

#ifdef USE_DISPERSION
        // Exit when all channels are blocked
        if (transmittance3.r < MIN_TRANSMITTANCE &&
            transmittance3.g < MIN_TRANSMITTANCE &&
            transmittance3.b < MIN_TRANSMITTANCE) break;
#else
        if (transmittance < MIN_TRANSMITTANCE) break;
#endif

        vec3 pos = rayOrigin + rayDir * t;

#ifdef USE_DISPERSION
        // DISPERSION PATH: Need gradient for R/B channel extrapolation before alpha check
        // Combined density+gradient via tetrahedral sampling (4 samples total)
        TetraSample tetra = sampleWithTetrahedralGradient(pos, animTime, 0.05);
        float rho = tetra.rho;
        float sCenter = tetra.s;
        float phase = tetra.phase;
        vec3 gradient = tetra.gradient;

        // Early exit if density is consistently low (harmonic oscillator only)
        if (allowEarlyExit && rho < MIN_DENSITY) {
            lowDensityCount++;
            if (lowDensityCount > 5) break;
        } else {
            lowDensityCount = 0;
        }

        // Chromatic Dispersion: compute per-channel densities BEFORE alpha check
        // This matches HQ mode structure - dispersion can make R/B visible even when center is dim
        vec3 rhoRGB = vec3(rho);

        if (dispersionActive) {
            // Update radial offset per sample
            if (uDispersionDirection == 0) {
                vec3 normalProxy = normalize(pos);
                float dispAmount = uDispersionStrength * 0.15;
                dispOffsetR = normalProxy * dispAmount;
                dispOffsetB = -normalProxy * dispAmount;
            }

            // Extrapolate log-density for R/B channels using gradient (zero extra cost)
            float s_r = sCenter + dot(gradient, dispOffsetR);
            float s_b = sCenter + dot(gradient, dispOffsetB);

            // Per-channel density from gradient extrapolation
            rhoRGB.r = exp(s_r);
            rhoRGB.b = exp(s_b);
        }

        // Nodal Surface Opacity Boost - apply to ALL channels (matches HQ mode)
        vec3 rhoAlpha = rhoRGB;
#ifdef USE_NODAL
        if (uNodalEnabled) {
             if (sCenter < -5.0 && sCenter > -12.0) {
                 float intensity = 1.0 - smoothstep(-12.0, -5.0, sCenter);
                 rhoAlpha += vec3(5.0 * uNodalStrength * intensity);
             }
        }
#endif

        // Per-channel alpha (matches HQ mode structure)
        vec3 alpha3;
        alpha3.r = computeAlpha(rhoAlpha.r, stepLen, uDensityGain);
        alpha3.g = computeAlpha(rhoAlpha.g, stepLen, uDensityGain);
        alpha3.b = computeAlpha(rhoAlpha.b, stepLen, uDensityGain);

        // Check if ANY channel has significant contribution (matches HQ mode)
        if (alpha3.g > 0.001 || alpha3.r > 0.001 || alpha3.b > 0.001) {
            // Track entry point (use Green/Center channel)
            if (entryT < 0.0 && alpha3.g > ENTRY_ALPHA_THRESHOLD) {
                entryT = t;
            }

            // CENTROID ACCUMULATION (use average)
            float avgAlpha = (alpha3.r + alpha3.g + alpha3.b) / 3.0;
            float avgTrans = (transmittance3.r + transmittance3.g + transmittance3.b) / 3.0;
            float weight = avgAlpha * avgTrans;
            centroidSum += pos * weight;
            centroidWeight += weight;

            // Compute emission from green channel, modulate R/B (matches HQ mode)
            vec3 emissionCenter = computeEmissionLit(rhoRGB.g, phase, pos, gradient, viewDir);
            vec3 emission;
            emission.g = emissionCenter.g;
            emission.r = emissionCenter.r * (rhoRGB.r / max(rhoRGB.g, 0.0001));
            emission.b = emissionCenter.b * (rhoRGB.b / max(rhoRGB.g, 0.0001));

            // Front-to-back compositing with per-channel transmittance
            accColor += transmittance3 * alpha3 * emission;
            transmittance3 *= (vec3(1.0) - alpha3);
        }
#else
        // NON-DISPERSION PATH: LAZY GRADIENT - only compute when visible
        // OPTIMIZED: Use sampleDensityWithPhaseAndFlow to get flowedPos for gradient reuse
        vec3 flowedPos;
        vec3 densityInfo = sampleDensityWithPhaseAndFlow(pos, animTime, flowedPos);
        float rho = densityInfo.x;
        float sCenter = densityInfo.y;
        float phase = densityInfo.z;

        // Early exit if density is consistently low (harmonic oscillator only)
        if (allowEarlyExit && rho < MIN_DENSITY) {
            lowDensityCount++;
            if (lowDensityCount > 5) break;
        } else {
            lowDensityCount = 0;
        }

        float rhoAlpha = rho;
#ifdef USE_NODAL
        if (uNodalEnabled) {
             if (sCenter < -5.0 && sCenter > -12.0) {
                 float intensity = 1.0 - smoothstep(-12.0, -5.0, sCenter);
                 rhoAlpha += 5.0 * uNodalStrength * intensity;
             }
        }
#endif

        float alpha = computeAlpha(rhoAlpha, stepLen, uDensityGain);

        if (alpha > 0.001) {
            if (entryT < 0.0 && alpha > ENTRY_ALPHA_THRESHOLD) {
                entryT = t;
            }

            // CENTROID ACCUMULATION
            float weight = alpha * transmittance;
            centroidSum += pos * weight;
            centroidWeight += weight;

            // Step 2: Compute gradient at flowed position (skips 4 redundant applyFlow calls)
            vec3 gradient = computeGradientTetrahedralAtFlowedPos(flowedPos, animTime, 0.05);

            // Compute emission with lighting
            vec3 emission = computeEmissionLit(rho, phase, pos, gradient, viewDir);

            // Front-to-back compositing (scalar path)
            accColor += transmittance * alpha * emission;
            transmittance *= (1.0 - alpha);
        }
#endif

        t += stepLen;
    }

    // Final alpha
#ifdef USE_DISPERSION
    float finalAlpha = 1.0 - (transmittance3.r + transmittance3.g + transmittance3.b) / 3.0;
#else
    float finalAlpha = 1.0 - transmittance;
#endif

    // Fallback: if no entry found, use midpoint for depth
    if (entryT < 0.0) {
        entryT = (tNear + tFar) * 0.5;
    }

    // Compute final weighted center
    vec3 wCenter = centroidWeight > 0.001
        ? centroidSum / centroidWeight
        : rayOrigin + rayDir * entryT;

    return VolumeResult(accColor, finalAlpha, entryT, wCenter, centroidWeight);
}

// High-quality volume integration with lighting
// OPTIMIZED: Uses tetrahedral gradient sampling (4 samples) for O(h^2) accuracy
//
// Fixed sample counts: 64 for HQ, 32 for fast mode
VolumeResult volumeRaymarchHQ(vec3 rayOrigin, vec3 rayDir, float tNear, float tFar) {
    vec3 accColor = vec3(0.0);
    vec3 transmittance = vec3(1.0); // Now vec3 for chromatic dispersion support
    float entryT = -1.0;  // Track first meaningful contribution

    // Centroid accumulation for stable temporal reprojection
    vec3 centroidSum = vec3(0.0);
    float centroidWeight = 0.0;

    // Fixed sample count: 64 for HQ, 32 for fast mode
    int sampleCount = uFastMode ? 32 : 64;

    // Set global max iterations for debug heatmap
    g_volumeMaxIterations = sampleCount;
    g_volumeIterations = 0;

    float stepLen = (tFar - tNear) / float(sampleCount);
    float t = tNear;

    float animTime = getVolumeTime();
    vec3 viewDir = -rayDir;

#ifdef USE_DISPERSION
    // Dispersion offsets
    vec3 dispOffsetR = vec3(0.0);
    vec3 dispOffsetB = vec3(0.0);

    if (uDispersionEnabled && uDispersionStrength > 0.0) {
        float dispAmount = uDispersionStrength * 0.15; // Increased scale for visibility

        if (uDispersionDirection == 0) { // Radial (from center)
             // Updated inside loop
        } else { // View-aligned
             // Use alternative up vector when rayDir is nearly vertical to avoid NaN from zero cross product
             vec3 up = abs(rayDir.y) > 0.999 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
             vec3 right = normalize(cross(rayDir, up));
             dispOffsetR = right * dispAmount;
             dispOffsetB = -right * dispAmount;
        }
    }
#endif

    for (int i = 0; i < MAX_VOLUME_SAMPLES; i++) {
        if (i >= sampleCount) break;

        // Track iterations for debug visualization
        g_volumeIterations = i + 1;

        // Exit if ALL channels are blocked
        if (transmittance.r < MIN_TRANSMITTANCE && transmittance.g < MIN_TRANSMITTANCE && transmittance.b < MIN_TRANSMITTANCE) break;

        vec3 pos = rayOrigin + rayDir * t;

#ifdef USE_DISPERSION
        // DISPERSION PATH: Need gradient for R/B channel extrapolation before alpha check
        // Radial dispersion update per sample
        if (uDispersionEnabled && uDispersionDirection == 0) {
             vec3 normalProxy = normalize(pos); // From center
             float dispAmount = uDispersionStrength * 0.15;
             dispOffsetR = normalProxy * dispAmount;
             dispOffsetB = -normalProxy * dispAmount;
        }

        // Combined density+gradient via tetrahedral sampling (4 samples total)
        TetraSample tetra = sampleWithTetrahedralGradient(pos, animTime, 0.05);
        float rho = tetra.rho;
        float sCenter = tetra.s;
        float phase = tetra.phase;
        vec3 gradient = tetra.gradient;

        // Chromatic Dispersion Logic
        vec3 rhoRGB = vec3(rho); // Default: all channels same

        if (uDispersionEnabled && uDispersionStrength > 0.0) {
             // Force gradient hack when in fast mode (during rotation)
             // Full sampling (3x density evaluations) is too expensive for interactive use
             bool useFullSampling = (uDispersionQuality == 1) && !uFastMode;
             if (useFullSampling) { // High Quality: Full Sampling
                 vec3 dInfoR = sampleDensityWithPhase(pos + dispOffsetR, animTime);
                 vec3 dInfoB = sampleDensityWithPhase(pos + dispOffsetB, animTime);
                 rhoRGB.r = dInfoR.x;
                 rhoRGB.b = dInfoB.x;
             } else {
                 // Gradient Hack: reuse cached gradient (zero additional cost)
                 float s_r = sCenter + dot(gradient, dispOffsetR);
                 float s_b = sCenter + dot(gradient, dispOffsetB);

                 rhoRGB.r = exp(s_r);
                 rhoRGB.b = exp(s_b);
             }
        }

        // Nodal Surface Opacity Boost
        vec3 rhoAlpha = rhoRGB;

#ifdef USE_NODAL
        if (uNodalEnabled) {
            if (sCenter < -5.0 && sCenter > -12.0) {
                float intensity = 1.0 - smoothstep(-12.0, -5.0, sCenter);
                float boost = 5.0 * uNodalStrength * intensity;
                rhoAlpha += vec3(boost);
            }
        }
#endif

        // Alpha per channel (using boosted density)
        vec3 alpha;
        alpha.r = computeAlpha(rhoAlpha.r, stepLen, uDensityGain);
        alpha.g = computeAlpha(rhoAlpha.g, stepLen, uDensityGain);
        alpha.b = computeAlpha(rhoAlpha.b, stepLen, uDensityGain);

        if (alpha.g > 0.001 || alpha.r > 0.001 || alpha.b > 0.001) {
            // Track entry point (use Green/Center channel)
            if (entryT < 0.0 && alpha.g > ENTRY_ALPHA_THRESHOLD) {
                entryT = t;
            }

            // CENTROID ACCUMULATION
            float avgAlpha = (alpha.r + alpha.g + alpha.b) / 3.0;
            float avgTrans = (transmittance.r + transmittance.g + transmittance.b) / 3.0;
            float weight = avgAlpha * avgTrans;
            centroidSum += pos * weight;
            centroidWeight += weight;

            // Compute emission using ORIGINAL density (rhoRGB) so coloring logic works
            vec3 emissionCenter = computeEmissionLit(rhoRGB.g, phase, pos, gradient, viewDir);

            // Modulate emission for R/B channels based on their density relative to G
            vec3 emission;
            emission.g = emissionCenter.g;
            emission.r = emissionCenter.r * (rhoRGB.r / max(rhoRGB.g, 0.0001));
            emission.b = emissionCenter.b * (rhoRGB.b / max(rhoRGB.g, 0.0001));

            accColor += transmittance * alpha * emission;
            transmittance *= (vec3(1.0) - alpha);
        }
#else
        // NON-DISPERSION PATH: LAZY GRADIENT - only compute when visible
        // OPTIMIZED: Use sampleDensityWithPhaseAndFlow to get flowedPos for gradient reuse
        vec3 flowedPos;
        vec3 densityInfo = sampleDensityWithPhaseAndFlow(pos, animTime, flowedPos);
        float rho = densityInfo.x;
        float sCenter = densityInfo.y;
        float phase = densityInfo.z;

        vec3 rhoAlpha = vec3(rho);

#ifdef USE_NODAL
        if (uNodalEnabled) {
            if (sCenter < -5.0 && sCenter > -12.0) {
                float intensity = 1.0 - smoothstep(-12.0, -5.0, sCenter);
                float boost = 5.0 * uNodalStrength * intensity;
                rhoAlpha += vec3(boost);
            }
        }
#endif

        // Alpha per channel (uniform since no dispersion)
        vec3 alpha;
        alpha.r = computeAlpha(rhoAlpha.r, stepLen, uDensityGain);
        alpha.g = computeAlpha(rhoAlpha.g, stepLen, uDensityGain);
        alpha.b = computeAlpha(rhoAlpha.b, stepLen, uDensityGain);

        if (alpha.g > 0.001 || alpha.r > 0.001 || alpha.b > 0.001) {
            // Track entry point (use Green/Center channel)
            if (entryT < 0.0 && alpha.g > ENTRY_ALPHA_THRESHOLD) {
                entryT = t;
            }

            // CENTROID ACCUMULATION
            float avgAlpha = (alpha.r + alpha.g + alpha.b) / 3.0;
            float avgTrans = (transmittance.r + transmittance.g + transmittance.b) / 3.0;
            float weight = avgAlpha * avgTrans;
            centroidSum += pos * weight;
            centroidWeight += weight;

            // Step 2: Compute gradient at flowed position (skips 4 redundant applyFlow calls)
            vec3 gradient = computeGradientTetrahedralAtFlowedPos(flowedPos, animTime, 0.05);

            // Compute emission (all channels same density since no dispersion)
            vec3 emission = computeEmissionLit(rho, phase, pos, gradient, viewDir);

            accColor += transmittance * alpha * emission;
            transmittance *= (vec3(1.0) - alpha);
        }
#endif

        t += stepLen;
    }

    // Fallback: if no entry found, use midpoint for depth
    if (entryT < 0.0) {
        entryT = (tNear + tFar) * 0.5;
    }

    // Compute final weighted center
    vec3 wCenter = centroidWeight > 0.001
        ? centroidSum / centroidWeight
        : rayOrigin + rayDir * entryT;

    // Final alpha (average or max?)
    // For depth writing and composition, average remaining transmittance?
    float finalAlpha = 1.0 - (transmittance.r + transmittance.g + transmittance.b) / 3.0;

    return VolumeResult(accColor, finalAlpha, entryT, wCenter, centroidWeight);
}
`
