/**
 * TDSE Half-Step Potential Compute Shader
 *
 * Applies only the potential propagator in a half-step of the Strang splitting:
 *
 *   ψ(x) → exp(-iV_eff(x)·dt/(2ℏ)) · ψ(x)
 *
 * Absorbing boundary conditions are applied in a SEPARATE pass after the
 * full Strang step (potential → kinetic → potential). This prevents the FFT
 * kinetic step from seeing spatially-modulated amplitudes from the absorber,
 * which it would scatter across k-space and inject as spurious amplitude at
 * barriers and slits.
 *
 * The effective potential includes the GPE nonlinear term when g ≠ 0:
 *   V_eff(x) = V(x) + g|ψ|²
 *
 * Requires tdseUniformsBlock + freeScalarNDIndexBlock to be prepended.
 *
 * @workgroup_size(64)
 * @module
 */

export const tdseApplyPotentialHalfBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> psiIm: array<f32>;
@group(0) @binding(3) var<storage, read> potential: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  let re = psiRe[idx];
  let im = psiIm[idx];

  // Effective potential: V(x) + g|ψ|² (GPE nonlinear term; g=0 for linear TDSE)
  let density = re * re + im * im;
  let effectiveV = potential[idx] + params.interactionStrength * density;

  let arg = effectiveV * params.dt / (2.0 * max(params.hbar, 1e-6));

  if (params.imaginaryTime != 0u) {
    // Imaginary-time (Wick rotation): exp(-V·dτ/(2ℏ)) — real exponential decay
    let decay = exp(-arg);
    psiRe[idx] = re * decay;
    psiIm[idx] = im * decay;
  } else {
    // Real-time: exp(-i·V·dt/(2ℏ)) — unitary phase rotation
    let phase = -arg;
    let cosP = cos(phase);
    let sinP = sin(phase);
    psiRe[idx] = re * cosP - im * sinP;
    psiIm[idx] = re * sinP + im * cosP;
  }
}
`
