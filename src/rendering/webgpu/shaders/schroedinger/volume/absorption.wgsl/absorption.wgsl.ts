/**
 * WGSL Beer-Lambert absorption for volumetric rendering
 *
 * The Beer-Lambert law describes light absorption through a medium:
 *   I = I_0 * e^{-sigma*rho*delta_l}
 *
 * where:
 *   sigma = absorption coefficient (density gain)
 *   rho = local density
 *   delta_l = step length
 *
 * The local opacity (alpha) is:
 *   alpha = 1 - e^{-sigma*rho*delta_l}
 *
 * And transmittance accumulates as:
 *   T_{n+1} = T_n * (1 - alpha)
 *
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/absorption.wgsl
 */

export const absorptionBlock = /* wgsl */ `
// ============================================
// Beer-Lambert Volume Absorption
// ============================================

/**
 * Compute local alpha from density using Beer-Lambert law.
 *
 * @param rho Local probability density |psi|^2
 * @param stepLen Step length along ray
 * @param sigma Absorption coefficient (densityGain)
 * @return Local opacity [0, 1]
 */
fn computeAlpha(rho: f32, stepLen: f32, sigma: f32) -> f32 {
  // Density ceiling: at σ=10 (max densityGain), step≈0.02 → exponent = -10·10·0.02 = -2.
  // exp(-2)=0.14, well within f32 range. Prevents extreme values from unstable grids.
  let clampedRho = min(rho, 10.0);

  // Beer-Lambert: alpha = 1 - e^{-sigma*rho*delta_l}
  var exponent = -sigma * clampedRho * stepLen;

  // exp(-20)≈2e-9: below f32 mantissa precision for alpha accumulation. Pure underflow guard.
  exponent = max(exponent, -20.0);

  return 1.0 - exp(exponent);
}
`
