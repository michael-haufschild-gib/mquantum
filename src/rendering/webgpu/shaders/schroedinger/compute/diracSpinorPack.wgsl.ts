/**
 * Dirac Spinor Pack/Unpack Compute Shaders
 *
 * Dirac-specific variants of the TDSE pack/unpack kernels operating on the
 * merged spinor buffer layout. The spatial spinor uses a single
 * `array<vec2f>` storage buffer where component c occupies totalSites
 * consecutive vec2f slots: `spinor[c*T + idx] = vec2f(re, im)`.
 *
 * Pack: sub-ranged `spinorSlice: array<vec2f>` -> interleaved f32
 *       `complexBuf[2*idx]   = spinorSlice[idx].x`
 *       `complexBuf[2*idx+1] = spinorSlice[idx].y`
 *
 * Unpack: interleaved f32 -> `spinorSlice` with 1/N normalization.
 *
 * The TDSE pack shader cannot serve this layout because it expects two
 * separate f32 buffers bound at bindings 1 and 2 — a merged vec2f buffer
 * has no way to expose Re and Im as two separate f32 bindings (they
 * interleave inside each vec2f at stride 8).
 *
 * `complexBuf` retains the existing interleaved f32 layout so the FFT
 * kernels stay untouched.
 *
 * @workgroup_size(64)
 * @module
 */

import type { ShaderBlock } from '../../shared/compose-helpers'

/**
 * Pack: spinorSlice (vec2f) -> interleaved complex buffer (f32)
 *
 * Bind group layout:
 *   @group(0) @binding(0) packUni: PackUniforms
 *   @group(0) @binding(1) spinorSlice: array<vec2f> (read, sub-ranged by component)
 *   @group(0) @binding(2) complexBuf: array<f32> (write)
 */
export const diracSpinorPackBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> packUni: PackUniforms;
@group(0) @binding(1) var<storage, read> spinorSlice: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> complexBuf: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= packUni.totalElements) {
    return;
  }
  let v = spinorSlice[idx];
  let c = idx << 1u;
  complexBuf[c] = v.x;
  complexBuf[c + 1u] = v.y;
}
`

/**
 * Unpack: interleaved complex buffer (f32) -> spinorSlice (vec2f)
 *
 * Applies 1/N normalization (multiply by packUni.invN). For forward FFT,
 * the host supplies invN=1.0; for inverse FFT, invN=1/N.
 *
 * Bind group layout:
 *   @group(0) @binding(0) packUni: PackUniforms
 *   @group(0) @binding(1) complexBuf: array<f32> (read)
 *   @group(0) @binding(2) spinorSlice: array<vec2f> (write, sub-ranged)
 */
export const diracSpinorUnpackBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> packUni: PackUniforms;
@group(0) @binding(1) var<storage, read> complexBuf: array<f32>;
@group(0) @binding(2) var<storage, read_write> spinorSlice: array<vec2f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= packUni.totalElements) {
    return;
  }
  let c = idx << 1u;
  let invN = packUni.invN;
  spinorSlice[idx] = vec2f(complexBuf[c] * invN, complexBuf[c + 1u] * invN);
}
`

/** Pack shader as a ShaderBlock. */
export const diracSpinorPackShaderBlock: ShaderBlock = {
  name: 'dirac-spinor-pack',
  content: diracSpinorPackBlock,
}

/** Unpack shader as a ShaderBlock. */
export const diracSpinorUnpackShaderBlock: ShaderBlock = {
  name: 'dirac-spinor-unpack',
  content: diracSpinorUnpackBlock,
}
