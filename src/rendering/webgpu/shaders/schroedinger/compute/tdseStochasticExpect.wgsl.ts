/**
 * TDSE Stochastic Expectation Reduction Shader
 *
 * Two-pass parallel reduction to compute ⟨W⟩ = Σ|ψ|²·W / Σ|ψ|²,
 * where W(x) = Σ_k L_k(x)·ξ_k is the combined noise field from all
 * collapse centers.
 *
 * Pass 1 (reduce): Each workgroup computes partial sums for 2 channels:
 *   channel 0 = Σ|ψ|²·W (density-weighted noise field)
 *   channel 1 = Σ|ψ|² (bare norm for normalization)
 * Pass 2 (finalize): Single workgroup reduces partial sums, divides
 *   channel 0 by channel 1 to produce ⟨W⟩.
 *
 * Result buffer: [⟨W⟩] (1 float). The localization shader reads this
 * and subtracts it from W(x) to center the kick.
 *
 * @workgroup_size(256) for both passes
 * @module
 */

/** Pass 1: Reduce |ψ|² · W(x) and |ψ|² -> partial sums. */
export const tdseStochasticExpectReduceBlock = /* wgsl */ `
struct StochasticParams {
  gamma: f32,
  sigma: f32,
  numCollapseSites: u32,
  stepIndex: u32,
  seed: u32,
  dt: f32,
  _pad0: u32,
  _pad1: u32,
  centers: array<vec4f, 96>,
};

@group(0) @binding(0) var<uniform> tdseParams: TDSEUniforms;
@group(0) @binding(1) var<storage, read> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read> psiIm: array<f32>;
@group(0) @binding(3) var<uniform> sParams: StochasticParams;
@group(0) @binding(4) var<storage, read_write> partialSums: array<f32>;

fn getCenterCoord(k: u32, d: u32) -> f32 {
  let vecIdx = k * 3u + d / 4u;
  let comp = d % 4u;
  return sParams.centers[vecIdx][comp];
}

fn getCenterNoise(k: u32) -> f32 {
  return sParams.centers[k * 3u + 2u][3];
}

var<workgroup> shared_psiW: array<f32, 256>;
var<workgroup> shared_norm: array<f32, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let idx = gid.x;
  let local = lid.x;
  let invTwoSigmaSq = 1.0 / (2.0 * sParams.sigma * sParams.sigma);
  let normFactor = pow(
    3.14159265 * sParams.sigma * sParams.sigma,
    -f32(tdseParams.latticeDim) * 0.25
  );

  var density: f32 = 0.0;
  var noiseField: f32 = 0.0;

  if (idx < tdseParams.totalSites) {
    let re = psiRe[idx];
    let im = psiIm[idx];
    density = re * re + im * im;

    // Compute lattice coordinates
    var coords: array<f32, 12>;
    var rem = idx;
    for (var d: u32 = 0u; d < tdseParams.latticeDim; d++) {
      let stride = tdseParams.strides[d];
      let ci = rem / stride;
      rem = rem % stride;
      let halfExtent = f32(tdseParams.gridSize[d]) * tdseParams.spacing[d] * 0.5;
      coords[d] = f32(ci) * tdseParams.spacing[d] - halfExtent;
    }

    // W(x) = Σ_k L_k(x) · ξ_k
    for (var k: u32 = 0u; k < sParams.numCollapseSites; k++) {
      var distSq: f32 = 0.0;
      for (var d: u32 = 0u; d < tdseParams.latticeDim; d++) {
        let diff = coords[d] - getCenterCoord(k, d);
        distSq += diff * diff;
      }
      let weight = normFactor * exp(-distSq * invTwoSigmaSq);
      noiseField += weight * getCenterNoise(k);
    }
  }

  // 2 channels: |ψ|²·W and |ψ|²
  shared_psiW[local] = density * noiseField;
  shared_norm[local] = density;
  workgroupBarrier();

  // Tree reduction
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_psiW[local] += shared_psiW[local + stride];
      shared_norm[local] += shared_norm[local + stride];
    }
    workgroupBarrier();
  }

  // Write workgroup partial sums: [psiW_wg0, psiW_wg1, ..., norm_wg0, norm_wg1, ...]
  if (local == 0u) {
    let numWG = arrayLength(&partialSums) / 2u;
    partialSums[wid.x] = shared_psiW[0];
    partialSums[numWG + wid.x] = shared_norm[0];
  }
}
`

/** Pass 2: Finalize 2-channel partial sums into ⟨W⟩. */
export const tdseStochasticExpectFinalizeBlock = /* wgsl */ `
struct ExpectFinalizeUniforms {
  numWorkgroups: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
};

@group(0) @binding(0) var<uniform> fParams: ExpectFinalizeUniforms;
@group(0) @binding(1) var<storage, read> partialSums: array<f32>;
@group(0) @binding(2) var<storage, read_write> result: array<f32>;

var<workgroup> shared_val: array<f32, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3u) {
  let local = lid.x;

  // Reduce 2 channels: psiW (channel 0) and norm (channel 1)
  for (var ch: u32 = 0u; ch < 2u; ch++) {
    var val: f32 = 0.0;
    var i = local;
    let baseOffset = ch * fParams.numWorkgroups;
    while (i < fParams.numWorkgroups) {
      val += partialSums[baseOffset + i];
      i += 256u;
    }
    shared_val[local] = val;
    workgroupBarrier();

    for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
      if (local < stride) {
        shared_val[local] += shared_val[local + stride];
      }
      workgroupBarrier();
    }

    if (local == 0u) {
      result[ch] = shared_val[0];
    }
    workgroupBarrier();
  }

  // Compute ⟨W⟩ = Σ(|ψ|²·W) / Σ|ψ|²
  if (local == 0u) {
    let normSq = result[1];
    if (normSq > 0.0) {
      result[0] = result[0] / normSq;
    }
  }
}
`
