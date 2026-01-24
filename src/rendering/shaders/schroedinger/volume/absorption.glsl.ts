/**
 * Beer-Lambert absorption for volumetric rendering
 *
 * The Beer-Lambert law describes light absorption through a medium:
 *   I = I_0 · e^{-σρΔl}
 *
 * where:
 *   σ = absorption coefficient (density gain)
 *   ρ = local density
 *   Δl = step length
 *
 * The local opacity (alpha) is:
 *   α = 1 - e^{-σρΔl}
 *
 * And transmittance accumulates as:
 *   T_{n+1} = T_n · (1 - α)
 */
export const absorptionBlock = `
// ============================================
// Beer-Lambert Volume Absorption
// ============================================

// Compute local alpha from density using Beer-Lambert law
// Parameters:
//   rho      - local probability density |ψ|²
//   stepLen  - step length along ray
//   sigma    - absorption coefficient (uDensityGain)
//
// Returns: local opacity [0, 1]
float computeAlpha(float rho, float stepLen, float sigma) {
    // Clamp density to prevent extreme values
    float clampedRho = min(rho, 10.0);

    // Beer-Lambert: α = 1 - e^{-σρΔl}
    float exponent = -sigma * clampedRho * stepLen;

    // Clamp exponent to prevent underflow/overflow
    exponent = max(exponent, -20.0);

    return 1.0 - exp(exponent);
}

// Compute alpha with density boost for low-density regions
// This helps make faint quantum features more visible
float computeAlphaBoost(float rho, float stepLen, float sigma, float boost) {
    // Apply boost to low-density regions
    float boostedRho = rho * (1.0 + boost * exp(-rho * 10.0));
    return computeAlpha(boostedRho, stepLen, sigma);
}
`
