/**
 * TDSE Stochastic Localization Compute Shader
 *
 * Applies continuous spontaneous localization (CSL) kicks to the wavefunction.
 * Uses the CENTERED combined noise field W(x) - ⟨W⟩ where:
 *   W(x) = Σ_k L_k(x) · ξ_k
 *   ⟨W⟩ = Σ|ψ|² · W / Σ|ψ|²  (computed by separate reduction pass)
 *
 * The centering ensures (W - ⟨W⟩) has zero density-weighted mean, which:
 * - Preserves norm in expectation (martingale property)
 * - Prevents the drift term from uniformly suppressing density
 * - Works correctly at any σ (broad or narrow)
 *
 * Exponential discretization:
 *   ψ *= exp(√(γ·dt) · (W - ⟨W⟩) - (γ/2) · (W - ⟨W⟩)² · dt)
 *
 * Supports up to 32 collapse centers for a smooth effective collapse field.
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
  // Collapse centers: packed as 3 × vec4f per center × 32 centers = 96 vec4f
  // Per center: (x0,x1,x2,x3), (x4,x5,x6,x7), (x8,x9,x10,noise)
  centers: array<vec4f, 96>,
};

@group(0) @binding(0) var<storage, read> tdseParams: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> psiRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> psiIm: array<f32>;
@group(0) @binding(3) var<uniform> sParams: StochasticParams;
@group(0) @binding(4) var<storage, read> expectResult: array<f32>;

// Helper: read coordinate d from center k's packed vec4 triplet
fn getCenterCoord(k: u32, d: u32) -> f32 {
  let vecIdx = k * 3u + d / 4u;
  let comp = d % 4u;
  return sParams.centers[vecIdx][comp];
}

// Helper: read noise value from center k (stored at index 11 within the triplet)
fn getCenterNoise(k: u32) -> f32 {
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
    let halfExtent = f32(tdseParams.gridSize[d]) * tdseParams.spacing[d] * 0.5;
    coords[d] = f32(ci) * tdseParams.spacing[d] - halfExtent;
  }

  let invTwoSigmaSq = 1.0 / (2.0 * sParams.sigma * sParams.sigma);
  let sqrtGammaDt = sqrt(sParams.gamma * sParams.dt);
  let halfGammaDt = 0.5 * sParams.gamma * sParams.dt;
  let normFactor = pow(
    3.14159265 * sParams.sigma * sParams.sigma,
    -f32(tdseParams.latticeDim) * 0.25
  );

  // Compute W(x) = Σ_k L_k(x) · ξ_k (combined noise field at this site)
  var noiseField: f32 = 0.0;
  for (var k: u32 = 0u; k < sParams.numCollapseSites; k++) {
    var distSq: f32 = 0.0;
    for (var d: u32 = 0u; d < tdseParams.latticeDim; d++) {
      let diff = coords[d] - getCenterCoord(k, d);
      distSq += diff * diff;
    }
    let weight = normFactor * exp(-distSq * invTwoSigmaSq);
    noiseField += weight * getCenterNoise(k);
  }

  // Read ⟨W⟩ from the reduction result (computed by expect pass)
  let expectW = expectResult[0];

  // Centered noise field: removes the density-weighted mean
  let wCentered = noiseField - expectW;

  // Exponential Milstein discretization with centering:
  //   ψ *= exp(√(γ·dt) · (W - ⟨W⟩) - (γ/2) · (W - ⟨W⟩)² · dt)
  let factor = sqrtGammaDt * wCentered - halfGammaDt * wCentered * wCentered;
  let scale = exp(factor);
  psiRe[idx] = psiRe[idx] * scale;
  psiIm[idx] = psiIm[idx] * scale;
}
`
