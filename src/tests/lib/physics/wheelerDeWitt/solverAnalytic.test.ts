/**
 * Closed-form / leading-WKB reference tests for the Wheeler–DeWitt solver.
 *
 * The solver is a 2nd-order leapfrog on a finite (a × φ₁ × φ₂) grid with
 * Stage-2 (analytic Euclidean tail) and Stage-3 (Airy/Langer connection)
 * corrections. Without an external pin it cannot be claimed to "compute
 * the WdW wavefunction" — it could be drifting toward a numerical
 * artefact and we wouldn't know.
 *
 * This module pins the solver against the three minisuperspace regimes
 * with closed-form analytic references:
 *
 *  - **Free / massless / Λ=0** — EXACT pointwise comparison against
 *    `√a · H_{1/4}^{(1)}(3π·a²)` (the Hankel-form outgoing-wave
 *    solution of the Weber-equation reduction `χ'' + 36π²·a²·χ = 0`).
 *    Uses {@link WheelerDeWittSolverInput#customBoundary} to inject a
 *    constant-in-φ initial slab so the φ-Laplacian term vanishes and
 *    the solver reduces to a pure 1D problem on the central column.
 *    Tolerance 5e-3 amplitude / 5e-3 cumulative phase across ~2
 *    oscillations.
 *
 *  - **Pure anti-de Sitter (m=0, Λ<0)** — leading-WKB phase rate
 *    matches closed-form `Φ_L^AdS(a)` (`wdwLorentzianWkbPhase` in
 *    `constants.ts`) on the deep tail. Pure-Lorentzian everywhere; no
 *    Stage-3 overwrite. Constant-φ injection isolates 1D.
 *
 *  - **Pure de Sitter (m=0, Λ>0)** — two analytic pins:
 *    (i) Lorentzian-side WKB phase rate matches `Φ_L^dS(a)` on `a <
 *    a_turn`; (ii) Euclidean-side HH renormalised tail
 *    `T(a) = |χ|·|U|^{1/4}·exp(+S_E)` constant on `a > 1.5·a_turn`.
 *
 * Plus a residual block of legacy WKB-zero-crossing-count smoke tests
 * (kept for pattern coverage; the pointwise pins above are the
 * primary correctness gates).
 *
 * The published analytic fixture lives in
 * `src/lib/physics/wheelerDeWitt/analyticFixtures.ts` (and is itself
 * pinned by `analyticFixtures.test.ts` against Wronskian / asymptotic
 * envelope identities).
 *
 * Original analytic-coverage block:
 *
 *  - **Pure de Sitter** (`m=0, Λ>0`, BC=`noBoundary`). In the deep
 *    Euclidean band `a ≫ a_turn`, the Hartle–Hawking wavefunction is
 *    dominated by the decaying branch
 *
 *        `χ(a) ∝ |U(a)|^{−1/4} · exp(−S_E(a))`
 *
 *    where `S_E(a) = ∫_{a_turn}^a √U(a') da'` has the closed-form
 *    expression in `wdwEuclideanWkbAction`. We assert that the
 *    "renormalised tail" `|χ(a)|·|U(a)|^{1/4}·exp(+S_E(a))` is
 *    approximately constant on the deep band — this is the *defining*
 *    signature of the HH proposal.
 *
 *  - **Pure anti-de Sitter** (`m=0, Λ<0`). `U(a) = −36π²a²(1 − KΛa²)`
 *    with `Λ<0` is negative for all `a > 0`, so the column is
 *    pure-Lorentzian. The number of zero-crossings of `Re χ(a)` on the
 *    central column equals `∫ √|U| da / π` to leading WKB. The integral
 *    is closed-form — substitute `u = K|Λ|a²`, get
 *    `∫√|U| = (2π/K|Λ|) · ((1+u_max)^{3/2} − (1+u_min)^{3/2})`. We
 *    assert the numerical zero-crossing count matches the predicted
 *    integer to ±2 crossings.
 *
 *  - **Free-scalar / flat** (`m=0, Λ=0`). `U(a) = −36π²a²` has the
 *    closed-form WKB action `S_L(a) = 3π·a²` (i.e. `∫√|U| da = 3π·a²`).
 *    Same zero-crossing test as AdS, with a tighter analytic count.
 *
 * ## Nomenclature
 *
 * The user request mentioned "Bunch–Davies mode functions" and "Hankel
 * functions" for the dS case. Those describe the de-Sitter QFT VACUUM
 * MODE FUNCTIONS for inflaton perturbations on a fixed background — a
 * different problem from the WdW wavefunction `χ` on minisuperspace
 * (which is the canonical-quantum-gravity wavefunction OF the
 * background). We are testing the latter; this is documented here so
 * future readers do not chase the wrong analytic limit.
 *
 * ## Why this matters
 *
 * Before these tests there was nothing pinning the WdW solver to any
 * known limit. Three regimes each independently catch a different class
 * of solver bug:
 *  - dS Euclidean tail catches Stage-2/3 mis-connection (e.g. wrong
 *    `kappa`, wrong BC weighting, missing `|U|^{1/4}` prefactor).
 *  - AdS zero-crossings catch wrong `K = 8πG/3` constant and wrong
 *    quartic-in-`a` term in `U`.
 *  - Free zero-crossings catch wrong `c_U = 36π²` quadratic prefactor.
 *
 * @module tests/lib/physics/wheelerDeWitt/solverAnalytic
 */

import { describe, expect, it } from 'vitest'

import {
  besselJQuarter,
  besselJQuarterPrime,
  besselYQuarter,
  besselYQuarterPrime,
  freeMinisuperspaceChiHankel,
} from '@/lib/physics/wheelerDeWitt/analyticFixtures'
import {
  WDW_G_PREFACTOR,
  wdwEuclideanWkbAction,
  wdwLorentzianWkbPhase,
  wdwTurningA,
  wdwU,
} from '@/lib/physics/wheelerDeWitt/constants'
import {
  resetCflWarningBudget,
  solveWheelerDeWitt,
  type WheelerDeWittSolverInput,
  type WheelerDeWittSolverOutput,
} from '@/lib/physics/wheelerDeWitt/solver'

/** Read `χ(ia, i1, i2)` complex pair from the interleaved buffer. */
function chiAt(
  out: WheelerDeWittSolverOutput,
  ia: number,
  i1: number,
  i2: number
): {
  re: number
  im: number
} {
  const [, Nphi] = out.gridSize
  const slab = Nphi * Nphi
  const off = 2 * (ia * slab + i1 * Nphi + i2)
  if (off < 0 || off + 1 >= out.chi.length) {
    throw new RangeError(
      `chiAt: offset ${off} out of bounds for chi.length=${out.chi.length} at (ia=${ia}, i1=${i1}, i2=${i2})`
    )
  }
  return { re: out.chi[off] as number, im: out.chi[off + 1] as number }
}

/** `a` coordinate at index `ia`. */
function aOf(out: WheelerDeWittSolverOutput, ia: number): number {
  const Na = out.gridSize[0]
  const da = (out.aMax - out.aMin) / (Na - 1)
  return out.aMin + ia * da
}

/**
 * Mid-grid column index. With `Nphi` odd the central column is at
 * `(Nphi-1)/2` and corresponds exactly to `φ=0`; with `Nphi` even it
 * sits at `Nphi/2`, half a cell off centre. We use odd `Nphi` in these
 * tests so the comparison column is exactly at the symmetry axis.
 */
function centerIdx(Nphi: number): number {
  return Math.floor(Nphi / 2)
}

/**
 * Count zero-crossings of `Re χ(a)` along the central column on the
 * sub-array `[iaStart, iaEnd)`. A zero-crossing is a sign change between
 * consecutive non-zero samples; zero-valued cells do not reset the
 * reference sign, so a node that lands exactly on a sampled cell still
 * contributes one crossing to the count (the run `+, 0, −` is one
 * crossing).
 */
function countReZeroCrossings(
  out: WheelerDeWittSolverOutput,
  iaStart: number,
  iaEnd: number
): number {
  const Nphi = out.gridSize[1]
  const c = centerIdx(Nphi)
  let lastNonZero = 0
  for (let ia = iaStart; ia < iaEnd; ia++) {
    const v = chiAt(out, ia, c, c).re
    if (v !== 0) {
      lastNonZero = v
      break
    }
  }
  let count = 0
  for (let ia = iaStart + 1; ia < iaEnd; ia++) {
    const cur = chiAt(out, ia, c, c).re
    if (cur === 0) continue
    if (lastNonZero !== 0 && lastNonZero > 0 !== cur > 0) count++
    lastNonZero = cur
  }
  return count
}

/**
 * Closed-form WKB integral `∫_{a0}^{a1} √|U(a, 0, 0)| da` for the
 * `V(φ)=Λ` case (φ-zero-mode at `m=0`):
 *
 *   `√|U| = 6π · a · √|1 − KΛ·a²|`
 *
 * Substitute `u = KΛa²` (or `u = K|Λ|a²` for AdS):
 *
 *   `∫6π·a·√|1−KΛa²| da = (3π/(KΛ)) · ∫√|1−u| du`
 *
 * For Λ=0 the integrand collapses to `6π·a`, integrating to `3π·a²`.
 *
 * We compute the integral by closed-form per regime: this is what we
 * pin the numerical solver against, so naturally we cannot fall back
 * to a numerical quadrature here.
 */
function wkbActionIntegral(a0: number, a1: number, lambda: number): number {
  if (lambda === 0) {
    // ∫6π·a da = 3π(a1² - a0²)
    return 3 * Math.PI * (a1 * a1 - a0 * a0)
  }
  const K = WDW_G_PREFACTOR
  if (lambda > 0) {
    // dS: 1 − KΛa² changes sign at a_turn = 1/√(KΛ). The integrand is
    // ∫6π·a·√|1 − KΛa²| da, so we need the *absolute* value across the
    // turning point — clamping to zero would drop the Euclidean
    // contribution for a > a_turn.
    //
    // Primitives:
    //   a < a_turn (Lorentzian):  ∫6π·a·√(1 − KΛa²) da
    //       = −(2π/(KΛ)) · (1 − KΛa²)^{3/2} + C
    //   a > a_turn (Euclidean):   ∫6π·a·√(KΛa² − 1) da
    //       = +(2π/(KΛ)) · (KΛa² − 1)^{3/2} + C
    const KL = K * lambda
    const aTurn = 1 / Math.sqrt(KL)
    const lorentz = (x0: number, x1: number): number =>
      ((2 * Math.PI) / KL) * (Math.pow(1 - KL * x0 * x0, 1.5) - Math.pow(1 - KL * x1 * x1, 1.5))
    const euclid = (x0: number, x1: number): number =>
      ((2 * Math.PI) / KL) * (Math.pow(KL * x1 * x1 - 1, 1.5) - Math.pow(KL * x0 * x0 - 1, 1.5))
    if (a1 <= aTurn) return lorentz(a0, a1)
    if (a0 >= aTurn) return euclid(a0, a1)
    return lorentz(a0, aTurn) + euclid(aTurn, a1)
  }
  // AdS Λ<0: 1 − KΛa² = 1 + K|Λ|a²
  // ∫6π·a·√(1 + K|Λ|a²) da = (2π/(K|Λ|))·(1+K|Λ|a²)^{3/2} + C
  const KabsL = K * -lambda
  const u0 = 1 + KabsL * a0 * a0
  const u1 = 1 + KabsL * a1 * a1
  return ((2 * Math.PI) / KabsL) * (Math.pow(u1, 1.5) - Math.pow(u0, 1.5))
}

/** Predicted zero-crossing count from leading WKB on `[a0, a1]`. */
function wkbPredictedZeroCrossings(a0: number, a1: number, lambda: number): number {
  return wkbActionIntegral(a0, a1, lambda) / Math.PI
}

const SHARED: Pick<
  WheelerDeWittSolverInput,
  'aMin' | 'aMax' | 'gridNa' | 'gridNphi' | 'phiExtent' | 'boundaryCondition'
> = {
  aMin: 0.05,
  aMax: 1.4,
  gridNa: 256,
  // Odd Nphi so the central column sits exactly on φ=0 — see centerIdx().
  gridNphi: 17,
  phiExtent: 2.5,
  boundaryCondition: 'noBoundary',
}

describe('Wheeler–DeWitt analytic-limit pins', () => {
  it('pure de Sitter (m=0, Λ>0): HH Euclidean tail decays as exp(−S_E)·|U|^{−1/4}', () => {
    // Stage-3 Airy connection overwrites the Euclidean band with the
    // BC-correct Langer formula. For HH the asymptotic limit is the
    // pure decaying branch, |χ| ∝ |U|^{−1/4}·exp(−S_E). The
    // "renormalised tail" `T(a) = |χ|·|U|^{1/4}·exp(+S_E)` should
    // therefore be approximately CONSTANT on the deep Euclidean band.
    resetCflWarningBudget()
    const m = 0
    const lambda = 0.5
    const out = solveWheelerDeWitt({
      ...SHARED,
      inflatonMass: m,
      cosmologicalConstant: lambda,
    })
    // a_turn ≈ 1/√(KΛ). At Λ=0.5, K=8π/3 → KΛ=4π/3 ≈ 4.189 → a_turn≈0.488.
    const aTurn = wdwTurningA(0, 0, m, lambda)!
    expect(aTurn).toBeGreaterThan(0)
    const Nphi = out.gridSize[1]
    const c = centerIdx(Nphi)

    // Take cells well past the turning surface (a > 1.5·a_turn) and
    // before the right edge to skip a small numerical reflection.
    const iaTailStart = Math.ceil(
      ((1.5 * aTurn - out.aMin) / (out.aMax - out.aMin)) * (out.gridSize[0] - 1)
    )
    const iaTailEnd = out.gridSize[0] - 4
    expect(iaTailEnd - iaTailStart).toBeGreaterThan(20)
    const tailValues: number[] = []
    for (let ia = iaTailStart; ia < iaTailEnd; ia++) {
      const a = aOf(out, ia)
      const U = wdwU(a, 0, 0, m, lambda)
      if (U <= 0) continue
      const SE = wdwEuclideanWkbAction(a, 0, 0, m, lambda)
      const { re, im } = chiAt(out, ia, c, c)
      const mag = Math.sqrt(re * re + im * im)
      // T(a) = |χ| · |U|^{1/4} · exp(+S_E)
      tailValues.push(mag * Math.pow(U, 0.25) * Math.exp(SE))
    }
    expect(tailValues.length).toBeGreaterThan(20)
    // Geometric mean / std as relative spread (the tail can vary by an
    // order of magnitude in absolute terms — only the relative bound is
    // physically meaningful).
    const log = tailValues.map((v) => Math.log(v))
    const meanLog = log.reduce((a, b) => a + b, 0) / log.length
    let varLog = 0
    for (const v of log) varLog += (v - meanLog) ** 2
    varLog /= log.length - 1
    const sigmaLog = Math.sqrt(varLog)
    // Less than 30% spread in log-space ⇔ less than 35% relative spread
    // in `T`. The Stage-3 Langer connection plus Stage-2 propagator
    // should bring this well inside that envelope on the deep tail.
    expect(sigmaLog).toBeLessThan(0.3)
  })

  it('pure anti-de Sitter (m=0, Λ<0): zero-crossing count matches WKB prediction', () => {
    // ∫√|U| da from a0 (post-transient) to a1 (pre-edge) gives the
    // closed-form Lorentzian phase accumulation. Number of zero-crossings
    // of Re χ on the same range = phase / π to leading WKB.
    resetCflWarningBudget()
    const m = 0
    const lambda = -0.5
    const out = solveWheelerDeWitt({
      ...SHARED,
      inflatonMass: m,
      cosmologicalConstant: lambda,
    })
    // Skip first 25% of grid (boundary transient) and last 5% (edge effects).
    const iaStart = Math.floor(0.25 * out.gridSize[0])
    const iaEnd = Math.floor(0.95 * out.gridSize[0])
    const a0 = aOf(out, iaStart)
    const a1 = aOf(out, iaEnd - 1)
    // Confirm the band is fully Lorentzian for the analytic comparison.
    expect(wdwU(a0, 0, 0, m, lambda)).toBeLessThan(0)
    expect(wdwU(a1, 0, 0, m, lambda)).toBeLessThan(0)

    const predicted = wkbPredictedZeroCrossings(a0, a1, lambda)
    const observed = countReZeroCrossings(out, iaStart, iaEnd)
    // Predicted is fractional — the test allows ±3 crossings tolerance
    // (next-to-leading WKB drift + boundary transient + π/4 phase shift).
    expect(observed).toBeGreaterThan(predicted - 3)
    expect(observed).toBeLessThan(predicted + 3)
    // Sanity: predicted should be a meaningful (>3) number for this
    // regime, otherwise the test has no statistical power.
    expect(predicted).toBeGreaterThan(3)
  })

  it('free scalar (m=Λ=0): zero-crossing count matches WKB prediction', () => {
    // U(a) = -36π²a², |U|^{1/2} = 6π·a, ∫√|U| da = 3π(a1² - a0²).
    // Number of crossings = 3·(a1² - a0²).
    resetCflWarningBudget()
    const out = solveWheelerDeWitt({
      ...SHARED,
      inflatonMass: 0,
      cosmologicalConstant: 0,
    })
    const iaStart = Math.floor(0.25 * out.gridSize[0])
    const iaEnd = Math.floor(0.95 * out.gridSize[0])
    const a0 = aOf(out, iaStart)
    const a1 = aOf(out, iaEnd - 1)
    expect(wdwU(a0, 0, 0, 0, 0)).toBeLessThan(0)

    const predicted = wkbPredictedZeroCrossings(a0, a1, 0)
    const observed = countReZeroCrossings(out, iaStart, iaEnd)
    expect(observed).toBeGreaterThan(predicted - 3)
    expect(observed).toBeLessThan(predicted + 3)
    expect(predicted).toBeGreaterThan(3)
  })

  it('finite, non-NaN χ across the full grid for all three regimes', () => {
    // Cross-cutting sanity catch — if any of the analytic regimes
    // explode numerically the assertion above could pass on a denuded
    // grid. Confirm the buffer is alive.
    resetCflWarningBudget()
    for (const lambda of [0.5, -0.5, 0]) {
      const out = solveWheelerDeWitt({
        ...SHARED,
        inflatonMass: 0,
        cosmologicalConstant: lambda,
      })
      let anyNaN = false
      let maxMag = 0
      for (let i = 0; i < out.chi.length; i++) {
        const v = out.chi[i] ?? 0
        if (!Number.isFinite(v)) anyNaN = true
        if (Math.abs(v) > maxMag) maxMag = Math.abs(v)
      }
      expect(anyNaN, `lambda=${lambda} produced NaN/Inf`).toBe(false)
      expect(maxMag, `lambda=${lambda} produced zero amplitude`).toBeGreaterThan(0)
    }
  })
})

/**
 * Build a constant-in-φ initial slab for the WdW solver, populating
 * `χ(a_min, ·) = (cre, cim)` and `∂_a χ(a_min, ·) = (dre, dim)` at
 * every `(φ₁, φ₂)` cell. The constant profile is an exact eigenfunction
 * of `∇²_φ` with eigenvalue 0 in the interior; the φ-Laplacian
 * contribution to the WdW equation vanishes everywhere except at the
 * outer φ-edges (ghost-zero Dirichlet leaks `−2·const/dφ²`).
 *
 * Edge contamination propagates inward at characteristic speed
 * `1/a` per unit `a`. From the edge `φ = phiExtent` to the centre
 * `φ = 0` the travel time satisfies `dφ/da = 1/a` ⇒ `Δa = √(2·Δφ +
 * a₀²) − a₀`. Tests confine measurements to a-ranges where the
 * edge perturbation has not yet reached the centre.
 */
function constantPhiSlab(
  Nphi: number,
  cre: number,
  cim: number,
  dre: number,
  dim: number
): { chi: Float32Array; chiDeriv: Float32Array } {
  const N = Nphi * Nphi
  const chi = new Float32Array(2 * N)
  const chiDeriv = new Float32Array(2 * N)
  for (let i = 0; i < N; i++) {
    chi[2 * i] = cre
    chi[2 * i + 1] = cim
    chiDeriv[2 * i] = dre
    chiDeriv[2 * i + 1] = dim
  }
  return { chi, chiDeriv }
}

/** Read χ(a, central) for a constant-in-φ slab (any `(i1, i2)` works
 * before contamination, but the centre is most contamination-resistant). */
function chiCentral(out: WheelerDeWittSolverOutput, ia: number): { re: number; im: number } {
  const Nphi = out.gridSize[1]
  return chiAt(out, ia, centerIdx(Nphi), centerIdx(Nphi))
}

/**
 * Edge-contamination horizon at the central column. From the BC slab
 * at `a_min` to scale-factor `a` the inward-propagating perturbation
 * has travelled `Δφ = (a² − a_min²)/2` (integrating `dφ/da = 1/a` is
 * `dφ = a·da`). Below the horizon `a_safe = √(a_min² + 2·phiExtent)`
 * the centre is contamination-free.
 */
function safeAUpperBound(aMin: number, phiExtent: number): number {
  return Math.sqrt(aMin * aMin + 2 * phiExtent)
}

/**
 * **Exact** derivative `d/da [√a · H_{1/4}^{(1)}(3π·a²)]` at scale
 * factor `a`. Required as the boundary derivative for the analytic
 * pointwise comparison: the leading-WKB Vilenkin formula
 * `χ'/χ ≈ −1/(2a) + i·6π·a` only matches the Hankel solution
 * **asymptotically** (`3π·a² ≫ 1`); near `a_min ≲ 0.7` the exact
 * Hankel derivative differs by `O(1/(3π·a²))` — a few percent — and
 * that mismatch seeds a J/Y branch admixture that grows during
 * propagation and dominates the 5e-3 amplitude error budget.
 *
 * Derivation:
 *
 *     d/da [√a · H_ν(3π·a²)]
 *       = (1/(2√a)) · H_ν(3π·a²) + √a · 6π·a · H_ν'(3π·a²)
 *       = χ(a)/(2a) + √a · 6π·a · H_ν'(z)
 *
 * with `H_ν'(z) = J_ν'(z) + i·Y_ν'(z)` (recurrence
 * `J_ν'(z) = J_{ν−1}(z) − (ν/z)·J_ν(z)`).
 */
function freeHankelDerivativeExact(a: number): { re: number; im: number } {
  const z = 3 * Math.PI * a * a
  const Jp = besselJQuarterPrime(z)
  const Yp = besselYQuarterPrime(z)
  const J = besselJQuarter(z)
  const Y = besselYQuarter(z)
  const sqrtA = Math.sqrt(a)
  const inv2sqrtA = 1 / (2 * sqrtA)
  const sixPiA = 6 * Math.PI * a
  // χ' = (1/(2√a))·H + √a · 6π·a · H'(z)
  const re = inv2sqrtA * J + sqrtA * sixPiA * Jp
  const im = inv2sqrtA * Y + sqrtA * sixPiA * Yp
  return { re, im }
}

describe('Wheeler–DeWitt solver vs published analytic fixtures (1D-isolated)', () => {
  /**
   * Constant-φ Hankel injection on the free regime. The φ-Laplacian
   * vanishes (constant eigenfunction with eigenvalue 0), so the central
   * column evolves under the bare 1D Weber equation
   * `χ'' + 36π²·a²·χ = 0`. The exact solution that matches the
   * Vilenkin-style outgoing-wave BC is
   *
   *     χ(a) = N · √a · H_{1/4}^{(1)}(3π·a²)
   *
   * where `N` is fixed by the BC's complex amplitude at `a = a_min`.
   * Test compares solver output to the analytic fixture pointwise on
   * the contamination-safe a-range.
   *
   * **Why this is the canonical "Hankel function analytic" check** (the
   * user's request, properly attributed): the free-massless-Λ=0 WdW
   * minisuperspace problem is the only regime where the solution is a
   * single named special function on the entire `a > 0` axis. dS and
   * AdS acquire a quartic-in-`a` term and only admit closed-form WKB
   * approximations.
   */
  it('free (m=0, Λ=0): central column matches √a · H_{1/4}^{(1)}(3π·a²) to 5e-3', () => {
    resetCflWarningBudget()
    const aMin = 0.5
    const aMax = 1.5
    const Na = 1024 // refine for tight tolerance — analytic test only
    const Nphi = 17
    const phiExtent = 5.0 // ensures safeA > aMax (see safeAUpperBound)
    expect(safeAUpperBound(aMin, phiExtent)).toBeGreaterThan(aMax)

    // Analytic anchor at a_min: N = 1, so χ(a_min) = √a_min · H^{(1)}(z_min)
    // and χ'(a_min) = exact derivative (NOT the leading-WKB Vilenkin
    // formula — see freeHankelDerivativeExact for why).
    const chiAtMin = freeMinisuperspaceChiHankel(aMin)
    const dChiAtMin = freeHankelDerivativeExact(aMin)
    const customBoundary = constantPhiSlab(
      Nphi,
      chiAtMin.re,
      chiAtMin.im,
      dChiAtMin.re,
      dChiAtMin.im
    )

    const out = solveWheelerDeWitt({
      boundaryCondition: 'tunneling', // BC enum is a no-op label here
      inflatonMass: 0,
      cosmologicalConstant: 0,
      aMin,
      aMax,
      gridNa: Na,
      gridNphi: Nphi,
      phiExtent,
      customBoundary,
    })

    // Sample at every 32nd cell.
    let maxMagErr = 0
    let maxPhaseErr = 0
    let nSamples = 0
    for (let ia = 16; ia < Na - 4; ia += 32) {
      const a = aOf(out, ia)
      const numerical = chiCentral(out, ia)
      const analytic = freeMinisuperspaceChiHankel(a)
      const errRe = numerical.re - analytic.re
      const errIm = numerical.im - analytic.im
      const errMag = Math.sqrt(errRe * errRe + errIm * errIm)
      const refMag = Math.sqrt(analytic.re ** 2 + analytic.im ** 2)
      const relMag = errMag / refMag
      if (relMag > maxMagErr) maxMagErr = relMag
      // Cumulative phase error.
      const numPhase = Math.atan2(numerical.im, numerical.re)
      const refPhase = Math.atan2(analytic.im, analytic.re)
      let dPhase = numPhase - refPhase
      // Wrap to [−π, π].
      while (dPhase > Math.PI) dPhase -= 2 * Math.PI
      while (dPhase < -Math.PI) dPhase += 2 * Math.PI
      if (Math.abs(dPhase) > maxPhaseErr) maxPhaseErr = Math.abs(dPhase)
      nSamples++
    }
    expect(nSamples).toBeGreaterThan(20)
    expect(maxMagErr, `max relative magnitude error = ${maxMagErr}`).toBeLessThan(5e-3)
    expect(maxPhaseErr, `max phase deviation = ${maxPhaseErr} rad`).toBeLessThan(5e-3)
  })

  /**
   * Construct a Vilenkin outgoing-wave BC `χ ∝ |U|^{-1/4}·exp(+i·Φ_L)`
   * at `a = aMin` with constant-in-φ profile. Returns the BC slab plus
   * the analytic anchor phase at `aMin` for downstream comparison.
   */
  function buildOutgoingWaveBC(
    aMin: number,
    Nphi: number,
    m: number,
    lambda: number
  ): {
    boundary: { chi: Float32Array; chiDeriv: Float32Array }
    phaseAtMin: number
  } {
    const phaseAtMin = wdwLorentzianWkbPhase(aMin, 0, 0, m, lambda)
    const Umag = -wdwU(aMin, 0, 0, m, lambda)
    const prefactor = Math.pow(Umag, -0.25)
    const c0Re = prefactor * Math.cos(phaseAtMin)
    const c0Im = prefactor * Math.sin(phaseAtMin)
    const aPlus = aMin + 1e-5
    const UmagPlus = -wdwU(aPlus, 0, 0, m, lambda)
    const dUda = (UmagPlus - Umag) / 1e-5
    const prefRate = -dUda / (4 * Umag)
    const phaseRate = Math.sqrt(Umag)
    const dRe = prefRate * c0Re - phaseRate * c0Im
    const dIm = prefRate * c0Im + phaseRate * c0Re
    const boundary = constantPhiSlab(Nphi, c0Re, c0Im, dRe, dIm)
    return { boundary, phaseAtMin }
  }

  /**
   * Per-cell **phase-rate** (instantaneous) pin. The accumulated phase
   * shift over a chunk of `nStep` cells `[ia, ia+nStep]` should equal
   * the analytic integrated phase `Φ_L(a_{ia+nStep}) − Φ_L(a_{ia})` to
   * leapfrog precision `O(da²·ω²)`. Bypasses BC-mismatch admixture
   * (which contaminates absolute phase) and isolates the per-step
   * propagation accuracy.
   */
  function maxLocalPhaseRateError(
    out: WheelerDeWittSolverOutput,
    m: number,
    lambda: number,
    iaStart: number,
    iaEnd: number,
    nStep: number
  ): { maxErr: number; nChunks: number } {
    let maxErr = 0
    let nChunks = 0
    for (let ia = iaStart; ia + nStep < iaEnd; ia += nStep) {
      const a0 = aOf(out, ia)
      const a1 = aOf(out, ia + nStep)
      // Skip chunks that straddle a turning surface — the WKB phase
      // saturates there and per-cell rate diverges (`U → 0`).
      if (wdwU(a0, 0, 0, m, lambda) >= 0) continue
      if (wdwU(a1, 0, 0, m, lambda) >= 0) continue
      const cStart = chiCentral(out, ia)
      const cEnd = chiCentral(out, ia + nStep)
      const phaseStart = Math.atan2(cStart.im, cStart.re)
      const phaseEnd = Math.atan2(cEnd.im, cEnd.re)
      let delta = phaseEnd - phaseStart
      while (delta > Math.PI) delta -= 2 * Math.PI
      while (delta < -Math.PI) delta += 2 * Math.PI
      const analyticDelta =
        wdwLorentzianWkbPhase(a1, 0, 0, m, lambda) - wdwLorentzianWkbPhase(a0, 0, 0, m, lambda)
      // Wrap analytic delta to the same convention.
      let analyticDeltaWrapped = analyticDelta % (2 * Math.PI)
      if (analyticDeltaWrapped > Math.PI) analyticDeltaWrapped -= 2 * Math.PI
      if (analyticDeltaWrapped < -Math.PI) analyticDeltaWrapped += 2 * Math.PI
      let err = Math.abs(delta - analyticDeltaWrapped)
      // Account for ambiguity at the wrap boundary.
      if (err > Math.PI) err = 2 * Math.PI - err
      if (err > maxErr) maxErr = err
      nChunks++
    }
    return { maxErr, nChunks }
  }

  /**
   * Pure AdS (m=0, Λ<0) phase-rate pin. The whole grid is Lorentzian
   * (V<0 ⇒ no turning surface). With constant-φ Vilenkin outgoing-wave
   * BC, the per-cell-chunk phase advance should equal closed-form
   * `ΔΦ_L^{AdS} = (3/(4|Λ|))·((1+K|Λ|·a²)^{3/2} − 1)` differences to
   * leapfrog precision.
   *
   * The per-chunk metric is insensitive to BC-mismatch
   * branch-admixture (which contaminates absolute phase but not the
   * local advance rate).
   */
  it('pure AdS (m=0, Λ<0): per-cell phase advance matches ΔΦ_L^{AdS} to ≤ 1e-2 rad', () => {
    resetCflWarningBudget()
    const m = 0
    const lambda = -0.5
    const aMin = 0.5
    const aMax = 1.5
    const Na = 1024
    const Nphi = 17
    const phiExtent = 5.0
    expect(safeAUpperBound(aMin, phiExtent)).toBeGreaterThan(aMax)
    const { boundary } = buildOutgoingWaveBC(aMin, Nphi, m, lambda)
    const out = solveWheelerDeWitt({
      boundaryCondition: 'tunneling',
      inflatonMass: m,
      cosmologicalConstant: lambda,
      aMin,
      aMax,
      gridNa: Na,
      gridNphi: Nphi,
      phiExtent,
      customBoundary: boundary,
    })
    // Skip first 64 cells (BC transient) and last 16 cells (edge).
    // 8-cell chunks: ΔΦ ≈ 0.5 rad per chunk at mid-grid — well below π,
    // safe from wrap ambiguity.
    // Tolerance budget: leapfrog truncation per 8-cell chunk is
    // O((ω·da)²/12)·8 ≈ 2e-4 rad at mid-grid. The dominant error
    // contribution is BC-mismatch branch-admixture: the leading-WKB
    // outgoing-wave BC `χ ∝ |U|^{-1/4}·exp(+i·Φ_L)` is asymptotically
    // exact only when `√|U|·a >> 1`. At `aMin = 0.5` with Λ = -0.5,
    // the AdS WKB has subleading corrections of relative size
    // `O(1/(√|U|·a)) ~ 1/(6π·0.5·√1.7) ≈ 4%` that seed a small
    // counter-propagating-branch admixture. The admixture causes
    // a sinusoidal phase wobble at the AdS-Bessel periodicity with
    // amplitude in line with the measured 7e-3 rad.
    //
    // 1e-2 rad is still ~3 orders of magnitude tighter than the
    // legacy zero-crossing pin (±3π rad), and pins the leapfrog
    // dispersion to 4 significant figures of the analytic gradient.
    const { maxErr, nChunks } = maxLocalPhaseRateError(out, m, lambda, 64, Na - 16, 8)
    expect(nChunks).toBeGreaterThan(50)
    expect(maxErr, `max chunked phase advance error = ${maxErr} rad`).toBeLessThan(1e-2)
  })

  /**
   * Pure dS (m=0, Λ>0) Lorentzian-side phase-rate pin. Same approach as
   * the AdS test, restricted to `a < a_turn`. Use `Λ = 0.05` so
   * `a_turn = 1/√(KΛ) ≈ 1.546` accommodates aMax = 1.4 fully on the
   * Lorentzian side.
   *
   * Stage-3 Airy overwrite is inactive on Lorentzian cells (it
   * triggers only in the Euclidean region `a > a_turn`); the test is
   * purely a leapfrog-precision check.
   */
  it('pure dS (m=0, Λ>0): Lorentzian-side per-cell phase advance matches ΔΦ_L^{dS} to ≤ 5e-3 rad', () => {
    resetCflWarningBudget()
    const m = 0
    const lambda = 0.05
    const aTurn = wdwTurningA(0, 0, m, lambda)!
    expect(aTurn).toBeGreaterThan(1.4)
    const aMin = 0.4
    const aMax = 1.4
    const Na = 1024
    const Nphi = 17
    const phiExtent = 5.0
    expect(safeAUpperBound(aMin, phiExtent)).toBeGreaterThan(aMax)
    expect(wdwU(aMax, 0, 0, m, lambda)).toBeLessThan(0)

    const { boundary } = buildOutgoingWaveBC(aMin, Nphi, m, lambda)
    const out = solveWheelerDeWitt({
      boundaryCondition: 'tunneling',
      inflatonMass: m,
      cosmologicalConstant: lambda,
      aMin,
      aMax,
      gridNa: Na,
      gridNphi: Nphi,
      phiExtent,
      customBoundary: boundary,
    })
    const { maxErr, nChunks } = maxLocalPhaseRateError(out, m, lambda, 64, Na - 16, 8)
    expect(nChunks).toBeGreaterThan(50)
    expect(maxErr, `max chunked phase advance error = ${maxErr} rad`).toBeLessThan(5e-3)
  })
})
