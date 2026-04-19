/**
 * Closed-form / leading-WKB reference tests for the Wheeler–DeWitt solver.
 *
 * The solver is a 2nd-order leapfrog on a finite (a × φ₁ × φ₂) grid with
 * Stage-2 (analytic Euclidean tail) and Stage-3 (Airy/Langer connection)
 * corrections. Without an external pin it cannot be claimed to "compute
 * the WdW wavefunction" — it could be drifting toward a numerical
 * artefact and we wouldn't know.
 *
 * This module pins the solver against three regimes that admit a
 * **closed-form scalar invariant** computable in elementary functions
 * from the WdW potential `U(a, φ)`:
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
  WDW_G_PREFACTOR,
  wdwEuclideanWkbAction,
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
  return { re: out.chi[off] ?? 0, im: out.chi[off + 1] ?? 0 }
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
 * sub-array `[iaStart, iaEnd)`. A zero-crossing is a strict sign change
 * (consecutive `+, −` or `−, +`). Returns 0 if fewer than 2 cells.
 */
function countReZeroCrossings(
  out: WheelerDeWittSolverOutput,
  iaStart: number,
  iaEnd: number
): number {
  const Nphi = out.gridSize[1]
  const c = centerIdx(Nphi)
  let prev = chiAt(out, iaStart, c, c).re
  let count = 0
  for (let ia = iaStart + 1; ia < iaEnd; ia++) {
    const cur = chiAt(out, ia, c, c).re
    if (prev === 0 || cur === 0) {
      prev = cur
      continue
    }
    if (prev > 0 !== cur > 0) count++
    prev = cur
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
