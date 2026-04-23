/**
 * Wavefunction Collapse Compute Shader
 *
 * Replaces the current wavefunction with a narrow Gaussian centered at the
 * measurement position. Used after Born rule measurement to implement
 * wavefunction collapse: ψ(x) → A·exp(-|x - x_meas|²/(2σ²))
 *
 * The collapsed state is real (im = 0) and unnormalized — the existing
 * renormalization pass handles normalization on the next step.
 *
 * Requires freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const collapseGaussianBlock = /* wgsl */ `
struct CollapseUniforms {
  totalSites: u32,
  latticeDim: u32,
  collapseWidth: f32,    // σ — Gaussian width (in world units)
  _pad0: u32,
  gridSize: array<u32, 12>,
  strides: array<u32, 12>,
  spacing: array<f32, 12>,
  collapseCenter: array<f32, 12>,  // x_meas per dimension
}

@group(0) @binding(0) var<uniform> params: CollapseUniforms;
@group(0) @binding(1) var<storage, read_write> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> psiIm: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) { return; }

  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);

  var dist2: f32 = 0.0;
  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    let pos_d = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
    let delta = pos_d - params.collapseCenter[d];
    dist2 += delta * delta;
  }

  let sigma2 = params.collapseWidth * params.collapseWidth;
  // Precompute 1/(2σ²) once (uniform for all threads) so per-thread exp uses multiply, not divide.
  let invTwoSigma2 = 1.0 / (2.0 * max(sigma2, 1e-8));
  let amplitude = exp(-dist2 * invTwoSigma2);

  psiRe[idx] = amplitude;
  psiIm[idx] = 0.0;
}
`
