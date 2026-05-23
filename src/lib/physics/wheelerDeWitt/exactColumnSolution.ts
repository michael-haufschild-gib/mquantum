/**
 * Column-wise closed-form / uniform-Airy reference solutions for the
 * Wheeler–DeWitt minisuperspace ODE at fixed `(φ₁, φ₂)`:
 *
 *     −χ''(a) + U(a, φ)·χ(a) = 0
 *
 * with `U(a, φ) = −c_U·a²·(1 − K·V(φ)·a²)` and `V(φ) = ½m²·φ₁² +
 * ½(m·α)²·φ₂² + Λ`. This module is the **non-self-referential reference**
 * against which the numerical solver is validated by
 * `src/tests/lib/physics/wheelerDeWitt/exactSolutionAgreement.test.ts`.
 *
 * ## Three regimes
 *
 * | `V(φ)` | Exact / reference form                                              |
 * |--------|---------------------------------------------------------------------|
 * | `> 0`  | **Langer-uniform Airy**: `(ζ/U)^{1/4}·[c₁·Ai(ζ) + c₂·Bi(ζ)]`         |
 * | `= 0`  | **Exact Bessel-1/4**: `√a·[A·J_{1/4}(3π·a²) + B·Y_{1/4}(3π·a²)]`    |
 * | `< 0`  | **Leading-WKB**: `|U|^{−1/4}·[A·cos Φ_L(a) + B·sin Φ_L(a)]`         |
 *
 * The Langer-uniform form is valid across the turning surface (both
 * `a < a_turn` Lorentzian and `a > a_turn` Euclidean). The V=0 Bessel
 * form is pointwise-exact. The V<0 form is exact only in the leading-WKB
 * (`Φ_L ≫ 1`) limit — that's why the agreement test tolerates
 * `O(1/Φ_L)` for V<0 while demanding `O(1%)` agreement elsewhere.
 *
 * ## Derivatives
 *
 * Each `columnSolution*` returns the paired `∂_a χ(a)` in closed form.
 * The V>0 derivative threads the Langer chain rule:
 *
 *     ∂_a χ = (ζ/U)^{1/4}·[(1/4)·(ζ'/ζ − U'/U)·W(ζ) + W'(ζ)·ζ'(a)]
 *
 * with `W(ζ) = c₁·Ai(ζ) + c₂·Bi(ζ)` and `ζ'(a) = √|U|/√|ζ|` (derived
 * from `ζ^{3/2} = (3/2)·∫√|U|·da`). Near the turning surface `ζ → 0`
 * the factor `ζ'/ζ − U'/U` is a finite `0/0`; this module evaluates it
 * via a symmetric finite difference over a `1e-5·a` step whenever
 * `|ζ| < 1e-3`, which keeps error below `1e-7` (dominated by the
 * `airy.ts` asymptotic accuracy, not the finite difference).
 *
 * @module lib/physics/wheelerDeWitt/exactColumnSolution
 */

import { airyAll, combineAiryBasis } from './airy'
import {
  besselJQuarter,
  besselJQuarterPrime,
  besselYQuarter,
  besselYQuarterPrime,
} from './analyticFixtures'
import {
  WDW_C_U,
  WDW_G_PREFACTOR,
  wdwLangerVariable,
  wdwLorentzianWkbPhase,
  wdwPotential,
  wdwTurningA,
  wdwU,
} from './constants'

/** Complex `(re, im)` pair. */
export interface ComplexPair {
  re: number
  im: number
}

/** Paired column value and `a`-derivative at a single `a`. */
export interface ColumnSample {
  chi: ComplexPair
  dChi: ComplexPair
}

/**
 * Arguments common to every column-solution call.
 */
export interface ColumnArgs {
  a: number
  phi1: number
  phi2: number
  m: number
  lambda: number
  /** `α` multiplier on the φ₂ component of V. Default 1 (isotropic). */
  asymmetry?: number
}

/** `U'(a)` in closed form: `dU/da = 2·c_U·a·(2·K·V·a² − 1)`. */
function dUdaAnalytic(a: number, V: number): number {
  const K = WDW_G_PREFACTOR
  return 2 * WDW_C_U * a * (2 * K * V * a * a - 1)
}

/**
 * `ζ'(a) = √|U| / √|ζ|` with `sign(ζ') = +1` (`ζ` is monotone increasing
 * through the turning surface). Valid only for V>0 (the only regime
 * where `ζ` is defined). Near `|ζ| < 1e-6` the expression is evaluated
 * with a protective floor to avoid division-by-zero; callers that hit
 * that regime should prefer the finite-difference path.
 */
function dZetaDaAnalytic(
  a: number,
  phi1: number,
  phi2: number,
  m: number,
  lambda: number,
  asymmetry: number
): number {
  const U = wdwU(a, phi1, phi2, m, lambda, asymmetry)
  const zeta = wdwLangerVariable(a, phi1, phi2, m, lambda, asymmetry)
  const absZeta = Math.max(Math.abs(zeta), 1e-30)
  return Math.sqrt(Math.abs(U)) / Math.sqrt(absZeta)
}

/**
 * Langer prefactor `(ζ/U)^{1/4}`. Regular through the turning surface
 * (both `ζ → 0` and `U → 0` at the same rate `∝ (a − a_turn)`, so the
 * ratio stays finite). We evaluate the fourth root on the signed ratio;
 * since both `ζ` and `U` change sign simultaneously (negative in the
 * Lorentzian band, positive in the Euclidean band), `ζ/U > 0` always,
 * and the fourth root is real.
 */
function langerPrefactor(zeta: number, U: number): number {
  // Both zero exactly at turning surface — use a protective floor
  // equal to the machine-eps product, which keeps the computed prefactor
  // finite without biasing the continuum limit.
  const eps = 1e-30
  const ratio = zeta / (U === 0 ? (U >= 0 ? eps : -eps) : U)
  return Math.pow(Math.abs(ratio), 0.25) * (ratio >= 0 ? 1 : NaN)
}

/**
 * Value of the Langer-uniform χ = `(ζ/U)^{1/4}·[c₁·Ai(ζ) + c₂·Bi(ζ)]`
 * at one `a`. Used by both the evaluator and the finite-difference
 * derivative fallback near `ζ ≈ 0`.
 */
function langerChiReal(
  a: number,
  phi1: number,
  phi2: number,
  m: number,
  lambda: number,
  asymmetry: number,
  c1: number,
  c2: number
): number {
  const zeta = wdwLangerVariable(a, phi1, phi2, m, lambda, asymmetry)
  const U = wdwU(a, phi1, phi2, m, lambda, asymmetry)
  const pref = langerPrefactor(zeta, U)
  const { ai, bi } = airyAll(zeta)
  return pref * combineAiryBasis(c1, c2, ai, bi)
}

/**
 * V>0 Langer-uniform column solution with real coefficients `(c₁, c₂)`.
 * The coefficients are picked by the caller to encode the physical BC:
 *  - HH proposal: `c₁ = N_HH`, `c₂ = 0` (pure `Ai`, regular at classical singularity).
 *  - Vilenkin: `c₁ = 1`, `c₂ = i` (outgoing wave) — but since this
 *    module returns real `χ` only, Vilenkin callers should combine two
 *    calls `(1, 0) + i·(0, 1)` at the complex level themselves.
 *  - DeWitt: `c₁`, `c₂` fixed by `χ(a = 0) = 0` boundary (analytic
 *    form at `a → 0` requires `c₂ = (Ai(ζ₀)/Bi(ζ₀))·c₁` with some sign).
 *
 * Only valid for `V(φ) > 0`. Throws if `V ≤ 0`.
 *
 * @param input - Column position and potential parameters.
 * @param c1 - Coefficient of `Ai(ζ)` branch.
 * @param c2 - Coefficient of `Bi(ζ)` branch.
 * @returns `{ chi, dChi }` with both real (imaginary parts zero).
 */
export function columnSolutionPositiveV(input: ColumnArgs, c1: number, c2: number): ColumnSample {
  const { a, phi1, phi2, m, lambda } = input
  const asymmetry = input.asymmetry ?? 1
  const V = wdwPotential(phi1, phi2, m, lambda, asymmetry)
  if (V <= 0) {
    throw new RangeError(
      `columnSolutionPositiveV requires V(φ) > 0; got V=${V} at (φ₁=${phi1}, φ₂=${phi2}, m=${m}, Λ=${lambda}).`
    )
  }
  if (a <= 0) throw new RangeError(`columnSolutionPositiveV requires a > 0, got ${a}`)

  const zeta = wdwLangerVariable(a, phi1, phi2, m, lambda, asymmetry)
  const U = wdwU(a, phi1, phi2, m, lambda, asymmetry)
  const pref = langerPrefactor(zeta, U)
  const { ai, bi, aiPrime, biPrime } = airyAll(zeta)
  const chiReal = pref * combineAiryBasis(c1, c2, ai, bi)

  // Derivative via chain rule:
  //   χ' = (1/4)·(ζ/U)^{1/4}·(ζ'/ζ − U'/U)·W(ζ) + (ζ/U)^{1/4}·W'(ζ)·ζ'(a)
  // with W(ζ) = c₁·Ai(ζ) + c₂·Bi(ζ).
  //
  // Near the turning surface, ζ → 0 and U → 0 simultaneously, so
  // (ζ'/ζ − U'/U) is a finite 0/0. We detect that regime and fall back
  // to a symmetric finite difference.
  const absZeta = Math.abs(zeta)
  let dChiReal: number
  if (absZeta < 1e-3) {
    const aTurn = wdwTurningA(phi1, phi2, m, lambda, asymmetry) ?? a
    const h = Math.max(1e-6 * aTurn, 1e-8)
    const plus = langerChiReal(a + h, phi1, phi2, m, lambda, asymmetry, c1, c2)
    const minus = langerChiReal(a - h, phi1, phi2, m, lambda, asymmetry, c1, c2)
    dChiReal = (plus - minus) / (2 * h)
  } else {
    const zetaPrime = dZetaDaAnalytic(a, phi1, phi2, m, lambda, asymmetry)
    const Uprime = dUdaAnalytic(a, V)
    const Wmix = combineAiryBasis(c1, c2, ai, bi)
    const WmixPrime = combineAiryBasis(c1, c2, aiPrime, biPrime)
    const prefRate = 0.25 * (zetaPrime / zeta - Uprime / U)
    dChiReal = pref * prefRate * Wmix + pref * WmixPrime * zetaPrime
  }

  return { chi: { re: chiReal, im: 0 }, dChi: { re: dChiReal, im: 0 } }
}

/**
 * V=0 exact column solution: `χ(a) = √a·[A·J_{1/4}(3π·a²) +
 * B·Y_{1/4}(3π·a²)]` with complex coefficients `(A, B)`. Closed form,
 * no asymptotic approximation.
 *
 * Valid only for the free case `m=0, Λ=0` (any other parameters give
 * `V ≠ 0` and should use the V>0 or V<0 branches). Caller-responsibility
 * precondition; the function does not check.
 *
 * @param a - Scale factor (`a > 0`).
 * @param A - Complex coefficient of the `J_{1/4}` branch.
 * @param B - Complex coefficient of the `Y_{1/4}` branch.
 * @returns `{ chi, dChi }` complex.
 */
export function columnSolutionZeroV(a: number, A: ComplexPair, B: ComplexPair): ColumnSample {
  if (a <= 0) throw new RangeError(`columnSolutionZeroV requires a > 0, got ${a}`)
  const z = 3 * Math.PI * a * a
  const J = besselJQuarter(z)
  const Y = besselYQuarter(z)
  const Jp = besselJQuarterPrime(z)
  const Yp = besselYQuarterPrime(z)
  const sqrtA = Math.sqrt(a)
  const inv2sqrtA = 1 / (2 * sqrtA)
  const sixPiA = 6 * Math.PI * a

  // χ = √a·(A·J + B·Y); χ' = (1/(2√a))·(A·J + B·Y) + √a·6π·a·(A·J' + B·Y')
  const chiRe = sqrtA * (A.re * J + B.re * Y)
  const chiIm = sqrtA * (A.im * J + B.im * Y)
  const dChiRe = inv2sqrtA * (A.re * J + B.re * Y) + sqrtA * sixPiA * (A.re * Jp + B.re * Yp)
  const dChiIm = inv2sqrtA * (A.im * J + B.im * Y) + sqrtA * sixPiA * (A.im * Jp + B.im * Yp)

  return { chi: { re: chiRe, im: chiIm }, dChi: { re: dChiRe, im: dChiIm } }
}

/**
 * V<0 leading-WKB column reference: `χ(a) = |U(a)|^{−1/4}·[A·cos Φ_L(a)
 * + B·sin Φ_L(a)]` with complex coefficients `(A, B)` and
 * `Φ_L(a) = ∫_0^a √|U| da'` from {@link wdwLorentzianWkbPhase}.
 *
 * Unlike the V=0 and V>0 references, this form is accurate only to
 * `O(1/Φ_L)` — there is no closed-form exact solution for the full
 * quartic-in-`a` ODE on the Lorentzian-everywhere AdS branch. The
 * agreement test loosens the tolerance here correspondingly.
 *
 * Derivative:
 *   χ' = (1/4)·(|U|^{−1/4})'·(A·cos Φ + B·sin Φ)
 *      + |U|^{−1/4}·(−A·sin Φ + B·cos Φ)·Φ'(a)
 *   (|U|^{−1/4})' = −(1/4)·|U|^{−5/4}·|U|'     (|U|' = −U' since U < 0)
 *   Φ'(a) = √|U|
 *
 * @param input - Column position and potential parameters.
 * @param A - Complex coefficient of the `cos Φ_L` branch.
 * @param B - Complex coefficient of the `sin Φ_L` branch.
 * @returns `{ chi, dChi }` complex.
 */
export function columnSolutionNegativeV(
  input: ColumnArgs,
  A: ComplexPair,
  B: ComplexPair
): ColumnSample {
  const { a, phi1, phi2, m, lambda } = input
  const asymmetry = input.asymmetry ?? 1
  const V = wdwPotential(phi1, phi2, m, lambda, asymmetry)
  if (V >= 0) {
    throw new RangeError(
      `columnSolutionNegativeV requires V(φ) < 0; got V=${V} at (φ₁=${phi1}, φ₂=${phi2}, m=${m}, Λ=${lambda}).`
    )
  }
  if (a <= 0) throw new RangeError(`columnSolutionNegativeV requires a > 0, got ${a}`)

  const U = wdwU(a, phi1, phi2, m, lambda, asymmetry)
  if (U >= 0) {
    // U can in principle go positive for V<0 at extreme a if K·V·a² > 1,
    // but V<0 makes (1 − K·V·a²) > 1, so U = −c·a²·(positive) < 0 always.
    // Defensive guard against numerical edge cases.
    throw new RangeError(`columnSolutionNegativeV: unexpected U(a=${a}) = ${U} ≥ 0 for V=${V}.`)
  }
  const absU = -U
  const pref = Math.pow(absU, -0.25)
  const phase = wdwLorentzianWkbPhase(a, phi1, phi2, m, lambda, asymmetry)
  const c = Math.cos(phase)
  const s = Math.sin(phase)

  const chiRe = pref * (A.re * c + B.re * s)
  const chiIm = pref * (A.im * c + B.im * s)

  // dU/da then d|U|/da = −dU/da (since U < 0). d(|U|^{−1/4})/da =
  //   −(1/4)·|U|^{−5/4}·d|U|/da = (1/4)·|U|^{−5/4}·(dU/da).
  const Uprime = dUdaAnalytic(a, V)
  const prefPrime = 0.25 * Math.pow(absU, -1.25) * Uprime
  const phasePrime = Math.sqrt(absU)

  const oscRe = A.re * c + B.re * s
  const oscIm = A.im * c + B.im * s
  const oscPrimeRe = -A.re * s + B.re * c
  const oscPrimeIm = -A.im * s + B.im * c

  const dChiRe = prefPrime * oscRe + pref * oscPrimeRe * phasePrime
  const dChiIm = prefPrime * oscIm + pref * oscPrimeIm * phasePrime

  return { chi: { re: chiRe, im: chiIm }, dChi: { re: dChiRe, im: dChiIm } }
}

/**
 * 4th-order Runge–Kutta trajectory of the reduced Wheeler–DeWitt
 * 1D ODE `−χ''(a) + U(a, φ)·χ = 0` at fixed `(φ₁, φ₂)`. Computes
 * `χ(a)` at every `a`-point in the argument `aGrid`, starting from a
 * caller-supplied seed at `aGrid[0]`.
 *
 * ## Why not Langer-Airy?
 *
 * {@link columnSolutionPositiveV} returns the Langer-uniform Airy
 * combination `(ζ/U)^{1/4}·[c₁·Ai(ζ) + c₂·Bi(ζ)]`, which is only an
 * **asymptotic** approximation of the ODE solution. The subleading
 * corrections scale as `O(1/|ζ|^{3/2})` — at `a = 0.4, Λ = 0.5,
 * V(φ) = Λ` the Langer variable is `|ζ| ≈ 0.6` and the asymptotic
 * error exceeds `100 %`. A test that compares the solver against
 * Langer-Airy is really testing the solver's agreement with an
 * asymptotic approximation, not with the true ODE solution.
 *
 * RK4 at `h = 1e-4` has per-step truncation error `O(h⁵) ≈ 1·10⁻²⁰`,
 * so cumulative error over `10⁴` steps is `1·10⁻¹⁶` — below float64
 * precision. Solver-vs-RK4 therefore measures the solver's own 2nd-order
 * discretization error, which is the authoritative physics check.
 *
 * ## System
 *
 * Rewrite `χ'' = U(a, φ)·χ` as a first-order system
 * `(χ, χ')' = (χ', U(a, φ)·χ)` on each of the real and imaginary
 * components. The real and imaginary parts decouple because the
 * operator `U` is real-valued.
 *
 * @param aGrid         Strictly-increasing a-values at which to record
 *                      χ. `aGrid[0]` is the seed point.
 * @param seed          `χ(aGrid[0])` and `χ'(aGrid[0])`.
 * @param phi1          First inflaton coordinate.
 * @param phi2          Second inflaton coordinate.
 * @param m             Inflaton mass.
 * @param lambda        Cosmological constant.
 * @param asymmetry     `α = inflatonMassAsymmetry` on the `φ₂` axis.
 * @param substepsPerInterval
 *                      Number of RK4 substeps taken between consecutive
 *                      `aGrid` points. 20 is ample for the default
 *                      solver grids — the sub-h is then `(da/20) ≈
 *                      1.5·10⁻⁴` and RK4 error is `O(10⁻¹⁹)` per step.
 * @returns             Array of `{ chi, dChi }` samples aligned 1:1 with
 *                      `aGrid`. `result[0]` is `seed` by construction.
 */
export function rk4ColumnTrajectory(
  aGrid: ArrayLike<number>,
  seed: ColumnSample,
  phi1: number,
  phi2: number,
  m: number,
  lambda: number,
  asymmetry: number = 1,
  substepsPerInterval: number = 20
): ColumnSample[] {
  const N = aGrid.length
  if (N === 0) return []
  const result: ColumnSample[] = new Array(N)
  let yRe = seed.chi.re
  let yIm = seed.chi.im
  let dyRe = seed.dChi.re
  let dyIm = seed.dChi.im
  result[0] = {
    chi: { re: yRe, im: yIm },
    dChi: { re: dyRe, im: dyIm },
  }

  if (
    !Number.isFinite(substepsPerInterval) ||
    !Number.isInteger(substepsPerInterval) ||
    substepsPerInterval < 1
  ) {
    throw new RangeError(
      `rk4ColumnTrajectory: substepsPerInterval must be a positive integer, got ${substepsPerInterval}`
    )
  }

  for (let i = 1; i < N; i++) {
    const aFrom = aGrid[i - 1] as number
    const aTo = aGrid[i] as number
    const interval = aTo - aFrom
    if (interval <= 0) {
      result[i] = {
        chi: { re: yRe, im: yIm },
        dChi: { re: dyRe, im: dyIm },
      }
      continue
    }
    const h = interval / substepsPerInterval
    let a = aFrom

    for (let step = 0; step < substepsPerInterval; step++) {
      // k1: slope at (a, y)
      const Ua = wdwU(a, phi1, phi2, m, lambda, asymmetry)
      const k1yR = dyRe
      const k1yI = dyIm
      const k1dR = Ua * yRe
      const k1dI = Ua * yIm

      // k2: slope at (a + h/2, y + h/2·k1)
      const aMid = a + 0.5 * h
      const Umid = wdwU(aMid, phi1, phi2, m, lambda, asymmetry)
      const y2R = yRe + 0.5 * h * k1yR
      const y2I = yIm + 0.5 * h * k1yI
      const d2R = dyRe + 0.5 * h * k1dR
      const d2I = dyIm + 0.5 * h * k1dI
      const k2yR = d2R
      const k2yI = d2I
      const k2dR = Umid * y2R
      const k2dI = Umid * y2I

      // k3: slope at (a + h/2, y + h/2·k2)
      const y3R = yRe + 0.5 * h * k2yR
      const y3I = yIm + 0.5 * h * k2yI
      const d3R = dyRe + 0.5 * h * k2dR
      const d3I = dyIm + 0.5 * h * k2dI
      const k3yR = d3R
      const k3yI = d3I
      const k3dR = Umid * y3R
      const k3dI = Umid * y3I

      // k4: slope at (a + h, y + h·k3)
      const aEnd = a + h
      const Uend = wdwU(aEnd, phi1, phi2, m, lambda, asymmetry)
      const y4R = yRe + h * k3yR
      const y4I = yIm + h * k3yI
      const d4R = dyRe + h * k3dR
      const d4I = dyIm + h * k3dI
      const k4yR = d4R
      const k4yI = d4I
      const k4dR = Uend * y4R
      const k4dI = Uend * y4I

      // Weighted RK4 combine.
      const sixth = h / 6
      yRe += sixth * (k1yR + 2 * k2yR + 2 * k3yR + k4yR)
      yIm += sixth * (k1yI + 2 * k2yI + 2 * k3yI + k4yI)
      dyRe += sixth * (k1dR + 2 * k2dR + 2 * k3dR + k4dR)
      dyIm += sixth * (k1dI + 2 * k2dI + 2 * k3dI + k4dI)
      a = aEnd
    }

    result[i] = {
      chi: { re: yRe, im: yIm },
      dChi: { re: dyRe, im: dyIm },
    }
  }

  return result
}

/**
 * Dispatch to the regime-specific column solver, verifying at call time
 * that the caller-tagged `coeffs.kind` matches the actual sign of `V(φ)`.
 *
 * `V > 0` selects the Langer-uniform Airy branch (real `(c₁, c₂)`), `V = 0`
 * the exact Bessel-¼ branch (complex `(A, B)`), `V < 0` the leading-WKB
 * branch (complex `(A, B)`). A caller that tags the wrong kind — e.g. asking
 * for `kind: 'positive'` at a column where `V(φ) < 0` — gets a `RangeError`
 * instead of a silently-wrong result. This is the only place in this module
 * that *inspects* `V(φ)`; the per-branch functions trust their tag (enforced
 * by their own guards against the unsupported sign).
 *
 * `V = 0` uses an exact-equality threshold of `1e-12` — smaller than float64
 * round-off on the `(m², Λ)` combination and wider than the magnitudes that
 * downstream tests exercise on the free branch.
 *
 * @param input - Column args.
 * @param coeffs - Regime-specific coefficients. The tag must match the
 *                 actual sign of `V(φ)` at the caller-supplied column.
 * @returns `{ chi, dChi }`.
 * @throws RangeError when `coeffs.kind` disagrees with `sign(V(φ))`.
 */
export function columnSolution(
  input: ColumnArgs,
  coeffs:
    | { kind: 'positive'; c1: number; c2: number }
    | { kind: 'zero'; A: ComplexPair; B: ComplexPair }
    | { kind: 'negative'; A: ComplexPair; B: ComplexPair }
): ColumnSample {
  const V = wdwPotential(input.phi1, input.phi2, input.m, input.lambda, input.asymmetry ?? 1)
  const V_ZERO_TOL = 1e-12
  const actualKind: 'positive' | 'zero' | 'negative' =
    Math.abs(V) < V_ZERO_TOL ? 'zero' : V > 0 ? 'positive' : 'negative'
  if (coeffs.kind !== actualKind) {
    throw new RangeError(
      `columnSolution: coeffs.kind='${coeffs.kind}' disagrees with sign(V(φ))='${actualKind}' ` +
        `(V=${V} at φ₁=${input.phi1}, φ₂=${input.phi2}, m=${input.m}, Λ=${input.lambda}).`
    )
  }
  switch (coeffs.kind) {
    case 'positive':
      return columnSolutionPositiveV(input, coeffs.c1, coeffs.c2)
    case 'zero':
      return columnSolutionZeroV(input.a, coeffs.A, coeffs.B)
    case 'negative':
      return columnSolutionNegativeV(input, coeffs.A, coeffs.B)
  }
}
