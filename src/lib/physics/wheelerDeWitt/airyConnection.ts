/**
 * Per-column Lorentzian → Euclidean Airy/Langer connection for the
 * Wheeler–DeWitt solver.
 *
 * ## Why
 *
 * Stage-2 of the solver replaces the runaway-prone Euclidean leapfrog
 * with two regions: a transition band (numerical leapfrog + soft
 * `exp(−η·√U·da)` absorber) and a deep band (analytic 1D-WKB propagator
 * from a captured "match cell"). The match cell inherits whatever
 * branch content the leapfrog produced — the soft absorber damps the
 * decaying and growing branches by the same rate, so the match is
 * **boundary-condition-agnostic**: it carries an unselected mixture of
 * Hartle–Hawking's pure-decaying, Vilenkin's outgoing-wave, and DeWitt's
 * linear-in-`a` solutions.
 *
 * The Airy connection fixes this by:
 *
 *  1. Sampling the leapfrog's Lorentzian-side amplitude in the deep WKB
 *     asymptotic regime (`|ζ| > 1.5`).
 *  2. Inverting the WKB ansatz to extract the complex amplitudes
 *     `(A_c, A_s)` of `cos φ_L` and `sin φ_L`.
 *  3. Mapping `(A_c, A_s) → (c₁, c₂)` via the Airy connection formula.
 *  4. Applying a per-BC branch policy (HH/DeWitt: `c₂ = 0`; Vilenkin:
 *     `c₂ = −i · c₁`).
 *  5. Overwriting every Euclidean cell in the column with the Langer
 *     uniform formula
 *
 *        χ(a) = (ζ(a) / U(a))^{1/4} · [c₁ · Ai(ζ(a)) + c₂ · Bi(ζ(a))]
 *
 *     which is uniformly valid across the turning surface and reduces to
 *     leading-WKB asymptotically.
 *
 * Replacing the absorber + match-cell handoff with a single analytic
 * formula eliminates the BC-mixture contamination that corrupted
 * downstream Bogoliubov-coefficient extraction (`./bogoliubov`).
 *
 * ## Connection formulas (derivation)
 *
 * Linearise `U(a) ≈ κ · (a − a_turn)` near the turning surface with
 * `κ = ∂_a U|_{a_turn} = 2·c_U·a_turn(φ)`. The reduced WdW equation
 * `χ'' = U·χ` becomes Airy's equation `χ'' = z·χ` with
 * `z = κ^{1/3}(a − a_turn)`. The general solution is
 * `χ = c₁ · Ai(z) + c₂ · Bi(z)`.
 *
 * Far from the turning surface the Langer-variable substitution
 * `(2/3)|ζ|^{3/2} = ∫|p| da` extends this to the uniform formula above.
 * In the deep Lorentzian asymptotic regime (`ζ → −∞`), DLMF 9.7.9–10
 * give
 *
 *     Ai(ζ) ~ π^{−1/2} · |ζ|^{−1/4} · sin((2/3)|ζ|^{3/2} + π/4)
 *     Bi(ζ) ~ π^{−1/2} · |ζ|^{−1/4} · cos((2/3)|ζ|^{3/2} + π/4)
 *
 * with `(2/3)|ζ|^{3/2} = S_L(a, φ)` from {@link wdwLorentzianWkbAction}.
 * Combined with the Langer prefactor `(ζ/U)^{1/4}` (which absorbs all
 * `κ`-dependence and equals `|U|^{−1/4}` in the asymptotic), matching
 * to the WKB form `χ = |U|^{−1/4}·(A_c · cos φ_L + A_s · sin φ_L)` gives
 *
 *     A_c = (1 / √(2π)) · (c₁ + c₂)
 *     A_s = (1 / √(2π)) · (c₁ − c₂)
 *
 * Inverted:
 *
 *     c₁ = √(π/2) · (A_c + A_s)
 *     c₂ = √(π/2) · (A_c − A_s)
 *
 * No `κ` factor — the Langer prefactor handles it. (User specs that
 * include `κ^{1/12}` factors describe the non-Langer "linearised Airy"
 * variant, which is mathematically equivalent but algebraically
 * messier.)
 *
 * ## Per-BC branch policy
 *
 * - **HH (`noBoundary`)** and **DeWitt (`deWitt`)**: real boundary data
 *   →  pure decaying-Euclidean continuation. Set `c₂ = 0` and rescale
 *   `c₁` to preserve the Lorentzian amplitude `√(|c₁|² + |c₂|²)`.
 *   Phase: keep `arg(c₁_raw)`. The two BCs differ in their Lorentzian
 *   wave shape (HH: WKB-decaying instanton tail; DeWitt: linear-in-`a`
 *   ramp from origin) but both produce real Lorentzian waves whose
 *   physical Euclidean continuation is `c₂ = 0`.
 * - **Vilenkin (`tunneling`)**: outgoing Lorentzian wave (`e^{+i·a³V/3}`
 *   in the BC's small-`a` expansion → wave moves in `+a` direction →
 *   universe expanding). The outgoing wave is `χ ∝ e^{+iS_phys}/|U|^{1/4}`
 *   with `S_phys ≈ −φ_L + const` (since `dφ_L/da = −√|U| < 0` while
 *   `dS_phys/da = +√|U| > 0`). Substituting into the cosine/sine
 *   ansatz: `A_c = A_total`, `A_s = −i · A_total`. The connection
 *   formulas give `c₁ = √(π/2)·A_total·(1 − i)` and
 *   `c₂ = √(π/2)·A_total·(1 + i)`, so `c₂ / c₁ = i`. Hence the
 *   Vilenkin-outgoing rule is `c₂ = +i · c₁` (verified by direct
 *   substitution: with `c₂ = i · c₁`, `β = (A_c − i · A_s)/√2 = 0`,
 *   leaving pure `α = (A_c + i · A_s)/√2 ≠ 0`).
 *
 * @module lib/physics/wheelerDeWitt/airyConnection
 */

import type { WdwBoundaryCondition } from '@/lib/geometry/extended/wheelerDeWitt'

import { airyAll } from './airy'
import { WDW_C_U, wdwLangerVariable, wdwLorentzianWkbAction, wdwTurningA, wdwU } from './constants'

/**
 * φ-boundary note: this module samples `χ(a, φ₁, φ₂)` at a **fixed**
 * `(i1, i2)` column across varying `a` slabs. It does not apply any
 * φ-axis finite-difference stencil, so it does not assume a specific
 * φ-boundary rule (ghost-zero Dirichlet / Neumann / anything else).
 * The connection formula and Langer evaluation
 * depend only on per-column `χ` values, which are themselves
 * produced by the leapfrog's chosen stencil — no implicit ghost
 * assumption leaks into the Airy transfer function.
 */

/** Minimum `|ζ|` at which the deep-WKB asymptotic is trusted for extraction. */
export const AIRY_CONNECTION_LZETA_MIN = 1.5

/** Minimum number of Lorentzian-asymptotic cells required for extraction. */
const MIN_EXTRACTION_CELLS = 2

/**
 * Numerical floor for `|U|` in the Langer prefactor. Below this the
 * `(ζ/U)^{1/4}` ratio is replaced by the linearised limit `κ^{−1/6}`
 * to avoid 0/0.
 */
const LANGER_PREFACTOR_FLOOR = 1e-12

/**
 * Result of per-column Airy connection. Consumed by both the solver
 * (Langer overwrite of Euclidean cells) and the Bogoliubov extractor
 * (positive- vs negative-frequency mode amplitudes).
 */
export interface ColumnAiryInfo {
  /** True when extraction succeeded and Langer overwrite is applied. */
  hasOverwrite: boolean
  /** Turning-surface scale factor (`null` if column has `V ≤ 0`). */
  aTurn: number | null
  /** `κ = ∂_a U|_{a_turn}` (`0` when `aTurn` is null). */
  kappa: number
  /** Number of Lorentzian-asymptotic cells used in the extraction. */
  asymptoticCellCount: number
  /** Raw extracted Lorentzian amplitudes (real & imag of complex `A_c`). */
  acRe: number
  acIm: number
  /** Raw extracted Lorentzian amplitudes (real & imag of complex `A_s`). */
  asRe: number
  asIm: number
  /** Raw `c₁` from the connection (before BC weighting). */
  c1RawRe: number
  c1RawIm: number
  /** Raw `c₂` from the connection (before BC weighting). */
  c2RawRe: number
  c2RawIm: number
  /** Final `c₁` after BC weighting (used for the Langer overwrite). */
  c1Re: number
  c1Im: number
  /** Final `c₂` after BC weighting. */
  c2Re: number
  c2Im: number
}

/**
 * Make a default `ColumnAiryInfo` reflecting "no overwrite" — used for
 * columns that have no turning surface or too few asymptotic cells.
 */
export function emptyColumnAiry(aTurn: number | null = null): ColumnAiryInfo {
  return {
    hasOverwrite: false,
    aTurn,
    kappa: aTurn !== null ? 2 * WDW_C_U * aTurn : 0,
    asymptoticCellCount: 0,
    acRe: 0,
    acIm: 0,
    asRe: 0,
    asIm: 0,
    c1RawRe: 0,
    c1RawIm: 0,
    c2RawRe: 0,
    c2RawIm: 0,
    c1Re: 0,
    c1Im: 0,
    c2Re: 0,
    c2Im: 0,
  }
}

/** Solver-shape inputs needed for column scanning. */
interface ColumnContext {
  /** Slab buffer (interleaved re/im). */
  chi: Float32Array
  /** Number of `a` slabs in the grid. */
  Na: number
  /** Number of cells per `φ`-slab (`Nphi · Nphi`). */
  slabSize: number
  /** Linear index into a slab for this column (`i1 · Nphi + i2`). */
  slabIndex: number
  /** Step size in `a`. */
  da: number
  /** Lower edge of the `a` grid. */
  aMin: number
  /** Inflaton coordinates of the column. */
  phi1: number
  phi2: number
  /** Inflaton mass. */
  mass: number
  /** Cosmological constant. */
  lambda: number
  /**
   * Per-axis effective-mass ratio on the φ₂ axis. Optional; defaults
   * to `1` (symmetric). Threaded through every `wdwPotential` /
   * `wdwU` / turning-point / Langer-variable call so the Langer
   * overwrite of Euclidean cells uses the same anisotropic potential
   * as the leapfrog.
   */
  asymmetry?: number
}

/**
 * Extract the per-column Airy connection coefficients from numerical
 * Lorentzian-side leapfrog data. Returns `emptyColumnAiry(...)` when
 * extraction is not feasible (no turning surface, too few asymptotic
 * cells, or singular fitting matrix).
 *
 * @param ctx - Column scanning context.
 * @param bc - Wheeler–DeWitt boundary-condition flavor (drives the BC
 *   weighting policy).
 */
export function extractColumnAiry(ctx: ColumnContext, bc: WdwBoundaryCondition): ColumnAiryInfo {
  const asymmetry = ctx.asymmetry ?? 1
  const aTurn = wdwTurningA(ctx.phi1, ctx.phi2, ctx.mass, ctx.lambda, asymmetry)
  if (aTurn === null) return emptyColumnAiry(null)
  const aMax = ctx.aMin + (ctx.Na - 1) * ctx.da
  if (aTurn <= ctx.aMin) return emptyColumnAiry(aTurn)
  if (aTurn >= aMax) return emptyColumnAiry(aTurn)

  // Collect Lorentzian-asymptotic samples: indices ia where a < a_turn
  // AND |ζ| > AIRY_CONNECTION_LZETA_MIN.
  const samplesIa: number[] = []
  for (let ia = 0; ia < ctx.Na; ia++) {
    const a = ctx.aMin + ia * ctx.da
    if (a >= aTurn) break
    const zeta = wdwLangerVariable(a, ctx.phi1, ctx.phi2, ctx.mass, ctx.lambda, asymmetry)
    if (Math.abs(zeta) >= AIRY_CONNECTION_LZETA_MIN) samplesIa.push(ia)
  }
  if (samplesIa.length < MIN_EXTRACTION_CELLS) return emptyColumnAiry(aTurn)

  // Solve normal equations for least-squares fit of (A_c, A_s) ∈ ℂ:
  //   χ_k · |U_k|^{1/4} = A_c · cos S_L_k + A_s · sin S_L_k
  // Real & imaginary parts decouple — solve as two independent 2×2
  // systems with the same design matrix.
  let M00 = 0
  let M01 = 0
  let M11 = 0
  let bcRe = 0
  let bsRe = 0
  let bcIm = 0
  let bsIm = 0
  for (const ia of samplesIa) {
    const a = ctx.aMin + ia * ctx.da
    const SL = wdwLorentzianWkbAction(a, ctx.phi1, ctx.phi2, ctx.mass, ctx.lambda, asymmetry)
    const U = wdwU(a, ctx.phi1, ctx.phi2, ctx.mass, ctx.lambda, asymmetry)
    const c = Math.cos(SL)
    const s = Math.sin(SL)
    const cellOff = 2 * (ia * ctx.slabSize + ctx.slabIndex)
    const re = ctx.chi[cellOff] ?? 0
    const im = ctx.chi[cellOff + 1] ?? 0
    const u14 = Math.pow(Math.abs(U), 0.25)
    const yRe = re * u14
    const yIm = im * u14
    M00 += c * c
    M01 += c * s
    M11 += s * s
    bcRe += c * yRe
    bsRe += s * yRe
    bcIm += c * yIm
    bsIm += s * yIm
  }
  const det = M00 * M11 - M01 * M01
  if (Math.abs(det) < 1e-30) return emptyColumnAiry(aTurn)
  const invDet = 1 / det
  const acRe = invDet * (M11 * bcRe - M01 * bsRe)
  const asRe = invDet * (-M01 * bcRe + M00 * bsRe)
  const acIm = invDet * (M11 * bcIm - M01 * bsIm)
  const asIm = invDet * (-M01 * bcIm + M00 * bsIm)

  // Connection: c₁ = √(π/2)·(A_c + A_s), c₂ = √(π/2)·(A_c − A_s).
  const sqrtHalfPi = Math.sqrt(Math.PI / 2)
  const c1RawRe = sqrtHalfPi * (acRe + asRe)
  const c1RawIm = sqrtHalfPi * (acIm + asIm)
  const c2RawRe = sqrtHalfPi * (acRe - asRe)
  const c2RawIm = sqrtHalfPi * (acIm - asIm)

  const { c1Re, c1Im, c2Re, c2Im } = applyBcWeighting(bc, c1RawRe, c1RawIm, c2RawRe, c2RawIm)
  const kappa = 2 * WDW_C_U * aTurn

  return {
    hasOverwrite: true,
    aTurn,
    kappa,
    asymptoticCellCount: samplesIa.length,
    acRe,
    acIm,
    asRe,
    asIm,
    c1RawRe,
    c1RawIm,
    c2RawRe,
    c2RawIm,
    c1Re,
    c1Im,
    c2Re,
    c2Im,
  }
}

/**
 * Apply the per-BC branch policy. Takes raw extracted (c₁, c₂) and
 * returns the policy-corrected pair the Langer overwrite should use.
 *
 * Total amplitude is preserved across the policy step:
 *
 *   `|c₁_new|² + |c₂_new|² = |c₁_raw|² + |c₂_raw|²`
 *
 * so the Lorentzian-side wave magnitude is unchanged. This keeps the
 * downstream `maxDensity` consistent with the leapfrog's physical
 * scale.
 */
function applyBcWeighting(
  bc: WdwBoundaryCondition,
  c1Re: number,
  c1Im: number,
  c2Re: number,
  c2Im: number
): { c1Re: number; c1Im: number; c2Re: number; c2Im: number } {
  const totalSq = c1Re * c1Re + c1Im * c1Im + c2Re * c2Re + c2Im * c2Im

  switch (bc) {
    case 'noBoundary':
    case 'deWitt': {
      // Pure decaying-Euclidean: discard Bi.
      const mag1 = Math.sqrt(c1Re * c1Re + c1Im * c1Im)
      if (mag1 < 1e-30) {
        // Degenerate — keep both at zero.
        return { c1Re: 0, c1Im: 0, c2Re: 0, c2Im: 0 }
      }
      const scale = Math.sqrt(totalSq) / mag1
      return {
        c1Re: c1Re * scale,
        c1Im: c1Im * scale,
        c2Re: 0,
        c2Im: 0,
      }
    }
    case 'tunneling': {
      // Outgoing wave: c₂ = +i·c₁. With c₂ = i·c₁ the amplitudes satisfy
      //   |c₁_new|² + |c₂_new|² = 2·|c₁_new|²,
      // so to preserve totalSq we need |c₁_new|² = totalSq/2 →
      //   c₁_new = c₁_raw · √(totalSq / (2·|c₁_raw|²)).
      const mag1Sq = c1Re * c1Re + c1Im * c1Im
      if (mag1Sq < 1e-30) {
        return { c1Re: 0, c1Im: 0, c2Re: 0, c2Im: 0 }
      }
      const scale = Math.sqrt(totalSq / (2 * mag1Sq))
      const newC1Re = c1Re * scale
      const newC1Im = c1Im * scale
      // c₂ = +i · c₁  ⇒  (Re, Im) of c₂ = (−Im, Re) of c₁ (since
      //   i·(a + ib) = −b + i·a).
      return {
        c1Re: newC1Re,
        c1Im: newC1Im,
        c2Re: -newC1Im,
        c2Im: newC1Re,
      }
    }
    default: {
      const exhaustive: never = bc
      throw new Error(`Unknown WdW boundary condition: ${String(exhaustive)}`)
    }
  }
}

/**
 * Evaluate the Langer formula at a single Euclidean cell and write the
 * result into the chi buffer.
 *
 *   χ(a) = (ζ / U)^{1/4} · [c₁ · Ai(ζ) + c₂ · Bi(ζ)]
 *
 * Handles the `|U| → 0` limit by substituting `(ζ/U)^{1/4} → κ^{−1/6}`
 * (the linearised limit at the turning surface).
 *
 * @param info - Per-column Airy connection state (must have `hasOverwrite`).
 * @param a - Scale factor at the cell.
 * @param phi1, phi2 - Inflaton coordinates.
 * @param mass, lambda - Physics constants.
 * @param asymmetry - Per-axis effective-mass ratio on the φ₂ axis.
 *   Optional; defaults to `1` for byte-identical legacy callers.
 * @returns Complex `(re, im)` value to overwrite the cell with.
 */
export function langerEvaluate(
  info: ColumnAiryInfo,
  a: number,
  phi1: number,
  phi2: number,
  mass: number,
  lambda: number,
  asymmetry: number = 1
): { re: number; im: number } {
  const zeta = wdwLangerVariable(a, phi1, phi2, mass, lambda, asymmetry)
  const U = wdwU(a, phi1, phi2, mass, lambda, asymmetry)
  let prefactor: number
  if (Math.abs(U) < LANGER_PREFACTOR_FLOOR) {
    // Linearised limit: (ζ/U)^{1/4} → κ^{-1/6}.
    prefactor = info.kappa > 0 ? Math.pow(info.kappa, -1 / 6) : 0
  } else {
    prefactor = Math.pow(zeta / U, 0.25)
  }
  const { ai, bi } = airyAll(zeta)
  const re = prefactor * (info.c1Re * ai + info.c2Re * bi)
  const im = prefactor * (info.c1Im * ai + info.c2Im * bi)
  return { re, im }
}
