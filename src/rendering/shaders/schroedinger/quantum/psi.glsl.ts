/**
 * Schrödinger wavefunction evaluation
 *
 * Supports three quantum physics modes:
 *
 * 1. HARMONIC OSCILLATOR (uQuantumMode == 0):
 *    Evaluates the time-dependent wavefunction as a superposition of
 *    harmonic oscillator eigenstates:
 *      ψ(x,t) = Σ_k c_k · Φ_k(x) · e^{-iE_k t}
 *
 * 2. HYDROGEN ORBITAL (uQuantumMode == 1):
 *    Evaluates the hydrogen atom wavefunction:
 *      ψ_nlm(r,θ,φ,t) = R_nl(r) · Y_lm(θ,φ) · e^{-iE_n t}
 *
 * 3. HYDROGEN ND (uQuantumMode == 2):
 *    Evaluates an N-dimensional hydrogen-like wavefunction:
 *      ψ_ND = R_nl(r_D) × Y_lm(θ,φ) × ∏_{j=4}^{D} φ_{nj}(xj)
 *    Uses spherical harmonics for first 3 dims, HO basis for extra dims.
 *
 * The mode is selected via the uQuantumMode uniform.
 */
/**
 * Full psi block with dynamic HO superposition loop.
 * Used when termCount is NOT known at compile time.
 */
export const psiBlock = `
// ============================================
// Wavefunction Evaluation (Mode-Switching)
// ============================================

// Note: MAX_TERMS is defined in schroedingerUniformsBlock

// Quantum mode constants
#define QUANTUM_MODE_HARMONIC 0
#define QUANTUM_MODE_HYDROGEN 1
#define QUANTUM_MODE_HYDROGEN_ND 2

// ----------------------------------------
// Harmonic Oscillator Mode Evaluation (Dynamic Loop)
// ----------------------------------------

// Evaluate harmonic oscillator wavefunction with runtime term count
vec2 evalHarmonicOscillatorPsi(float xND[MAX_DIM], float t) {
    vec2 psi = vec2(0.0);

    for (int k = 0; k < MAX_TERMS; k++) {
        if (k >= uTermCount) break;

        // Time phase factor: e^{-iE_k t}
        float phase = -uEnergy[k] * t;
        vec2 timeFactor = cexp_i(phase);

        // Complex coefficient c_k
        vec2 coeff = uCoeff[k];

        // Combined: c_k · e^{-iE_k t}
        vec2 term = cmul(coeff, timeFactor);

        // Spatial eigenfunction Φ_k(x)
        // Uses compile-time dimension dispatch for loop unrolling optimization
        float spatial = hoNDOptimized(xND, k);

        // Accumulate: ψ += c_k · Φ_k(x) · e^{-iE_k t}
        psi += cscale(spatial, term);
    }

    return psi;
}

// ----------------------------------------
// Unified Evaluation (Mode-Switching)
// ----------------------------------------

// Evaluate wavefunction ψ(x,t) at D-dimensional point xND and time t
// Returns complex value as vec2(re, im)
// Automatically selects between harmonic oscillator, hydrogen orbital, and hydrogen ND modes
vec2 evalPsi(float xND[MAX_DIM], float t) {
#ifdef HYDROGEN_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN) {
        // Hydrogen orbital mode - use first 3 dimensions as Cartesian
        vec3 pos = vec3(xND[0], xND[1], xND[2]);
        return evalHydrogenPsiTime(pos, uPrincipalN, uAzimuthalL, uMagneticM,
                                    uBohrRadius, uUseRealOrbitals, t);
    }
#endif

#ifdef HYDROGEN_ND_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN_ND) {
        // Hydrogen ND mode - use generated dispatch function
        // hydrogenNDOptimized directly calls the dimension-specific unrolled variant
        // Generated at JavaScript level to eliminate preprocessor conditionals
        return hydrogenNDOptimized(xND, t);
    }
#endif

    // Default: Harmonic oscillator mode
    return evalHarmonicOscillatorPsi(xND, t);
}

// Evaluate ψ with phase information for coloring
// Returns: vec3(re, im, phase)
vec3 evalPsiWithPhase(float xND[MAX_DIM], float t) {
    vec2 psi = evalPsi(xND, t);
    float phase = atan(psi.y, psi.x);
    return vec3(psi, phase);
}

// Evaluate spatial-only phase (t=0) for stable coloring
// This gives position-dependent color without time-flickering
// NOTE: Prefer evalPsiWithSpatialPhase() to avoid redundant calculations
float evalSpatialPhase(float xND[MAX_DIM]) {
#ifdef HYDROGEN_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN) {
        vec3 pos = vec3(xND[0], xND[1], xND[2]);
        vec2 psi = evalHydrogenPsi(pos, uPrincipalN, uAzimuthalL, uMagneticM,
                                    uBohrRadius, uUseRealOrbitals);
        return atan(psi.y, psi.x);
    }
#endif

#ifdef HYDROGEN_ND_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN_ND) {
        // Hydrogen ND mode - evaluate at t=0 for spatial phase
        // Uses generated dispatch function (no preprocessor conditionals)
        vec2 psi = hydrogenNDOptimized(xND, 0.0);
        return atan(psi.y, psi.x);
    }
#endif

    // Harmonic oscillator mode
    vec2 psi = vec2(0.0);

    for (int k = 0; k < MAX_TERMS; k++) {
        if (k >= uTermCount) break;

        // No time factor - just spatial part
        vec2 coeff = uCoeff[k];
        // Uses compile-time dimension dispatch for loop unrolling optimization
        float spatial = hoNDOptimized(xND, k);
        psi += cscale(spatial, coeff);
    }

    return atan(psi.y, psi.x);
}

// OPTIMIZED: Evaluate time-dependent ψ AND spatial-only phase in ONE pass
// This computes both the density (from time-dependent |ψ|²) and the
// stable spatial phase (for coloring) without redundant calculations.
// Returns: vec4(psi_time.re, psi_time.im, spatialPhase, unused)
vec4 evalPsiWithSpatialPhase(float xND[MAX_DIM], float t) {
#ifdef HYDROGEN_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN) {
        vec3 pos = vec3(xND[0], xND[1], xND[2]);
        vec4 result = evalHydrogenPsiWithPhase(pos, uPrincipalN, uAzimuthalL, uMagneticM,
                                                uBohrRadius, uUseRealOrbitals, t);
        return vec4(result.xy, result.z, 0.0);
    }
#endif

#ifdef HYDROGEN_ND_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN_ND) {
        // OPTIMIZED: Evaluate spatial wavefunction ONCE (at t=0)
        // For a single eigenstate, |ψ(t)|² = |ψ_spatial|² since time evolution
        // is just a global phase rotation: e^{-iEt} has unit magnitude.
        // This cuts wavefunction evaluation cost in half.
        // Uses generated dispatch function (no preprocessor conditionals)
        vec2 psiSpatial = hydrogenNDOptimized(xND, 0.0);

        // Spatial phase for stable coloring (default)
        float spatialPhase = atan(psiSpatial.y, psiSpatial.x);

        // Phase animation: compute time-dependent phase rotation when enabled
        float outputPhase = spatialPhase;
        if (uPhaseAnimationEnabled) {
            // Use simplified hydrogen energy (extra dimension contributions are small)
            float fn = float(uPrincipalN);
            float E = -0.5 / (fn * fn);  // Hydrogen ground state energy

            // phase(t) = phase_spatial - E * t
            outputPhase = spatialPhase - E * t;
        }

        // Return spatial wavefunction (density unchanged) with animated phase
        return vec4(psiSpatial, outputPhase, 0.0);
    }
#endif

    // Harmonic oscillator mode
    vec2 psiTime = vec2(0.0);    // Time-dependent for density
    vec2 psiSpatial = vec2(0.0); // Spatial-only for stable phase

    for (int k = 0; k < MAX_TERMS; k++) {
        if (k >= uTermCount) break;

        // Spatial eigenfunction - computed ONCE per term
        // Uses compile-time dimension dispatch for loop unrolling optimization
        float spatial = hoNDOptimized(xND, k);

        // Complex coefficient c_k
        vec2 coeff = uCoeff[k];

        // Spatial-only accumulation (no time factor)
        psiSpatial += cscale(spatial, coeff);

        // Time-dependent accumulation
        float phase = -uEnergy[k] * t;
        vec2 timeFactor = cexp_i(phase);
        vec2 term = cmul(coeff, timeFactor);
        psiTime += cscale(spatial, term);
    }

    float spatialPhase = atan(psiSpatial.y, psiSpatial.x);
    return vec4(psiTime, spatialPhase, 0.0);
}
`

/**
 * Dynamic psi block - assumes evalHarmonicOscillatorPsi is provided externally.
 * Used when termCount IS known at compile time and HO superposition is unrolled.
 * The unrolled dispatch block provides evalHarmonicOscillatorPsi, evalHOSpatialOnly,
 * and evalHOCombinedPsi functions.
 */
export const psiBlockDynamic = `
// ============================================
// Wavefunction Evaluation (Mode-Switching)
// HO functions provided by unrolled dispatch block
// ============================================

// Note: MAX_TERMS is defined in schroedingerUniformsBlock

// Quantum mode constants
#define QUANTUM_MODE_HARMONIC 0
#define QUANTUM_MODE_HYDROGEN 1
#define QUANTUM_MODE_HYDROGEN_ND 2

// Note: evalHarmonicOscillatorPsi is provided by HO Dispatch (Unrolled) block

// ----------------------------------------
// Unified Evaluation (Mode-Switching)
// ----------------------------------------

// Evaluate wavefunction ψ(x,t) at D-dimensional point xND and time t
// Returns complex value as vec2(re, im)
// Automatically selects between harmonic oscillator, hydrogen orbital, and hydrogen ND modes
vec2 evalPsi(float xND[MAX_DIM], float t) {
#ifdef HYDROGEN_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN) {
        // Hydrogen orbital mode - use first 3 dimensions as Cartesian
        vec3 pos = vec3(xND[0], xND[1], xND[2]);
        return evalHydrogenPsiTime(pos, uPrincipalN, uAzimuthalL, uMagneticM,
                                    uBohrRadius, uUseRealOrbitals, t);
    }
#endif

#ifdef HYDROGEN_ND_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN_ND) {
        // Hydrogen ND mode - use generated dispatch function
        return hydrogenNDOptimized(xND, t);
    }
#endif

    // Default: Harmonic oscillator mode (unrolled version)
    return evalHarmonicOscillatorPsi(xND, t);
}

// Evaluate ψ with phase information for coloring
// Returns: vec3(re, im, phase)
vec3 evalPsiWithPhase(float xND[MAX_DIM], float t) {
    vec2 psi = evalPsi(xND, t);
    float phase = atan(psi.y, psi.x);
    return vec3(psi, phase);
}

// Evaluate spatial-only phase (t=0) for stable coloring
float evalSpatialPhase(float xND[MAX_DIM]) {
#ifdef HYDROGEN_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN) {
        vec3 pos = vec3(xND[0], xND[1], xND[2]);
        vec2 psi = evalHydrogenPsi(pos, uPrincipalN, uAzimuthalL, uMagneticM,
                                    uBohrRadius, uUseRealOrbitals);
        return atan(psi.y, psi.x);
    }
#endif

#ifdef HYDROGEN_ND_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN_ND) {
        vec2 psi = hydrogenNDOptimized(xND, 0.0);
        return atan(psi.y, psi.x);
    }
#endif

    // Harmonic oscillator mode - use unrolled spatial function
    vec2 psi = evalHOSpatialOnly(xND);
    return atan(psi.y, psi.x);
}

// OPTIMIZED: Evaluate time-dependent ψ AND spatial-only phase in ONE pass
vec4 evalPsiWithSpatialPhase(float xND[MAX_DIM], float t) {
#ifdef HYDROGEN_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN) {
        vec3 pos = vec3(xND[0], xND[1], xND[2]);
        vec4 result = evalHydrogenPsiWithPhase(pos, uPrincipalN, uAzimuthalL, uMagneticM,
                                                uBohrRadius, uUseRealOrbitals, t);
        return vec4(result.xy, result.z, 0.0);
    }
#endif

#ifdef HYDROGEN_ND_MODE_ENABLED
    if (uQuantumMode == QUANTUM_MODE_HYDROGEN_ND) {
        vec2 psiSpatial = hydrogenNDOptimized(xND, 0.0);
        float spatialPhase = atan(psiSpatial.y, psiSpatial.x);
        float outputPhase = spatialPhase;
        if (uPhaseAnimationEnabled) {
            float fn = float(uPrincipalN);
            float E = -0.5 / (fn * fn);
            outputPhase = spatialPhase - E * t;
        }
        return vec4(psiSpatial, outputPhase, 0.0);
    }
#endif

    // Harmonic oscillator mode - use unrolled combined function
    return evalHOCombinedPsi(xND, t);
}
`
