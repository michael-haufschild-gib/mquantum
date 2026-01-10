/**
 * Common utilities for Hydrogen ND wavefunction evaluation
 *
 * Provides shared functions for computing:
 * - 3D spherical angles from first 3 dimensions
 * - Angular factor evaluation (Y_lm)
 * - Time evolution
 *
 * REFACTORED: The loop-based functions (extraDimEarlyExit, extraDimFactor,
 * hydrogenNDTimeEvolutionFull) have been moved to hydrogenNDVariants.glsl.ts
 * where they are generated as fully unrolled code at JavaScript level.
 *
 * The hybrid ND hydrogen approach uses:
 * - R_nl(r_ND) for radial decay (using full ND radius)
 * - Y_lm(theta, phi) for angular shape (from first 3 dims)
 * - product of ho1D for extra dimensions (dims 4+)
 */
export const hydrogenNDCommonBlock = `
// ============================================
// Hydrogen ND Common Functions
// ============================================

// Note: QUANTUM_MODE_HYDROGEN_ND is defined in psi.glsl.ts
// to avoid duplicate definitions

/**
 * Compute spherical angles from first 3 dimensions
 *
 * Returns vec2(theta, phi) where:
 * - theta: polar angle from z-axis [0, pi]
 * - phi: azimuthal angle from x-axis [0, 2pi]
 *
 * @param x, y, z - Cartesian coordinates
 * @param r3d - 3D radius (precomputed for efficiency)
 * @return vec2(theta, phi)
 */
vec2 sphericalAngles3D(float x, float y, float z, float r3d) {
    if (r3d < 1e-10) return vec2(0.0, 0.0);

    // theta = arccos(z/r)
    float theta = acos(clamp(z / r3d, -1.0, 1.0));

    // phi = atan2(y, x)
    float phi = atan(y, x);
    if (phi < 0.0) phi += 2.0 * PI;

    return vec2(theta, phi);
}

// Note: hydrogenRadialEarlyExit() is defined in hydrogenPsi.glsl.ts
// and is shared between hydrogen 3D and hydrogen ND modes.

/**
 * Evaluate angular part Y_lm for hydrogen ND
 *
 * Uses the existing spherical harmonic functions.
 *
 * @param l - Azimuthal quantum number
 * @param m - Magnetic quantum number
 * @param theta - Polar angle
 * @param phi - Azimuthal angle
 * @param useReal - Use real orbital representation
 * @return Angular factor value
 */
float evalHydrogenNDAngular(int l, int m, float theta, float phi, bool useReal) {
    if (useReal) {
        // Use fast path for l <= 2, general path otherwise
        return (l <= 2)
            ? fastRealSphericalHarmonic(l, m, theta, phi)
            : realSphericalHarmonic(l, m, theta, phi, true);
    } else {
        // Complex: return magnitude
        vec2 Yc = sphericalHarmonic(l, m, theta, phi);
        return length(Yc);
    }
}

/**
 * Apply time evolution to hydrogen ND wavefunction
 *
 * ψ(t) = ψ(0) * exp(-i * E * t)
 *
 * Energy E_n = -1/(2n²) in atomic units (Hartree).
 *
 * Note: For simplicity, this uses only the hydrogen energy.
 * The extra dimension HO contributions to energy are typically
 * small compared to the hydrogen energy for visualization purposes.
 *
 * @param psiReal - Real part of wavefunction at t=0
 * @param n - Principal quantum number
 * @param t - Time
 * @return vec2(re, im) of time-evolved wavefunction
 */
vec2 hydrogenNDTimeEvolution(float psiReal, int n, float t) {
    // Guard: n must be >= 1 (principal quantum number)
    if (n < 1) return vec2(psiReal, 0.0);
    float fn = float(n);
    float E = -0.5 / (fn * fn);
    float phase = -E * t;
    vec2 timeFactor = vec2(cos(phase), sin(phase));
    return vec2(psiReal * timeFactor.x, psiReal * timeFactor.y);
}
`;
