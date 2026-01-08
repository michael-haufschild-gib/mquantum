/**
 * Hydrogen ND for 5D - Hydrogen orbital + 2 HO dimensions
 *
 * Wavefunction: ψ = R_nl(r_5D) × Y_lm(θ,φ) × φ_n3(x3) × φ_n4(x4)
 *
 * Fully unrolled for performance.
 */
export const hydrogenND5dBlock = `
// ============================================
// Hydrogen ND - 5D (2 Extra Dimensions)
// ============================================

/**
 * Evaluate Hydrogen ND wavefunction in 5D
 *
 * @param xND - 5-dimensional coordinates array
 * @param t - Time for phase evolution
 * @return vec2(re, im) of wavefunction
 */
vec2 evalHydrogenNDPsi5D(float xND[MAX_DIM], float t) {
    // Extract coordinates
    float x0 = xND[0];
    float x1 = xND[1];
    float x2 = xND[2];
    float x3 = xND[3]; // Extra dimension 1
    float x4 = xND[4]; // Extra dimension 2

    // EARLY EXIT 1: Check extra dimensions first (fast check)
    if (extraDimEarlyExit(2, xND)) {
        return vec2(0.0);
    }

    // PERF: Compute sum of squares for 3D once, reuse for both r5D and r3D
    float sum3D = x0*x0 + x1*x1 + x2*x2;

    // Compute 5D radius for radial decay
    float r5D = sqrt(sum3D + x3*x3 + x4*x4);

    // EARLY EXIT 2: Check hydrogen radial threshold
    if (hydrogenRadialEarlyExit(r5D, uPrincipalN, uBohrRadius, uAzimuthalL)) {
        return vec2(0.0);
    }

    // PERF: Reuse sum3D for 3D radius computation
    float r3D = sqrt(sum3D);

    // Spherical angles from first 3 dims
    vec2 angles = sphericalAngles3D(x0, x1, x2, r3D);
    float theta = angles.x;
    float phi = angles.y;

    // Radial part: R_nl(r_5D) with 5D radius
    float R = hydrogenRadial(uPrincipalN, uAzimuthalL, r5D, uBohrRadius);

    // Angular part: Y_lm(theta, phi) from first 3 dims
    float Y = evalHydrogenNDAngular(uAzimuthalL, uMagneticM, theta, phi, uUseRealOrbitals);

    // Unrolled extra dimension factors
    float ef0 = extraDimFactor(0, x3);
    float ef1 = extraDimFactor(1, x4);
    float extraProduct = ef0 * ef1;

    // Combine: psi = R * Y * extraProduct
    float psiReal = R * Y * extraProduct;

    // Time evolution
    return hydrogenNDTimeEvolution(psiReal, uPrincipalN, t);
}
`;
