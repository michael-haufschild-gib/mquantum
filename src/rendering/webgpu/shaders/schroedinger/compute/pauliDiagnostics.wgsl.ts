/**
 * Pauli Diagnostics Compute Shader — Parallel Reduction
 *
 * Two-pass parallel reduction for spin-resolved diagnostics of the 2-component
 * Pauli spinor field.
 *
 * Computed quantities:
 *   totalNorm:  Σ_x (|ψ_up|² + |ψ_down|²)
 *   normUp:     Σ_x |ψ_up|²
 *   normDown:   Σ_x |ψ_down|²
 *   sigmaX:     2 Σ_x Re(ψ_up*(x) ψ_down(x))   [= ⟨σ_x⟩ unnormalized]
 *   sigmaY:     2 Σ_x Im(ψ_up*(x) ψ_down(x))   [= ⟨σ_y⟩ unnormalized; note sign: ψ†σ_y ψ = 2 Im(ψ_up* ψ_down)]
 *   sigmaZ:     Σ_x (|ψ_up|² - |ψ_down|²)      [= ⟨σ_z⟩ unnormalized]
 *   maxDensity: max_x (|ψ_up|² + |ψ_down|²)
 *   pad:        0.0 (reserved)
 *
 * Result buffer layout: [totalNorm, normUp, normDown, sigmaX, sigmaY, sigmaZ, maxDensity, pad]
 *
 * Pass 1 (`pauliDiagReduceBlock`):
 *   Each workgroup reduces its chunk of sites into a partial result (8 floats per workgroup).
 *   @workgroup_size(64)
 *
 * Pass 2 (`pauliDiagFinalizeBlock`):
 *   A single workgroup reduces all partial results into the final 8-float output.
 *   @workgroup_size(64)
 *
 * @module
 */

/** Pass 1: reduce spinor data → partial sums. One workgroup per chunk. */
export const pauliDiagReduceBlock = /* wgsl */ `
struct PauliDiagUniforms {
  totalSites: u32,
  numWorkgroups: u32,
  spinorSize: u32,
  _pad: u32,
}

@group(0) @binding(0) var<uniform> diagParams: PauliDiagUniforms;
@group(0) @binding(1) var<storage, read> spinorRe: array<f32>;
@group(0) @binding(2) var<storage, read> spinorIm: array<f32>;
@group(0) @binding(3) var<storage, read_write> partial: array<f32>;

// 8 quantities × 64 threads
var<workgroup> sh_totalNorm: array<f32, 64>;
var<workgroup> sh_normUp: array<f32, 64>;
var<workgroup> sh_normDown: array<f32, 64>;
var<workgroup> sh_sigmaX: array<f32, 64>;
var<workgroup> sh_sigmaY: array<f32, 64>;
var<workgroup> sh_sigmaZ: array<f32, 64>;
var<workgroup> sh_maxDensity: array<f32, 64>;

@compute @workgroup_size(64)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let idx = gid.x;
  let local = lid.x;
  let T = diagParams.totalSites;

  var totalNorm: f32 = 0.0;
  var normUp: f32 = 0.0;
  var normDown: f32 = 0.0;
  var sigmaX: f32 = 0.0;
  var sigmaY: f32 = 0.0;
  var sigmaZ: f32 = 0.0;
  var maxDensity: f32 = 0.0;

  if (idx < T) {
    let re0 = spinorRe[idx];
    let im0 = spinorIm[idx];
    let re1 = spinorRe[T + idx];
    let im1 = spinorIm[T + idx];

    let d0 = re0 * re0 + im0 * im0;  // |ψ_up|²
    let d1 = re1 * re1 + im1 * im1;  // |ψ_down|²
    let total = d0 + d1;

    // ψ_up* · ψ_down = (re0 - i im0)(re1 + i im1)
    //                 = (re0·re1 + im0·im1) + i(re0·im1 - im0·re1)
    let cohRe = re0 * re1 + im0 * im1;
    let cohIm = re0 * im1 - im0 * re1;

    totalNorm = total;
    normUp = d0;
    normDown = d1;
    sigmaX = 2.0 * cohRe;                // ⟨σ_x⟩ unnormalized
    sigmaY = 2.0 * cohIm;                // ⟨σ_y⟩ unnormalized (2 Im(ψ_up* ψ_down))
    sigmaZ = d0 - d1;                    // ⟨σ_z⟩ unnormalized
    maxDensity = total;
  }

  sh_totalNorm[local] = totalNorm;
  sh_normUp[local] = normUp;
  sh_normDown[local] = normDown;
  sh_sigmaX[local] = sigmaX;
  sh_sigmaY[local] = sigmaY;
  sh_sigmaZ[local] = sigmaZ;
  sh_maxDensity[local] = maxDensity;
  workgroupBarrier();

  // Tree reduction (64 threads → 1)
  for (var stride: u32 = 32u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      sh_totalNorm[local] += sh_totalNorm[local + stride];
      sh_normUp[local] += sh_normUp[local + stride];
      sh_normDown[local] += sh_normDown[local + stride];
      sh_sigmaX[local] += sh_sigmaX[local + stride];
      sh_sigmaY[local] += sh_sigmaY[local + stride];
      sh_sigmaZ[local] += sh_sigmaZ[local + stride];
      sh_maxDensity[local] = max(sh_maxDensity[local], sh_maxDensity[local + stride]);
    }
    workgroupBarrier();
  }

  if (local == 0u) {
    // Each workgroup writes 8 floats starting at wid.x * 8
    let base = wid.x * 8u;
    partial[base + 0u] = sh_totalNorm[0];
    partial[base + 1u] = sh_normUp[0];
    partial[base + 2u] = sh_normDown[0];
    partial[base + 3u] = sh_sigmaX[0];
    partial[base + 4u] = sh_sigmaY[0];
    partial[base + 5u] = sh_sigmaZ[0];
    partial[base + 6u] = sh_maxDensity[0];
    partial[base + 7u] = 0.0;
  }
}
`

/** Pass 2: reduce partial sums → final 8-float result. Single workgroup. */
export const pauliDiagFinalizeBlock = /* wgsl */ `
struct PauliDiagUniforms {
  totalSites: u32,
  numWorkgroups: u32,
  spinorSize: u32,
  _pad: u32,
}

@group(0) @binding(0) var<uniform> diagParams: PauliDiagUniforms;
@group(0) @binding(1) var<storage, read> partial: array<f32>;
@group(0) @binding(2) var<storage, read_write> result: array<f32>;

var<workgroup> sh_totalNorm: array<f32, 64>;
var<workgroup> sh_normUp: array<f32, 64>;
var<workgroup> sh_normDown: array<f32, 64>;
var<workgroup> sh_sigmaX: array<f32, 64>;
var<workgroup> sh_sigmaY: array<f32, 64>;
var<workgroup> sh_sigmaZ: array<f32, 64>;
var<workgroup> sh_maxDensity: array<f32, 64>;

@compute @workgroup_size(64)
fn main(@builtin(local_invocation_id) lid: vec3u) {
  let local = lid.x;

  var totalNorm: f32 = 0.0;
  var normUp: f32 = 0.0;
  var normDown: f32 = 0.0;
  var sigmaX: f32 = 0.0;
  var sigmaY: f32 = 0.0;
  var sigmaZ: f32 = 0.0;
  var maxDensity: f32 = 0.0;

  // Each thread accumulates from multiple workgroups (strided)
  var i = local;
  while (i < diagParams.numWorkgroups) {
    let base = i * 8u;
    totalNorm += partial[base + 0u];
    normUp += partial[base + 1u];
    normDown += partial[base + 2u];
    sigmaX += partial[base + 3u];
    sigmaY += partial[base + 4u];
    sigmaZ += partial[base + 5u];
    maxDensity = max(maxDensity, partial[base + 6u]);
    i += 64u;
  }

  sh_totalNorm[local] = totalNorm;
  sh_normUp[local] = normUp;
  sh_normDown[local] = normDown;
  sh_sigmaX[local] = sigmaX;
  sh_sigmaY[local] = sigmaY;
  sh_sigmaZ[local] = sigmaZ;
  sh_maxDensity[local] = maxDensity;
  workgroupBarrier();

  for (var stride: u32 = 32u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      sh_totalNorm[local] += sh_totalNorm[local + stride];
      sh_normUp[local] += sh_normUp[local + stride];
      sh_normDown[local] += sh_normDown[local + stride];
      sh_sigmaX[local] += sh_sigmaX[local + stride];
      sh_sigmaY[local] += sh_sigmaY[local + stride];
      sh_sigmaZ[local] += sh_sigmaZ[local + stride];
      sh_maxDensity[local] = max(sh_maxDensity[local], sh_maxDensity[local + stride]);
    }
    workgroupBarrier();
  }

  // Result layout: [totalNorm, normUp, normDown, sigmaX, sigmaY, sigmaZ, maxDensity, pad]
  if (local == 0u) {
    result[0] = sh_totalNorm[0];
    result[1] = sh_normUp[0];
    result[2] = sh_normDown[0];
    result[3] = sh_sigmaX[0];
    result[4] = sh_sigmaY[0];
    result[5] = sh_sigmaZ[0];
    result[6] = sh_maxDensity[0];
    result[7] = 0.0;
  }
}
`
