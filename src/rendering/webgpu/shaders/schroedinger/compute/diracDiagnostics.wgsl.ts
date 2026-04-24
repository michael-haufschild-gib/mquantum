/**
 * Dirac Diagnostics Compute Shader — Parallel Norm Reduction
 *
 * Two-pass parallel reduction to compute spinor diagnostics:
 * - Total norm: Σ_c Σ_x |ψ_c(x)|²
 * - Max density: max_x Σ_c |ψ_c(x)|²
 * - Particle fraction: Σ_{c<S/2} Σ_x |ψ_c(x)|² / totalNorm
 * - Antiparticle fraction: Σ_{c≥S/2} Σ_x |ψ_c(x)|² / totalNorm
 *
 * Output: [totalNorm, maxDensity, particleNorm, antiparticleNorm]
 *
 * Pass 1 (`diracDiagNormReduceBlock`):
 *   Each workgroup reduces a chunk of spinor data into partial sums.
 *
 * Pass 2 (`diracDiagNormFinalizeBlock`):
 *   A single workgroup reduces the partial sums into final scalars.
 *
 * @workgroup_size(256) for both passes
 * @module
 */

/** Pass 1: Reduce spinor data -> partial sums. One workgroup per chunk. */
export const diracDiagNormReduceBlock = /* wgsl */ `
struct DiracDiagUniforms {
  totalSites: u32,
  numWorkgroups: u32,
  spinorSize: u32,
  _pad0: u32,
}

@group(0) @binding(0) var<uniform> diagParams: DiracDiagUniforms;
@group(0) @binding(1) var<storage, read> spinorRe: array<f32>;
@group(0) @binding(2) var<storage, read> spinorIm: array<f32>;
@group(0) @binding(3) var<storage, read_write> partialNorm: array<f32>;
@group(0) @binding(4) var<storage, read_write> partialMax: array<f32>;
@group(0) @binding(5) var<storage, read_write> partialParticle: array<f32>;
@group(0) @binding(6) var<storage, read_write> partialAnti: array<f32>;

// Pack 3 additive channels (norm, particle, anti) into a vec3 — cuts
// tree-reduce shared-memory ops 4→2 per step. Max stays separate.
// norm = particle + anti so we can drop the third accumulator.
var<workgroup> shared_add: array<vec3<f32>, 256>;
var<workgroup> shared_max: array<f32, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let idx = gid.x;
  let local = lid.x;
  let S = diagParams.spinorSize;
  let half = S >> 1u;

  var particleD: f32 = 0.0;
  var antiD: f32 = 0.0;

  if (idx < diagParams.totalSites) {
    // Sum |ψ_c|² over all spinor components at this site
    let T = diagParams.totalSites;
    for (var c: u32 = 0u; c < S; c = c + 1u) {
      let bufIdx = c * T + idx;
      let re = spinorRe[bufIdx];
      let im = spinorIm[bufIdx];
      let d = re * re + im * im;
      if (c < half) {
        particleD += d;
      } else {
        antiD += d;
      }
    }
  }

  let totalD = particleD + antiD;
  shared_add[local] = vec3<f32>(totalD, particleD, antiD);
  shared_max[local] = totalD;
  workgroupBarrier();

  // Tree reduction within workgroup
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_add[local] = shared_add[local] + shared_add[local + stride];
      shared_max[local] = max(shared_max[local], shared_max[local + stride]);
    }
    workgroupBarrier();
  }

  if (local == 0u) {
    let sum = shared_add[0];
    partialNorm[wid.x] = sum.x;
    partialMax[wid.x] = shared_max[0];
    partialParticle[wid.x] = sum.y;
    partialAnti[wid.x] = sum.z;
  }
}
`

/** Pass 2: Reduce partial sums -> final results. Single workgroup. */
export const diracDiagNormFinalizeBlock = /* wgsl */ `
struct DiracDiagUniforms {
  totalSites: u32,
  numWorkgroups: u32,
  spinorSize: u32,
  _pad0: u32,
}

@group(0) @binding(0) var<uniform> diagParams: DiracDiagUniforms;
@group(0) @binding(1) var<storage, read> partialNorm: array<f32>;
@group(0) @binding(2) var<storage, read> partialMax: array<f32>;
@group(0) @binding(3) var<storage, read_write> result: array<f32>;
@group(0) @binding(4) var<storage, read> partialParticle: array<f32>;
@group(0) @binding(5) var<storage, read> partialAnti: array<f32>;

var<workgroup> shared_add: array<vec3<f32>, 256>;
var<workgroup> shared_max: array<f32, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_id) lid: vec3u,
) {
  let local = lid.x;

  var acc: vec3<f32> = vec3<f32>(0.0, 0.0, 0.0);
  var max_val: f32 = 0.0;
  let ngroups = diagParams.numWorkgroups;
  var i = local;
  while (i < ngroups) {
    acc = acc + vec3<f32>(partialNorm[i], partialParticle[i], partialAnti[i]);
    max_val = max(max_val, partialMax[i]);
    i += 256u;
  }
  shared_add[local] = acc;
  shared_max[local] = max_val;
  workgroupBarrier();

  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_add[local] = shared_add[local] + shared_add[local + stride];
      shared_max[local] = max(shared_max[local], shared_max[local + stride]);
    }
    workgroupBarrier();
  }

  // Output: [0]=totalNorm, [1]=maxDensity, [2]=particleNorm, [3]=antiparticleNorm
  if (local == 0u) {
    let sum = shared_add[0];
    result[0] = sum.x;
    result[1] = shared_max[0];
    result[2] = sum.y;
    result[3] = sum.z;
  }
}
`
