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
// See freeScalarInit.wgsl for why this binding is 'storage, read'.
@group(0) @binding(0) var<storage, read> params: FreeScalarUniforms;
@group(0) @binding(1) var<storage, read> phi: array<f32>;
@group(0) @binding(2) var<storage, read_write> pi: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) { return; }

  let phiCenter = phi[idx];
  var laplacian: f32 = 0.0;
  var axialLap1: f32 = 0.0;
  var axialLap2: f32 = 0.0;

  if (params.latticeDim == 3u) {
    // ── 3D fast path ──
    // Strides are power-of-2; shift/mask beats divide/mul-sub by ~10× on
    // every backend. Spacing divides replaced with pre-reciprocal multiplies.
    let s0 = params.strides[0];
    let s1 = params.strides[1];
    // s2 = 1 for C-order strides (row-major, last dim contiguous)
    let N0 = params.gridSize[0];
    let N1 = params.gridSize[1];
    let N2 = params.gridSize[2];

    let log0 = firstTrailingBit(s0);
    let log1 = firstTrailingBit(s1);
    let c0 = idx >> log0;
    let r0 = idx & (s0 - 1u);
    let c1 = r0 >> log1;
    let c2 = r0 & (s1 - 1u);

    // 1/Δx² per axis — one reciprocal per axis, multiplies inside loops.
    let invA2_0 = 1.0 / max(params.spacing[0] * params.spacing[0], 1e-12);
    let invA2_1 = 1.0 / max(params.spacing[1] * params.spacing[1], 1e-12);
    let invA2_2 = 1.0 / max(params.spacing[2] * params.spacing[2], 1e-12);

    // Axis 0 Laplacian
    let fwd0 = select(idx + s0, idx - s0 * (N0 - 1u), c0 == N0 - 1u);
    let bwd0 = select(idx - s0, idx + s0 * (N0 - 1u), c0 == 0u);
    let axialLap0 = (phi[fwd0] - 2.0 * phiCenter + phi[bwd0]) * invA2_0;

    // Axis 1 Laplacian
    let fwd1 = select(idx + s1, idx - s1 * (N1 - 1u), c1 == N1 - 1u);
    let bwd1 = select(idx - s1, idx + s1 * (N1 - 1u), c1 == 0u);
    axialLap1 = (phi[fwd1] - 2.0 * phiCenter + phi[bwd1]) * invA2_1;

    // Axis 2 Laplacian (stride = 1 for the last C-order dimension)
    let fwd2 = select(idx + 1u, idx - (N2 - 1u), c2 == N2 - 1u);
    let bwd2 = select(idx - 1u, idx + (N2 - 1u), c2 == 0u);
    axialLap2 = (phi[fwd2] - 2.0 * phiCenter + phi[bwd2]) * invA2_2;

    laplacian = axialLap0 + axialLap1 + axialLap2;
  } else {
    // ── Generic N-D path ──
    let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);
    let ldim = params.latticeDim;

    for (var d: u32 = 0u; d < ldim; d = d + 1u) {
      if (params.gridSize[d] <= 1u) { continue; }

      let stride = params.strides[d];
      let coord = coords[d];
      let fwdIdx = select(idx + stride, idx - stride * (params.gridSize[d] - 1u), coord == params.gridSize[d] - 1u);
      let bwdIdx = select(idx - stride, idx + stride * (params.gridSize[d] - 1u), coord == 0u);

      let invA2 = 1.0 / max(params.spacing[d] * params.spacing[d], 1e-12);
      let axialLap = (phi[fwdIdx] - 2.0 * phiCenter + phi[bwdIdx]) * invA2;
      laplacian += axialLap;
      if (d == 1u) { axialLap1 = axialLap; }
      else if (d == 2u) { axialLap2 = axialLap; }
    }
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
  // Factor aPotential out of the three gradient contributions (3 muls → 1 mul).
  let aniso = laplacian
            + (params.aPotentialRatio1 - 1.0) * axialLap1
            + (params.aPotentialRatio2 - 1.0) * axialLap2;
  var force = params.aPotential * aniso - massCoef * phiCenter;

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
