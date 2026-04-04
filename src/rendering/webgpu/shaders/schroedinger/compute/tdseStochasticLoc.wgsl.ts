/**
 * TDSE Stochastic Localization Compute Shader
 *
 * Applies continuous spontaneous localization (CSL) kicks to the wavefunction
 * after each Strang splitting step. Each collapse center applies a Gaussian-weighted
 * multiplicative update to psi, implementing the stochastic Schrödinger equation:
 *
 *   dψ = (-i/ℏ)Hψ dt + Σ_k √γ (L_k - ⟨L_k⟩) ψ dW_k
 *
 * Simplified to the renormalization-corrected form (no ⟨L_k⟩ subtraction):
 *   ψ[i] *= (1 + Σ_k √(γ·dt)·G(x_i, c_k, σ)·ξ_k)   where ξ_k ~ N(0,1)
 *
 * Norm drift from the multiplicative noise is corrected by the existing
 * renormalization pass (step 9 in Strang splitting).
 *
 * @workgroup_size(64) — matches LINEAR_WG
 * @module
 */

export const tdseStochasticLocBlock = /* wgsl */ `
struct StochasticParams {
  gamma: f32,
  sigma: f32,
  numCollapseSites: u32,
  stepIndex: u32,
  seed: u32,
  dt: f32,
  _pad0: u32,
  _pad1: u32,
  // Collapse centers: packed as (x, y, z, noise_value) × 8
  centers: array<vec4f, 8>,
};

@group(0) @binding(0) var<uniform> tdseParams: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> psiIm: array<f32>;
@group(0) @binding(3) var<uniform> sParams: StochasticParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= tdseParams.totalSites) {
    return;
  }

  // Convert flat index to N-D lattice coordinates
  var coords: array<f32, 12>;
  var rem = idx;
  for (var d: u32 = 0u; d < tdseParams.latticeDim; d++) {
    let stride = tdseParams.strides[d];
    let ci = rem / stride;
    rem = rem % stride;
    // World coordinate: centered grid
    let halfExtent = f32(tdseParams.gridSize[d]) * tdseParams.spacing[d] * 0.5;
    coords[d] = f32(ci) * tdseParams.spacing[d] - halfExtent;
  }

  // Accumulate multiplicative factor from all collapse centers
  var totalFactor: f32 = 0.0;
  let invTwoSigmaSq = 1.0 / (2.0 * sParams.sigma * sParams.sigma);

  for (var k: u32 = 0u; k < sParams.numCollapseSites; k++) {
    let center = sParams.centers[k];
    // center.xyz = world-space collapse center, center.w = dW noise value

    // Compute squared distance from this site to collapse center
    var distSq: f32 = 0.0;
    // Use first 3 dims (matching visible lattice dims for the center)
    let numDims = min(tdseParams.latticeDim, 3u);
    for (var d: u32 = 0u; d < numDims; d++) {
      var diff: f32;
      if (d == 0u) { diff = coords[0] - center.x; }
      else if (d == 1u) { diff = coords[1] - center.y; }
      else { diff = coords[2] - center.z; }
      distSq += diff * diff;
    }

    // Gaussian weight: exp(-|x - c|² / (2σ²))
    let weight = exp(-distSq * invTwoSigmaSq);

    // Euler-Maruyama diffusion: √(γ·dt) · G(x, c, σ) · ξ,  ξ ~ N(0,1)
    totalFactor += sqrt(sParams.gamma * sParams.dt) * weight * center.w;
  }

  // Multiplicative update: ψ *= (1 + totalFactor)
  let scale = 1.0 + totalFactor;
  psiRe[idx] = psiRe[idx] * scale;
  psiIm[idx] = psiIm[idx] * scale;
}
`
