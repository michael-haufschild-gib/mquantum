/**
 * TDSE Stochastic Localization Compute Shader
 *
 * Applies continuous spontaneous localization (CSL) kicks to the wavefunction
 * after each Strang splitting step. Each collapse center applies a Gaussian-weighted
 * multiplicative update to psi, implementing the stochastic Schrödinger equation:
 *
 *   dψ = (-i/ℏ)Hψ dt + Σ_k √γ (L_k - ⟨L_k⟩) ψ dW_k
 *
 * The ⟨L_k⟩ expectation values are computed by a separate reduction pass and
 * stored in the expectation buffer. If the expectation buffer is not available,
 * falls back to the renormalization-corrected form (no ⟨L_k⟩ subtraction).
 *
 * Center packing: 3 vec4f per center (12 floats):
 *   vec4(x0, x1, x2, x3), vec4(x4, x5, x6, x7), vec4(x8, x9, x10, noise)
 * Supports up to 11 spatial dimensions.
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
  // Collapse centers: packed as 3 × vec4f per center × 8 centers = 24 vec4f
  // Per center: (x0,x1,x2,x3), (x4,x5,x6,x7), (x8,x9,x10,noise)
  centers: array<vec4f, 24>,
};

@group(0) @binding(0) var<uniform> tdseParams: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> psiIm: array<f32>;
@group(0) @binding(3) var<uniform> sParams: StochasticParams;
@group(0) @binding(4) var<storage, read> expectations: array<f32>;

// Helper: read coordinate d from center k's packed vec4 triplet
fn getCenterCoord(k: u32, d: u32) -> f32 {
  let vecIdx = k * 3u + d / 4u;
  let comp = d % 4u;
  return sParams.centers[vecIdx][comp];
}

// Helper: read noise value from center k (stored at index 11 within the triplet)
fn getCenterNoise(k: u32) -> f32 {
  // Noise is at vec4 index k*3+2, component 3
  return sParams.centers[k * 3u + 2u][3];
}

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
    // Compute squared distance from this site to collapse center in all dims
    var distSq: f32 = 0.0;
    for (var d: u32 = 0u; d < tdseParams.latticeDim; d++) {
      let diff = coords[d] - getCenterCoord(k, d);
      distSq += diff * diff;
    }

    // Gaussian weight: exp(-|x - c|² / (2σ²))
    let weight = exp(-distSq * invTwoSigmaSq);

    // SSE diffusion: √(γ·dt) · G(x, c, σ) · (ξ_k - ⟨L_k⟩)
    let noise = getCenterNoise(k);
    let expectation = expectations[k];
    totalFactor += sqrt(sParams.gamma * sParams.dt) * weight * (noise - expectation);
  }

  // Multiplicative update: ψ *= (1 + totalFactor)
  let scale = 1.0 + totalFactor;
  psiRe[idx] = psiRe[idx] * scale;
  psiIm[idx] = psiIm[idx] * scale;
}
`
