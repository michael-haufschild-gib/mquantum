/**
 * Pauli-specific Complex Pack / Unpack Compute Shaders
 *
 * These shaders exist as a Pauli-local variant of the TDSE pack/unpack
 * because the Pauli spinor uses a merged `spinor: array<vec2f>` buffer
 * (one 8-byte load per site) rather than split Re/Im f32 arrays.
 *
 * A per-component sub-binding (byteOffset = c·totalSites·8,
 * byteSize = totalSites·8) is exposed to these shaders as a single
 * `psi: array<vec2f>` of length `totalSites`. The alignment constraint
 * (minStorageBufferOffsetAlignment = 256) is satisfied because every
 * valid Pauli config has latticeDim >= 3 and per-axis gridSize >= 8,
 * so totalSites >= 512 and totalSites*8 >= 4096 (multiple of 256).
 *
 * The interleaved `complexBuf: array<f32>` contract is UNCHANGED — these
 * shaders produce / consume the exact same [re, im, re, im, ...] layout
 * that the shared Stockham FFT reads and writes, so the cross-family FFT
 * infrastructure never sees the buffer merge.
 *
 * @workgroup_size(64)
 * @module
 */

import type { ShaderBlock } from '../../shared/compose-helpers'

/**
 * Pack shader: merged vec2f spinor (single-component slice) -> interleaved complex buffer.
 *
 * Bind group layout:
 *   @group(0) @binding(0) uniforms { totalElements: u32, invN: f32 }
 *   @group(0) @binding(1) psi: array<vec2f> (read)    — totalSites slots (one component)
 *   @group(0) @binding(2) complexBuf: array<f32> (write)
 */
export const pauliComplexPackBlock = /* wgsl */ `
struct PackUniforms {
  totalElements: u32,
  invN: f32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> packUni: PackUniforms;
@group(0) @binding(1) var<storage, read> psi: array<vec2f>;
// vec2f view: the same bytes the Stockham FFT reads and writes as
// array<vec2f>. Lets the pack write both lanes in a single 8-byte op
// instead of two scalar stores.
@group(0) @binding(2) var<storage, read_write> complexBuf: array<vec2f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= packUni.totalElements) {
    return;
  }
  complexBuf[idx] = psi[idx];
}
`

/**
 * Unpack shader: interleaved complex buffer -> merged vec2f spinor (single-component slice).
 * Applies 1/N normalization for inverse FFT output.
 *
 * Bind group layout:
 *   @group(0) @binding(0) uniforms { totalElements: u32, invN: f32 }
 *   @group(0) @binding(1) complexBuf: array<f32> (read)
 *   @group(0) @binding(2) psi: array<vec2f> (write)   — totalSites slots (one component)
 */
export const pauliComplexUnpackBlock = /* wgsl */ `
struct PackUniforms {
  totalElements: u32,
  invN: f32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> packUni: PackUniforms;
// vec2f view (same byte layout as the FFT). One 8-byte load instead of two
// scalar loads, then a single vec2 mul-by-scalar normalization.
@group(0) @binding(1) var<storage, read> complexBuf: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> psi: array<vec2f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= packUni.totalElements) {
    return;
  }
  psi[idx] = complexBuf[idx] * packUni.invN;
}
`

/** ShaderBlock form of the Pauli pack shader. */
export const pauliComplexPackShaderBlock: ShaderBlock = {
  name: 'pauli-complex-pack',
  content: pauliComplexPackBlock,
}

/** ShaderBlock form of the Pauli unpack shader. */
export const pauliComplexUnpackShaderBlock: ShaderBlock = {
  name: 'pauli-complex-unpack',
  content: pauliComplexUnpackBlock,
}
