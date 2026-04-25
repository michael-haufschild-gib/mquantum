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
 * Fused potentialHalf + pack: Apply half-step potential rotation to the
 * vec2f psi buffer in-place, then interleave into the complex FFT buffer.
 *
 * Bind group layout:
 *   @group(0) @binding(0) TDSEUniforms
 *   @group(0) @binding(1) psi (vec2f, read_write)
 *   @group(0) @binding(2) potential (read)
 *   @group(0) @binding(3) complexBuf (read_write)
 */
export const tdseFusedPotentialPackBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psi: array<vec2f>;
@group(0) @binding(2) var<storage, read> potential: array<f32>;
@group(0) @binding(3) var<storage, read_write> complexBuf: array<f32>;

const INV_TWO_PI: f32 = 0.15915494309189535;
const TWO_PI: f32 = 6.283185307179587;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  let z = psi[idx];
  let re = z.x;
  let im = z.y;

  // Uniform-only: precompute 0.5·dt/max(ℏ,ε) to replace per-thread divide with multiply.
  let halfDtOverHbar = (0.5 * params.dt) / max(params.hbar, 1e-6);

  // 1. Apply half-step potential: psi -> exp(-iV_eff*dt/(2h)) * psi
  let density = re * re + im * im;
  let effectiveV = potential[idx] + params.interactionStrength * density;
  let arg = effectiveV * halfDtOverHbar;

  var newRe: f32;
  var newIm: f32;

  if (params.imaginaryTime != 0u) {
    let decay = exp(-arg);
    newRe = re * decay;
    newIm = im * decay;
  } else {
    // Reduce arg (positive) to [-π, π]; fold the −arg sign into the complex
    // multiply via cos(-x)=cos(x), sin(-x)=-sin(x). Saves one negate per thread.
    let argReduced = arg - round(arg * INV_TWO_PI) * TWO_PI;
    let cosP = cos(argReduced);
    let sinP = sin(argReduced);
    // exp(−i·arg)·(re + i·im) = (re·cosP + im·sinP) + i·(im·cosP − re·sinP)
    newRe = re * cosP + im * sinP;
    newIm = im * cosP - re * sinP;
  }

  // 2. Write back to psi (needed for potential/absorber in later passes) — one vec2f store.
  psi[idx] = vec2f(newRe, newIm);

  // 3. Pack into interleaved complex buffer for FFT (one address → adjacent writes).
  let c = idx << 1u;
  complexBuf[c] = newRe;
  complexBuf[c + 1u] = newIm;
}
`

/**
 * Fused unpack + potentialHalf: Deinterleave complex FFT output with 1/N normalization,
 * then apply half-step potential rotation, writing directly to vec2f psi.
 *
 * Bind group layout:
 *   @group(0) @binding(0) TDSEUniforms
 *   @group(0) @binding(1) complexBuf (read)
 *   @group(0) @binding(2) psi (vec2f, read_write)
 *   @group(0) @binding(3) potential (read)
 */
export const tdseFusedUnpackPotentialBlock = /* wgsl */ `
@group(0) @binding(0) var<storage, read> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read> complexBuf: array<f32>;
@group(0) @binding(2) var<storage, read_write> psi: array<vec2f>;
@group(0) @binding(3) var<storage, read> potential: array<f32>;

const UP_INV_TWO_PI: f32 = 0.15915494309189535;
const UP_TWO_PI: f32 = 6.283185307179587;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  // 1. Unpack with 1/N normalization from inverse FFT (one index compute, two reads).
  let invN = 1.0 / f32(params.totalSites);
  let c = idx << 1u;
  let re = complexBuf[c] * invN;
  let im = complexBuf[c + 1u] * invN;

  // 2. Half-step potential. Uniform-only prefactor hoisted to a multiply.
  let halfDtOverHbar = (0.5 * params.dt) / max(params.hbar, 1e-6);
  let density = re * re + im * im;
  let effectiveV = potential[idx] + params.interactionStrength * density;
  let arg = effectiveV * halfDtOverHbar;

  if (params.imaginaryTime != 0u) {
    let decay = exp(-arg);
    psi[idx] = vec2f(re * decay, im * decay);
  } else {
    // Reduce arg (positive) to [-π, π]; fold the −arg sign into the complex
    // multiply via cos(-x)=cos(x), sin(-x)=-sin(x). Saves one negate per thread.
    let argReduced = arg - round(arg * UP_INV_TWO_PI) * UP_TWO_PI;
    let cosP = cos(argReduced);
    let sinP = sin(argReduced);
    // exp(−i·arg)·(re + i·im) = (re·cosP + im·sinP) + i·(im·cosP − re·sinP)
    psi[idx] = vec2f(re * cosP + im * sinP, im * cosP - re * sinP);
  }
}
`
