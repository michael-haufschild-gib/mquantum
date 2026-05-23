/**
 * Wavefunction Renormalization Compute Shader
 *
 * Reads currentNorm from the diagnostic result buffer and scales ψ by
 * √(targetNorm / currentNorm) to restore the original amplitude scale.
 *
 * Unlike dividing by √(currentNorm) (which forces norm to 1.0 and breaks
 * the display pipeline), this preserves the initial amplitude range while
 * correcting f32 drift.
 *
 * Mode-agnostic: works for TDSE (1 component), Pauli (2 components),
 * and Dirac (S components). The caller sets totalElements and targetNorm.
 *
 * @workgroup_size(64)
 * @module
 */

export const renormalizeFiniteGuardBlock = /* wgsl */ `
const RENORM_MAX_SAFE_NORM: f32 = 1.0e30;

fn isSafeRenormNorm(value: f32) -> bool {
  // Comparisons reject NaN and +/-Inf; the ceiling prevents an overflowed
  // diagnostic reduction from turning the renormalization scale into zero.
  return value > 0.0 && value < RENORM_MAX_SAFE_NORM;
}
`

/**
 * TDSE-variant renormalization using a single vec2f ψ buffer (merged
 * Re+Im, 8-byte stride). See {@link renormalizeBlock} for the canonical
 * docstring; this fork exists because TDSE merged its split psiRe/psiIm
 * into one `psi: array<vec2f>` buffer for bandwidth savings, while
 * Dirac/Pauli still use the split layout (their spinor buffers have more
 * than 2 components and the split form lets the renormalize kernel treat
 * them as a single flat array). Keep this block in sync with
 * `renormalizeBlock`'s math — the only difference is the binding layout.
 */
export const tdseRenormalizeVec2Block =
  renormalizeFiniteGuardBlock +
  /* wgsl */ `
struct RenormUniforms {
  totalElements: u32,  // = totalSites (one vec2f per site)
  targetNorm: f32,
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> renormUni: RenormUniforms;
@group(0) @binding(1) var<storage, read> diagResult: array<f32>;
@group(0) @binding(2) var<storage, read_write> psi: array<vec2f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= renormUni.totalElements) {
    return;
  }
  let currentNorm = diagResult[0];
  let targetNorm = renormUni.targetNorm;
  if (!isSafeRenormNorm(currentNorm) || !isSafeRenormNorm(targetNorm)) {
    return;
  }
  let scale = sqrt(targetNorm / currentNorm);
  psi[idx] = psi[idx] * scale;
}
`

export const renormalizeBlock =
  renormalizeFiniteGuardBlock +
  /* wgsl */ `
struct RenormUniforms {
  totalElements: u32,  // components * totalSites
  targetNorm: f32,     // initial ||ψ||² to restore to
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> renormUni: RenormUniforms;
@group(0) @binding(1) var<storage, read> diagResult: array<f32>;
@group(0) @binding(2) var<storage, read_write> psiRe: array<f32>;
@group(0) @binding(3) var<storage, read_write> psiIm: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= renormUni.totalElements) {
    return;
  }

  let currentNorm = diagResult[0];
  let targetNorm = renormUni.targetNorm;

  // Guard: skip if norms are invalid or overflowed.
  if (!isSafeRenormNorm(currentNorm) || !isSafeRenormNorm(targetNorm)) {
    return;
  }

  // Scale: ψ *= √(target/current) so that ||ψ||² → targetNorm
  let scale = sqrt(targetNorm / currentNorm);

  psiRe[idx] = psiRe[idx] * scale;
  psiIm[idx] = psiIm[idx] * scale;
}
`
