/**
 * Pauli Wavefunction Renormalization Compute Shader
 *
 * Pauli-local variant of the shared renormalize shader. Scales the merged
 * `spinor: array<vec2f>` buffer in place by sqrt(targetNorm / currentNorm)
 * so the per-component vec2f (re, im) is scaled as a single SIMD multiply
 * instead of two scalar loads/stores into split Re/Im buffers.
 *
 * Dispatch count: components * totalSites (one thread per vec2f slot).
 *
 * @workgroup_size(64)
 * @module
 */

import { assembleShaderBlocks } from '../../shared/compose-helpers'
import { renormalizeFiniteGuardBlock } from './renormalize.wgsl'

export const pauliRenormalizeBlock = assembleShaderBlocks([
  { name: 'renormalize-finite-guard', content: renormalizeFiniteGuardBlock },
  {
    name: 'pauli-renormalize',
    content: /* wgsl */ `
struct PauliRenormUniforms {
  totalElements: u32,  // components * totalSites (number of vec2f slots)
  targetNorm: f32,     // initial ||ψ||² to restore to
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> renormUni: PauliRenormUniforms;
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

  // Guard: skip if either norm is invalid or overflowed. A bad reduction must
  // not turn the renormalization scale into zero/Inf and corrupt every spinor.
  if (!isSafeRenormNorm(currentNorm) || !isSafeRenormNorm(targetNorm)) {
    return;
  }

  let ratio = targetNorm / currentNorm;
  if (!isSafeRenormNorm(ratio)) {
    return;
  }
  let scale = sqrt(ratio);
  spinor[idx] = spinor[idx] * scale;
}
`,
  },
]).wgsl
