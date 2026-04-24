/**
 * Complex packing/unpacking compute shaders for TDSE FFT pipeline.
 *
 * Pack: Interleaves separate psiRe[] and psiIm[] buffers into a single
 *       complex[] buffer [re0, im0, re1, im1, ...] for FFT input.
 *
 * Unpack: Deinterleaves complex[] buffer back to separate psiRe[] and psiIm[].
 *         Applies 1/N normalization for inverse FFT.
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
 * Pack shader: psiRe + psiIm -> interleaved complex buffer
 *
 * Bind group layout:
 *   @group(0) @binding(0) uniforms { totalElements: u32, invN: f32 }
 *   @group(0) @binding(1) psiRe: array<f32> (read)
 *   @group(0) @binding(2) psiIm: array<f32> (read)
 *   @group(0) @binding(3) complexBuf: array<f32> (write)
 */
export const tdseComplexPackBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> packUni: PackUniforms;
@group(0) @binding(1) var<storage, read> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read> psiIm: array<f32>;
@group(0) @binding(3) var<storage, read_write> complexBuf: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= packUni.totalElements) {
    return;
  }
  let c = idx << 1u;
  complexBuf[c] = psiRe[idx];
  complexBuf[c + 1u] = psiIm[idx];
}
`

/**
 * Unpack shader: interleaved complex buffer -> psiRe + psiIm
 * Applies 1/N normalization for inverse FFT output.
 *
 * Bind group layout:
 *   @group(0) @binding(0) uniforms { totalElements: u32, invN: f32 }
 *   @group(0) @binding(1) complexBuf: array<f32> (read)
 *   @group(0) @binding(2) psiRe: array<f32> (write)
 *   @group(0) @binding(3) psiIm: array<f32> (write)
 */
export const tdseComplexUnpackBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> packUni: PackUniforms;
@group(0) @binding(1) var<storage, read> complexBuf: array<f32>;
@group(0) @binding(2) var<storage, read_write> psiRe: array<f32>;
@group(0) @binding(3) var<storage, read_write> psiIm: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= packUni.totalElements) {
    return;
  }
  // Apply 1/N normalization from inverse FFT
  let c = idx << 1u;
  let invN = packUni.invN;
  psiRe[idx] = complexBuf[c] * invN;
  psiIm[idx] = complexBuf[c + 1u] * invN;
}
`

// ShaderBlock exports for assembleShaderBlocks() composition

/** PackUniforms struct as a ShaderBlock. */
export const tdsePackUniformsShaderBlock: ShaderBlock = {
  name: 'tdse-pack-uniforms',
  content: tdsePackUniformsBlock,
}

/** Complex pack shader as a ShaderBlock. */
export const tdseComplexPackShaderBlock: ShaderBlock = {
  name: 'tdse-complex-pack',
  content: tdseComplexPackBlock,
}

/** Complex unpack shader as a ShaderBlock. */
export const tdseComplexUnpackShaderBlock: ShaderBlock = {
  name: 'tdse-complex-unpack',
  content: tdseComplexUnpackBlock,
}
