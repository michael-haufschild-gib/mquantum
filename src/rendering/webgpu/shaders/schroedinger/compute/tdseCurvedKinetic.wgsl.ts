/**
 * TDSE Curved-Space Kinetic + RK4 Helper Compute Shaders
 *
 * Implements the Laplace–Beltrami kinetic operator for the curved-space TDSE
 * across 8 metric kinds (v2). Used only when the RK4 integrator runs —
 * i.e. when `config.metric?.kind` is neither `'flat'` nor `'torus'`. The
 * split-step FFT path handles flat and torus (torus = flat + FFT's native
 * periodic wrap), preserving the v1 zero-regression guarantee.
 *
 * Metric kinds and their u32 codes (must match TDSEComputePassUniforms.ts):
 *   0 = flat, 1 = morrisThorne, 2 = schwarzschild, 3 = deSitter,
 *   4 = antiDeSitter, 5 = sphere2D, 6 = torus, 7 = doubleThroat.
 *
 * Discretization: staggered 2nd-order central differences with Dirichlet
 * boundaries (ψ = 0 outside the grid). Hermitian under the proper-volume
 * inner product on a uniform lattice (see CPU reference in
 * `lib/physics/tdse/metrics/curvedKineticRef.ts`).
 *
 * Time-dependent metrics (deSitter): the kinetic kernel reads the current
 * RK4 stage index from a small group-1 uniform and selects one of the
 * four stage-time fields in TDSEUniforms (stageTimeK1..K4). Static metrics
 * ignore `time` so the extra indirection is zero-cost.
 *
 * Four kernels live here; together they implement one classical RK4 step of
 * ∂_t ψ = (−i/ℏ) · Ĥ ψ with Ĥ = T_LB + V:
 *
 *   - tdseCurvedKineticBlock: out = T_LB · ψ_in (pure kinetic)
 *   - tdseCurvedBuildKBlock:  k   = (−i/ℏ) · (T_LB · ψ_in + V · ψ_in)
 *   - tdseCurvedStageBlock:   staged = ψ + α · k  (prepare next RK4 input)
 *   - tdseCurvedAccumulateBlock: ψ += coef · dt · k  (final combine)
 *
 * Each kernel expects `tdseUniformsBlock + freeScalarNDIndexBlock` to be
 * prepended. Metric is evaluated per-cell from `params.metricKind` +
 * `params.throatRadius`; no separate metric buffers are required for v1.
 *
 * @workgroup_size(64)
 * @module
 */

/** Shared helpers used by every curved-space kernel in this file. */
const curvedHelpers = /* wgsl */ `
struct CurvedMetric {
  sqrtDet: f32,
  gInvDiag: array<f32, 12>,
}

// Numerical safety constants (mirror lib/physics/tdse/metrics/evaluator.ts).
const CURVED_SCHW_MIN_RADIUS: f32 = 0.01;
const CURVED_ADS_MIN_Z: f32 = 0.05;
const CURVED_SPHERE_POLE_EPS: f32 = 0.05;
const CURVED_MT_MIN_RADIUS: f32 = 1e-4;

// World coordinate of cell index i along an axis with N cells and spacing dx.
fn curvedWorldCoord(i: f32, N: f32, dx: f32) -> f32 {
  return (i - (N - 1.0) * 0.5) * dx;
}

// Morris–Thorne transverse radius r(l) = sqrt(b0^2 + l^2). Returns max(r, eps)
// so a deep-subgrid throat cannot produce 1/0.
fn mtRadius(l: f32, b0: f32) -> f32 {
  let safeB = max(b0, 0.1);
  return max(sqrt(safeB * safeB + l * l), CURVED_MT_MIN_RADIUS);
}

// Double-throat effective radius: b₀ + 0.5·(√(s²/4+(l−s/2)²) + √(s²/4+(l+s/2)²) − s).
// (Matches lib/physics/tdse/metrics/evaluator.ts::doubleThroatRadius.)
fn dtRadius(l: f32, b0: f32, s: f32) -> f32 {
  let half = 0.5 * s;
  let left = sqrt(half * half + (l - half) * (l - half));
  let right = sqrt(half * half + (l + half) * (l + half));
  return max(b0 + 0.5 * (left + right - s), CURVED_MT_MIN_RADIUS);
}

// Wrapped lattice index for periodic axes; pass-through for non-periodic.
// Callers must check bounds when periodic = false.
fn wrappedIndex(i: i32, N: u32, periodic: bool) -> i32 {
  if (!periodic) { return i; }
  let nI = i32(N);
  // ((i % N) + N) % N — branchless positive-modulo for all int inputs.
  return ((i % nI) + nI) % nI;
}

// Whether a given axis is periodic for the active metric kind.
// v2a: only torus kind (6u). sphere2D φ periodicity is deferred (axis-wise
// periodic flags would require broader plumbing). Torus routes to the FFT
// path in v2a, so this helper is exposed for Wave 6 / future kinds but is
// effectively Dirichlet throughout the kinetic kernel.
fn axisIsPeriodic(kind: u32, axis: u32) -> bool {
  return kind == 6u;
}

// Per-stage RK4 simulation time. stage ∈ {0,1,2,3} maps to stageTimeK{1..4}.
fn curvedStageTime(stage: u32) -> f32 {
  switch (stage) {
    case 0u: { return params.stageTimeK1; }
    case 1u: { return params.stageTimeK2; }
    case 2u: { return params.stageTimeK3; }
    case 3u: { return params.stageTimeK4; }
    default: { return params.stageTimeK1; }
  }
}

// Sample the diagonal inverse metric g^μμ and √|g| at world-space coords.
// 'time' is consulted only by time-dependent kinds (currently deSitter).
fn evalMetric(kind: u32, coords: array<f32, 12>, dim: u32, time: f32) -> CurvedMetric {
  var out: CurvedMetric;
  // Default: flat.
  for (var d: u32 = 0u; d < 12u; d++) {
    out.gInvDiag[d] = 1.0;
  }
  out.sqrtDet = 1.0;

  // Morris–Thorne: axis 0 = l (proper distance), transverse axes share r(l).
  if (kind == 1u && dim >= 2u) {
    let r = mtRadius(coords[0], params.throatRadius);
    let invR2 = 1.0 / (r * r);
    out.gInvDiag[0] = 1.0;
    for (var d: u32 = 1u; d < dim; d++) {
      out.gInvDiag[d] = invR2;
    }
    var sqrtDet: f32 = 1.0;
    for (var d: u32 = 1u; d < dim; d++) {
      sqrtDet = sqrtDet * r;
    }
    out.sqrtDet = sqrtDet;
    return out;
  }

  // Schwarzschild in isotropic coords: g_ij = ψ⁴ δ_ij, ψ = 1 + M/(2r).
  // ⇒ g^ij = ψ⁻⁴ δ_ij, √|g| = ψ^(2·dim).
  if (kind == 2u) {
    let M = max(params.schwarzschildMass, 0.01);
    var r2: f32 = 0.0;
    for (var d: u32 = 0u; d < dim; d++) {
      r2 = r2 + coords[d] * coords[d];
    }
    let rMin = max(M * 0.5, CURVED_SCHW_MIN_RADIUS);
    let r = max(sqrt(r2), rMin);
    let psi = 1.0 + M / (2.0 * r);
    let psi2 = psi * psi;
    let psi4 = psi2 * psi2;
    let invPsi4 = 1.0 / psi4;
    for (var d: u32 = 0u; d < dim; d++) {
      out.gInvDiag[d] = invPsi4;
    }
    var sqrtDet: f32 = 1.0;
    for (var d: u32 = 0u; d < dim; d++) {
      sqrtDet = sqrtDet * psi2;
    }
    out.sqrtDet = sqrtDet;
    return out;
  }

  // de Sitter spatial slice: g_ij = a² δ_ij, a(t) = exp(H·t).
  if (kind == 3u) {
    let H = max(params.hubbleRate, 0.0);
    let a = exp(H * time);
    let invA2 = 1.0 / max(a * a, 1e-12);
    for (var d: u32 = 0u; d < dim; d++) {
      out.gInvDiag[d] = invA2;
    }
    var sqrtDet: f32 = 1.0;
    for (var d: u32 = 0u; d < dim; d++) {
      sqrtDet = sqrtDet * a;
    }
    out.sqrtDet = sqrtDet;
    return out;
  }

  // Anti-de Sitter (Poincaré half-space, axis 0 = z):
  // g_ij = (L/z)² δ_ij ⇒ g^ij = (z/L)² δ_ij, √|g| = (L/z)^dim.
  if (kind == 4u) {
    let L = max(params.adsRadius, 0.1);
    let z = max(abs(coords[0]), CURVED_ADS_MIN_Z);
    let zOverL = z / L;
    let gInv = zOverL * zOverL;
    for (var d: u32 = 0u; d < dim; d++) {
      out.gInvDiag[d] = gInv;
    }
    let LoverZ = L / z;
    var sqrtDet: f32 = 1.0;
    for (var d: u32 = 0u; d < dim; d++) {
      sqrtDet = sqrtDet * LoverZ;
    }
    out.sqrtDet = sqrtDet;
    return out;
  }

  // 2-sphere of radius R on axes (θ,φ) = (1,2); needs dim ≥ 3.
  if (kind == 5u && dim >= 3u) {
    let R = max(params.sphereRadius, 0.1);
    let thetaRaw = coords[1];
    let theta = min(max(thetaRaw, CURVED_SPHERE_POLE_EPS), 3.141592653589793 - CURVED_SPHERE_POLE_EPS);
    let sinTheta = sin(theta);
    let invR2 = 1.0 / (R * R);
    // Axis 0 and any axis ≥ 3 stay flat (gInvDiag = 1 by default).
    out.gInvDiag[1] = invR2;
    out.gInvDiag[2] = invR2 / max(sinTheta * sinTheta, 1e-12);
    // √|g| contribution: R² sinθ. Extra flat axes contribute ×1.
    out.sqrtDet = R * R * sinTheta;
    return out;
  }

  // Torus: flat metric; periodic BC is a boundary concern, not a metric one.
  // Falls through to default flat output.
  if (kind == 6u) {
    return out;
  }

  // Double-throat wormhole along axis 0: same transverse structure as MT
  // but r(l) features two throat shoulders at ±s/2.
  if (kind == 7u && dim >= 2u) {
    let b0 = max(params.doubleThroatRad, 0.1);
    let s = max(params.doubleThroatSep, 0.2);
    let r = dtRadius(coords[0], b0, s);
    let invR2 = 1.0 / (r * r);
    out.gInvDiag[0] = 1.0;
    for (var d: u32 = 1u; d < dim; d++) {
      out.gInvDiag[d] = invR2;
    }
    var sqrtDet: f32 = 1.0;
    for (var d: u32 = 1u; d < dim; d++) {
      sqrtDet = sqrtDet * r;
    }
    out.sqrtDet = sqrtDet;
    return out;
  }

  // Unknown/flat kinds fall through to flat (identity) output.
  return out;
}

// Cell-center world coordinates for lattice index (via coords[] from linearToND).
fn curvedCellCoords(latCoords: array<u32, 12>, dim: u32) -> array<f32, 12> {
  var w: array<f32, 12>;
  for (var d: u32 = 0u; d < 12u; d++) {
    w[d] = 0.0;
  }
  for (var d: u32 = 0u; d < dim; d++) {
    let N = f32(params.gridSize[d]);
    w[d] = curvedWorldCoord(f32(latCoords[d]), N, params.spacing[d]);
  }
  return w;
}

// ── Diagnostic curvature scalars (provided for Wave 6 visualization) ────
// These are NOT invoked by the kinetic kernel — they exist so downstream
// overlays can query curvature without re-implementing the metric dispatch.
// Keep formulas in sync with lib/physics/tdse/metrics/evaluator.ts.
fn ricciScalarWGSL(coords: array<f32, 12>, dim: u32, time: f32) -> f32 {
  let kind = params.metricKind;
  // flat / torus / schwarzschild → 0 (vacuum Ricci).
  if (kind == 0u || kind == 6u || kind == 2u) { return 0.0; }
  if (kind == 5u) {
    let R = max(params.sphereRadius, 0.1);
    return 2.0 / (R * R);
  }
  if (kind == 3u) {
    let H = max(params.hubbleRate, 0.0);
    let n = f32(dim);
    // Suppress unused-param warning for static curvature.
    let _ = time;
    return n * (n - 1.0) * H * H;
  }
  if (kind == 4u) {
    let L = max(params.adsRadius, 0.1);
    let n = f32(dim);
    return -(n * (n - 1.0)) / (L * L);
  }
  if (kind == 1u) {
    let b0 = max(params.throatRadius, 0.1);
    let l = coords[0];
    let r = sqrt(b0 * b0 + l * l);
    let rPrime = l / r;
    let rDoublePrime = (b0 * b0) / (r * r * r);
    return 2.0 * (1.0 - rPrime * rPrime) / (r * r) - 2.0 * rDoublePrime / r;
  }
  if (kind == 7u) {
    // Superposition of two MT throats at ±s/2 (plan-approved approximation).
    let b0 = max(params.doubleThroatRad, 0.1);
    let s = max(params.doubleThroatSep, 0.2);
    let lLeft = coords[0] - 0.5 * s;
    let lRight = coords[0] + 0.5 * s;
    let rL = sqrt(b0 * b0 + lLeft * lLeft);
    let rR = sqrt(b0 * b0 + lRight * lRight);
    let rpL = lLeft / rL; let rppL = (b0 * b0) / (rL * rL * rL);
    let rpR = lRight / rR; let rppR = (b0 * b0) / (rR * rR * rR);
    let ricciL = 2.0 * (1.0 - rpL * rpL) / (rL * rL) - 2.0 * rppL / rL;
    let ricciR = 2.0 * (1.0 - rpR * rpR) / (rR * rR) - 2.0 * rppR / rR;
    return ricciL + ricciR;
  }
  return 0.0;
}

fn kretschmannScalarWGSL(coords: array<f32, 12>, dim: u32, time: f32) -> f32 {
  let _t = time;
  // Only non-zero for Schwarzschild: K = 48 M² / r⁶.
  if (params.metricKind != 2u) { return 0.0; }
  let M = max(params.schwarzschildMass, 0.01);
  var r2: f32 = 0.0;
  for (var d: u32 = 0u; d < dim; d++) {
    r2 = r2 + coords[d] * coords[d];
  }
  let rMin = max(M * 0.5, CURVED_SCHW_MIN_RADIUS);
  let r = max(sqrt(r2), rMin);
  let r2f = r * r;
  let r6 = r2f * r2f * r2f;
  return (48.0 * M * M) / r6;
}
`

/**
 * Evaluate T_LB · ψ and write the result to outRe/outIm.
 *
 * Output does NOT include V and does NOT include the (−i/ℏ) factor — the
 * caller fuses those in via {@link tdseCurvedBuildKBlock}.
 */
export const tdseCurvedKineticBlock = /* wgsl */ `
${curvedHelpers}

struct CurvedStageIndex { value: u32, _p0: u32, _p1: u32, _p2: u32 }

@group(0) @binding(0) var<uniform> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read> curvedKinPsiRe: array<f32>;
@group(0) @binding(2) var<storage, read> curvedKinPsiIm: array<f32>;
@group(0) @binding(3) var<storage, read_write> curvedKinOutRe: array<f32>;
@group(0) @binding(4) var<storage, read_write> curvedKinOutIm: array<f32>;
// Group 1: per-dispatch RK4 stage index (0..3). Selects one of
// stageTimeK1..K4 for time-dependent metrics.
@group(1) @binding(0) var<uniform> curvedKinStage: CurvedStageIndex;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) { return; }

  let coords = linearToND(idx, params.strides, params.gridSize, params.latticeDim);
  let cellW = curvedCellCoords(coords, params.latticeDim);
  let stageT = curvedStageTime(curvedKinStage.value);
  let mCenter = evalMetric(params.metricKind, cellW, params.latticeDim, stageT);
  let invSqrtDet = 1.0 / max(mCenter.sqrtDet, 1e-12);
  let prefactor = -(params.hbar * params.hbar) / (2.0 * max(params.mass, 1e-6));

  let psiCenterRe = curvedKinPsiRe[idx];
  let psiCenterIm = curvedKinPsiIm[idx];

  var divFluxRe: f32 = 0.0;
  var divFluxIm: f32 = 0.0;

  for (var axis: u32 = 0u; axis < params.latticeDim; axis++) {
    let dx = params.spacing[axis];
    let invDx = 1.0 / max(dx, 1e-12);
    let Naxis = params.gridSize[axis];
    let stride = params.strides[axis];
    let coordAxis = coords[axis];
    // axisIsPeriodic is exposed for future kinds; in v2a all active metric
    // kinds in this kernel use Dirichlet (torus is routed to FFT path).
    let periodic = axisIsPeriodic(params.metricKind, axis);

    // Plus neighbor ψ (Dirichlet: 0 outside grid; wrap when periodic).
    var psiPlusRe: f32 = 0.0;
    var psiPlusIm: f32 = 0.0;
    if (coordAxis + 1u < Naxis) {
      let idxPlus = idx + stride;
      psiPlusRe = curvedKinPsiRe[idxPlus];
      psiPlusIm = curvedKinPsiIm[idxPlus];
    } else if (periodic) {
      // Wrap to index 0 along this axis (subtract (N-1)*stride to move from
      // coordAxis=N-1 back to coordAxis=0 while keeping all other coords).
      let idxPlus = idx - (Naxis - 1u) * stride;
      psiPlusRe = curvedKinPsiRe[idxPlus];
      psiPlusIm = curvedKinPsiIm[idxPlus];
    }
    // Minus neighbor ψ.
    var psiMinusRe: f32 = 0.0;
    var psiMinusIm: f32 = 0.0;
    if (coordAxis >= 1u) {
      let idxMinus = idx - stride;
      psiMinusRe = curvedKinPsiRe[idxMinus];
      psiMinusIm = curvedKinPsiIm[idxMinus];
    } else if (periodic) {
      let idxMinus = idx + (Naxis - 1u) * stride;
      psiMinusRe = curvedKinPsiRe[idxMinus];
      psiMinusIm = curvedKinPsiIm[idxMinus];
    }

    // Half-point world coords along this axis (+½ and −½).
    var coordsPlus = cellW;
    coordsPlus[axis] = cellW[axis] + 0.5 * dx;
    var coordsMinus = cellW;
    coordsMinus[axis] = cellW[axis] - 0.5 * dx;

    let mPlus = evalMetric(params.metricKind, coordsPlus, params.latticeDim, stageT);
    let mMinus = evalMetric(params.metricKind, coordsMinus, params.latticeDim, stageT);
    let aPlus = mPlus.sqrtDet * mPlus.gInvDiag[axis];
    let aMinus = mMinus.sqrtDet * mMinus.gInvDiag[axis];

    // Staggered flux: F_+ = a_+ · (ψ_{+1} − ψ_0)/dx, F_− = a_− · (ψ_0 − ψ_{−1})/dx.
    let fluxPlusRe = aPlus * (psiPlusRe - psiCenterRe) * invDx;
    let fluxPlusIm = aPlus * (psiPlusIm - psiCenterIm) * invDx;
    let fluxMinusRe = aMinus * (psiCenterRe - psiMinusRe) * invDx;
    let fluxMinusIm = aMinus * (psiCenterIm - psiMinusIm) * invDx;

    divFluxRe = divFluxRe + (fluxPlusRe - fluxMinusRe) * invDx;
    divFluxIm = divFluxIm + (fluxPlusIm - fluxMinusIm) * invDx;
  }

  curvedKinOutRe[idx] = prefactor * invSqrtDet * divFluxRe;
  curvedKinOutIm[idx] = prefactor * invSqrtDet * divFluxIm;
}
`

/**
 * Combine kinetic output with V·ψ and multiply by (−i/ℏ) to produce one
 * RK4 derivative k = (−i/ℏ) · Ĥ · ψ_in.
 *
 * For real Ĥ acting on ψ = ψ_re + i·ψ_im:
 *   ∂_t ψ_re = (1/ℏ) · (Tψ + V·ψ)_im
 *   ∂_t ψ_im = −(1/ℏ) · (Tψ + V·ψ)_re
 */
export const tdseCurvedBuildKBlock = /* wgsl */ `
@group(0) @binding(0) var<uniform> params: TDSEUniforms;
@group(0) @binding(1) var<storage, read> curvedBkTRe: array<f32>;
@group(0) @binding(2) var<storage, read> curvedBkTIm: array<f32>;
@group(0) @binding(3) var<storage, read> curvedBkStageRe: array<f32>;
@group(0) @binding(4) var<storage, read> curvedBkStageIm: array<f32>;
@group(0) @binding(5) var<storage, read> curvedBkPotential: array<f32>;
@group(0) @binding(6) var<storage, read_write> curvedBkKRe: array<f32>;
@group(0) @binding(7) var<storage, read_write> curvedBkKIm: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.totalSites) { return; }

  let invHbar = 1.0 / max(params.hbar, 1e-6);
  let V = curvedBkPotential[idx];
  let hRe = curvedBkTRe[idx] + V * curvedBkStageRe[idx];
  let hIm = curvedBkTIm[idx] + V * curvedBkStageIm[idx];

  curvedBkKRe[idx] = invHbar * hIm;
  curvedBkKIm[idx] = -invHbar * hRe;
}
`

/**
 * Stage ψ_staged = ψ + (α · dt) · k, used to build the RK4 intermediate
 * states. The α factor (0.5 for k2/k3, 1.0 for k4) comes from a dedicated
 * small uniform buffer; `dt` is read from TDSEUniforms so the stage matches
 * the classical RK4 tableau exactly:
 *   k_2 = f(ψ + (dt/2)·k_1), k_3 = f(ψ + (dt/2)·k_2), k_4 = f(ψ + dt·k_3)
 *
 * Omitting the dt factor collapses RK4 to an unstable Euler-like scheme and
 * was the root cause of the curved-path wavefunction blow-up observed
 * during v1 preset bring-up.
 */
export const tdseCurvedStageBlock = /* wgsl */ `
struct CurvedScalarUniform { value: f32, _p0: f32, _p1: f32, _p2: f32 }

@group(0) @binding(0) var<uniform> curvedStageParams: TDSEUniforms;
@group(0) @binding(1) var<storage, read> curvedStagePsiRe: array<f32>;
@group(0) @binding(2) var<storage, read> curvedStagePsiIm: array<f32>;
@group(0) @binding(3) var<storage, read> curvedStageKRe: array<f32>;
@group(0) @binding(4) var<storage, read> curvedStageKIm: array<f32>;
@group(0) @binding(5) var<storage, read_write> curvedStageOutRe: array<f32>;
@group(0) @binding(6) var<storage, read_write> curvedStageOutIm: array<f32>;
@group(1) @binding(0) var<uniform> curvedStageAlpha: CurvedScalarUniform;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= curvedStageParams.totalSites) { return; }
  let s = curvedStageAlpha.value * curvedStageParams.dt;
  curvedStageOutRe[idx] = curvedStagePsiRe[idx] + s * curvedStageKRe[idx];
  curvedStageOutIm[idx] = curvedStagePsiIm[idx] + s * curvedStageKIm[idx];
}
`

/**
 * Final combine: ψ += coef · dt · k, applied once per k_m with coefficients
 * c_1 = 1/6, c_2 = 2/6, c_3 = 2/6, c_4 = 1/6. The coef multiplier is supplied
 * via a small uniform buffer; dt is read from TDSEUniforms.
 */
export const tdseCurvedAccumulateBlock = /* wgsl */ `
struct CurvedScalarUniform { value: f32, _p0: f32, _p1: f32, _p2: f32 }

@group(0) @binding(0) var<uniform> curvedAccParams: TDSEUniforms;
@group(0) @binding(1) var<storage, read_write> curvedAccPsiRe: array<f32>;
@group(0) @binding(2) var<storage, read_write> curvedAccPsiIm: array<f32>;
@group(0) @binding(3) var<storage, read> curvedAccKRe: array<f32>;
@group(0) @binding(4) var<storage, read> curvedAccKIm: array<f32>;
@group(1) @binding(0) var<uniform> curvedAccCoef: CurvedScalarUniform;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= curvedAccParams.totalSites) { return; }
  let s = curvedAccCoef.value * curvedAccParams.dt;
  curvedAccPsiRe[idx] = curvedAccPsiRe[idx] + s * curvedAccKRe[idx];
  curvedAccPsiIm[idx] = curvedAccPsiIm[idx] + s * curvedAccKIm[idx];
}
`
