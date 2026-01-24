/**
 * Probability density field calculations
 *
 * The probability density is:
 *   ρ(x,t) = |ψ(x,t)|² = ψ*ψ = re² + im²
 *
 * For rendering stability and better dynamic range, we often use
 * log-density:
 *   s(x,t) = log(ρ + ε)
 *
 * This compresses the large range of ρ values and provides
 * better numerical stability for gradient computation.
 */

/**
 * First part of density block - noise and flow functions (before mapPosToND)
 */
export const densityPreMapBlock = `
// ============================================
// Noise & Erosion Functions
// ============================================

// OPTIMIZED: Integer bit-manipulation hash (A1)
// ~10× faster than sin()-based hash - uses WebGL2 uvec3 operations
// Produces statistically equivalent randomness without expensive transcendentals
vec3 hash33(vec3 p) {
    uvec3 q = uvec3(ivec3(floor(p))) * uvec3(1597334673U, 3812015801U, 2798796415U);
    q = (q.x ^ q.y ^ q.z) * uvec3(1597334673U, 3812015801U, 2798796415U);
    return -1.0 + 2.0 * vec3(q) * (1.0 / float(0xffffffffU));
}

// 3D Perlin/Gradient Noise
float gradientNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    
    return mix(mix(mix(dot(hash33(i + vec3(0,0,0)), f - vec3(0,0,0)),
                       dot(hash33(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                   mix(dot(hash33(i + vec3(0,1,0)), f - vec3(0,1,0)),
                       dot(hash33(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
               mix(mix(dot(hash33(i + vec3(0,0,1)), f - vec3(0,0,1)),
                       dot(hash33(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                   mix(dot(hash33(i + vec3(0,1,1)), f - vec3(0,1,1)),
                       dot(hash33(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
}

// ============================================
// Worley Noise - HQ vs Fast variants
// ============================================

#ifdef EROSION_HQ
// HQ: Full 3×3×3 cell search (27 neighbors)
// Higher quality but ~3.4× slower than 2×2×2
// Unrolled for GPU - no loop overhead
float worleyNoiseSquared(vec3 p) {
    vec3 id = floor(p);
    vec3 f = fract(p);
    float m = 1e20;

    // Layer z = -1
    vec3 d = vec3(-1,-1,-1) + hash33(id + vec3(-1,-1,-1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 0,-1,-1) + hash33(id + vec3( 0,-1,-1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 1,-1,-1) + hash33(id + vec3( 1,-1,-1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3(-1, 0,-1) + hash33(id + vec3(-1, 0,-1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 0, 0,-1) + hash33(id + vec3( 0, 0,-1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 1, 0,-1) + hash33(id + vec3( 1, 0,-1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3(-1, 1,-1) + hash33(id + vec3(-1, 1,-1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 0, 1,-1) + hash33(id + vec3( 0, 1,-1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 1, 1,-1) + hash33(id + vec3( 1, 1,-1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));

    // Layer z = 0
    d = vec3(-1,-1, 0) + hash33(id + vec3(-1,-1, 0)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 0,-1, 0) + hash33(id + vec3( 0,-1, 0)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 1,-1, 0) + hash33(id + vec3( 1,-1, 0)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3(-1, 0, 0) + hash33(id + vec3(-1, 0, 0)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 0, 0, 0) + hash33(id + vec3( 0, 0, 0)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 1, 0, 0) + hash33(id + vec3( 1, 0, 0)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3(-1, 1, 0) + hash33(id + vec3(-1, 1, 0)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 0, 1, 0) + hash33(id + vec3( 0, 1, 0)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 1, 1, 0) + hash33(id + vec3( 1, 1, 0)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));

    // Layer z = 1
    d = vec3(-1,-1, 1) + hash33(id + vec3(-1,-1, 1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 0,-1, 1) + hash33(id + vec3( 0,-1, 1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 1,-1, 1) + hash33(id + vec3( 1,-1, 1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3(-1, 0, 1) + hash33(id + vec3(-1, 0, 1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 0, 0, 1) + hash33(id + vec3( 0, 0, 1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 1, 0, 1) + hash33(id + vec3( 1, 0, 1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3(-1, 1, 1) + hash33(id + vec3(-1, 1, 1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 0, 1, 1) + hash33(id + vec3( 0, 1, 1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));
    d = vec3( 1, 1, 1) + hash33(id + vec3( 1, 1, 1)) * 0.5 + 0.5 - f; m = min(m, dot(d,d));

    return m;
}
#else
// Fast: 2×2×2 octant search (8 neighbors) - B1 + B2 optimizations
// Only searches 8 neighbors based on which octant we're in
// Returns squared distance, sqrt deferred to caller
// Fully unrolled - no loop overhead on GPU
float worleyNoiseSquared(vec3 p) {
    vec3 id = floor(p);
    vec3 f = fract(p);

    // B1: Determine which octant of the cell we're in
    vec3 o = step(0.5, f) - 1.0; // -1 or 0 for each axis

    // Unrolled 8 neighbor checks (2×2×2)
    vec3 d0 = o + hash33(id + o) * 0.5 + 0.5 - f;
    vec3 d1 = o + vec3(1,0,0) + hash33(id + o + vec3(1,0,0)) * 0.5 + 0.5 - f;
    vec3 d2 = o + vec3(0,1,0) + hash33(id + o + vec3(0,1,0)) * 0.5 + 0.5 - f;
    vec3 d3 = o + vec3(1,1,0) + hash33(id + o + vec3(1,1,0)) * 0.5 + 0.5 - f;
    vec3 d4 = o + vec3(0,0,1) + hash33(id + o + vec3(0,0,1)) * 0.5 + 0.5 - f;
    vec3 d5 = o + vec3(1,0,1) + hash33(id + o + vec3(1,0,1)) * 0.5 + 0.5 - f;
    vec3 d6 = o + vec3(0,1,1) + hash33(id + o + vec3(0,1,1)) * 0.5 + 0.5 - f;
    vec3 d7 = o + vec3(1,1,1) + hash33(id + o + vec3(1,1,1)) * 0.5 + 0.5 - f;

    // Find minimum squared distance
    float m = dot(d0, d0);
    m = min(m, dot(d1, d1));
    m = min(m, dot(d2, d2));
    m = min(m, dot(d3, d3));
    m = min(m, dot(d4, d4));
    m = min(m, dot(d5, d5));
    m = min(m, dot(d6, d6));
    m = min(m, dot(d7, d7));

    return m;
}
#endif

// Unified Noise Function based on type (D4: compile-time selection available)
// 0=Worley (Billowy), 1=Perlin (Smooth), 2=Hybrid
// When EROSION_NOISE_TYPE is defined, compiler eliminates dead branches
#ifdef EROSION_NOISE_TYPE
float getErosionNoise(vec3 p) {
    #if EROSION_NOISE_TYPE == 0
        // Worley: sqrt of squared distance, inverted for billowy clouds
        return 1.0 - sqrt(worleyNoiseSquared(p));
    #elif EROSION_NOISE_TYPE == 1
        // Perlin: -1 to 1. Map to 0..1
        return gradientNoise(p) * 0.5 + 0.5;
    #else
        // Hybrid: Perlin-Worley
        float pN = gradientNoise(p) * 0.5 + 0.5;
        float wN = 1.0 - sqrt(worleyNoiseSquared(p * 2.0));
        return mix(pN, wN, 0.5);
    #endif
}
#else
// Runtime fallback when noise type not known at compile time
float getErosionNoise(vec3 p, int type) {
    if (type == 0) {
        // Worley: sqrt of squared distance, inverted for billowy clouds
        return 1.0 - sqrt(worleyNoiseSquared(p));
    } else if (type == 1) {
        // Perlin: -1 to 1. Map to 0..1
        return gradientNoise(p) * 0.5 + 0.5;
    } else {
        // Hybrid: Perlin-Worley
        float pN = gradientNoise(p) * 0.5 + 0.5;
        float wN = 1.0 - sqrt(worleyNoiseSquared(p * 2.0));
        return mix(pN, wN, 0.5);
    }
}
#endif

// ============================================
// Curl Distortion - HQ vs Fast variants
// ============================================

#ifdef EROSION_HQ
// HQ: Full 4-sample curl (analytically correct divergence-free flow)
// Computes true curl of gradient noise field using finite differences
vec3 distortPosition(vec3 p, float strength) {
    if (strength < 0.1) return p; // C3: Skip when visually imperceptible

    float eps = 0.01;

    // Sample gradient noise at 4 offset positions for true curl computation
    // curl = nabla × F = (dFz/dy - dFy/dz, dFx/dz - dFz/dx, dFy/dx - dFx/dy)
    float nx = gradientNoise(p + vec3(eps, 0.0, 0.0));
    float ny = gradientNoise(p + vec3(0.0, eps, 0.0));
    float nz = gradientNoise(p + vec3(0.0, 0.0, eps));
    float n0 = gradientNoise(p);

    // Finite difference approximation of curl
    vec3 curl = vec3(
        (ny - n0) - (nz - n0),  // dz/dy - dy/dz
        (nz - n0) - (nx - n0),  // dx/dz - dz/dx
        (nx - n0) - (ny - n0)   // dy/dx - dx/dy
    ) / eps;

    return p + curl * strength * 0.1;
}
#else
// Fast: Pseudo-curl with 2 samples (C2 + C3 optimizations)
// Uses 2 noise samples instead of 4 (~2× faster)
// Produces slightly different but visually equivalent swirling motion
vec3 distortPosition(vec3 p, float strength) {
    if (strength < 0.1) return p; // C3: Skip when visually imperceptible

    // C2: Pseudo-curl with only 2 noise samples
    // Sample at two offset positions to create rotational displacement
    float n1 = gradientNoise(p + vec3(0.1, 0.0, 0.0));
    float n2 = gradientNoise(p + vec3(0.0, 0.1, 0.0));

    // Create pseudo-curl displacement (divergence-free-ish rotation)
    // This approximates curl behavior with half the samples
    vec3 displacement = vec3(
        n2,           // X displacement from Y-offset sample
        -n1,          // Y displacement from X-offset sample (negated for rotation)
        n1 - n2       // Z displacement from difference (adds turbulence)
    );

    return p + displacement * strength;
}
#endif

// Erode density based on noise
// OPTIMIZED: Early exits for invisible (D1) and core (D2) samples
#ifdef USE_EROSION
float erodeDensity(float rho, vec3 pos) {
    // Early exit: erosion disabled
    if (uErosionStrength <= 0.001) return rho;

    // D1: Skip erosion for very low density (invisible samples)
    // These contribute negligibly to final image - no point computing expensive noise
    if (rho < 0.001) return rho;

    // D2: Skip erosion for high-density core
    // Edge erosion is meant for edges - dense core is unaffected anyway
    // Threshold ~2.0 corresponds to densitySignal ~0.7 where erosion has minimal effect
    if (rho > 2.0) return rho;

    // Scale position for noise
    vec3 noisePos = pos * uErosionScale;

    // Add turbulence/distortion (C3 threshold handled inside distortPosition)
    if (uErosionTurbulence > 0.0) {
        // Animate swirl
        float t = uTime * uTimeScale * 0.2;
        noisePos += vec3(0.0, -t, 0.0); // Simple scroll
        noisePos = distortPosition(noisePos, uErosionTurbulence);
    }

    // Sample noise (D4: uses compile-time or runtime selection)
    #ifdef EROSION_NOISE_TYPE
    float noise = getErosionNoise(noisePos);
    #else
    float noise = getErosionNoise(noisePos, uErosionNoiseType);
    #endif

    // Erosion logic: erode edges more than core
    // Normalized density proxy (approx 0-1)
    float densitySignal = clamp(log(rho + 1.0) / 4.0, 0.0, 1.0);

    // Erosion factor increases at low density
    float erosionFactor = uErosionStrength * (1.0 - densitySignal * 0.5);

    // Direct subtraction in linear space
    float erodedRho = max(0.0, rho - noise * uErosionStrength * 2.0);

    // Smooth blending to avoid hard cuts
    return mix(rho, erodedRho, uErosionStrength);
}
#else
float erodeDensity(float rho, vec3 pos) { return rho; }
#endif

// Procedural Curl Noise (Divergence Free)
// Uses distortPosition which computes a pseudo-curl via gradient cross product
#ifdef USE_CURL
vec3 curlNoise(vec3 p) {
    return distortPosition(p, 1.0) - p;
}

// Apply Curl Noise Flow to position
vec3 applyFlow(vec3 pos, float t) {
    if (!uCurlEnabled || uCurlStrength <= 0.001) return pos;

    vec3 flowPos = pos * uCurlScale + vec3(0.0, 0.0, t * uCurlSpeed * 0.2);

    // Base curl vector
    vec3 curl = curlNoise(flowPos);

    // Apply bias
    if (uCurlBias == 1) { // Upward
        curl += vec3(0.0, 1.0, 0.0) * 0.5;
    } else if (uCurlBias == 2) { // Outward
        curl += normalize(pos) * 0.5;
    } else if (uCurlBias == 3) { // Inward
        curl -= normalize(pos) * 0.5;
    }

    // Distort sampling position by the curl vector
    // This means we sample from 'pos + offset'
    // If flow moves UP, density at P comes from P - Velocity?
    // Advection: new_density(x) = old_density(x - v*dt)
    // Here we are mapping: space -> density.
    // If we want the cloud to "move up", we should sample "down".
    // So pos - curl.

    return pos - curl * uCurlStrength;
}
#else
vec3 applyFlow(vec3 pos, float t) { return pos; }
#endif
`

/**
 * Generate dimension-specific mapPosToND function.
 * Following mandelbulb pattern: generate exact code at JS level, no preprocessor conditionals.
 * @param dimension - The dimension (3-11)
 * @returns GLSL mapPosToND function for the specified dimension
 */
export function generateMapPosToND(dimension: number): string {
  const dim = Math.min(Math.max(dimension, 3), 11)

  // Generate unrolled coordinate assignments
  const assignments = []
  for (let j = 0; j < dim; j++) {
    assignments.push(
      `    xND[${j}] = (uOrigin[${j}] + pos.x*uBasisX[${j}] + pos.y*uBasisY[${j}] + pos.z*uBasisZ[${j}]) * uFieldScale;`
    )
  }

  // Zero out remaining dimensions if not at MAX_DIM
  const zeroLoop = dim < 11 ? `\n    for (int j = ${dim}; j < MAX_DIM; j++) xND[j] = 0.0;` : ''

  return `
// ============================================
// Dimension-Specific Coordinate Mapping (Unrolled)
// Dimension: ${dim}
// ============================================

// Maps 3D position to ND coordinates using rotated basis vectors.
// Unrolled for dimension ${dim} - no runtime branching.
void mapPosToND(vec3 pos, out float xND[MAX_DIM]) {
${assignments.join('\n')}${zeroLoop}
}
`
}

/**
 * Second part of density block - density calculations (after mapPosToND)
 */
export const densityPostMapBlock = `
// ============================================
// Density Field Calculations
// ============================================

// Small epsilon to prevent log(0)
#define DENSITY_EPS 1e-8

// Compute probability density ρ = |ψ|²
float rhoFromPsi(vec2 psi) {
    return dot(psi, psi); // re² + im²
}

// Compute log-density for stability and dynamic range
// s = log(ρ + ε)
float sFromRho(float rho) {
    return log(rho + DENSITY_EPS);
}

// Compute both ρ and s efficiently
vec2 densityPair(vec2 psi) {
    float rho = rhoFromPsi(psi);
    float s = sFromRho(rho);
    return vec2(rho, s);
}

// Sample density at a 3D position, mapping through ND basis
// This is the primary entry point for volume rendering
float sampleDensity(vec3 pos, float t) {
    // Apply Animated Flow (Curl Noise)
    // We warp the sampling position 'pos' before mapping to ND space
    vec3 flowedPos = applyFlow(pos, t);

    // Map 3D position to ND coordinates (uses unrolled dimension-specific mapping)
    float xND[MAX_DIM];
    mapPosToND(flowedPos, xND);

    // Evaluate wavefunction and density
    vec2 psi = evalPsi(xND, t);
    float rho = rhoFromPsi(psi);

    // Hydrogen orbital density boost
    // Hydrogen wavefunctions have much smaller local density values than
    // harmonic oscillator superpositions due to different normalization.
    // Boost the density to make hydrogen orbitals visible with same gain settings.
    // PERF: Uses precomputed uHydrogenBoost uniform instead of pow(3.0, fl) per sample
#ifdef HYDROGEN_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN) {
        rho *= uHydrogenBoost;
    }
#endif

    // Hydrogen ND density boost
    // ND hydrogen has additional decay from extra dimensions, requiring more aggressive boost
    // PERF: Uses precomputed uHydrogenNDBoost uniform instead of pow(3.0, fl) per sample
#ifdef HYDROGEN_ND_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN_ND) {
        rho *= uHydrogenNDBoost;
    }
#endif

    // Apply Edge Erosion
    rho = erodeDensity(rho, flowedPos);

    return rho;
}

// Sample density with phase information for coloring
// Returns: vec3(rho, logRho, spatialPhase)
// Note: Uses spatial-only phase for stable coloring (no time flicker)
// OPTIMIZED: Uses single-pass evalPsiWithSpatialPhase to avoid redundant hoND calls
vec3 sampleDensityWithPhase(vec3 pos, float t) {
    // Apply Animated Flow (Curl Noise)
    vec3 flowedPos = applyFlow(pos, t);

    // Map 3D position to ND coordinates (uses unrolled dimension-specific mapping)
    float xND[MAX_DIM];
    mapPosToND(flowedPos, xND);

    // OPTIMIZED: Single-pass evaluation for both time-dependent density and spatial phase
    // This avoids calling hoND() twice per sample point
    vec4 psiResult = evalPsiWithSpatialPhase(xND, t);
    vec2 psi = psiResult.xy;
    float spatialPhase = psiResult.z;

    float rho = rhoFromPsi(psi);

    // Hydrogen orbital density boost
    // PERF: Uses precomputed uHydrogenBoost uniform
#ifdef HYDROGEN_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN) {
        rho *= uHydrogenBoost;
    }
#endif

    // Hydrogen ND density boost
    // PERF: Uses precomputed uHydrogenNDBoost uniform
#ifdef HYDROGEN_ND_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN_ND) {
        rho *= uHydrogenNDBoost;
    }
#endif

    // Apply Edge Erosion
    rho = erodeDensity(rho, flowedPos);

#ifdef USE_SHIMMER
    // Uncertainty Shimmer
    if (uShimmerEnabled && uShimmerStrength > 0.0) {
        // Only shimmer at low densities (edges)
        if (rho > 0.001 && rho < 0.5) {
            float time = uTime * uTimeScale;
            // High frequency noise for shimmer
            vec3 noisePos = flowedPos * 5.0 + vec3(0.0, 0.0, time * 2.0);
            float shimmer = gradientNoise(noisePos);

            // Map to positive perturbation
            shimmer = shimmer * 0.5 + 0.5;

            // Strength inversely proportional to density (more uncertainty where probability is low)
            float uncertainty = 1.0 - clamp(rho * 2.0, 0.0, 1.0);

            rho *= (1.0 + (shimmer - 0.5) * uShimmerStrength * uncertainty);
        }
    }
#endif

    float s = sFromRho(rho);

    return vec3(rho, s, spatialPhase);
}

// Sample density with phase, also returning the flowed position for gradient reuse
// Returns: vec3(rho, logRho, spatialPhase)
// Out: flowedPosOut - the curl-flowed position for use in gradient sampling
// OPTIMIZED: Allows gradient computation to skip redundant applyFlow() calls
vec3 sampleDensityWithPhaseAndFlow(vec3 pos, float t, out vec3 flowedPosOut) {
    // Apply Animated Flow (Curl Noise) - computed once and returned
    vec3 flowedPos = applyFlow(pos, t);
    flowedPosOut = flowedPos;

    // Map 3D position to ND coordinates (uses unrolled dimension-specific mapping)
    float xND[MAX_DIM];
    mapPosToND(flowedPos, xND);

    // OPTIMIZED: Single-pass evaluation for both time-dependent density and spatial phase
    vec4 psiResult = evalPsiWithSpatialPhase(xND, t);
    vec2 psi = psiResult.xy;
    float spatialPhase = psiResult.z;

    float rho = rhoFromPsi(psi);

    // Hydrogen orbital density boost
    // PERF: Uses precomputed uHydrogenBoost uniform
#ifdef HYDROGEN_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN) {
        rho *= uHydrogenBoost;
    }
#endif

    // Hydrogen ND density boost
    // PERF: Uses precomputed uHydrogenNDBoost uniform
#ifdef HYDROGEN_ND_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN_ND) {
        rho *= uHydrogenNDBoost;
    }
#endif

    // Apply Edge Erosion
    rho = erodeDensity(rho, flowedPos);

#ifdef USE_SHIMMER
    // Uncertainty Shimmer
    if (uShimmerEnabled && uShimmerStrength > 0.0) {
        if (rho > 0.001 && rho < 0.5) {
            float time = uTime * uTimeScale;
            vec3 noisePos = flowedPos * 5.0 + vec3(0.0, 0.0, time * 2.0);
            float shimmer = gradientNoise(noisePos);
            shimmer = shimmer * 0.5 + 0.5;
            float uncertainty = 1.0 - clamp(rho * 2.0, 0.0, 1.0);
            rho *= (1.0 + (shimmer - 0.5) * uShimmerStrength * uncertainty);
        }
    }
#endif

    float s = sFromRho(rho);

    return vec3(rho, s, spatialPhase);
}

// Sample density at a pre-flowed position (skips applyFlow)
// Use this for gradient sampling when flowedPos is already computed
// OPTIMIZED: Saves 4 expensive applyFlow() calls per visible sample in gradient computation
float sampleDensityAtFlowedPos(vec3 flowedPos, float t) {
    // Map pre-flowed 3D position to ND coordinates
    float xND[MAX_DIM];
    mapPosToND(flowedPos, xND);

    // Evaluate wavefunction and density
    vec2 psi = evalPsi(xND, t);
    float rho = rhoFromPsi(psi);

    // Hydrogen orbital density boost
    // PERF: Uses precomputed uHydrogenBoost uniform
#ifdef HYDROGEN_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN) {
        rho *= uHydrogenBoost;
    }
#endif

    // Hydrogen ND density boost
    // PERF: Uses precomputed uHydrogenNDBoost uniform
#ifdef HYDROGEN_ND_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN_ND) {
        rho *= uHydrogenNDBoost;
    }
#endif

    // Apply Edge Erosion (using flowedPos since it's already flowed)
    rho = erodeDensity(rho, flowedPos);

    return rho;
}

// E1 OPTIMIZATION: Sample density WITHOUT erosion for gradient computation
// Gradient samples only affect lighting direction, not density values.
// Skipping erosion here saves 4 expensive noise evaluations per visible sample.
// This reduces erosion calls by ~80% with zero visual impact on lighting.
float sampleDensityAtFlowedPosNoErosion(vec3 flowedPos, float t) {
    // Map pre-flowed 3D position to ND coordinates
    float xND[MAX_DIM];
    mapPosToND(flowedPos, xND);

    // Evaluate wavefunction and density
    vec2 psi = evalPsi(xND, t);
    float rho = rhoFromPsi(psi);

    // Hydrogen orbital density boost (still needed for correct gradient magnitude)
    // PERF: Uses precomputed uHydrogenBoost uniform
#ifdef HYDROGEN_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN) {
        rho *= uHydrogenBoost;
    }
#endif

    // PERF: Uses precomputed uHydrogenNDBoost uniform
#ifdef HYDROGEN_ND_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN_ND) {
        rho *= uHydrogenNDBoost;
    }
#endif

    // NO erosion applied - gradient shape from base wavefunction is sufficient
    return rho;
}
`

/**
 * Legacy combined block - kept for backwards compatibility
 * @deprecated Use densityPreMapBlock + generateMapPosToND(dim) + densityPostMapBlock instead
 */
export const densityBlock =
  densityPreMapBlock +
  `
// Fallback: generic loop-based mapping
void mapPosToND(vec3 pos, out float xND[MAX_DIM]) {
    for (int j = 0; j < MAX_DIM; j++) {
        if (j >= uDimension) {
            xND[j] = 0.0;
        } else {
            xND[j] = (uOrigin[j]
                   + pos.x * uBasisX[j]
                   + pos.y * uBasisY[j]
                   + pos.z * uBasisZ[j]) * uFieldScale;
        }
    }
}
` +
  densityPostMapBlock
