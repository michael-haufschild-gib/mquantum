/**
 * WGSL radial probability overlay for hydrogen orbitals.
 *
 * Computes P(r) = 4πr²|R_nl(r)|² and renders it as semi-transparent
 * spherical shell emission during volume raymarching.
 *
 * Uses the existing hydrogenRadial() function from the quantum math blocks.
 *
 * @module rendering/webgpu/shaders/schroedinger/volume/radialProbability.wgsl
 */

export const radialProbabilityBlock = /* wgsl */ `
// ============================================
// Radial Probability Overlay (Hydrogen P(r))
// ============================================

/**
 * Compute radial probability overlay at a world-space position.
 *
 * P(r) = 4π r² |R_nl(r)|², normalized by CPU-precomputed 1/max(P(r))
 * so the result maps to [0,1] regardless of quantum numbers.
 *
 * Returns vec4f(color * intensity, alpha).
 */
fn computeRadialProbabilityOverlay(pos: vec3f, uniforms: SchroedingerUniforms) -> vec4f {
  if (uniforms.radialProbabilityEnabled == 0u) {
    return vec4f(0.0);
  }

  let r = length(pos);
  if (r < 1e-6) {
    return vec4f(0.0);
  }

  // Evaluate R_nl(r) using existing hydrogen radial function
  let R = hydrogenRadial(uniforms.principalN, uniforms.azimuthalL, r, uniforms.bohrRadius);

  // P(r) = 4π r² |R_nl(r)|², normalized by CPU precomputed norm
  let Pr = 4.0 * PI * r * r * R * R * uniforms.radialProbabilityNorm;

  // sqrt compression: preserves all peaks (inner ones are much smaller than outer)
  // while giving good visual contrast. Without this, inner shells of n=3,l=0 vanish.
  let shellIntensity = sqrt(Pr);

  if (shellIntensity < 0.01) {
    return vec4f(0.0);
  }

  let alpha = shellIntensity * uniforms.radialProbabilityOpacity;
  return vec4f(uniforms.radialProbabilityColor * shellIntensity, alpha);
}
`

export const radialProbabilityStubBlock = /* wgsl */ `
// ============================================
// Radial Probability Overlay (stub for HO mode)
// ============================================

fn computeRadialProbabilityOverlay(pos: vec3f, uniforms: SchroedingerUniforms) -> vec4f {
  return vec4f(0.0);
}
`
