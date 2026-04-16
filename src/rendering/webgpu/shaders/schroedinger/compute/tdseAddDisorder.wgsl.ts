/**
 * Disorder Overlay Compute Shader (mode-agnostic)
 *
 * Adds pre-generated random disorder to a potential / mass² buffer:
 *   V(x) += strength * disorder(x)
 *
 * The disorder buffer contains uniform random values in [-0.5, +0.5],
 * generated on the CPU for reproducibility (seeded PRNG). The strength
 * parameter scales the disorder amplitude: effective noise ∈ [-W/2, +W/2].
 *
 * Dispatched after the host mode's potential-fill pass when strength > 0.
 * Currently consumed by the TDSE compute path (and BEC via the shared
 * TDSE pipeline); any mode with an f32 scalar potential buffer can adopt.
 *
 * @workgroup_size(64)
 * @module
 */

export const disorderOverlayBlock = /* wgsl */ `
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

/**
 * Back-compat alias. Prefer {@link disorderOverlayBlock} — the block is
 * mode-agnostic and is now used by BEC through the shared TDSE pipeline.
 */
export const tdseAddDisorderBlock = disorderOverlayBlock
