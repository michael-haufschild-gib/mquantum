/**
 * Dirac Spinor Renormalization Compute Shader
 *
 * Dirac-specific variant of the shared renormalize kernel, operating on
 * the merged `array<vec2f>` spinor buffer. Scales every (re, im) pair by
 * `sqrt(targetNorm / currentNorm)` so the total L2 norm drifts back to
 * its initial value after f32 round-off accumulates.
 *
 * The shared `renormalizeBlock` takes two separate f32 bindings for re
 * and im — incompatible with the merged vec2f layout, hence this variant.
 *
 * @workgroup_size(64)
 * @module
 */

export const diracRenormalizeBlock = /* wgsl */ `
struct RenormUniforms {
  totalElements: u32,  // S * totalSites
  targetNorm: f32,     // initial ||ψ||² to restore to
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> renormUni: RenormUniforms;
@group(0) @binding(1) var<storage, read> diagResult: array<f32>;
@group(0) @binding(2) var<storage, read_write> spinor: array<vec2f>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= renormUni.totalElements) {
    return;
  }

  let currentNorm = diagResult[0];
  let targetNorm = renormUni.targetNorm;

  // Guard: skip if norms are invalid
  if (currentNorm <= 0.0 || currentNorm != currentNorm || targetNorm <= 0.0) {
    return;
  }

  // Scale: ψ *= √(target/current) so that ||ψ||² → targetNorm
  let scale = sqrt(targetNorm / currentNorm);
  spinor[idx] = spinor[idx] * scale;
}
`
