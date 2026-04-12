/**
 * Free Scalar Field — Leapfrog Pi-Update Compute Shader
 *
 * Updates the canonical conjugate momentum π = a^(n−2)·δφ' using the
 * Hamilton equation of motion on a (possibly time-dependent, possibly
 * anisotropic) cosmological background:
 *
 *   dπ/dη = Σ_d (aPot_d · ∂²_d δφ) − mass²·aFull · δφ − aFull · V'(δφ)
 *
 * On isotropic FLRW presets (Minkowski, de Sitter, ekpyrotic, Kasner stiff)
 * every axis shares `aPot_d = aPotential` and the sum collapses to
 * `aPotential · ∇²δφ`. Under the Bianchi-I vacuum Kasner preset the three
 * spatial axes carry different coefficients `aPot_i = ã^n / a_i²`. The
 * CPU uploads the axis-0 value into `params.aPotential` and the other two
 * as **ratios** `aPotentialRatio1 = aPot_1/aPot_0`,
 * `aPotentialRatio2 = aPot_2/aPot_0` so the 528-byte uniform struct stays
 * intact.
 *
 * Bit-identity property: under every isotropic preset the CPU uploads
 * `aPotentialRatio1 = aPotentialRatio2 = 1.0`. The shader expresses the
 * anisotropic force as
 *
 *   force = aPotential · laplacian
 *         + aPotential · (aPotentialRatio1 − 1) · axialLap_1
 *         + aPotential · (aPotentialRatio2 − 1) · axialLap_2
 *
 * The two correction terms multiply by exactly `0.0` under ratios = 1 and
 * contribute nothing to the sum — so the flat-background shader output is
 * bit-identical to the pre-change single-coefficient form. Only axes 0..2
 * participate in the anisotropy; axes d ≥ 3 (higher-dim lattices) always
 * use the bare `aPotential` per the scope constraints of Bianchi-I.
 *
 * Physical dispersion (bounded — no 1/η² pole): ω² = k² + mass²·a². This is
 * the whole point of evolving the physical δφ instead of the old
 * Mukhanov-Sasaki `v = a^((n−2)/2)·δφ`: leapfrog CFL only sees the physical
 * frequency and stays stable through horizon crossing.
 *
 * The discrete Laplacian uses periodic boundary conditions and loops over
 * 0..latticeDim for N-D support:
 *   laplacian = sum_d (phi[n+e_d] - 2*phi[n] + phi[n-e_d]) / a_d^2
 *
 * Requires freeScalarUniformsBlock + freeScalarNDIndexBlock to be prepended.
 */

export const freeScalarUpdatePiBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: FreeScalarUniforms;
@group(0) @binding(1) var<storage, read> phi: array<f32>;
@group(0) @binding(2) var<storage, read_write> pi: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) { return; }

  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);
  let phiCenter = phi[idx];
  var laplacian: f32 = 0.0;
  // Cache axis-1 and axis-2 contributions separately so the Bianchi-I
  // correction terms can multiply them without re-traversing the stencil.
  // Under isotropic presets the corrections evaluate to 0*axialLap = 0
  // and the final force reduces bit-identically to the pre-change form
  // aPotential * laplacian.
  var axialLap1: f32 = 0.0;
  var axialLap2: f32 = 0.0;

  for (var d: u32 = 0u; d < params.latticeDim; d++) {
    if (params.gridSize[d] <= 1u) { continue; }

    // Stride-based neighbor lookup: O(1) per dimension instead of O(D)
    let stride = params.strides[d];
    let coord = coords[d];
    let fwdIdx = select(idx + stride, idx - stride * (params.gridSize[d] - 1u), coord == params.gridSize[d] - 1u);
    let bwdIdx = select(idx - stride, idx + stride * (params.gridSize[d] - 1u), coord == 0u);

    let a2 = max(params.spacing[d] * params.spacing[d], 1e-12);
    let axialLap = (phi[fwdIdx] - 2.0 * phiCenter + phi[bwdIdx]) / a2;
    laplacian += axialLap;
    if (d == 1u) { axialLap1 = axialLap; }
    else if (d == 2u) { axialLap2 = axialLap; }
  }

  // Hamilton kick equation in the canonical delta-phi variables:
  //   d(pi)/d(eta) = aPotential * laplacian(phi)
  //                + aPotential * (aPotentialRatio1 − 1) * axialLap_1
  //                + aPotential * (aPotentialRatio2 − 1) * axialLap_2
  //                - mass^2 * aFull * massSquaredScale(eta) * phi
  //                - aFull * V'(phi)
  // Under the Minkowski / de Sitter / Kasner / ekpyrotic presets the CPU
  // uploads ratios = 1 and the two correction terms vanish exactly; the
  // expression reduces bit-identically to the pre-Bianchi form
  // aPotential * laplacian - massCoef * phi - Vprime. Under Bianchi-I
  // vacuum Kasner the non-unity ratios drive each axis gradient
  // contribution separately — the visible cigar distortion.
  let massCoef = params.mass * params.mass * params.aFull * params.massSquaredScale;
  var force = params.aPotential * laplacian
            + params.aPotential * (params.aPotentialRatio1 - 1.0) * axialLap1
            + params.aPotential * (params.aPotentialRatio2 - 1.0) * axialLap2
            - massCoef * phiCenter;

  // Self-interaction: V(phi) = lambda*(phi^2 - v^2)^2,
  //                   V'(phi) = 4*lambda*phi*(phi^2 - v^2).
  // Weighted by aFull so the action term (int d(eta) d^d x  a^n  V(phi)) lands
  // in the pi-update with the right time-dependent strength.
  if (params.selfInteractionEnabled != 0u) {
    let v2 = params.selfInteractionVev * params.selfInteractionVev;
    let phi2 = phiCenter * phiCenter;
    force -= params.aFull * 4.0 * params.selfInteractionLambda * phiCenter * (phi2 - v2);
  }

  pi[idx] = pi[idx] + params.dt * force;
}
`
