/**
 * Dirac Half-Step Potential Phase Rotation Compute Shader
 *
 * Applies the half-step potential propagator in the Strang splitting:
 *   ψ_c(x) → exp(-iV(x)·dt/(2ℏ)) · ψ_c(x)  for each spinor component c
 *
 * The scalar potential V(x) is diagonal in spinor space, so each component
 * gets the same phase rotation independently.
 *
 * Requires diracUniformsBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const diracPotentialHalfBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: DiracUniforms;
@group(0) @binding(1) var<storage, read_write> spinorRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> spinorIm: array<f32>;
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

  // Apply phase rotation to each spinor component
  for (var c: u32 = 0u; c < params.spinorSize; c++) {
    let bufIdx = c * params.totalSites + idx;
    let re = spinorRe[bufIdx];
    let im = spinorIm[bufIdx];
    spinorRe[bufIdx] = re * cosP - im * sinP;
    spinorIm[bufIdx] = re * sinP + im * cosP;
  }
}
`
