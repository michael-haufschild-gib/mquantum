/**
 * Hydrogen ND for 8D - Hydrogen orbital + 5 HO dimensions
 *
 * Fully unrolled for performance.
 */
export const hydrogenND8dBlock = `
// ============================================
// Hydrogen ND - 8D (5 Extra Dimensions)
// ============================================

vec2 evalHydrogenNDPsi8D(float xND[MAX_DIM], float t) {
    float x0 = xND[0], x1 = xND[1], x2 = xND[2];
    float x3 = xND[3], x4 = xND[4], x5 = xND[5], x6 = xND[6], x7 = xND[7];

    // EARLY EXIT 1: Check extra dimensions first (fast check)
    if (extraDimEarlyExit(5, xND)) {
        return vec2(0.0);
    }

    // PERF: Compute sum of squares for 3D once, reuse for both r8D and r3D
    float sum3D = x0*x0 + x1*x1 + x2*x2;

    // 8D radius
    float r8D = sqrt(sum3D + x3*x3 + x4*x4 + x5*x5 + x6*x6 + x7*x7);

    // EARLY EXIT 2: Check hydrogen radial threshold
    if (hydrogenRadialEarlyExit(r8D, uPrincipalN, uBohrRadius, uAzimuthalL)) {
        return vec2(0.0);
    }

    // PERF: Reuse sum3D for 3D radius computation
    float r3D = sqrt(sum3D);

    vec2 angles = sphericalAngles3D(x0, x1, x2, r3D);
    float theta = angles.x, phi = angles.y;

    float R = hydrogenRadial(uPrincipalN, uAzimuthalL, r8D, uBohrRadius);
    float Y = evalHydrogenNDAngular(uAzimuthalL, uMagneticM, theta, phi, uUseRealOrbitals);

    // Unrolled extra dimension factors
    float ef0 = extraDimFactor(0, x3);
    float ef1 = extraDimFactor(1, x4);
    float ef2 = extraDimFactor(2, x5);
    float ef3 = extraDimFactor(3, x6);
    float ef4 = extraDimFactor(4, x7);
    float extraProduct = ef0 * ef1 * ef2 * ef3 * ef4;

    float psiReal = R * Y * extraProduct;
    return hydrogenNDTimeEvolution(psiReal, uPrincipalN, t);
}
`;
