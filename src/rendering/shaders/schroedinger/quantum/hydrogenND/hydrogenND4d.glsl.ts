/**
 * Hydrogen ND for 4D - Hydrogen orbital + 1 HO dimension
 *
 * Wavefunction: ψ = R_nl(r_4D) × Y_lm(θ,φ) × φ_n3(x3)
 *
 * Fully unrolled for performance - no loops for extra dimension.
 */
export const hydrogenND4dBlock = `
// ============================================
// Hydrogen ND - 4D (1 Extra Dimension)
// ============================================

/**
 * Evaluate Hydrogen ND wavefunction in 4D
 *
 * @param xND - 4-dimensional coordinates array
 * @param t - Time for phase evolution
 * @return vec2(re, im) of wavefunction
 */
vec2 evalHydrogenNDPsi4D(float xND[MAX_DIM], float t) {
    // Extract coordinates
    float x0 = xND[0];
    float x1 = xND[1];
    float x2 = xND[2];
    float x3 = xND[3]; // Extra dimension

    // EARLY EXIT 1: Check extra dimensions first (fast check)
    if (extraDimEarlyExit(1, xND)) {
        return vec2(0.0);
    }

    // PERF: Compute sum of squares for 3D once, reuse for both r4D and r3D
    float sum3D = x0*x0 + x1*x1 + x2*x2;

    // Compute 4D radius for radial decay
    float r4D = sqrt(sum3D + x3*x3);

    // EARLY EXIT 2: Check hydrogen radial threshold
    if (hydrogenRadialEarlyExit(r4D, uPrincipalN, uBohrRadius, uAzimuthalL)) {
        return vec2(0.0);
    }

    // PERF: Reuse sum3D for 3D radius computation
    float r3D = sqrt(sum3D);

    // Spherical angles from first 3 dims
    vec2 angles = sphericalAngles3D(x0, x1, x2, r3D);
    float theta = angles.x;
    float phi = angles.y;

    // Radial part: R_nl(r_4D) with 4D radius
    float R = hydrogenRadial(uPrincipalN, uAzimuthalL, r4D, uBohrRadius);

    // Angular part: Y_lm(theta, phi) from first 3 dims
    float Y = evalHydrogenNDAngular(uAzimuthalL, uMagneticM, theta, phi, uUseRealOrbitals);

    // Extra dimension factor: phi_n3(x3)
    float ef0 = extraDimFactor(0, x3);

    // Combine: psi = R * Y * extraFactor
    float psiReal = R * Y * ef0;

    // Time evolution
    return hydrogenNDTimeEvolution(psiReal, uPrincipalN, t);
}
`;
