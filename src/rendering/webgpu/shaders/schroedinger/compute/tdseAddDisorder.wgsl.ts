/**
 * TDSE Disorder Overlay Compute Shader
 *
 * Adds pre-generated random disorder to the potential buffer:
 *   V(x) += strength * disorder(x)
 *
 * The disorder buffer contains uniform random values in [-0.5, +0.5],
 * generated on the CPU for reproducibility (seeded PRNG). The strength
 * parameter scales the disorder amplitude: effective noise ∈ [-W/2, +W/2].
 *
 * Dispatched after the main potential fill pass when disorderStrength > 0.
 *
 * @workgroup_size(64)
 * @module
 */

export const tdseAddDisorderBlock = /* wgsl */ `
struct DisorderUniforms {
  totalSites: u32,
  strength: f32,
}

@group(0) @binding(0) var<uniform> params: DisorderUniforms;
@group(0) @binding(1) var<storage, read_write> potential: array<f32>;
@group(0) @binding(2) var<storage, read> disorder: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }
  potential[idx] = potential[idx] + params.strength * disorder[idx];
}
`
