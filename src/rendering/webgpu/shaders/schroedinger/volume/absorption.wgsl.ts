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
 * Port of GLSL schroedinger/volume/absorption.glsl to WGSL.
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
  // Clamp density to prevent extreme values
  let clampedRho = min(rho, 10.0);

  // Beer-Lambert: alpha = 1 - e^{-sigma*rho*delta_l}
  var exponent = -sigma * clampedRho * stepLen;

  // Clamp exponent to prevent underflow/overflow
  exponent = max(exponent, -20.0);

  return 1.0 - exp(exponent);
}
`
