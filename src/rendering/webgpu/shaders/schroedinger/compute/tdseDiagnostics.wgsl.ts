/**
 * TDSE Diagnostics Compute Shader — Parallel Norm Reduction
 *
 * Two-pass parallel reduction to compute total wavefunction norm:
 *   ||psi||^2 = sum_i (|psiRe[i]|^2 + |psiIm[i]|^2)
 *
 * Pass 1 (`tdseDiagNormReduceBlock`):
 *   Each workgroup reduces a chunk of psi data into a single partial sum,
 *   written to the partial sums buffer.
 *
 * Pass 2 (`tdseDiagNormFinalizeBlock`):
 *   A single workgroup reduces the partial sums into one final scalar
 *   and also computes maxDensity (for display normalization).
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
}

@group(0) @binding(0) var<uniform> diagParams: DiagReduceUniforms;
@group(0) @binding(1) var<storage, read> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read> psiIm: array<f32>;
@group(0) @binding(3) var<storage, read_write> partialSums: array<f32>;
@group(0) @binding(4) var<storage, read_write> partialMax: array<f32>;

var<workgroup> shared_norm: array<f32, 256>;
var<workgroup> shared_max: array<f32, 256>;

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
  if (idx < diagParams.totalSites) {
    let re = psiRe[idx];
    let im = psiIm[idx];
    val = re * re + im * im;
  }
  shared_norm[local] = val;
  shared_max[local] = val;
  workgroupBarrier();

  // Tree reduction within workgroup
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_norm[local] += shared_norm[local + stride];
      shared_max[local] = max(shared_max[local], shared_max[local + stride]);
    }
    workgroupBarrier();
  }

  // Write workgroup result
  if (local == 0u) {
    partialSums[wid.x] = shared_norm[0];
    partialMax[wid.x] = shared_max[0];
  }
}
`

/** Pass 2: Reduce partial sums -> final norm + maxDensity. Single workgroup. */
export const tdseDiagNormFinalizeBlock = /* wgsl */ `
struct DiagReduceUniforms {
  totalSites: u32,
  numWorkgroups: u32,
}

@group(0) @binding(0) var<uniform> diagParams: DiagReduceUniforms;
@group(0) @binding(1) var<storage, read> partialSums: array<f32>;
@group(0) @binding(2) var<storage, read> partialMax: array<f32>;
@group(0) @binding(3) var<storage, read_write> result: array<f32>;

var<workgroup> shared_norm: array<f32, 256>;
var<workgroup> shared_max: array<f32, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_id) lid: vec3u,
) {
  let local = lid.x;

  // Load partial sums (each thread handles one partial)
  var norm_val: f32 = 0.0;
  var max_val: f32 = 0.0;
  if (local < diagParams.numWorkgroups) {
    norm_val = partialSums[local];
    max_val = partialMax[local];
  }
  shared_norm[local] = norm_val;
  shared_max[local] = max_val;
  workgroupBarrier();

  // Tree reduction
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_norm[local] += shared_norm[local + stride];
      shared_max[local] = max(shared_max[local], shared_max[local + stride]);
    }
    workgroupBarrier();
  }

  // Write final result: [0] = totalNorm, [1] = maxDensity
  if (local == 0u) {
    result[0] = shared_norm[0];
    result[1] = shared_max[0];
  }
}
`
