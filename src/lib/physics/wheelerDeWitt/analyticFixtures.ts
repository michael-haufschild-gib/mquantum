/**
 * Analytic closed-form fixtures for the Wheeler–DeWitt minisuperspace
 * solver.
 *
 * Three regimes admit a closed-form (or leading-WKB closed-form)
 * reference solution that the numerical solver must reproduce. This
 * module is the **single, standalone source** of those references —
 * pure, side-effect-free functions with no solver dependency. Tests
 * compare the solver against these fixtures; external implementers of
 * Wheeler–DeWitt minisuperspace code can copy this module verbatim and
 * use it as a benchmarking suite for their own integrators.
 *
 * ## Regimes covered
 *
 * | Regime          | `m` | `Λ` | Closed form                                              |
 * |-----------------|-----|-----|----------------------------------------------------------|
 * | Free / massless |  0  |  0  | EXACT: `√a · [A·J_{1/4}(3πa²) + B·Y_{1/4}(3πa²)]`        |
 * | Anti-de Sitter  |  0  | < 0 | Leading-WKB: `|U|^{-1/4}·[A·cos Φ_L + B·sin Φ_L]`        |
 * | de Sitter       |  0  | > 0 | Leading-WKB Lorentzian + HH decaying Euclidean tail      |
 *
 * The free case is **exact** — the reduced WdW equation `χ'' + 36π²a²χ
 * = 0` is the Weber equation `y'' + ω²x²y = 0` with `ω = 6π`, and the
 * substitution `t = ω x²/2 = 3π·a²`, `y = √x · w(t)` reduces it to the
 * Bessel equation of order ¼. So
 *
 *     χ_1(a) = √a · J_{1/4}(3π·a²)
 *     χ_2(a) = √a · Y_{1/4}(3π·a²)
 *     χ_H(a) = √a · H_{1/4}^{(1)}(3π·a²) = χ_1 + i·χ_2
 *
 * `χ_H` is the **outgoing-wave** combination — the canonical Vilenkin
 * (`tunneling`) selection at large `a`, with asymptotic phase
 * `+3π·a²` (matches Vilenkin's `+i·S_L` sign convention in
 * `boundaryConditions.ts`).
 *
 * The dS and AdS cases do not admit a global closed form — the WdW
 * equation acquires a quartic-in-`a` term `c_U·KV·a⁴` that the Weber
 * substitution does not absorb. The leading-WKB ansatz
 *
 *     χ(a) ≈ |U(a)|^{-1/4} · [A·cos Φ_L(a) + B·sin Φ_L(a)]
 *
 * with `Φ_L(a) = ∫_0^a √|U| da'` (`wdwLorentzianWkbPhase` in
 * `constants.ts`) is the right comparison and reaches `O(1/Φ_L)`
 * accuracy on the deep tail (`Φ_L ≫ 1`).
 *
 * For dS + Hartle–Hawking BC the Euclidean tail (`a > a_turn`) decays
 * as
 *
 *     χ(a) ≈ N · |U(a)|^{-1/4} · exp(−S_E(a))
 *
 * with `S_E(a) = ∫_{a_turn}^{a} √U da'` (`wdwEuclideanWkbAction`).
 * `N` is fit from the solver output at one anchor cell; the
 * fixture asserts that the renormalised tail
 * `T(a) = |χ(a)| · |U(a)|^{1/4} · exp(+S_E(a))` is constant.
 *
 * ## Bessel implementation
 *
 * `J_{1/4}` and `Y_{1/4}` are computed by:
 *
 *  - **Series for `|z| ≤ 6`** — convergent Maclaurin series for `J_ν`
 *    and the standard formula
 *    `Y_ν(z) = (J_ν(z)·cos(νπ) − J_{−ν}(z)) / sin(νπ)` (using the
 *    series for `J_{−ν}` as well).
 *  - **Asymptotic for `|z| > 6`** — DLMF 10.17.3 with three correction
 *    terms in each of the `P` and `Q` series. Reaches relative
 *    accuracy ≲ 1e-9 at `z = 6`, ≲ 1e-12 at `z ≥ 12`.
 *
 * Tested against published values (Wolfram, DLMF) at sample `z` to
 * relative tolerance 1e-6, and via the Wronskian identity
 * `J_ν(z)·Y_ν'(z) − J_ν'(z)·Y_ν(z) = 2/(πz)` to relative tolerance
 * 1e-9.
 *
 * @module lib/physics/wheelerDeWitt/analyticFixtures
 */

import { wdwEuclideanWkbAction, wdwLorentzianWkbPhase, wdwU } from './constants'

const NU = 0.25
/** Crossover between Maclaurin series and DLMF 10.17 asymptotic. */
const BESSEL_SERIES_RADIUS = 6
const PI_OVER_4 = Math.PI / 4

/**
 * Bessel `J_ν(z)` Maclaurin series (DLMF 10.2.2):
 *
 *     J_ν(z) = Σ_{k≥0}  (−1)^k · (z/2)^{ν+2k}  /  (k!·Γ(ν + k + 1))
 *
 * Implemented by computing `(z/2)^ν / Γ(ν+1)` and updating the
 * recurrence factor `−(z/2)² / (k·(ν+k))` per term. Truncates when
 * the magnitude of the next term falls below `Number.EPSILON` times
 * the running sum.
 */
function besselJSeries(z: number, nu: number): number {
  const halfZ = z / 2
  let term = Math.pow(halfZ, nu) / gammaFn(nu + 1)
  let sum = term
  const halfZSq = halfZ * halfZ
  // Up to ~80 iterations are plenty for |z| ≤ 6.
  for (let k = 1; k < 80; k++) {
    term *= -halfZSq / (k * (nu + k))
    sum += term
    if (Math.abs(term) < Number.EPSILON * Math.abs(sum)) break
  }
  return sum
}

/**
 * Lanczos approximation for `Γ(z)` (Spouge / Lanczos g=7, n=9). Used
 * only in the Bessel series at `z ∈ {ν+1, ν+k+1, …}` with `ν = 1/4`.
 * Accurate to ≲ 1e-15 in our range.
 *
 * Reflection formula `Γ(z)·Γ(1−z) = π / sin(πz)` would handle z < 0.5,
 * but here `z = ν + k + 1 ≥ 1.25` always, so no reflection needed.
 */
function gammaFn(z: number): number {
  // Lanczos g=7, n=9 coefficients (numerically stable, double precision).
  const G = 7
  const C = [
    0.999_999_999_999_809_93, 676.520_368_121_885_1, -1_259.139_216_722_402_8,
    771.323_428_777_653_13, -176.615_029_162_140_59, 12.507_343_278_686_905,
    -0.138_571_095_265_720_12, 9.984_369_578_019_571_6e-6, 1.505_632_735_149_311_6e-7,
  ]
  if (z < 0.5) {
    // Reflection (defensive — not exercised by Bessel series at ν=1/4).
    return Math.PI / (Math.sin(Math.PI * z) * gammaFn(1 - z))
  }
  const w = z - 1
  let acc = C[0] as number
  for (let i = 1; i < 9; i++) acc += (C[i] as number) / (w + i)
  const t = w + G + 0.5
  return Math.sqrt(2 * Math.PI) * Math.pow(t, w + 0.5) * Math.exp(-t) * acc
}

/**
 * `Y_ν(z)` via DLMF 10.2.3:
 *
 *     Y_ν(z) = [J_ν(z)·cos(νπ) − J_{−ν}(z)] / sin(νπ)
 *
 * Valid for non-integer `ν` (here `ν = 1/4`). Series form via
 * {@link besselJSeries}.
 */
function besselYSeries(z: number, nu: number): number {
  const Jp = besselJSeries(z, nu)
  const Jm = besselJSeries(z, -nu)
  return (Jp * Math.cos(nu * Math.PI) - Jm) / Math.sin(nu * Math.PI)
}

/**
 * DLMF 10.17.3 asymptotic for `J_ν(z)`, `Y_ν(z)` at large `z > 0`:
 *
 *     J_ν(z) = √(2/(πz))·[P·cos(z − νπ/2 − π/4) − Q·sin(z − νπ/2 − π/4)]
 *     Y_ν(z) = √(2/(πz))·[P·sin(z − νπ/2 − π/4) + Q·cos(z − νπ/2 − π/4)]
 *
 * with `μ = 4ν²`, `χ = 8z`, and
 *
 *     P(ν,z) = 1 − (μ−1)(μ−9)/(2!·χ²) + (μ−1)(μ−9)(μ−25)(μ−49)/(4!·χ⁴) − …
 *     Q(ν,z) = (μ−1)/χ − (μ−1)(μ−9)(μ−25)/(3!·χ³) + …
 *
 * Three terms each (P up to `χ^{−6}`, Q up to `χ^{−5}`) reaches ≲ 1e-9
 * at `z = 6` for `ν = 1/4`. Returns both J and Y in a single call to
 * share the cosine/sine evaluation.
 */
function besselAsymptotic(z: number, nu: number): { J: number; Y: number; Jp: number; Yp: number } {
  const mu = 4 * nu * nu
  const chi = 8 * z
  const c2 = chi * chi
  const c4 = c2 * c2
  const c6 = c4 * c2
  const m1 = mu - 1
  const m9 = mu - 9
  const m25 = mu - 25
  const m49 = mu - 49
  const m81 = mu - 81
  const m121 = mu - 121
  // DLMF 10.17.3 three-term P, three-term Q.
  const P =
    1 -
    (m1 * m9) / (2 * c2) +
    (m1 * m9 * m25 * m49) / (24 * c4) -
    (m1 * m9 * m25 * m49 * m81 * m121) / (720 * c6)
  const Q =
    m1 / chi - (m1 * m9 * m25) / (6 * c2 * chi) + (m1 * m9 * m25 * m49 * m81) / (120 * c4 * chi)
  const arg = z - nu * PI_OVER_4 * 2 - PI_OVER_4
  const c = Math.cos(arg)
  const s = Math.sin(arg)
  const amp = Math.sqrt(2 / (Math.PI * z))
  const J = amp * (P * c - Q * s)
  const Y = amp * (P * s + Q * c)
  // Derivatives by `z`: use DLMF 10.17.4 — same form, with P/Q swapped
  // for the (+ν+1) shift, and the prefactor amplitude differs by a
  // factor of −1 in the sin/cos roles. The cleanest universal route is
  // the recurrence J_ν' = J_{ν−1} − (ν/z)·J_ν, but that requires a
  // separate series/asymptotic at order ν−1. For the analytic-fixture
  // tests we use the recurrence form via {@link besselJ} and
  // {@link besselY} elsewhere; the derivative is reported back here only
  // for the asymptotic Wronskian self-test.
  // Asymptotic derivative (subtract ν/z and shift the argument by +π/2,
  // i.e. swap cos↔sin and flip):
  const dargdz = 1
  const Jp =
    -amp * dargdz * (P * s + Q * c) -
    (1 / (2 * z)) * J +
    amp * (asymPpDeriv(mu, chi, z) * c - asymQpDeriv(mu, chi, z) * s)
  const Yp =
    amp * dargdz * (P * c - Q * s) -
    (1 / (2 * z)) * Y +
    amp * (asymPpDeriv(mu, chi, z) * s + asymQpDeriv(mu, chi, z) * c)
  return { J, Y, Jp, Yp }
}

/** d/dz of the P series. Each `1/χ^{2k}` term differentiates to
 *  `−2k/χ^{2k} · 1/z`. */
function asymPpDeriv(mu: number, chi: number, z: number): number {
  const c2 = chi * chi
  const c4 = c2 * c2
  const c6 = c4 * c2
  const m1 = mu - 1
  const m9 = mu - 9
  const m25 = mu - 25
  const m49 = mu - 49
  const m81 = mu - 81
  const m121 = mu - 121
  const term2 = -(m1 * m9) / (2 * c2)
  const term4 = (m1 * m9 * m25 * m49) / (24 * c4)
  const term6 = -(m1 * m9 * m25 * m49 * m81 * m121) / (720 * c6)
  return (-2 * term2 - 4 * term4 - 6 * term6) / z
}

/** d/dz of the Q series. The leading `(μ−1)/χ` term contributes
 *  `−(μ−1)/(8z²) = −(μ−1)/χ · 1/z`. */
function asymQpDeriv(mu: number, chi: number, z: number): number {
  const c2 = chi * chi
  const c4 = c2 * c2
  const m1 = mu - 1
  const m9 = mu - 9
  const m25 = mu - 25
  const m49 = mu - 49
  const m81 = mu - 81
  const term1 = m1 / chi
  const term3 = -(m1 * m9 * m25) / (6 * c2 * chi)
  const term5 = (m1 * m9 * m25 * m49 * m81) / (120 * c4 * chi)
  return (-1 * term1 - 3 * term3 - 5 * term5) / z
}

/**
 * Bessel function `J_{1/4}(z)` for `z > 0`. Uses series for `z ≤ 6`,
 * asymptotic otherwise.
 *
 * @param z - Real argument (`z > 0`).
 * @returns `J_{1/4}(z)`.
 */
export function besselJQuarter(z: number): number {
  if (z <= 0) {
    if (z === 0) return 0 // J_ν(0) = 0 for ν > 0
    throw new RangeError(`besselJQuarter requires z > 0, got ${z}`)
  }
  if (z <= BESSEL_SERIES_RADIUS) return besselJSeries(z, NU)
  return besselAsymptotic(z, NU).J
}

/**
 * Bessel function `Y_{1/4}(z)` for `z > 0`. Uses the J/J_{−ν} series
 * combination for `z ≤ 6`, asymptotic otherwise.
 *
 * @param z - Real argument (`z > 0`).
 * @returns `Y_{1/4}(z)`.
 */
export function besselYQuarter(z: number): number {
  if (z <= 0) {
    throw new RangeError(`besselYQuarter requires z > 0, got ${z}`)
  }
  if (z <= BESSEL_SERIES_RADIUS) return besselYSeries(z, NU)
  return besselAsymptotic(z, NU).Y
}

/**
 * Derivatives `J_{1/4}'(z)` and `Y_{1/4}'(z)` via the standard Bessel
 * recurrence (DLMF 10.6.2):
 *
 *     Z_ν'(z) = Z_{ν−1}(z) − (ν/z)·Z_ν(z)
 *
 * For `ν = 1/4`, `ν − 1 = −3/4`. We use `J_{−3/4}` and `Y_{−3/4}` via
 * the same series/asymptotic machinery (with `nu = −3/4` for the
 * asymptotic and the J/J_{−ν} construction for Y).
 */
export function besselJQuarterPrime(z: number): number {
  if (z <= 0) throw new RangeError(`besselJQuarterPrime requires z > 0, got ${z}`)
  if (z <= BESSEL_SERIES_RADIUS) {
    const Jm34 = besselJSeries(z, NU - 1) // J_{−3/4}
    const J14 = besselJSeries(z, NU)
    return Jm34 - (NU / z) * J14
  }
  const a = besselAsymptotic(z, NU)
  return a.Jp
}

/**
 * `Y_{1/4}'(z)` via the recurrence. Y_{−3/4} uses
 * `Y_{−ν} = (J_{−ν}·cos(−νπ) − J_ν) / sin(−νπ)
 *        = −(J_{−ν}·cos(νπ) − J_ν) / sin(νπ)`.
 */
export function besselYQuarterPrime(z: number): number {
  if (z <= 0) throw new RangeError(`besselYQuarterPrime requires z > 0, got ${z}`)
  if (z <= BESSEL_SERIES_RADIUS) {
    // Y_{−3/4}(z): use the linear combination directly with ν' = −3/4.
    // Y_{ν'}(z) = (J_{ν'}(z)·cos(ν'π) − J_{−ν'}(z)) / sin(ν'π).
    const nuPrime = NU - 1 // = −3/4
    const Jp = besselJSeries(z, nuPrime)
    const Jm = besselJSeries(z, -nuPrime) // = J_{3/4}
    const Ym34 = (Jp * Math.cos(nuPrime * Math.PI) - Jm) / Math.sin(nuPrime * Math.PI)
    const Y14 = besselYSeries(z, NU)
    return Ym34 - (NU / z) * Y14
  }
  const a = besselAsymptotic(z, NU)
  return a.Yp
}

/**
 * Hankel function of the first kind `H_{1/4}^{(1)}(z) = J_{1/4}(z) +
 * i·Y_{1/4}(z)`. The outgoing-wave (positive-frequency) combination —
 * canonical Vilenkin selection at large `z`.
 *
 * @param z - Real argument (`z > 0`).
 * @returns `(re, im) = (J_{1/4}(z), Y_{1/4}(z))`.
 */
export function hankelQuarterFirstKind(z: number): { re: number; im: number } {
  return { re: besselJQuarter(z), im: besselYQuarter(z) }
}

/**
 * **Exact** closed-form Wheeler–DeWitt minisuperspace wavefunction for
 * the free / massless / Λ=0 regime:
 *
 *     χ(a) = √a · [A · J_{1/4}(3π·a²) + B · Y_{1/4}(3π·a²)]
 *
 * with complex coefficients `(A, B)`. Solves
 *
 *     χ''(a) + 36π²·a²·χ(a) = 0
 *
 * pointwise (no truncation, no asymptotic). Verified by ODE residual
 * test in `analyticFixtures.test.ts`.
 *
 * @param input.a - Scale factor (`a > 0`).
 * @param input.A - Complex coefficient of the `J_{1/4}` branch.
 * @param input.B - Complex coefficient of the `Y_{1/4}` branch.
 * @returns Complex `χ(a) = (re, im)`.
 */
export function freeMinisuperspaceChi(input: {
  a: number
  A: { re: number; im: number }
  B: { re: number; im: number }
}): { re: number; im: number } {
  const { a, A, B } = input
  if (a <= 0) throw new RangeError(`freeMinisuperspaceChi requires a > 0, got ${a}`)
  const z = 3 * Math.PI * a * a
  const J = besselJQuarter(z)
  const Y = besselYQuarter(z)
  const sqrtA = Math.sqrt(a)
  return {
    re: sqrtA * (A.re * J + B.re * Y),
    im: sqrtA * (A.im * J + B.im * Y),
  }
}

/**
 * Outgoing-wave (Vilenkin / `tunneling`) Hankel solution for the free
 * regime:
 *
 *     χ_H(a) = √a · H_{1/4}^{(1)}(3π·a²) = √a · (J_{1/4} + i·Y_{1/4})
 *
 * Asymptotic form `χ_H ~ √a · √(2/(π·3π·a²))·exp(i·(3π·a² − π/4·(2·1/4
 * + 1)))` — pure outgoing wave with phase `+3π·a²` at large `a`,
 * matching the Vilenkin BC `+i·S_L` sign convention in
 * `boundaryConditions.ts`.
 *
 * @param a - Scale factor (`a > 0`).
 * @returns Complex `χ_H(a) = (re, im)`.
 */
export function freeMinisuperspaceChiHankel(a: number): { re: number; im: number } {
  if (a <= 0) throw new RangeError(`freeMinisuperspaceChiHankel requires a > 0, got ${a}`)
  const z = 3 * Math.PI * a * a
  const sqrtA = Math.sqrt(a)
  return { re: sqrtA * besselJQuarter(z), im: sqrtA * besselYQuarter(z) }
}

/**
 * Leading-WKB Lorentzian-region Wheeler–DeWitt fixture for the dS / AdS
 * regimes (and the free regime as the `V → 0` limit):
 *
 *     χ_WKB(a) = |U(a)|^{-1/4} · [A · cos Φ_L(a) + B · sin Φ_L(a)]
 *
 * with `Φ_L(a) = ∫_0^a √|U| da'` from {@link wdwLorentzianWkbPhase}.
 * Accurate to `O(1/Φ_L)` on the deep tail (`Φ_L ≫ 1`); not valid near
 * a turning surface (where `|U|^{-1/4}` diverges and the Airy
 * connection is required instead — see `airyConnection.ts`).
 *
 * The `(A, B)` pair maps to physical branches via:
 *  - `A = 1, B = 0`           → standing wave, real, in-phase at `a=0`.
 *  - `A = 1, B = ±i`          → outgoing-wave (Vilenkin) Hankel-like:
 *                                `cos Φ_L ± i·sin Φ_L = exp(±i·Φ_L)`.
 *  - HH selects the real-decaying branch on the Euclidean side; on the
 *    Lorentzian side both branches contribute (the BC is set as
 *    `exp(−|S_E|)·(real WKB)`).
 *
 * Throws if `U(a) ≥ 0` (asks for a Lorentzian comparison in the
 * Euclidean region — caller should switch to
 * {@link wdwHartleHawkingDecayingTail}).
 *
 * @param input.a - Scale factor (`a > 0`).
 * @param input.m - Inflaton mass.
 * @param input.lambda - Cosmological constant.
 * @param input.phi1 - First inflaton coordinate (defaults to 0).
 * @param input.phi2 - Second inflaton coordinate (defaults to 0).
 * @param input.A - Complex coefficient of the `cos Φ_L` branch.
 * @param input.B - Complex coefficient of the `sin Φ_L` branch.
 * @returns Complex `χ_WKB(a) = (re, im)`.
 */
export function wdwLeadingWkbLorentzian(input: {
  a: number
  m: number
  lambda: number
  phi1?: number
  phi2?: number
  A: { re: number; im: number }
  B: { re: number; im: number }
}): { re: number; im: number } {
  const { a, m, lambda, A, B } = input
  const phi1 = input.phi1 ?? 0
  const phi2 = input.phi2 ?? 0
  const U = wdwU(a, phi1, phi2, m, lambda)
  if (U >= 0) {
    throw new RangeError(
      `wdwLeadingWkbLorentzian: U(a=${a}) = ${U} ≥ 0; request is in the ` +
        `Euclidean region. Use wdwHartleHawkingDecayingTail for the ` +
        `decaying-branch HH fixture there.`
    )
  }
  const phi = wdwLorentzianWkbPhase(a, phi1, phi2, m, lambda)
  const c = Math.cos(phi)
  const s = Math.sin(phi)
  const prefactor = Math.pow(-U, -0.25)
  return {
    re: prefactor * (A.re * c + B.re * s),
    im: prefactor * (A.im * c + B.im * s),
  }
}

/**
 * Hartle–Hawking decaying-branch fixture for the Euclidean tail
 * (`a > a_turn`, `U > 0`):
 *
 *     χ_HH(a) = N · |U(a)|^{-1/4} · exp(−S_E(a))
 *
 * with `S_E(a) = ∫_{a_turn}^a √U da'` from
 * {@link wdwEuclideanWkbAction}. The constant `N` is BC- and
 * normalization-dependent — typically fit from solver output at one
 * anchor cell.
 *
 * The renormalised tail
 *
 *     T(a) = |χ_solver(a)| · |U(a)|^{1/4} · exp(+S_E(a))
 *
 * should equal `|N|` (constant) to leading-WKB precision. The
 * tail-constancy assertion is the standard pin for the HH branch
 * selection in the WdW Stage-3 Airy connection.
 *
 * @param input.a - Scale factor (`a > a_turn`).
 * @param input.m - Inflaton mass.
 * @param input.lambda - Cosmological constant (`> 0` for dS).
 * @param input.phi1 - First inflaton coordinate (defaults to 0).
 * @param input.phi2 - Second inflaton coordinate (defaults to 0).
 * @param input.normalization - Real `N`.
 * @returns Real `χ_HH(a)`.
 */
export function wdwHartleHawkingDecayingTail(input: {
  a: number
  m: number
  lambda: number
  phi1?: number
  phi2?: number
  normalization: number
}): number {
  const { a, m, lambda, normalization } = input
  const phi1 = input.phi1 ?? 0
  const phi2 = input.phi2 ?? 0
  const U = wdwU(a, phi1, phi2, m, lambda)
  if (U <= 0) {
    throw new RangeError(
      `wdwHartleHawkingDecayingTail: U(a=${a}) = ${U} ≤ 0; request is in ` +
        `the Lorentzian region. Use wdwLeadingWkbLorentzian instead.`
    )
  }
  const SE = wdwEuclideanWkbAction(a, phi1, phi2, m, lambda)
  return normalization * Math.pow(U, -0.25) * Math.exp(-SE)
}
