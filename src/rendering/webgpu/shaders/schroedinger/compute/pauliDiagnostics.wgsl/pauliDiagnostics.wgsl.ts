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
@group(0) @binding(1) var<storage, read> spinor: array<vec2f>;
@group(0) @binding(2) var<storage, read_write> partial: array<f32>;

// Pack 4 independent additive channels (normUp, normDown, sigmaX, sigmaY) into a
// single vec4. totalNorm = normUp + normDown and sigmaZ = normUp - normDown are
// derived on final write — no need to reduce them separately. Max stays scalar
// (different reduction op). Tree-reduction shared-mem ops per step: 7 → 2.
var<workgroup> sh_add: array<vec4<f32>, 64>;
var<workgroup> sh_max: array<f32, 64>;

@compute @workgroup_size(64)
fn main(
  @builtin(global_invocation_id) gid: vec3u,
  @builtin(local_invocation_id) lid: vec3u,
  @builtin(workgroup_id) wid: vec3u,
) {
  let idx = gid.x;
  let local = lid.x;
  let T = diagParams.totalSites;

  var acc: vec4<f32> = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  var maxDensity: f32 = 0.0;

  if (idx < T) {
    // Merged vec2f layout: one 8-byte load per component.
    let v0 = spinor[idx];
    let v1 = spinor[T + idx];
    let re0 = v0.x;
    let im0 = v0.y;
    let re1 = v1.x;
    let im1 = v1.y;

    let d0 = re0 * re0 + im0 * im0;  // |ψ_up|²
    let d1 = re1 * re1 + im1 * im1;  // |ψ_down|²

    // ψ_up* · ψ_down = (re0 - i im0)(re1 + i im1)
    //                 = (re0·re1 + im0·im1) + i(re0·im1 - im0·re1)
    let cohRe = re0 * re1 + im0 * im1;
    let cohIm = re0 * im1 - im0 * re1;

    acc = vec4<f32>(d0, d1, 2.0 * cohRe, 2.0 * cohIm);
    maxDensity = d0 + d1;
  }

  sh_add[local] = acc;
  sh_max[local] = maxDensity;
  workgroupBarrier();

  // Tree reduction (64 threads → 1)
  for (var stride: u32 = 32u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      sh_add[local] = sh_add[local] + sh_add[local + stride];
      sh_max[local] = max(sh_max[local], sh_max[local + stride]);
    }
    workgroupBarrier();
  }

  if (local == 0u) {
    let sum = sh_add[0];           // (normUp, normDown, sigmaX, sigmaY)
    let nUp = sum.x;
    let nDn = sum.y;
    // Each workgroup writes 8 floats starting at wid.x * 8
    let base = wid.x * 8u;
    partial[base + 0u] = nUp + nDn;    // totalNorm
    partial[base + 1u] = nUp;           // normUp
    partial[base + 2u] = nDn;           // normDown
    partial[base + 3u] = sum.z;         // sigmaX
    partial[base + 4u] = sum.w;         // sigmaY
    partial[base + 5u] = nUp - nDn;     // sigmaZ
    partial[base + 6u] = sh_max[0];     // maxDensity
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

// Pack 4 independent additive channels (normUp, normDown, sigmaX, sigmaY) and
// derive totalNorm, sigmaZ on final write — matches reduce-pass packing.
var<workgroup> sh_add: array<vec4<f32>, 64>;
var<workgroup> sh_max: array<f32, 64>;

@compute @workgroup_size(64)
fn main(@builtin(local_invocation_id) lid: vec3u) {
  let local = lid.x;

  var acc: vec4<f32> = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  var maxDensity: f32 = 0.0;

  // Each thread accumulates from multiple workgroups (strided).
  let ngroups = diagParams.numWorkgroups;
  var i = local;
  while (i < ngroups) {
    let base = i * 8u;
    acc = acc + vec4<f32>(
      partial[base + 1u],           // normUp
      partial[base + 2u],           // normDown
      partial[base + 3u],           // sigmaX
      partial[base + 4u]            // sigmaY
    );
    maxDensity = max(maxDensity, partial[base + 6u]);
    i += 64u;
  }

  sh_add[local] = acc;
  sh_max[local] = maxDensity;
  workgroupBarrier();

  for (var stride: u32 = 32u; stride > 0u; stride >>= 1u) {
    if (local < stride) {
      sh_add[local] = sh_add[local] + sh_add[local + stride];
      sh_max[local] = max(sh_max[local], sh_max[local + stride]);
    }
    workgroupBarrier();
  }

  // Result layout: [totalNorm, normUp, normDown, sigmaX, sigmaY, sigmaZ, maxDensity, pad]
  if (local == 0u) {
    let sum = sh_add[0];
    let nUp = sum.x;
    let nDn = sum.y;
    result[0] = nUp + nDn;     // totalNorm
    result[1] = nUp;            // normUp
    result[2] = nDn;            // normDown
    result[3] = sum.z;          // sigmaX
    result[4] = sum.w;          // sigmaY
    result[5] = nUp - nDn;      // sigmaZ
    result[6] = sh_max[0];      // maxDensity
    result[7] = 0.0;
  }
}
`
