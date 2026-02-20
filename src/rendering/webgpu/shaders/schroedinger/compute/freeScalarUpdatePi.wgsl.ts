/**
 * Free Scalar Field — Leapfrog Pi-Update Compute Shader
 *
 * Updates conjugate momentum pi using the Klein-Gordon equation of motion:
 *   pi[n] += dt * (laplacian(phi)[n] - m^2 * phi[n])
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

  let coords = linearToND(idx, params.gridSize, params.latticeDim);
  let phiCenter = phi[idx];
  var laplacian: f32 = 0.0;

  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    if (params.gridSize[d] <= 1u) { continue; }

    // Forward neighbor
    var fwdCoords = coords;
    fwdCoords[d] = wrapCoord(i32(coords[d]) + 1, params.gridSize[d]);
    let fwdIdx = ndToLinear(fwdCoords, params.strides, params.latticeDim);

    // Backward neighbor
    var bwdCoords = coords;
    bwdCoords[d] = wrapCoord(i32(coords[d]) - 1, params.gridSize[d]);
    let bwdIdx = ndToLinear(bwdCoords, params.strides, params.latticeDim);

    let a2 = params.spacing[d] * params.spacing[d];
    laplacian += (phi[fwdIdx] - 2.0 * phiCenter + phi[bwdIdx]) / a2;
  }

  // Klein-Gordon equation: d²phi/dt² = laplacian(phi) - m² * phi
  // In Hamiltonian form: dpi/dt = laplacian(phi) - m² * phi
  pi[idx] = pi[idx] + params.dt * (laplacian - params.mass * params.mass * phiCenter);
}
`
