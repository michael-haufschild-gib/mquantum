/**
 * Hydrogen ND for 6D - Hydrogen orbital + 3 HO dimensions
 *
 * Wavefunction: ψ = R_nl(r_6D) × Y_lm(θ,φ) × φ_n3(x3) × φ_n4(x4) × φ_n5(x5)
 *
 * Fully unrolled for performance.
 */
export const hydrogenND6dBlock = `
// ============================================
// Hydrogen ND - 6D (3 Extra Dimensions)
// ============================================

/**
 * Evaluate Hydrogen ND wavefunction in 6D
 *
 * @param xND - 6-dimensional coordinates array
 * @param t - Time for phase evolution
 * @return vec2(re, im) of wavefunction
 */
vec2 evalHydrogenNDPsi6D(float xND[MAX_DIM], float t) {
    // Extract coordinates
    float x0 = xND[0];
    float x1 = xND[1];
    float x2 = xND[2];
    float x3 = xND[3];
    float x4 = xND[4];
    float x5 = xND[5];

    // EARLY EXIT 1: Check extra dimensions first (fast check)
    if (extraDimEarlyExit(3, xND)) {
        return vec2(0.0);
    }

    // PERF: Compute sum of squares for 3D once, reuse for both r6D and r3D
    float sum3D = x0*x0 + x1*x1 + x2*x2;

    // Compute 6D radius for radial decay
    float r6D = sqrt(sum3D + x3*x3 + x4*x4 + x5*x5);

    // EARLY EXIT 2: Check hydrogen radial threshold
    if (hydrogenRadialEarlyExit(r6D, uPrincipalN, uBohrRadius, uAzimuthalL)) {
        return vec2(0.0);
    }

    // PERF: Reuse sum3D for 3D radius computation
    float r3D = sqrt(sum3D);

    // Spherical angles from first 3 dims
    vec2 angles = sphericalAngles3D(x0, x1, x2, r3D);
    float theta = angles.x;
    float phi = angles.y;

    // Radial part with 6D radius
    float R = hydrogenRadial(uPrincipalN, uAzimuthalL, r6D, uBohrRadius);

    // Angular part from first 3 dims
    float Y = evalHydrogenNDAngular(uAzimuthalL, uMagneticM, theta, phi, uUseRealOrbitals);

    // Unrolled extra dimension factors
    float ef0 = extraDimFactor(0, x3);
    float ef1 = extraDimFactor(1, x4);
    float ef2 = extraDimFactor(2, x5);
    float extraProduct = ef0 * ef1 * ef2;

    // Combine
    float psiReal = R * Y * extraProduct;

    // Time evolution
    return hydrogenNDTimeEvolution(psiReal, uPrincipalN, t);
}
`;
