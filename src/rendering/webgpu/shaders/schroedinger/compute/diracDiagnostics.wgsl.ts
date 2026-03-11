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

var<workgroup> shared_norm: array<f32, 256>;
var<workgroup> shared_max: array<f32, 256>;
var<workgroup> shared_particle: array<f32, 256>;
var<workgroup> shared_anti: array<f32, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let idx = gid.x;
  let local = lid.x;
  let S = diagParams.spinorSize;
  let half = S / 2u;

  var totalD: f32 = 0.0;
  var particleD: f32 = 0.0;
  var antiD: f32 = 0.0;

  if (idx < diagParams.totalSites) {
    // Sum |ψ_c|² over all spinor components at this site
    for (var c: u32 = 0u; c < S; c++) {
      let bufIdx = c * diagParams.totalSites + idx;
      let re = spinorRe[bufIdx];
      let im = spinorIm[bufIdx];
      let d = re * re + im * im;
      totalD += d;
      if (c < half) {
        particleD += d;
      } else {
        antiD += d;
      }
    }
  }

  shared_norm[local] = totalD;
  shared_max[local] = totalD;
  shared_particle[local] = particleD;
  shared_anti[local] = antiD;
  workgroupBarrier();

  // Tree reduction within workgroup
  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_norm[local] += shared_norm[local + stride];
      shared_max[local] = max(shared_max[local], shared_max[local + stride]);
      shared_particle[local] += shared_particle[local + stride];
      shared_anti[local] += shared_anti[local + stride];
    }
    workgroupBarrier();
  }

  if (local == 0u) {
    partialNorm[wid.x] = shared_norm[0];
    partialMax[wid.x] = shared_max[0];
    partialParticle[wid.x] = shared_particle[0];
    partialAnti[wid.x] = shared_anti[0];
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

var<workgroup> shared_norm: array<f32, 256>;
var<workgroup> shared_max: array<f32, 256>;
var<workgroup> shared_particle: array<f32, 256>;
var<workgroup> shared_anti: array<f32, 256>;

@compute @workgroup_size(256)
fn main(
  @builtin(local_invocation_id) lid: vec3u,
) {
  let local = lid.x;

  var norm_val: f32 = 0.0;
  var max_val: f32 = 0.0;
  var particle_val: f32 = 0.0;
  var anti_val: f32 = 0.0;
  var i = local;
  while (i < diagParams.numWorkgroups) {
    norm_val += partialNorm[i];
    max_val = max(max_val, partialMax[i]);
    particle_val += partialParticle[i];
    anti_val += partialAnti[i];
    i += 256u;
  }
  shared_norm[local] = norm_val;
  shared_max[local] = max_val;
  shared_particle[local] = particle_val;
  shared_anti[local] = anti_val;
  workgroupBarrier();

  for (var stride: u32 = 128u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      shared_norm[local] += shared_norm[local + stride];
      shared_max[local] = max(shared_max[local], shared_max[local + stride]);
      shared_particle[local] += shared_particle[local + stride];
      shared_anti[local] += shared_anti[local + stride];
    }
    workgroupBarrier();
  }

  // Output: [0]=totalNorm, [1]=maxDensity, [2]=particleNorm, [3]=antiparticleNorm
  if (local == 0u) {
    result[0] = shared_norm[0];
    result[1] = shared_max[0];
    result[2] = shared_particle[0];
    result[3] = shared_anti[0];
  }
}
`
