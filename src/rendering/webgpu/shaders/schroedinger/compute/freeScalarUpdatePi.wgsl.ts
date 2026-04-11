/**
 * Free Scalar Field — Leapfrog Pi-Update Compute Shader
 *
 * Updates the canonical conjugate momentum π = a^(n−2)·δφ' using the
 * Hamilton equation of motion on a (possibly time-dependent) cosmological
 * background:
 *
 *   dπ/dη = aPotential · ∇²δφ − mass²·aFull · δφ − aFull · V'(δφ)
 *
 * where the three cosmology coefficients (`aKinetic`, `aPotential`, `aFull`)
 * come from `computeCosmologyCoefs(η)` and are written into the uniform
 * buffer before every pi dispatch. Under Minkowski they collapse to 1, so
 * this reduces bit-identically to the flat-space Klein-Gordon kick.
 *
 * Physical dispersion (bounded — no 1/η² pole): ω² = k² + mass²·a². This is
 * the whole point of evolving the physical δφ instead of the old
 * Mukhanov-Sasaki `v = a^((n−2)/2)·δφ`: leapfrog CFL only sees the physical
 * frequency and stays stable through horizon crossing.
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

  // Hamilton kick equation in the canonical delta-phi variables:
  //   d(pi)/d(eta) = aPotential * laplacian(phi)
  //                - mass^2 * aFull * phi
  //                - aFull * V'(phi)
  // Under the Minkowski preset aPotential = aFull = 1 and this degenerates
  // to the bare KG force (laplacian - mass^2 * phi - V'(phi)) bit-identically.
  let massCoef = params.mass * params.mass * params.aFull;
  var force = params.aPotential * laplacian - massCoef * phiCenter;

  // Self-interaction: V(phi) = lambda*(phi^2 - v^2)^2,
  //                   V'(phi) = 4*lambda*phi*(phi^2 - v^2).
  // Weighted by aFull so the action term (int d(eta) d^d x  a^n  V(phi)) lands
  // in the pi-update with the right time-dependent strength.
  if (params.selfInteractionEnabled != 0u) {
    let v2 = params.selfInteractionVev * params.selfInteractionVev;
    let phi2 = phiCenter * phiCenter;
    force -= params.aFull * 4.0 * params.selfInteractionLambda * phiCenter * (phi2 - v2);
  }

  pi[idx] = pi[idx] + params.dt * force;
}
`
