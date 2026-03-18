/**
 * Pauli Spinor Renormalization Compute Shader
 *
 * Reads totalNorm from the diagnostic result buffer (computed by the
 * reduction pass) and scales all spinor elements by 1/√(totalNorm).
 * This restores ||ψ||² = initialNorm, counteracting f32 precision drift
 * in the split-step FFT.
 *
 * Run periodically (every ~10 steps) between Strang splitting iterations.
 * The diagnostic reduction must have been dispatched first so that
 * diagResult[0] contains the current totalNorm.
 *
 * @workgroup_size(64)
 * @module
 */

export const pauliRenormalizeBlock = /* wgsl */ `
struct RenormUniforms {
  totalElements: u32,  // 2 * totalSites (both spinor components)
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

@group(0) @binding(0) var<uniform> renormUni: RenormUniforms;
@group(0) @binding(1) var<storage, read> diagResult: array<f32>;
@group(0) @binding(2) var<storage, read_write> spinorRe: array<f32>;
@group(0) @binding(3) var<storage, read_write> spinorIm: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= renormUni.totalElements) {
    return;
  }

  // diagResult[0] = totalNorm = ||ψ||² = Σ(|ψ_up|² + |ψ_down|²) × dV
  let totalNorm = diagResult[0];

  // Guard: skip if norm is zero, negative, or NaN
  if (totalNorm <= 0.0 || totalNorm != totalNorm) {
    return;
  }

  // Scale factor: multiply by 1/√(totalNorm) to restore ||ψ||² = 1
  // (or more precisely, restore to the norm the diagnostic reduction measures as 1.0)
  let scale = inverseSqrt(totalNorm);

  spinorRe[idx] = spinorRe[idx] * scale;
  spinorIm[idx] = spinorIm[idx] * scale;
}
`
