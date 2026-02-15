/**
 * Free Scalar Field — Leapfrog Phi-Update Compute Shader
 *
 * Updates field amplitude phi using the conjugate momentum:
 *   phi[n] += dt * pi[n]
 *
 * This is the second half of the symplectic leapfrog integrator.
 *
 * Requires freeScalarUniformsBlock to be prepended for struct definition.
 */

export const freeScalarUpdatePhiBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: FreeScalarUniforms;
@group(0) @binding(1) var<storage, read_write> phi: array<f32>;
@group(0) @binding(2) var<storage, read> pi: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) { return; }

  // Hamilton's equation: dphi/dt = pi
  phi[idx] = phi[idx] + params.dt * pi[idx];
}
`
