/**
 * Free Scalar Field — Leapfrog Pi-Update Compute Shader
 *
 * Updates conjugate momentum pi using the Klein-Gordon equation of motion
 * on a (possibly time-dependent) cosmological background:
 *   pi[n] += dt * (laplacian(phi)[n] - M²_eff(η) * phi[n])
 *
 * The effective mass `M²_eff(η) = a²(η)·m² − z''(η)/z(η)` comes from the
 * Mukhanov-Sasaki bridge (see src/lib/physics/cosmology/). When cosmology
 * is disabled the CPU writes `mEffSq = mass²`, recovering the ordinary
 * Klein-Gordon equation bit-identically.
 *
 * The discrete Laplacian uses periodic boundary conditions and loops over
 * 0..latticeDim for N-D support:
 *   laplacian = sum_d (phi[n+e_d] - 2*phi[n] + phi[n-e_d]) / a_d^2
 *
 * Requires freeScalarUniformsBlock + freeScalarNDIndexBlock to be prepended.
 */

export const freeScalarUpdatePiBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: FreeScalarUniforms;
@group(0) @binding(1) var<storage, read> phi: array<f32>;
@group(0) @binding(2) var<storage, read_write> pi: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) { return; }

  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);
  let phiCenter = phi[idx];
  var laplacian: f32 = 0.0;

  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    if (params.gridSize[d] <= 1u) { continue; }

    // Stride-based neighbor lookup: O(1) per dimension instead of O(D)
    let stride = params.strides[d];
    let coord = coords[d];
    let fwdIdx = select(idx + stride, idx - stride * (params.gridSize[d] - 1u), coord == params.gridSize[d] - 1u);
    let bwdIdx = select(idx - stride, idx + stride * (params.gridSize[d] - 1u), coord == 0u);

    let a2 = max(params.spacing[d] * params.spacing[d], 1e-12);
    laplacian += (phi[fwdIdx] - 2.0 * phiCenter + phi[bwdIdx]) / a2;
  }

  // Klein-Gordon equation with Mukhanov-Sasaki effective mass:
  //   dpi/dt = laplacian(phi) - M²_eff(η) * phi - dV/dphi
  // When cosmology is disabled, mEffSq = mass² and this degenerates to the
  // ordinary Klein-Gordon evolution.
  var force = laplacian - params.mEffSq * phiCenter;

  // Self-interaction: V(phi) = lambda*(phi²-v²)², dV/dphi = 4*lambda*phi*(phi²-v²)
  if (params.selfInteractionEnabled != 0u) {
    let v2 = params.selfInteractionVev * params.selfInteractionVev;
    let phi2 = phiCenter * phiCenter;
    force -= 4.0 * params.selfInteractionLambda * phiCenter * (phi2 - v2);
  }

  pi[idx] = pi[idx] + params.dt * force;
}
`
