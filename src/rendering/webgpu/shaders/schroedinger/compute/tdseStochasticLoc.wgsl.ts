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
 * Two variants: tdseStochasticLocBlock (1-D, workgroup_size(64)) and
 * tdseStochasticLocBlock3D (3-D, workgroup_size(4,4,4), gid.xyz). See
 * pickSiteDispatch in computePassUtils for the selection rule.
 *
 * @workgroup_size(64) (1-D variant) | @workgroup_size(4, 4, 4) (3-D variant)
 * @module
 */

/** Shared bindings + helpers used by both variants. */
const TDSE_STOCH_LOC_PRELUDE = /* wgsl */ `
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
@group(0) @binding(1) var<storage, read_write> psi: array<vec2f>;
@group(0) @binding(2) var<uniform> sParams: StochasticParams;
@group(0) @binding(3) var<storage, read> expectResult: array<f32>;

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
`

/**
 * Shared body. Expects 'idx', 'coords' (array<f32,12> of worldspace
 * positions), and 'ldim' to be defined by the prologue.
 */
const TDSE_STOCH_LOC_BODY = /* wgsl */ `
  let invTwoSigmaSq = 1.0 / (2.0 * sParams.sigma * sParams.sigma);
  let sqrtGammaDt = sqrt(sParams.gamma * sParams.dt);
  let halfGammaDt = 0.5 * sParams.gamma * sParams.dt;
  let normFactor = pow(
    3.14159265358979323846 * sParams.sigma * sParams.sigma,
    -f32(ldim) * 0.25
  );

  // Compute W(x) = normFactor · Σ_k exp(-d²/(2σ²)) · ξ_k.
  // Factor normFactor out of the inner loop — one mul saved per collapse site.
  // 6σ cutoff: beyond that exp(-18) ≈ 1.5e-8 is below f32 precision after the
  // ξ·normFactor scaling. Must match the cutoff in tdseStochasticExpect so
  // ⟨W⟩ and W(x) are computed from the same effective formula — otherwise the
  // centering would be inconsistent and violate the martingale property.
  let maxDistSq = 36.0 * sParams.sigma * sParams.sigma;
  var rawSum: f32 = 0.0;
  let nSites = sParams.numCollapseSites;
  for (var k: u32 = 0u; k < nSites; k = k + 1u) {
    var distSq: f32 = 0.0;
    for (var d: u32 = 0u; d < ldim; d = d + 1u) {
      let diff = coords[d] - getCenterCoord(k, d);
      distSq += diff * diff;
    }
    if (distSq < maxDistSq) {
      rawSum += exp(-distSq * invTwoSigmaSq) * getCenterNoise(k);
    }
  }
  let noiseField = normFactor * rawSum;

  // Centered noise field: removes the density-weighted mean ⟨W⟩.
  let wCentered = noiseField - expectResult[0];

  // Exponential Milstein discretization with centering:
  //   ψ *= exp(√(γ·dt)·(W − ⟨W⟩) − (γ/2)·(W − ⟨W⟩)²·dt)
  let factor = sqrtGammaDt * wCentered - halfGammaDt * wCentered * wCentered;
  let scale = exp(factor);
  psi[idx] = psi[idx] * scale;
`

/** 1-D variant: linear dispatch, linearToND-equivalent shift/mask coord loop. */
export const tdseStochasticLocBlock =
  TDSE_STOCH_LOC_PRELUDE +
  /* wgsl */ `
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= tdseParams.totalSites) {
    return;
  }

  // Lattice-coord decomposition. Strides are products of power-of-2 grid
  // dims → shift/mask beats u32 divide/modulo here.
  // VOXEL-CENTERED: site i at (i - N/2 + 0.5)*s — same convention as
  // tdseInit, tdsePotential, and the density-grid path. The earlier
  // corner-aligned i*s - N*s/2 placed lattice site i at a position
  // 0.5*s away from where the Hamiltonian places it, so a CSL Gaussian
  // centered at "physical x = 0" landed on a different lattice site
  // than V(x = 0); for sigma <~ spacing that's a real systematic offset.
  var coords: array<f32, 12>;
  var rem = idx;
  let ldim = tdseParams.latticeDim;
  for (var d: u32 = 0u; d < ldim; d = d + 1u) {
    let stride = tdseParams.strides[d];
    let logStride = firstTrailingBit(stride);
    let ci = rem >> logStride;
    rem = rem & (stride - 1u);
    coords[d] = (f32(ci) - f32(tdseParams.gridSize[d]) * 0.5 + 0.5) * tdseParams.spacing[d];
  }
${TDSE_STOCH_LOC_BODY}
}
`

/** 3-D variant: workgroup_size(4,4,4), gid.xyz → worldspace coords. */
export const tdseStochasticLocBlock3D =
  TDSE_STOCH_LOC_PRELUDE +
  /* wgsl */ `
@compute @workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= tdseParams.gridSize[0]
   || gid.y >= tdseParams.gridSize[1]
   || gid.z >= tdseParams.gridSize[2]) {
    return;
  }
  let idx =
    gid.x * tdseParams.strides[0] +
    gid.y * tdseParams.strides[1] +
    gid.z * tdseParams.strides[2];

  // Direct worldspace coords from gid.xyz — skips the per-thread shift/mask
  // decomposition the 1-D variant performs. Voxel-centered to match
  // tdseInit/tdsePotential (see 1-D variant comment).
  let ldim = tdseParams.latticeDim;
  var coords: array<f32, 12>;
  coords[0] = (f32(gid.x) - f32(tdseParams.gridSize[0]) * 0.5 + 0.5) * tdseParams.spacing[0];
  coords[1] = (f32(gid.y) - f32(tdseParams.gridSize[1]) * 0.5 + 0.5) * tdseParams.spacing[1];
  coords[2] = (f32(gid.z) - f32(tdseParams.gridSize[2]) * 0.5 + 0.5) * tdseParams.spacing[2];
${TDSE_STOCH_LOC_BODY}
}
`
