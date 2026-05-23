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
 * Result buffer: [⟨W⟩, normSq] (2 floats). The localization shader reads
 * result[0] (⟨W⟩) and subtracts it from W(x) to center the kick.
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

@group(0) @binding(0) var<storage, read> tdseParams: TDSEUniforms;
@group(0) @binding(1) var<storage, read> psi: array<vec2f>;
@group(0) @binding(2) var<uniform> sParams: StochasticParams;
@group(0) @binding(3) var<storage, read_write> partialSums: array<f32>;

fn getCenterCoord(k: u32, d: u32) -> f32 {
  let vecIdx = k * 3u + d / 4u;
  let comp = d % 4u;
  return sParams.centers[vecIdx][comp];
}

fn getCenterNoise(k: u32) -> f32 {
  return sParams.centers[k * 3u + 2u][3];
}

// Pack the two additive channels (|ψ|²·W and |ψ|²) into a single vec2 —
// tree reduction touches shared memory 1× per step instead of 2×.
var<workgroup> shared_pair: array<vec2f, 256>;

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
    3.14159265358979323846 * sParams.sigma * sParams.sigma,
    -f32(tdseParams.latticeDim) * 0.25
  );

  var density: f32 = 0.0;
  var noiseField: f32 = 0.0;

  if (idx < tdseParams.totalSites) {
    let z = psi[idx];
    let re = z.x;
    let im = z.y;
    density = re * re + im * im;

    // Compute lattice coordinates. Strides are products of power-of-2 grid
    // dims → use firstTrailingBit for shift/mask instead of u32 divide/modulo.
    // Voxel-centered: must stay in lockstep with tdseStochasticLoc's
    // coords[] formula — the centering ⟨W⟩ that this pass computes is
    // subtracted from W in the apply pass, and a frame mismatch would
    // violate the martingale property the comments at the top promise.
    var coords: array<f32, 12>;
    var rem = idx;
    let ldim = tdseParams.latticeDim;
    for (var d: u32 = 0u; d < ldim; d = d + 1u) {
      let stride = tdseParams.strides[d];
      let logStride = firstTrailingBit(stride);
      let ci = rem >> logStride;
      rem = rem & (stride - 1u);
      coords[d] = (f32(ci) - f32(tdseParams.gridSize[d]) * 0.5 + 0.5) * tdseParams.spacing[d];
    }

    // W(x) = normFactor · Σ_k exp(-dist²/(2σ²)) · ξ_k
    // Factor normFactor OUTSIDE the inner loop (one multiply saved per collapse site).
    // Cutoff at 6σ (distSq > 36σ²): exp(-18) ≈ 1.5e-8 is below f32 precision after
    // the ξ·normFactor scaling, so skip the exp + center lookups for far sites.
    // For typical σ = 1 grid unit this skips 95-99% of (voxel, site) pairs.
    // PERF: early-break the distSq accumulation loop once it exceeds maxDistSq —
    // for high-ldim (up to 11) with many far sites, this avoids evaluating
    // (ldim − breakpoint) subtract/square per skipped site. The outer test
    // stays correct because distSq after break is already > maxDistSq.
    let maxDistSq = 36.0 * sParams.sigma * sParams.sigma;
    var rawSum: f32 = 0.0;
    let nSites = sParams.numCollapseSites;
    for (var k: u32 = 0u; k < nSites; k = k + 1u) {
      var distSq: f32 = 0.0;
      for (var d: u32 = 0u; d < ldim; d = d + 1u) {
        let diff = coords[d] - getCenterCoord(k, d);
        distSq += diff * diff;
        if (distSq > maxDistSq) { break; }
      }
      if (distSq < maxDistSq) {
        rawSum += exp(-distSq * invTwoSigmaSq) * getCenterNoise(k);
      }
    }
    noiseField = normFactor * rawSum;
  }

  // 2 channels: |ψ|²·W and |ψ|²
  shared_pair[local] = vec2f(density * noiseField, density);
  workgroupBarrier();

  // Tree reduction
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_pair[local] = shared_pair[local] + shared_pair[local + stride];
    }
    workgroupBarrier();
  }

  // Write workgroup partial sums: [psiW_wg0, psiW_wg1, ..., norm_wg0, norm_wg1, ...]
  if (local == 0u) {
    let numWG = arrayLength(&partialSums) / 2u;
    let sum = shared_pair[0];
    partialSums[wid.x] = sum.x;
    partialSums[numWG + wid.x] = sum.y;
  }
}
`

/** Pass 2: Finalize 2-channel partial sums into ⟨W⟩. */
export const tdseStochasticExpectFinalizeBlock = /* wgsl */ `
const STOCHASTIC_EXPECT_MAX_SAFE: f32 = 1.0e30;

fn isSafeStochasticScalar(value: f32) -> bool {
  return abs(value) < STOCHASTIC_EXPECT_MAX_SAFE;
}

fn isSafeStochasticNorm(value: f32) -> bool {
  return value > 0.0 && value < STOCHASTIC_EXPECT_MAX_SAFE;
}

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
    let weightedMeanNumerator = result[0];
    if (isSafeStochasticNorm(normSq) && isSafeStochasticScalar(weightedMeanNumerator)) {
      result[0] = weightedMeanNumerator / normSq;
    } else {
      result[0] = 0.0;
    }
  }
}
`
