/**
 * Fused TDSE Compute Kernels
 *
 * Performance-optimized fused kernels that merge adjacent compute passes
 * to reduce dispatch overhead and memory bandwidth.
 *
 * 1. potentialHalf + pack: Apply half-step potential AND interleave into complex buffer
 * 2. unpack + potentialHalf: Deinterleave with 1/N normalization AND apply half-step potential
 *
 * Each fusion eliminates one dispatch per Strang substep (4 substeps/frame = 8 fewer dispatches).
 * Memory bandwidth savings: 4MB per eliminated intermediate read+write pass.
 *
 * @workgroup_size(64)
 * @module
 */

/**
 * Fused potentialHalf + pack: Apply half-step potential rotation to psiRe/psiIm
 * in-place, then interleave into the complex FFT buffer.
 *
 * Bind group layout:
 *   @group(0) @binding(0) TDSEUniforms
 *   @group(0) @binding(1) psiRe (read_write)
 *   @group(0) @binding(2) psiIm (read_write)
 *   @group(0) @binding(3) potential (read)
 *   @group(0) @binding(4) complexBuf (read_write)
 */
export const tdseFusedPotentialPackBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> psiIm: array<f32>;
@group(0) @binding(3) var<storage, read> potential: array<f32>;
@group(0) @binding(4) var<storage, read_write> complexBuf: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  let re = psiRe[idx];
  let im = psiIm[idx];

  // 1. Apply half-step potential: psi -> exp(-iV_eff*dt/(2h)) * psi
  let density = re * re + im * im;
  let effectiveV = potential[idx] + params.interactionStrength * density;
  let arg = effectiveV * params.dt / (2.0 * max(params.hbar, 1e-6));

  var newRe: f32;
  var newIm: f32;

  if (params.imaginaryTime != 0u) {
    let decay = exp(-arg);
    newRe = re * decay;
    newIm = im * decay;
  } else {
    let phase = -arg;
    let cosP = cos(phase);
    let sinP = sin(phase);
    newRe = re * cosP - im * sinP;
    newIm = re * sinP + im * cosP;
  }

  // 2. Write back to psiRe/psiIm (needed for potential/absorber in later passes)
  psiRe[idx] = newRe;
  psiIm[idx] = newIm;

  // 3. Pack into interleaved complex buffer for FFT
  complexBuf[idx * 2u] = newRe;
  complexBuf[idx * 2u + 1u] = newIm;
}
`

/**
 * Fused unpack + potentialHalf: Deinterleave complex FFT output with 1/N normalization,
 * then apply half-step potential rotation, writing directly to psiRe/psiIm.
 *
 * Bind group layout:
 *   @group(0) @binding(0) TDSEUniforms
 *   @group(0) @binding(1) complexBuf (read)
 *   @group(0) @binding(2) psiRe (read_write)
 *   @group(0) @binding(3) psiIm (read_write)
 *   @group(0) @binding(4) potential (read)
 */
export const tdseFusedUnpackPotentialBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read> complexBuf: array<f32>;
@group(0) @binding(2) var<storage, read_write> psiRe: array<f32>;
@group(0) @binding(3) var<storage, read_write> psiIm: array<f32>;
@group(0) @binding(4) var<storage, read> potential: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  // 1. Unpack with 1/N normalization from inverse FFT
  let invN = 1.0 / f32(params.totalSites);
  let re = complexBuf[idx * 2u] * invN;
  let im = complexBuf[idx * 2u + 1u] * invN;

  // 2. Apply half-step potential: psi -> exp(-iV_eff*dt/(2h)) * psi
  let density = re * re + im * im;
  let effectiveV = potential[idx] + params.interactionStrength * density;
  let arg = effectiveV * params.dt / (2.0 * max(params.hbar, 1e-6));

  if (params.imaginaryTime != 0u) {
    let decay = exp(-arg);
    psiRe[idx] = re * decay;
    psiIm[idx] = im * decay;
  } else {
    let phase = -arg;
    let cosP = cos(phase);
    let sinP = sin(phase);
    psiRe[idx] = re * cosP - im * sinP;
    psiIm[idx] = re * sinP + im * cosP;
  }
}
`
