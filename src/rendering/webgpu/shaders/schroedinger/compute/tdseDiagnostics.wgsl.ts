/**
 * TDSE Diagnostics Compute Shader — Parallel Norm Reduction
 *
 * Two-pass parallel reduction to compute total wavefunction norm and
 * spatially-partitioned norms (left/right of barrierCenter) for
 * reflection/transmission coefficient estimation.
 *
 * Output: [totalNorm, maxDensity, normLeft, normRight]
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
@group(0) @binding(1) var<storage, read> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read> psiIm: array<f32>;
@group(0) @binding(3) var<storage, read_write> partialSums: array<f32>;
@group(0) @binding(4) var<storage, read_write> partialMax: array<f32>;
@group(0) @binding(5) var<storage, read_write> partialLeft: array<f32>;
@group(0) @binding(6) var<storage, read_write> partialRight: array<f32>;

var<workgroup> shared_norm: array<f32, 256>;
var<workgroup> shared_max: array<f32, 256>;
var<workgroup> shared_left: array<f32, 256>;
var<workgroup> shared_right: array<f32, 256>;

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
  var isLeft: bool = true;
  if (idx < diagParams.totalSites) {
    let re = psiRe[idx];
    let im = psiIm[idx];
    val = re * re + im * im;

    // Determine if this site is left or right of barrier along axis 0
    // coord0 = (idx / stride0_unused) % gridSize0 — but for general N-D,
    // we extract the axis-0 coordinate from the linear index
    let coord0 = (idx / diagParams.stride0) % diagParams.gridSize0;
    let pos0 = (f32(coord0) - f32(diagParams.gridSize0) * 0.5 + 0.5) * diagParams.spacing0;
    isLeft = pos0 < diagParams.barrierCenter;
  }

  shared_norm[local] = val;
  shared_max[local] = val;
  shared_left[local] = select(0.0, val, isLeft);
  shared_right[local] = select(val, 0.0, isLeft);
  workgroupBarrier();

  // Tree reduction within workgroup
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_norm[local] += shared_norm[local + stride];
      shared_max[local] = max(shared_max[local], shared_max[local + stride]);
      shared_left[local] += shared_left[local + stride];
      shared_right[local] += shared_right[local + stride];
    }
    workgroupBarrier();
  }

  // Write workgroup result
  if (local == 0u) {
    partialSums[wid.x] = shared_norm[0];
    partialMax[wid.x] = shared_max[0];
    partialLeft[wid.x] = shared_left[0];
    partialRight[wid.x] = shared_right[0];
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

var<workgroup> shared_norm: array<f32, 256>;
var<workgroup> shared_max: array<f32, 256>;
var<workgroup> shared_left: array<f32, 256>;
var<workgroup> shared_right: array<f32, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_id) lid: vec3u,
) {
  let local = lid.x;

  // Load partial sums — each thread accumulates multiple entries
  // when numWorkgroups > 256 (e.g. 64^3 grid produces 1024 partials)
  var norm_val: f32 = 0.0;
  var max_val: f32 = 0.0;
  var left_val: f32 = 0.0;
  var right_val: f32 = 0.0;
  var i = local;
  while (i < diagParams.numWorkgroups) {
    norm_val += partialSums[i];
    max_val = max(max_val, partialMax[i]);
    left_val += partialLeft[i];
    right_val += partialRight[i];
    i += 256u;
  }
  shared_norm[local] = norm_val;
  shared_max[local] = max_val;
  shared_left[local] = left_val;
  shared_right[local] = right_val;
  workgroupBarrier();

  // Tree reduction
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_norm[local] += shared_norm[local + stride];
      shared_max[local] = max(shared_max[local], shared_max[local + stride]);
      shared_left[local] += shared_left[local + stride];
      shared_right[local] += shared_right[local + stride];
    }
    workgroupBarrier();
  }

  // Write final result: [0] = totalNorm, [1] = maxDensity, [2] = normLeft, [3] = normRight
  if (local == 0u) {
    result[0] = shared_norm[0];
    result[1] = shared_max[0];
    result[2] = shared_left[0];
    result[3] = shared_right[0];
  }
}
`
