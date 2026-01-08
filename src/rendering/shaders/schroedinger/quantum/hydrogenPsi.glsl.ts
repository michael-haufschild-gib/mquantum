/**
 * Full Hydrogen Atom Wavefunction ψ_nlm(r, θ, φ)
 *
 * The complete hydrogen wavefunction is the product of radial
 * and angular parts:
 *   ψ_nlm(r, θ, φ) = R_nl(r) · Y_lm(θ, φ)
 *
 * This module provides:
 * - Cartesian to spherical coordinate conversion
 * - Full wavefunction evaluation at any 3D point
 * - Time evolution via e^{-iEt/ℏ}
 * - Both complex and real (px/py/pz) orbital representations
 *
 * Energy eigenvalues:
 *   E_n = -13.6 eV / n² (in natural units: E_n = -1/(2n²))
 *
 * @see hydrogenRadial.glsl.ts for R_nl
 * @see sphericalHarmonics.glsl.ts for Y_lm
 */
export const hydrogenPsiBlock = `
// ============================================
// Full Hydrogen Wavefunction ψ_nlm
// ============================================

/**
 * Convert Cartesian coordinates to spherical coordinates
 *
 * PERF: Computes x² and y² once, reuses for both r and rho_xy.
 *
 * @param pos - Cartesian position (x, y, z)
 * @return vec3(r, theta, phi) where:
 *   r = radial distance from origin
 *   theta = polar angle from +z axis [0, π]
 *   phi = azimuthal angle from +x axis [0, 2π]
 */
vec3 cartesianToSpherical(vec3 pos) {
    // PERF: Compute squares once, reuse for both r and rho_xy
    float x2 = pos.x * pos.x;
    float y2 = pos.y * pos.y;
    float z2 = pos.z * pos.z;

    float rho_xy_sq = x2 + y2;
    float r = sqrt(rho_xy_sq + z2);

    // Handle origin (avoid division by zero)
    if (r < 1e-10) {
        return vec3(0.0, 0.0, 0.0);
    }

    // θ = polar angle from z-axis [0, π]
    // Using atan2(rho_xy, z) instead of acos(z/r) for numerical stability.
    // acos() loses precision when its argument approaches ±1 (near poles),
    // while atan() remains stable everywhere.
    float rho_xy = sqrt(rho_xy_sq);
    float theta = atan(rho_xy, pos.z);

    // φ = atan2(y, x), azimuthal angle from x-axis
    float phi = atan(pos.y, pos.x);

    // Ensure φ ∈ [0, 2π]
    if (phi < 0.0) {
        phi += 2.0 * PI;
    }

    return vec3(r, theta, phi);
}

// ============================================
// Early Exit Optimization
// ============================================

/**
 * Check if hydrogen radial contribution is negligible
 *
 * The hydrogen radial wavefunction decays as:
 *   R_nl(r) ∝ rho^l * L(rho) * exp(-rho/2)
 * where rho = 2r / (n * a0)
 *
 * At large r, the exponential dominates. For exp(-r/(n*a0)) < 1e-8:
 *   r > 18.4 * n * a0
 *
 * However, the rho^l term grows with r, so we use a conservative
 * threshold that accounts for:
 * - Polynomial growth: rho^l term
 * - Laguerre polynomial oscillations
 * - Density boost: 50 * n^2 * 3^l * dimFactor (up to ~6 million)
 *
 * The formula includes a 25% safety margin above the mathematically
 * required minimum to guarantee zero fidelity loss.
 *
 * PERF: Uses precomputed uHydrogenRadialThreshold uniform instead of
 * computing threshold = 25 * n * a0 * (1 + 0.1*l) per sample.
 *
 * @param r - Radial distance (3D or ND)
 * @param n - Principal quantum number (1-7) - UNUSED, kept for API compatibility
 * @param a0 - Bohr radius scale (0.5-3.0) - UNUSED, kept for API compatibility
 * @param l - Azimuthal quantum number (0 to n-1) - UNUSED, kept for API compatibility
 * @return true if contribution is guaranteed negligible
 */
bool hydrogenRadialEarlyExit(float r, int n, float a0, int l) {
    // PERF: Use precomputed threshold instead of computing per sample
    return r > uHydrogenRadialThreshold;
}

/**
 * Evaluate hydrogen orbital at a 3D Cartesian position
 *
 * Returns the wavefunction as a complex number (vec2).
 * For real orbitals, the imaginary part will be zero.
 *
 * @param pos - Cartesian position (x, y, z)
 * @param n - Principal quantum number (1-7)
 * @param l - Azimuthal quantum number (0 to n-1)
 * @param m - Magnetic quantum number (-l to +l)
 * @param a0 - Bohr radius scale factor
 * @param useReal - Use real spherical harmonics (px/py/pz notation)
 * @return Complex wavefunction ψ as vec2(re, im)
 */
vec2 evalHydrogenPsi(vec3 pos, int n, int l, int m, float a0, bool useReal) {
    // Convert to spherical coordinates
    vec3 sph = cartesianToSpherical(pos);
    float r = sph.x;
    float theta = sph.y;
    float phi = sph.z;

    // EARLY EXIT: Skip if radial contribution is negligible
    // This saves ~15-25% of evaluations for points far from the nucleus
    if (hydrogenRadialEarlyExit(r, n, a0, l)) {
        return vec2(0.0);
    }

    // Radial part R_nl(r)
    float R = hydrogenRadial(n, l, r, a0);

    // Angular part Y_lm(θ, φ)
    if (useReal) {
        // Real spherical harmonics (for px, py, pz, dxy, etc.)
        float Y;
        if (l <= 2) {
            // Use fast direct computation for common orbitals
            Y = fastRealSphericalHarmonic(l, m, theta, phi);
        } else {
            Y = realSphericalHarmonic(l, m, theta, phi, true);
        }
        // Real orbital: ψ is purely real
        return vec2(R * Y, 0.0);
    } else {
        // Complex spherical harmonics
        vec2 Y = sphericalHarmonic(l, m, theta, phi);
        // ψ = R · Y (complex multiplication with real R)
        return R * Y;
    }
}

/**
 * Evaluate hydrogen orbital with time evolution
 *
 * Applies the time-dependent phase factor e^{-iE_n t/ℏ}
 * to create oscillating probability densities (though |ψ|² is time-independent
 * for stationary states, this allows visualization of phase evolution).
 *
 * Energy: E_n = -1/(2n²) in atomic units
 *
 * @param pos - Cartesian position
 * @param n - Principal quantum number
 * @param l - Azimuthal quantum number
 * @param m - Magnetic quantum number
 * @param a0 - Bohr radius
 * @param useReal - Use real orbitals
 * @param t - Time parameter
 * @return Time-evolved ψ(r, t) as vec2(re, im)
 */
vec2 evalHydrogenPsiTime(vec3 pos, int n, int l, int m, float a0, bool useReal, float t) {
    // Static wavefunction
    vec2 psi0 = evalHydrogenPsi(pos, n, l, m, a0, useReal);

    // Energy eigenvalue: E_n = -1/(2n²) in atomic units
    // Scale for visualization (slower evolution)
    float fn = float(n);
    float E = -0.5 / (fn * fn);

    // Time evolution: ψ(t) = ψ(0) · e^{-iEt}
    float phase = -E * t;
    vec2 timeFactor = vec2(cos(phase), sin(phase));

    // Complex multiplication: ψ(t) = ψ(0) · e^{-iEt}
    return cmul(psi0, timeFactor);
}

/**
 * Evaluate hydrogen orbital with spatial phase for coloring
 *
 * Returns wavefunction value and phase information for
 * phase-based coloring schemes.
 *
 * OPTIMIZED: Computes psi0 once and derives time-evolved psi from it,
 * avoiding redundant hydrogenRadial() + sphericalHarmonic() calls.
 *
 * @param pos - Cartesian position
 * @param n, l, m - Quantum numbers
 * @param a0 - Bohr radius
 * @param useReal - Use real orbitals
 * @param t - Time parameter
 * @return vec4(psi.re, psi.im, spatialPhase, magnitude)
 */
vec4 evalHydrogenPsiWithPhase(vec3 pos, int n, int l, int m, float a0, bool useReal, float t) {
    // OPTIMIZED: Compute static wavefunction ONCE
    vec2 psi0 = evalHydrogenPsi(pos, n, l, m, a0, useReal);

    // Spatial phase (at t=0) for stable coloring
    float spatialPhase = atan(psi0.y, psi0.x);

    // Apply time evolution: ψ(t) = ψ(0) · e^{-iEt}
    // Energy eigenvalue: E_n = -1/(2n²) in atomic units
    float fn = float(n);
    float E = -0.5 / (fn * fn);
    float phase = -E * t;
    vec2 timeFactor = vec2(cos(phase), sin(phase));

    // Complex multiplication: ψ(t) = ψ(0) · e^{-iEt}
    vec2 psi = cmul(psi0, timeFactor);

    // Magnitude
    float mag = length(psi);

    return vec4(psi, spatialPhase, mag);
}

/**
 * Compute probability density |ψ|² at a point
 *
 * @param pos - Cartesian position
 * @param n, l, m - Quantum numbers
 * @param a0 - Bohr radius
 * @param useReal - Use real orbitals
 * @return Probability density |ψ|²
 */
float hydrogenProbabilityDensity(vec3 pos, int n, int l, int m, float a0, bool useReal) {
    vec2 psi = evalHydrogenPsi(pos, n, l, m, a0, useReal);
    return dot(psi, psi); // |ψ|² = re² + im²
}
`;
