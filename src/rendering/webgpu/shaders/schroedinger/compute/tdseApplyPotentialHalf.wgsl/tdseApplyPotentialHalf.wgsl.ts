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
@group(0) @binding(0) var<storage, read> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psi: array<vec2f>;
@group(0) @binding(2) var<storage, read> potential: array<f32>;

const POT_INV_TWO_PI: f32 = 0.15915494309189535;
const POT_TWO_PI: f32 = 6.283185307179587;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) {
    return;
  }

  let z = psi[idx];
  let re = z.x;
  let im = z.y;

  // Effective potential: V(x) + g|ψ|² (GPE nonlinear term; g=0 for linear TDSE)
  let density = re * re + im * im;
  let effectiveV = potential[idx] + params.interactionStrength * density;

  // Uniform-only: dt/(2·max(ℏ,ε)) — one reciprocal per thread turns into a multiply.
  let halfDtOverHbar = (0.5 * params.dt) / max(params.hbar, 1e-6);
  let arg = effectiveV * halfDtOverHbar;

  if (params.imaginaryTime != 0u) {
    // Imaginary-time (Wick rotation): exp(-V·dτ/(2ℏ)) — real exponential decay
    let decay = exp(-arg);
    psi[idx] = vec2f(re * decay, im * decay);
  } else {
    // Real-time: exp(-i·V·dt/(2ℏ)) — unitary phase rotation.
    // Reduce arg (not -arg) to [-π, π] for f32 trig precision on high-V/small-ℏ,
    // then fold the sign of -arg into the complex multiply: cos is even, sin is odd.
    let argReduced = arg - round(arg * POT_INV_TWO_PI) * POT_TWO_PI;
    let cosP = cos(argReduced);
    let sinP = sin(argReduced);
    // exp(−i·arg)·(re + i·im) = (re·cosP + im·sinP) + i·(im·cosP − re·sinP)
    psi[idx] = vec2f(re * cosP + im * sinP, im * cosP - re * sinP);
  }
}
`
