/**
 * TDSE Half-Step Potential Phase Rotation Compute Shader
 *
 * Applies the half-step potential propagator in the Strang splitting:
 *   psi(x) *= exp(-i * V(x) * dt / (2 * hbar))
 *
 * The potential V(x) is read from a precomputed buffer (computed by tdsePotential shader).
 *
 * Requires tdseUniformsBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const tdseApplyPotentialHalfBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> psiIm: array<f32>;
@group(0) @binding(3) var<storage, read> potential: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  let V = potential[idx];
  let phase = -V * params.dt / (2.0 * params.hbar);
  let cosP = cos(phase);
  let sinP = sin(phase);

  let re = psiRe[idx];
  let im = psiIm[idx];

  // Complex rotation: (re + i*im) * (cosP + i*sinP)
  psiRe[idx] = re * cosP - im * sinP;
  psiIm[idx] = re * sinP + im * cosP;
}
`
