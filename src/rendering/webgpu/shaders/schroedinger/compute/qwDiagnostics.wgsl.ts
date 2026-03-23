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
}

@group(0) @binding(0) var<uniform> diagParams: QWDiagUniforms;
@group(0) @binding(1) var<storage, read> coinState: array<f32>;
@group(0) @binding(2) var<storage, read_write> partialNorm: array<f32>;
@group(0) @binding(3) var<storage, read_write> partialPosSum: array<f32>;
@group(0) @binding(4) var<storage, read_write> partialPosSqSum: array<f32>;

var<workgroup> shared_norm: array<f32, 256>;
var<workgroup> shared_pos: array<f32, 256>;
var<workgroup> shared_pos2: array<f32, 256>;

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
    let baseIdx = site * diagParams.numCoinStates * 2u;
    for (var j: u32 = 0u; j < diagParams.numCoinStates; j++) {
      let re = coinState[baseIdx + j * 2u];
      let im = coinState[baseIdx + j * 2u + 1u];
      prob += re * re + im * im;
    }

    // Site position along dimension 0: centered so x ∈ [-G/2, G/2)
    let coord0 = f32(site % diagParams.gridSize0);
    let x = coord0 - f32(diagParams.gridSize0) * 0.5 + 0.5;
    xProb = x * prob;
    x2Prob = x * x * prob;
  }

  shared_norm[local] = prob;
  shared_pos[local] = xProb;
  shared_pos2[local] = x2Prob;
  workgroupBarrier();

  // Tree reduction within workgroup
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_norm[local] += shared_norm[local + stride];
      shared_pos[local] += shared_pos[local + stride];
      shared_pos2[local] += shared_pos2[local + stride];
    }
    workgroupBarrier();
  }

  // Write workgroup results (3 arrays of partials)
  if (local == 0u) {
    partialNorm[wid.x] = shared_norm[0];
    partialPosSum[wid.x] = shared_pos[0];
    partialPosSqSum[wid.x] = shared_pos2[0];
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
}

@group(0) @binding(0) var<uniform> diagParams: QWDiagUniforms;
@group(0) @binding(1) var<storage, read> partialNorm: array<f32>;
@group(0) @binding(2) var<storage, read> partialPosSum: array<f32>;
@group(0) @binding(3) var<storage, read> partialPosSqSum: array<f32>;
@group(0) @binding(4) var<storage, read_write> result: array<f32>;

var<workgroup> shared_norm: array<f32, 256>;
var<workgroup> shared_pos: array<f32, 256>;
var<workgroup> shared_pos2: array<f32, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_id) lid: vec3u,
) {
  let local = lid.x;

  // Load partial sums — each thread accumulates multiple entries
  var norm_val: f32 = 0.0;
  var pos_val: f32 = 0.0;
  var pos2_val: f32 = 0.0;
  var i = local;
  while (i < diagParams.numWorkgroups) {
    norm_val += partialNorm[i];
    pos_val += partialPosSum[i];
    pos2_val += partialPosSqSum[i];
    i += 256u;
  }
  shared_norm[local] = norm_val;
  shared_pos[local] = pos_val;
  shared_pos2[local] = pos2_val;
  workgroupBarrier();

  // Tree reduction
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_norm[local] += shared_norm[local + stride];
      shared_pos[local] += shared_pos[local + stride];
      shared_pos2[local] += shared_pos2[local + stride];
    }
    workgroupBarrier();
  }

  // Write final result: [0] = totalNorm, [1] = posSum, [2] = posSqSum
  if (local == 0u) {
    result[0] = shared_norm[0];
    result[1] = shared_pos[0];
    result[2] = shared_pos2[0];
  }
}
`
