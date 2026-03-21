/**
 * Gram-Schmidt Orthogonalization Shaders
 *
 * Two compute passes for orthogonalizing the current wavefunction ψ against
 * a set of previously found eigenstates φⱼ:
 *
 * Pass 1 — Inner Product: Compute ⟨φⱼ|ψ⟩ via parallel reduction.
 *   Output: [re, im] for the complex inner product.
 *
 * Pass 2 — Subtraction: ψ -= ⟨φⱼ|ψ⟩ · φⱼ for each stored eigenstate.
 *   This removes the projection of ψ onto the previously found states,
 *   allowing imaginary-time propagation to converge to the next excited state.
 *
 * @workgroup_size(256) for reduction, @workgroup_size(64) for subtraction
 * @module
 */

/**
 * Pass 1: Inner product ⟨φ|ψ⟩ — parallel reduction.
 *
 * Computes sum(φ_re[i]*ψ_re[i] + φ_im[i]*ψ_im[i]) for the real part
 * and sum(φ_re[i]*ψ_im[i] - φ_im[i]*ψ_re[i]) for the imaginary part.
 *
 * Two-pass: reduce → finalize (same pattern as tdseDiagnostics).
 */
export const gramSchmidtInnerProductReduceBlock = /* wgsl */ `
struct GSReduceUniforms {
  totalElements: u32,
  numWorkgroups: u32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> params: GSReduceUniforms;
@group(0) @binding(1) var<storage, read> phiRe: array<f32>;
@group(0) @binding(2) var<storage, read> phiIm: array<f32>;
@group(0) @binding(3) var<storage, read> psiRe: array<f32>;
@group(0) @binding(4) var<storage, read> psiIm: array<f32>;
@group(0) @binding(5) var<storage, read_write> partialRe: array<f32>;
@group(0) @binding(6) var<storage, read_write> partialIm: array<f32>;

var<workgroup> shared_re: array<f32, 256>;
var<workgroup> shared_im: array<f32, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let idx = gid.x;
  let local = lid.x;

  var ipRe: f32 = 0.0;
  var ipIm: f32 = 0.0;
  if (idx < params.totalElements) {
    let pRe = phiRe[idx];
    let pIm = phiIm[idx];
    let wRe = psiRe[idx];
    let wIm = psiIm[idx];
    // ⟨φ|ψ⟩ = conj(φ) · ψ = (φ_re - iφ_im)(ψ_re + iψ_im)
    ipRe = pRe * wRe + pIm * wIm;
    ipIm = pRe * wIm - pIm * wRe;
  }

  shared_re[local] = ipRe;
  shared_im[local] = ipIm;
  workgroupBarrier();

  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_re[local] += shared_re[local + stride];
      shared_im[local] += shared_im[local + stride];
    }
    workgroupBarrier();
  }

  if (local == 0u) {
    partialRe[wid.x] = shared_re[0];
    partialIm[wid.x] = shared_im[0];
  }
}
`

/** Pass 1b: Finalize inner product from partial sums. */
export const gramSchmidtInnerProductFinalizeBlock = /* wgsl */ `
struct GSReduceUniforms {
  totalElements: u32,
  numWorkgroups: u32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> params: GSReduceUniforms;
@group(0) @binding(1) var<storage, read> partialRe: array<f32>;
@group(0) @binding(2) var<storage, read> partialIm: array<f32>;
@group(0) @binding(3) var<storage, read_write> result: array<f32>;

var<workgroup> shared_re: array<f32, 256>;
var<workgroup> shared_im: array<f32, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3u) {
  let local = lid.x;

  var accRe: f32 = 0.0;
  var accIm: f32 = 0.0;
  var i = local;
  while (i < params.numWorkgroups) {
    accRe += partialRe[i];
    accIm += partialIm[i];
    i += 256u;
  }
  shared_re[local] = accRe;
  shared_im[local] = accIm;
  workgroupBarrier();

  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_re[local] += shared_re[local + stride];
      shared_im[local] += shared_im[local + stride];
    }
    workgroupBarrier();
  }

  if (local == 0u) {
    result[0] = shared_re[0];
    result[1] = shared_im[0];
  }
}
`

/**
 * Pass 2: Subtract projection ψ -= ⟨φ|ψ⟩ · φ
 *
 * Reads the inner product [re, im] from the result buffer and subtracts
 * the projection from each element of ψ.
 */
export const gramSchmidtSubtractBlock = /* wgsl */ `
struct GSSubtractUniforms {
  totalElements: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var<uniform> params: GSSubtractUniforms;
@group(0) @binding(1) var<storage, read> innerProduct: array<f32>;
@group(0) @binding(2) var<storage, read> phiRe: array<f32>;
@group(0) @binding(3) var<storage, read> phiIm: array<f32>;
@group(0) @binding(4) var<storage, read_write> psiRe: array<f32>;
@group(0) @binding(5) var<storage, read_write> psiIm: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalElements) { return; }

  let cRe = innerProduct[0];
  let cIm = innerProduct[1];

  let fRe = phiRe[idx];
  let fIm = phiIm[idx];

  // ⟨φ|ψ⟩ · φ = (cRe + icIm)(fRe + ifIm) = (cRe*fRe - cIm*fIm) + i(cRe*fIm + cIm*fRe)
  let projRe = cRe * fRe - cIm * fIm;
  let projIm = cRe * fIm + cIm * fRe;

  psiRe[idx] = psiRe[idx] - projRe;
  psiIm[idx] = psiIm[idx] - projIm;
}
`
