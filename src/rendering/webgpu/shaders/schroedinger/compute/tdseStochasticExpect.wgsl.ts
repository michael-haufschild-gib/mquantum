/**
 * TDSE Stochastic Expectation Reduction Shader
 *
 * Two-pass parallel reduction to compute ⟨L_k⟩ = Σ_j |ψ_j|² · G(x_j, c_k, σ)
 * for up to 8 collapse centers simultaneously.
 *
 * Pass 1 (reduce): Each workgroup computes partial sums for all 8 center expectations.
 * Pass 2 (finalize): Single workgroup reduces partial sums to 8 final ⟨L_k⟩ values.
 *
 * Requires tdseUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(256) for both passes
 * @module
 */

/** Pass 1: Reduce |ψ|² · G(x, c_k, σ) -> partial sums for 8 centers. */
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
  centers: array<vec4f, 24>,
};

@group(0) @binding(0) var<uniform> tdseParams: TDSEUniforms;
@group(0) @binding(1) var<storage, read> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read> psiIm: array<f32>;
@group(0) @binding(3) var<uniform> sParams: StochasticParams;
@group(0) @binding(4) var<storage, read_write> partialExpect: array<f32>;

// Helper: read coordinate d from center k's packed vec4 triplet
fn getCenterCoord(k: u32, d: u32) -> f32 {
  let vecIdx = k * 3u + d / 4u;
  let comp = d % 4u;
  return sParams.centers[vecIdx][comp];
}

// 8 shared arrays for the 8 center expectations
var<workgroup> shared0: array<f32, 256>;
var<workgroup> shared1: array<f32, 256>;
var<workgroup> shared2: array<f32, 256>;
var<workgroup> shared3: array<f32, 256>;
var<workgroup> shared4: array<f32, 256>;
var<workgroup> shared5: array<f32, 256>;
var<workgroup> shared6: array<f32, 256>;
var<workgroup> shared7: array<f32, 256>;

fn setShared(ch: u32, idx: u32, val: f32) {
  switch (ch) {
    case 0u: { shared0[idx] = val; }
    case 1u: { shared1[idx] = val; }
    case 2u: { shared2[idx] = val; }
    case 3u: { shared3[idx] = val; }
    case 4u: { shared4[idx] = val; }
    case 5u: { shared5[idx] = val; }
    case 6u: { shared6[idx] = val; }
    default: { shared7[idx] = val; }
  }
}

fn getShared(ch: u32, idx: u32) -> f32 {
  switch (ch) {
    case 0u: { return shared0[idx]; }
    case 1u: { return shared1[idx]; }
    case 2u: { return shared2[idx]; }
    case 3u: { return shared3[idx]; }
    case 4u: { return shared4[idx]; }
    case 5u: { return shared5[idx]; }
    case 6u: { return shared6[idx]; }
    default: { return shared7[idx]; }
  }
}

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let idx = gid.x;
  let local = lid.x;
  let invTwoSigmaSq = 1.0 / (2.0 * sParams.sigma * sParams.sigma);
  let numCenters = sParams.numCollapseSites;

  // Compute |ψ|² for this site
  var density: f32 = 0.0;
  var coords: array<f32, 12>;
  if (idx < tdseParams.totalSites) {
    let re = psiRe[idx];
    let im = psiIm[idx];
    density = re * re + im * im;

    // Convert flat index to N-D lattice coordinates
    var rem = idx;
    for (var d: u32 = 0u; d < tdseParams.latticeDim; d++) {
      let stride = tdseParams.strides[d];
      let ci = rem / stride;
      rem = rem % stride;
      let halfExtent = f32(tdseParams.gridSize[d]) * tdseParams.spacing[d] * 0.5;
      coords[d] = f32(ci) * tdseParams.spacing[d] - halfExtent;
    }
  }

  // For each center: compute |ψ|² · G(x, c_k, σ) and load into shared mem
  for (var k: u32 = 0u; k < 8u; k++) {
    var val: f32 = 0.0;
    if (k < numCenters && idx < tdseParams.totalSites) {
      var distSq: f32 = 0.0;
      for (var d: u32 = 0u; d < tdseParams.latticeDim; d++) {
        let diff = coords[d] - getCenterCoord(k, d);
        distSq += diff * diff;
      }
      val = density * exp(-distSq * invTwoSigmaSq);
    }
    setShared(k, local, val);
  }
  workgroupBarrier();

  // Tree reduction within workgroup for all 8 channels
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      for (var k: u32 = 0u; k < 8u; k++) {
        setShared(k, local, getShared(k, local) + getShared(k, local + stride));
      }
    }
    workgroupBarrier();
  }

  // Write workgroup partial sums: layout is [center0_wg0, center0_wg1, ..., center1_wg0, ...]
  // Total buffer: 8 centers × numWorkgroups floats
  if (local == 0u) {
    let numWG = arrayLength(&partialExpect) / 8u;
    for (var k: u32 = 0u; k < 8u; k++) {
      partialExpect[k * numWG + wid.x] = getShared(k, 0u);
    }
  }
}
`

/** Pass 2: Finalize expectation partial sums into 8 final values. */
export const tdseStochasticExpectFinalizeBlock = /* wgsl */ `
struct ExpectFinalizeUniforms {
  numWorkgroups: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
};

@group(0) @binding(0) var<uniform> fParams: ExpectFinalizeUniforms;
@group(0) @binding(1) var<storage, read> partialExpect: array<f32>;
@group(0) @binding(2) var<storage, read_write> result: array<f32>;

var<workgroup> shared_expect: array<f32, 256>;

@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3u) {
  let local = lid.x;

  // Process each center sequentially (8 passes through shared memory)
  for (var k: u32 = 0u; k < 8u; k++) {
    var val: f32 = 0.0;
    var i = local;
    let baseOffset = k * fParams.numWorkgroups;
    while (i < fParams.numWorkgroups) {
      val += partialExpect[baseOffset + i];
      i += 256u;
    }
    shared_expect[local] = val;
    workgroupBarrier();

    // Tree reduction
    for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
      if (local < stride) {
        shared_expect[local] += shared_expect[local + stride];
      }
      workgroupBarrier();
    }

    if (local == 0u) {
      result[k] = shared_expect[0];
    }
    workgroupBarrier();
  }
}
`
