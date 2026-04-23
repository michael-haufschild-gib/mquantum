/**
 * Dirac Half-Step Potential Compute Shader
 *
 * Applies only the potential propagator:
 *   ψ_c(x) → exp(-iV(x)·dt/(2ℏ)) · ψ_c(x)
 *
 * The scalar potential V(x) is diagonal in spinor space, so each component
 * gets the same phase rotation independently.
 *
 * Absorbing boundary conditions are applied in a SEPARATE pass after the
 * full Strang step to prevent FFT k-space scattering of the absorber profile.
 *
 * Requires diracUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const diracPotentialHalfBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: DiracUniforms;
@group(0) @binding(1) var<storage, read_write> spinorRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> spinorIm: array<f32>;
@group(0) @binding(3) var<storage, read> potential: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  // Extract the dt/(2ℏ) factor once so the inner phase computation stays
  // a single multiply, and the divide-by-(2·max(hbar, ε)) doesn't repeat
  // for each spinor component below. Readability + dedup, not a guaranteed
  // cross-thread hoist (WGSL evaluates uniform expressions per invocation
  // and relies on the driver compiler to recognize them).
  let dtOver2Hbar = params.dt / (2.0 * max(params.hbar, 1e-6));
  let V = potential[idx];
  let phase = -V * dtOver2Hbar;
  let cosP = cos(phase);
  let sinP = sin(phase);

  // Apply potential phase rotation to each spinor component
  let S = params.spinorSize;
  let T = params.totalSites;
  for (var c: u32 = 0u; c < S; c++) {
    let bufIdx = c * T + idx;
    let re = spinorRe[bufIdx];
    let im = spinorIm[bufIdx];
    spinorRe[bufIdx] = re * cosP - im * sinP;
    spinorIm[bufIdx] = re * sinP + im * cosP;
  }
}
`
