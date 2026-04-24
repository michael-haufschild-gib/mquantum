/**
 * Eigenfunction Cache Compute Shader
 *
 * Pre-computes 1D harmonic oscillator eigenfunctions φ_n(x) and their
 * derivatives φ'_n(x) into a storage buffer for fast lookup during raymarching.
 *
 * Architecture:
 * - Each workgroup handles one unique (n, ω) function
 * - Each thread computes one sample point
 * - Output: array<vec2f> where .x = φ_n(x), .y = φ'_n(x)
 *
 * @module rendering/webgpu/shaders/schroedinger/compute/eigenfunctionCache.wgsl
 */

import { EIGEN_CACHE_SAMPLES, MAX_EIGEN_FUNCS } from '../quantum/eigenfunctionCache.wgsl'

/**
 * Uniform struct for eigenfunction cache compute parameters.
 * Passed per-dispatch with the deduplication results from CPU.
 */
export const eigenCacheComputeParamsBlock = /* wgsl */ `
// ============================================
// Eigenfunction Cache Compute Parameters
// ============================================

const EIGEN_CACHE_SAMPLES: u32 = ${EIGEN_CACHE_SAMPLES}u;
const MAX_EIGEN_FUNCS: u32 = ${MAX_EIGEN_FUNCS}u;

// Per-function parameters computed by CPU deduplication
// Packed as vec4f: (xMin, xMax, quantumN as f32, omega)
struct EigenCacheComputeParams {
  numFuncs: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  funcParams: array<vec4f, ${MAX_EIGEN_FUNCS}>,
}
`

/**
 * Compute shader bindings for eigenfunction cache generation.
 */
export const eigenCacheComputeBindingsBlock = /* wgsl */ `
// ============================================
// Eigenfunction Cache Compute Bindings
// ============================================

@group(0) @binding(0) var<uniform> cacheParams: EigenCacheComputeParams;
@group(0) @binding(1) var<storage, read_write> eigenCacheOut: array<vec2f>;
`

/**
 * Compute shader entry point.
 * workgroup_id.x = function index, global_invocation_id.x = sample index within workgroup
 */
export const eigenCacheComputeMainBlock = /* wgsl */ `
// ============================================
// Eigenfunction Cache Compute Entry Point
// ============================================

// 1/sqrt(2^n n!) for n = 0..6 (matches ho1d.wgsl.ts)
const HO_NORM_C: array<f32, 7> = array<f32, 7>(
  1.0,
  0.707106781187,
  0.353553390593,
  0.144337567297,
  0.0510310363080,
  0.0161374306092,
  0.00465847495312
);

// Evaluate φ_n(x, ω) inline (same as ho1D but without external dependencies)
fn computeHo1D(n: i32, x: f32, omega: f32) -> f32 {
  if (n < 0 || n > 6) { return 0.0; }
  let omegaClamped = max(omega, 0.01);
  let alpha = sqrt(omegaClamped);
  let u = alpha * x;
  let u2 = min(u * u, 40.0);
  let gauss = exp(-0.5 * u2);
  let H = hermite(n, u);
  // α² = ω (clamped), so use omegaClamped directly
  let alphaNorm = sqrt(sqrt(omegaClamped * INV_PI));
  return alphaNorm * HO_NORM_C[n] * H * gauss;
}

// Compute φ_n(x,ω) AND φ'_n(x,ω) in a single pass, reusing α, u, e^{-½u²},
// α-normalization, and the shared gaussian envelope. Calling this is ~40 %
// cheaper than calling computeHo1D twice (once for n and once for n-1 via
// computeHo1DDeriv), which is why the cache kernel uses this fused form.
fn computeHo1DPhiDeriv(n: i32, x: f32, omega: f32) -> vec2f {
  if (n < 0 || n > 6) { return vec2f(0.0, 0.0); }
  let omegaClamped = max(omega, 0.01);
  let sqrtOmega = sqrt(omegaClamped);
  let u = sqrtOmega * x;
  let u2 = min(u * u, 40.0);
  let gauss = exp(-0.5 * u2);
  let alphaNorm = sqrt(sqrt(omegaClamped * INV_PI));
  let gaussNorm = alphaNorm * gauss;
  let Hn = hermite(n, u);
  let phi_n = gaussNorm * HO_NORM_C[n] * Hn;

  // φ'_n(x) = √ω · (√(2n)·φ_{n-1}(x) - √ω · x · φ_n(x))
  // For n=0: φ'_0 = -ω·x·φ_0 (√ω² = ω).
  var dphi: f32;
  if (n == 0) {
    dphi = -omegaClamped * x * phi_n;
  } else {
    let Hnm1 = hermite(n - 1, u);
    let phi_nm1 = gaussNorm * HO_NORM_C[n - 1] * Hnm1;
    dphi = sqrtOmega * (sqrt(2.0 * f32(n)) * phi_nm1 - sqrtOmega * x * phi_n);
  }
  return vec2f(phi_n, dphi);
}

const WORKGROUP_SIZE: u32 = 256u;
const WORKGROUPS_PER_FUNC: u32 = (EIGEN_CACHE_SAMPLES + WORKGROUP_SIZE - 1u) / WORKGROUP_SIZE;

@compute @workgroup_size(256, 1, 1)
fn main(
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wgid: vec3u
) {
  // Each function uses WORKGROUPS_PER_FUNC workgroups
  let funcIdx = wgid.x / WORKGROUPS_PER_FUNC;
  let localWgIdx = wgid.x % WORKGROUPS_PER_FUNC;
  let sampleIdx = localWgIdx * WORKGROUP_SIZE + lid.x;

  // Bounds check
  if (funcIdx >= cacheParams.numFuncs || sampleIdx >= EIGEN_CACHE_SAMPLES) {
    return;
  }

  // Read per-function parameters
  let params = cacheParams.funcParams[funcIdx];
  let xMin = params.x;
  let xMax = params.y;
  let n = i32(params.z);
  let omega = params.w;

  // Compute x at endpoint-aligned grid position: index 0 → xMin, index SAMPLES-1 → xMax.
  // Matches fragment shader's invRange = (SAMPLES-1) / (xMax-xMin) for Catmull-Rom lookup.
  let x = mix(xMin, xMax, f32(sampleIdx) / f32(EIGEN_CACHE_SAMPLES - 1u));

  // Compute eigenfunction value and derivative in a single fused pass
  let phiDphi = computeHo1DPhiDeriv(n, x, omega);

  // Write to storage buffer
  let bufIdx = funcIdx * EIGEN_CACHE_SAMPLES + sampleIdx;
  eigenCacheOut[bufIdx] = phiDphi;
}
`
