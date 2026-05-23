/**
 * TDSE Diagnostics Compute Shader — Parallel Norm Reduction
 *
 * Two-pass parallel reduction to compute total wavefunction norm and
 * spatially-partitioned norms (left/right of barrierCenter) for
 * reflection/transmission coefficient estimation. Curved metrics integrate
 * norms and IPR with the proper spatial measure sqrt(|g|) dV.
 *
 * Output: [totalNorm, maxDensity, normLeft, normRight, sumPsi4]
 *
 * Pass 1 (`tdseDiagNormReduceBlock`):
 *   Each workgroup reduces a chunk of psi data into partial sums for
 *   total norm, max density, left-of-barrier norm, and right-of-barrier norm.
 *
 * Pass 2 (`tdseDiagNormFinalizeBlock`):
 *   A single workgroup reduces the partial sums into 4 final scalars.
 *
 * Requires tdseUniformsBlock to be prepended (for totalSites).
 *
 * @workgroup_size(256) for both passes
 * @module
 */

/** Pass 1: Reduce psi -> partial sums. One workgroup per chunk. */
export const tdseDiagNormReduceBlock = /* wgsl */ `
struct DiagReduceUniforms {
  totalSites: u32,
  numWorkgroups: u32,
  barrierCenter: f32,
  gridSize0: u32,
  spacing0: f32,
  stride0: u32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> diagParams: DiagReduceUniforms;
@group(0) @binding(1) var<storage, read> psi: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> partialSums: array<f32>;
@group(0) @binding(3) var<storage, read_write> partialMax: array<f32>;
@group(0) @binding(4) var<storage, read_write> partialLeft: array<f32>;
@group(0) @binding(5) var<storage, read_write> partialRight: array<f32>;
@group(0) @binding(6) var<storage, read_write> partialIpr: array<f32>;
@group(0) @binding(7) var<storage, read> params: TDSEUniforms;

// Pack the four additive fields (norm, left, right, ipr) into a single vec4
// so the tree reduction touches shared memory 2× per step instead of 5×.
// Max uses a different op (max) and stays separate.
var<workgroup> shared_add: array<vec4f, 256>;
var<workgroup> shared_max: array<f32, 256>;

fn tdseDiagWorldCoords(idx: u32) -> array<f32, 12> {
  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);
  var world: array<f32, 12>;
  for (var d: u32 = 0u; d < params.latticeDim; d = d + 1u) {
    world[d] = (f32(coords[d]) - f32(params.gridSize[d]) * 0.5 + 0.5) * params.spacing[d];
  }
  return world;
}

fn tdseDiagCellMeasure(idx: u32) -> f32 {
  var dV: f32 = 1.0;
  for (var d: u32 = 0u; d < params.latticeDim; d = d + 1u) {
    dV *= params.spacing[d];
  }
  if (params.metricKind == 0u || params.metricKind == 6u) { return dV; }
  let coords = tdseDiagWorldCoords(idx);
  let metricTime = select(params.simTime, params.stageTimeK4, params.metricKind == 3u);
  // tdseCurvatureSqrtDet is finite-positive by construction: every metric
  // branch clamps the dominant radial/scale factor to >= small positive
  // (max(throatRadius, 0.1), max(adsRadius, 0.1), pole epsilon, etc.) so
  // sqrt arguments stay positive and exp/products of finite positives stay
  // finite. The CPU writer (writeTdseUniforms) further requires finite
  // metric params before dispatch. The max(..., 0.0) below is a defensive
  // floor against rare driver fast-math negative-zero artifacts; WGSL does
  // not guarantee NaN propagation through max, and isFinite is unavailable
  // for f32, so NaN/Inf prevention is enforced upstream.
  return max(tdseCurvatureSqrtDet(coords, params.latticeDim, metricTime), 0.0) * dV;
}

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let idx = gid.x;
  let local = lid.x;

  // Load: each thread computes |psi|^2 for one site
  var val: f32 = 0.0;
  var density: f32 = 0.0;
  var cellMeasure: f32 = 1.0;
  var isLeft: bool = true;
  if (idx < diagParams.totalSites) {
    let z = psi[idx];
    let re = z.x;
    let im = z.y;
    density = re * re + im * im;
    cellMeasure = tdseDiagCellMeasure(idx);
    val = density * cellMeasure;

    // Axis-0 coordinate from linear index. stride0 and gridSize0 are always
    // powers of 2 in this codebase, so replace the integer divide + mod with
    // a shift + AND. Both factors are uniform so firstTrailingBit hoists to
    // scalar registers. Saves ~20 cycles per thread vs hardware udiv/umod.
    let log2Stride0 = firstTrailingBit(diagParams.stride0);
    let mask0 = diagParams.gridSize0 - 1u;
    let coord0 = (idx >> log2Stride0) & mask0;
    let pos0 = (f32(coord0) - f32(diagParams.gridSize0) * 0.5 + 0.5) * diagParams.spacing0;
    isLeft = pos0 < diagParams.barrierCenter;
  }

  let leftVal = select(0.0, val, isLeft);
  let rightVal = val - leftVal; // exactly one branch contributes — saves a select
  // IPR uses per-cell probability mass p_i = |psi_i|^2 dV_i:
  // PR = (sum p_i)^2 / sum p_i^2. That preserves the documented 1..N
  // participation-count scale even when flat/curved cell measures differ.
  shared_add[local] = vec4f(val, leftVal, rightVal, val * val);
  shared_max[local] = density;
  workgroupBarrier();

  // Tree reduction within workgroup
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_add[local] = shared_add[local] + shared_add[local + stride];
      shared_max[local] = max(shared_max[local], shared_max[local + stride]);
    }
    workgroupBarrier();
  }

  // Write workgroup result
  if (local == 0u) {
    let sum = shared_add[0];
    partialSums[wid.x] = sum.x;
    partialMax[wid.x] = shared_max[0];
    partialLeft[wid.x] = sum.y;
    partialRight[wid.x] = sum.z;
    partialIpr[wid.x] = sum.w;
  }
}
`

/** Pass 2: Reduce partial sums -> final results. Single workgroup. */
export const tdseDiagNormFinalizeBlock = /* wgsl */ `
struct DiagReduceUniforms {
  totalSites: u32,
  numWorkgroups: u32,
  barrierCenter: f32,
  gridSize0: u32,
  spacing0: f32,
  stride0: u32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> diagParams: DiagReduceUniforms;
@group(0) @binding(1) var<storage, read> partialSums: array<f32>;
@group(0) @binding(2) var<storage, read> partialMax: array<f32>;
@group(0) @binding(3) var<storage, read_write> result: array<f32>;
@group(0) @binding(4) var<storage, read> partialLeft: array<f32>;
@group(0) @binding(5) var<storage, read> partialRight: array<f32>;
@group(0) @binding(6) var<storage, read> partialIpr: array<f32>;

var<workgroup> shared_add: array<vec4f, 256>;
var<workgroup> shared_max: array<f32, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_id) lid: vec3u,
) {
  let local = lid.x;

  // Load partial sums — each thread accumulates multiple entries when
  // numWorkgroups > 256 (e.g. 64³ grid → 1024 partials).
  var acc: vec4f = vec4f(0.0, 0.0, 0.0, 0.0);
  var max_val: f32 = 0.0;
  let ngroups = diagParams.numWorkgroups;
  var i = local;
  while (i < ngroups) {
    acc = acc + vec4f(partialSums[i], partialLeft[i], partialRight[i], partialIpr[i]);
    max_val = max(max_val, partialMax[i]);
    i += 256u;
  }
  shared_add[local] = acc;
  shared_max[local] = max_val;
  workgroupBarrier();

  // Tree reduction
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_add[local] = shared_add[local] + shared_add[local + stride];
      shared_max[local] = max(shared_max[local], shared_max[local + stride]);
    }
    workgroupBarrier();
  }

  // Write final result: [0]=totalNorm, [1]=maxDensity, [2]=normLeft, [3]=normRight, [4]=sumPsi4
  if (local == 0u) {
    let sum = shared_add[0];
    result[0] = sum.x;
    result[1] = shared_max[0];
    result[2] = sum.y;
    result[3] = sum.z;
    result[4] = sum.w;
  }
}
`
