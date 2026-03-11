/**
 * Dirac Potential Compute Shader
 *
 * Fills the potential buffer V(x) from the selected potential type.
 * Simpler than the TDSE potential shader — Dirac scenarios use
 * step, barrier, well, harmonic trap, and Coulomb potentials.
 *
 * Potential types:
 *   0 = none (V=0, free particle)
 *   1 = step (Heaviside along axis 0 at potentialCenter)
 *   2 = barrier (rectangular along axis 0)
 *   3 = well (symmetric finite square well along axis 0)
 *   4 = harmonicTrap (isotropic harmonic oscillator)
 *   5 = coulomb (-Z/r, soft-core regularized)
 *
 * Requires diracUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const diracPotentialBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: DiracUniforms;
@group(0) @binding(1) var<storage, read_write> potential: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  let coords = linearToND(idx, params.gridSize, params.latticeDim);

  // Compute physical positions
  var pos: array<f32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    pos[d] = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
  }

  var V: f32 = 0.0;

  if (params.potentialType == 0u) {
    // Free particle: V = 0
    V = 0.0;

  } else if (params.potentialType == 1u) {
    // Step potential: V₀ for x₀ > center (Klein paradox)
    V = select(0.0, params.potentialStrength, pos[0] > params.potentialCenter);

  } else if (params.potentialType == 2u) {
    // Rectangular barrier: V₀ within half-width of center
    let halfWidth = params.potentialWidth * 0.5;
    let inBarrier = abs(pos[0] - params.potentialCenter) < halfWidth;
    V = select(0.0, params.potentialStrength, inBarrier);

  } else if (params.potentialType == 3u) {
    // Finite square well: -V₀ within half-width of center
    let halfWidth = params.potentialWidth * 0.5;
    let inWell = abs(pos[0] - params.potentialCenter) < halfWidth;
    V = select(0.0, -params.potentialStrength, inWell);

  } else if (params.potentialType == 4u) {
    // Harmonic trap: V = 0.5 · m · ω² · |x|²
    var r2: f32 = 0.0;
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      r2 += pos[d] * pos[d];
    }
    V = 0.5 * params.mass * params.harmonicOmega * params.harmonicOmega * r2;

  } else if (params.potentialType == 5u) {
    // Coulomb: V = -Z/r (soft-core regularized to avoid singularity)
    var r2: f32 = 0.0;
    for (var d: u32 = 0u; d < params.latticeDim; d++) {
      r2 += pos[d] * pos[d];
    }
    // Soft-core: r_eff = sqrt(r² + (0.1·Δx)²)
    let softCore = 0.1 * params.spacing[0];
    let r = sqrt(r2 + softCore * softCore);
    V = -params.coulombZ / r;
  }

  potential[idx] = V;
}
`
