/**
 * Quantum Walk Diagnostics Compute Shader — Parallel Norm + Position Reduction
 *
 * Two-pass parallel reduction computing:
 *   totalNorm = Σ_{site,j} |c_j(site)|²
 *   positionMean = Σ x_site · P(site) / totalNorm    (along dim 0)
 *   positionVar  = Σ x²_site · P(site) / totalNorm - positionMean²
 *
 * where P(site) = Σ_j |c_j(site)|² is the per-site probability.
 *
 * Output: [totalNorm, posSum, posSqSum] (3 f32 values)
 *   positionMean = posSum / totalNorm
 *   positionVar  = posSqSum / totalNorm - positionMean²
 *   (computed CPU-side to avoid division in the shader)
 *
 * Buffer layout: coinState[site * numCoinStates * 2 + j * 2 + {0=re, 1=im}]
 *
 * @workgroup_size(256) for both passes
 * @module
 */

/** Number of f32 values in the diagnostic output */
export const QW_DIAG_RESULT_COUNT = 3

/** Pass 1: Reduce coin state → partial sums for norm, posSum, posSqSum. */
export const qwDiagReduceBlock = /* wgsl */ `
struct QWDiagUniforms {
  totalSites: u32,
  numCoinStates: u32,   // = 2 * latticeDim
  numWorkgroups: u32,
  gridSize0: u32,       // grid size along dimension 0 (for position computation)
  stride0: u32,         // stride for dimension 0 = gridSize[1]*gridSize[2]*...
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var<uniform> diagParams: QWDiagUniforms;
// vec2f view of the [re,im] interleaved coin buffer (matches sibling QW
// shaders). |c|² becomes dot(z, z) — one load per amplitude instead of two.
@group(0) @binding(1) var<storage, read> coinState: array<vec2f>;
// partial buffers hold scalar reduction sums (norm + position moments) — f32 only.
@group(0) @binding(2) var<storage, read_write> partialNorm: array<f32>;
@group(0) @binding(3) var<storage, read_write> partialPosSum: array<f32>;
@group(0) @binding(4) var<storage, read_write> partialPosSqSum: array<f32>;

// Pack 3 additives (prob, xProb, x2Prob) into a vec3<f32> so tree-reduce does
// one SM op per step instead of three. (vec3 aligns to 16 bytes — same SM
// footprint as three scalar arrays would use after alignment.)
var<workgroup> shared_add: array<vec3<f32>, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let site = gid.x;
  let local = lid.x;

  // Each thread computes P(site) = Σ_j |c_j|² and position contributions
  var prob: f32 = 0.0;
  var xProb: f32 = 0.0;
  var x2Prob: f32 = 0.0;

  if (site < diagParams.totalSites) {
    // vec2f view: per-site stride is numCoinStates (was numCoinStates * 2 in f32 units).
    let baseIdx = site * diagParams.numCoinStates;
    let nCoin = diagParams.numCoinStates;
    for (var j: u32 = 0u; j < nCoin; j = j + 1u) {
      let z = coinState[baseIdx + j];
      prob += dot(z, z);
    }

    // Site position along dim 0 via shift (stride0 is power-of-2).
    let logS0 = firstTrailingBit(diagParams.stride0);
    let coord0 = f32(site >> logS0);
    let x = coord0 - f32(diagParams.gridSize0) * 0.5 + 0.5;
    xProb = x * prob;
    x2Prob = x * x * prob;
  }

  shared_add[local] = vec3<f32>(prob, xProb, x2Prob);
  workgroupBarrier();

  // Tree reduction within workgroup
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_add[local] = shared_add[local] + shared_add[local + stride];
    }
    workgroupBarrier();
  }

  // Write workgroup results (3 arrays of partials)
  if (local == 0u) {
    let sum = shared_add[0];
    partialNorm[wid.x] = sum.x;
    partialPosSum[wid.x] = sum.y;
    partialPosSqSum[wid.x] = sum.z;
  }
}
`

/** Pass 2: Reduce partial sums → final [totalNorm, posSum, posSqSum]. */
export const qwDiagFinalizeBlock = /* wgsl */ `
struct QWDiagUniforms {
  totalSites: u32,
  numCoinStates: u32,
  numWorkgroups: u32,
  gridSize0: u32,
  stride0: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var<uniform> diagParams: QWDiagUniforms;
@group(0) @binding(1) var<storage, read> partialNorm: array<f32>;
@group(0) @binding(2) var<storage, read> partialPosSum: array<f32>;
@group(0) @binding(3) var<storage, read> partialPosSqSum: array<f32>;
@group(0) @binding(4) var<storage, read_write> result: array<f32>;

var<workgroup> shared_add: array<vec3<f32>, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_id) lid: vec3u,
) {
  let local = lid.x;

  // Load partial sums — each thread accumulates multiple entries
  var acc: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
  let ngroups = diagParams.numWorkgroups;
  var i = local;
  while (i < ngroups) {
    acc = acc + vec3<f32>(partialNorm[i], partialPosSum[i], partialPosSqSum[i]);
    i += 256u;
  }
  shared_add[local] = acc;
  workgroupBarrier();

  // Tree reduction
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_add[local] = shared_add[local] + shared_add[local + stride];
    }
    workgroupBarrier();
  }

  // Write final result: [0] = totalNorm, [1] = posSum, [2] = posSqSum
  if (local == 0u) {
    let sum = shared_add[0];
    result[0] = sum.x;
    result[1] = sum.y;
    result[2] = sum.z;
  }
}
`
