/**
 * Disorder Overlay Compute Shader (mode-agnostic)
 *
 * Adds pre-generated random disorder to a potential / mass² buffer:
 *   V(x) += strength * disorder(x)
 *
 * The disorder buffer contains unit-scale random values ([-0.5, +0.5] for
 * uniform, N(0, 1) for gaussian), generated on the CPU for reproducibility
 * (seeded PRNG). The strength parameter scales the disorder amplitude.
 *
 * Dispatched after the host mode's potential-fill pass when strength > 0.
 * Currently consumed by the TDSE compute path (and BEC via the shared
 * TDSE pipeline); any mode with an f32 scalar potential buffer can adopt.
 *
 * @workgroup_size(64)
 * @module
 */

import type { ShaderBlock } from '../../shared/compose-helpers'

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

/** Disorder overlay entry point as a {@link ShaderBlock} (styleguide form). */
export const disorderOverlayShaderBlock: ShaderBlock = {
  name: 'disorder-overlay',
  content: disorderOverlayBlock,
}

/**
 * Back-compat alias. Prefer {@link disorderOverlayBlock} — the block is
 * mode-agnostic and is now used by BEC through the shared TDSE pipeline.
 */
export const tdseAddDisorderBlock = disorderOverlayBlock
