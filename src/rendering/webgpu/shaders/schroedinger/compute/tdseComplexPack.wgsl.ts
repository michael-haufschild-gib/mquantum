/**
 * Complex packing/unpacking compute shaders for TDSE FFT pipeline.
 *
 * Pack: Reads a merged `psi: array<vec2f>` buffer and writes an interleaved
 *       `complex[]` buffer [re0, im0, re1, im1, ...] for FFT input.
 *
 * Unpack: Reads the interleaved `complex[]` buffer back into
 *         `psi: array<vec2f>` and applies 1/N normalization for inverse FFT.
 *
 * @workgroup_size(64)
 * @module
 */

import type { ShaderBlock } from '../../shared/compose-helpers'

/** Shared uniform struct for pack/unpack shaders. */
export const tdsePackUniformsBlock = /* wgsl */ `
struct PackUniforms {
  totalElements: u32,
  invN: f32,
  _pad0: u32,
  _pad1: u32,
}
`

/**
 * Vec2f pack variant: reads a single `psi: array<vec2f>` buffer (merged
 * Re+Im, 8-byte stride) and writes the interleaved complex FFT buffer.
 * Used by the TDSE path, which merged its split psiRe/psiIm into one
 * vec2f buffer for bandwidth savings. Pauli has its own pack/unpack
 * blocks in `pauliPack.wgsl.ts` because its spinor buffers are
 * S-component and need a different layout.
 *
 * Bind group layout:
 *   @group(0) @binding(0) uniforms { totalElements: u32, invN: f32 }
 *   @group(0) @binding(1) psi: array<vec2f> (read)
 *   @group(0) @binding(2) complexBuf: array<f32> (write)
 */
export const tdseComplexPackVec2Block = /* wgsl */ `
@group(0) @binding(0) var<uniform> packUni: PackUniforms;
@group(0) @binding(1) var<storage, read> psi: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> complexBuf: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= packUni.totalElements) {
    return;
  }
  let c = idx << 1u;
  let v = psi[idx];
  complexBuf[c] = v.x;
  complexBuf[c + 1u] = v.y;
}
`

/**
 * Vec2f unpack variant: reads the interleaved complex FFT buffer and
 * writes the single `psi: array<vec2f>` buffer with 1/N normalization.
 * See {@link tdseComplexPackVec2Block} for the rationale.
 */
export const tdseComplexUnpackVec2Block = /* wgsl */ `
@group(0) @binding(0) var<uniform> packUni: PackUniforms;
@group(0) @binding(1) var<storage, read> complexBuf: array<f32>;
@group(0) @binding(2) var<storage, read_write> psi: array<vec2f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= packUni.totalElements) {
    return;
  }
  let c = idx << 1u;
  let invN = packUni.invN;
  psi[idx] = vec2f(complexBuf[c] * invN, complexBuf[c + 1u] * invN);
}
`

// ShaderBlock exports for assembleShaderBlocks() composition

/** PackUniforms struct as a ShaderBlock. */
export const tdsePackUniformsShaderBlock: ShaderBlock = {
  name: 'tdse-pack-uniforms',
  content: tdsePackUniformsBlock,
}

/** Vec2f-psi pack shader as a ShaderBlock (TDSE-only). */
export const tdseComplexPackVec2ShaderBlock: ShaderBlock = {
  name: 'tdse-complex-pack-vec2',
  content: tdseComplexPackVec2Block,
}

/** Vec2f-psi unpack shader as a ShaderBlock (TDSE-only). */
export const tdseComplexUnpackVec2ShaderBlock: ShaderBlock = {
  name: 'tdse-complex-unpack-vec2',
  content: tdseComplexUnpackVec2Block,
}
