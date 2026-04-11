/**
 * Free Scalar Field — Leapfrog Phi-Update Compute Shader
 *
 * Updates the physical field amplitude δφ from the canonical conjugate
 * momentum via Hamilton's drift equation:
 *
 *   dδφ/dη = aKinetic · π       with  aKinetic = a^(−(n−2))
 *
 * Under the Minkowski preset aKinetic = 1 and this reduces to the
 * flat-space drift `φ += dt · π`.
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

  // Hamilton's drift: dδφ/dη = aKinetic · π
  phi[idx] = phi[idx] + params.dt * params.aKinetic * pi[idx];
}
`
