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
@group(0) @binding(1) var<storage, read> phi: array<vec2f>;
@group(0) @binding(2) var<storage, read> psi: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> partialRe: array<f32>;
@group(0) @binding(4) var<storage, read_write> partialIm: array<f32>;

// Pack (re, im) into vec2 — halves shared-memory ops in the tree reduce.
var<workgroup> shared_ip: array<vec2<f32>, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let idx = gid.x;
  let local = lid.x;

  var ip: vec2<f32> = vec2<f32>(0.0, 0.0);
  if (idx < params.totalElements) {
    let phiV = phi[idx];
    let psiV = psi[idx];
    let pRe = phiV.x;
    let pIm = phiV.y;
    let wRe = psiV.x;
    let wIm = psiV.y;
    // ⟨φ|ψ⟩ = conj(φ) · ψ = (φ_re - iφ_im)(ψ_re + iψ_im)
    ip = vec2<f32>(pRe * wRe + pIm * wIm, pRe * wIm - pIm * wRe);
  }

  shared_ip[local] = ip;
  workgroupBarrier();

  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_ip[local] = shared_ip[local] + shared_ip[local + stride];
    }
    workgroupBarrier();
  }

  if (local == 0u) {
    let sum = shared_ip[0];
    partialRe[wid.x] = sum.x;
    partialIm[wid.x] = sum.y;
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

var<workgroup> shared_ip: array<vec2<f32>, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3u) {
  let local = lid.x;

  var acc: vec2<f32> = vec2<f32>(0.0, 0.0);
  let ngroups = params.numWorkgroups;
  var i = local;
  while (i < ngroups) {
    acc = acc + vec2<f32>(partialRe[i], partialIm[i]);
    i += 256u;
  }
  shared_ip[local] = acc;
  workgroupBarrier();

  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_ip[local] = shared_ip[local] + shared_ip[local + stride];
    }
    workgroupBarrier();
  }

  if (local == 0u) {
    let sum = shared_ip[0];
    result[0] = sum.x;
    result[1] = sum.y;
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
  /// ⟨φ|φ⟩ for the current eigenstate (divide inner product by this)
  normSquared: f32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var<uniform> params: GSSubtractUniforms;
@group(0) @binding(1) var<storage, read> innerProduct: array<f32>;
@group(0) @binding(2) var<storage, read> phi: array<vec2f>;
@group(0) @binding(3) var<storage, read_write> psi: array<vec2f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalElements) { return; }

  // Both threads divide by the same norm2; one reciprocal replaces N divides.
  let invNorm2 = 1.0 / max(params.normSquared, 1e-20);
  let cRe = innerProduct[0] * invNorm2;
  let cIm = innerProduct[1] * invNorm2;

  let phiV = phi[idx];
  let fRe = phiV.x;
  let fIm = phiV.y;

  // (⟨φ|ψ⟩/⟨φ|φ⟩) · φ
  let projRe = cRe * fRe - cIm * fIm;
  let projIm = cRe * fIm + cIm * fRe;

  let psiV = psi[idx];
  psi[idx] = vec2f(psiV.x - projRe, psiV.y - projIm);
}
`
