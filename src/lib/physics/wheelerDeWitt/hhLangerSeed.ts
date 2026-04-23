/**
 * Physically-correct per-column Hartle-Hawking and Vilenkin boundary
 * seeds for the Wheeler-DeWitt minisuperspace solver.
 *
 * The legacy `hartleHawkingBoundary` / `vilenkinBoundary` generators
 * (`boundaryConditions.ts`) seeded `χ(a_min, φ)` from the **leading-WKB**
 * amplitude `|U|^{-1/4}·exp(∓|S_E|)`. That form is asymptotically
 * correct only for `|ζ| ≫ 1`; at the typical seeding point
 * `a_min = 0.05..0.1` with `Λ = 0.5` the Langer variable sits at
 * `|ζ(a_min)| ≈ 1.6`, well inside the regime where the subleading
 * corrections matter. A least-squares fit of the resulting solver
 * output against the Airy basis `{Ai(ζ), Bi(ζ)}` gives
 * `|c₂/c₁| = 0.53` — a 53 % admixture of the exponentially-growing Bi
 * branch where the Hartle-Hawking proposal requires pure Ai. See
 * `docs/plans/wdw-solver-physics-correctness.md` §Finding 1 and
 * `docs/physics/langer-hh-seed.md` for the full derivation.
 *
 * This module replaces the leading-WKB seed with the **Langer-uniform**
 * seed `χ(a_min, φ) = (ζ/U)^{1/4}·[c₁·Ai(ζ) + c₂·Bi(ζ)]` (V > 0), which
 * is exact to all orders of the uniform Airy asymptotic expansion
 * across the turning surface. Hartle-Hawking selects pure Ai
 * (`c₁ = 1, c₂ = 0`); Vilenkin selects outgoing
 * (`c₁ = 1, c₂ = +i`) — the unique combinations that yield the
 * decaying-Euclidean and +a-propagating branches respectively, with no
 * leading-WKB residual.
 *
 * ## Dispatch by sign of `V(φ)`
 *
 * | Regime | Seed                                                              | Derivative                       |
 * |--------|-------------------------------------------------------------------|----------------------------------|
 * | V > 0  | HH: pure `Ai` Langer / Vilenkin: `Ai + i·Bi` Langer               | closed-form chain rule           |
 * | V = 0  | Gaussian-envelope × `√a·J_{1/4}(3π·a²)` / `√a·H_{1/4}^{(1)}`      | closed-form Bessel-¼ derivative  |
 * | V < 0  | Gaussian-envelope × `|U|^{-1/4}·cos Φ_L` / `...·exp(+iΦ_L)`       | leading-WKB deriv with prefactor |
 *
 * The `V = 0` and `V < 0` regimes have no classical turning surface on
 * the column; there is no physics-determined amplitude and the
 * Gaussian-in-φ envelope `exp(-½|φ|²)` is a conventional gauge choice
 * (preserving the identifier-level continuity across the three regimes
 * that the legacy generator also relied on). For `V > 0` the Langer-Ai
 * amplitude carries its own Euclidean decay for cells with
 * `a_min > a_turn(φ)`, so no extra envelope is applied.
 *
 * @module lib/physics/wheelerDeWitt/hhLangerSeed
 */

import { wdwPotential } from './constants'
import {
  type ColumnArgs,
  type ColumnSample,
  columnSolutionNegativeV,
  columnSolutionPositiveV,
  columnSolutionZeroV,
  type ComplexPair,
} from './exactColumnSolution'

/**
 * Minimum `|V|` at which a column is routed to the V > 0 Langer-Ai form.
 * Cells with `|V| < WDW_LANGER_V_ZERO_THRESHOLD` are treated as the
 * exact-V=0 (Bessel) regime; the free case `m = lambda = 0` satisfies
 * this across every grid cell.
 *
 * The threshold is chosen O(1e-12) to discriminate exact zero from
 * small-but-finite V. Rationale: at `V = 1e-6, a = 0.1` the Langer
 * variable `|ζ| ≈ 1.1·10⁴`; the Airy asymptotic `Ai(ζ)` is numerically
 * well-behaved at that scale (f64 phase `(2/3)|ζ|^{3/2} ≈ 7.5·10⁵`
 * retains ~5 decimals of precision). A higher threshold would force
 * small-but-nonzero V cells into a Gaussian gauge and reintroduce the
 * discontinuity bug that Phase 1's `boundaryConditions.test.ts`
 * `is continuous at the V = 0 origin cell` test explicitly guards.
 */
const WDW_LANGER_V_ZERO_THRESHOLD = 1e-12

/** Fixed Gaussian-in-φ envelope factor `exp(-½(φ₁² + φ₂²))` (gauge). */
function gaussianEnvelope(phi1: number, phi2: number): number {
  return Math.exp(-0.5 * (phi1 * phi1 + phi2 * phi2))
}

/**
 * Hartle-Hawking ("no-boundary") seed at `(a_min, φ)`. Real-valued:
 * both `χ` and `∂_a χ` are real. Returned as a `ColumnSample` with
 * `chi.im = dChi.im = 0`.
 *
 * Physical meaning:
 *  - V > 0: pure Ai branch `χ = (ζ/U)^{1/4}·Ai(ζ)` — regular at the
 *    classical singularity, exponentially decaying past the turning
 *    surface. The no-boundary proposal's Euclidean path integral over
 *    compact 4-geometries selects exactly this branch.
 *  - V = 0: `env·√a·J_{1/4}(3π·a²)` — real even Bessel of order ¼. The
 *    envelope is a gauge; no physical prescription selects a
 *    J/Y combination at V = 0.
 *  - V < 0: `env·|U|^{-1/4}·cos Φ_L` — real cos-branch standing wave.
 *    The envelope is a gauge; HH on V < 0 has no compact Euclidean
 *    instanton (AdS has no classical bounce), so the real combination
 *    is a consensus standing-wave convention.
 *
 * @param args - `{ a, phi1, phi2, m, lambda, asymmetry? }`.
 * @returns Real-valued `{ chi, dChi }` at the cell.
 */
export function hhLangerSeed(args: ColumnArgs): ColumnSample {
  const { a, phi1, phi2, m, lambda } = args
  const asymmetry = args.asymmetry ?? 1
  const V = wdwPotential(phi1, phi2, m, lambda, asymmetry)

  if (V > WDW_LANGER_V_ZERO_THRESHOLD) {
    // V > 0: pure Ai branch (c1 = 1, c2 = 0). Ai's Euclidean decay
    // handles the φ-envelope for cells with a_min > a_turn(φ); no extra
    // Gaussian factor.
    return columnSolutionPositiveV(args, 1, 0)
  }

  if (V < -WDW_LANGER_V_ZERO_THRESHOLD) {
    // V < 0 (AdS cell): env · |U|^{-1/4} · cos(Φ_L). Standing wave gauge.
    const env = gaussianEnvelope(phi1, phi2)
    return columnSolutionNegativeV(args, { re: env, im: 0 }, { re: 0, im: 0 })
  }

  // V = 0 (exactly): env · √a · J_{1/4}(3π·a²). Pure real Bessel gauge.
  const env = gaussianEnvelope(phi1, phi2)
  return columnSolutionZeroV(a, { re: env, im: 0 }, { re: 0, im: 0 })
}

/**
 * Vilenkin ("tunneling") seed at `(a_min, φ)`. Complex-valued: the
 * `+i` imaginary component encodes the outgoing (+a-direction =
 * expanding-universe) phase gradient.
 *
 * Physical meaning:
 *  - V > 0: Langer-uniform outgoing combination
 *    `χ = (ζ/U)^{1/4}·(Ai(ζ) + i·Bi(ζ))`. The asymptotic form
 *    `Ai + i·Bi → (1/√π)|ζ|^{-1/4}·exp(-i·|S_L|+i·π/4)` gives
 *    `χ'/χ → +i·√|U|` — the +a-direction outgoing phase that
 *    Vilenkin's tunneling proposal selects.
 *  - V = 0: `env · √a · H_{1/4}^{(1)}(3π·a²) = env·√a·(J + i·Y)`.
 *    Outgoing Hankel combination; asymptotic phase rate `+√|U|`.
 *  - V < 0: `env · |U|^{-1/4} · exp(+i·Φ_L)`. Leading-WKB outgoing
 *    wave; pure-Lorentzian column with no turning surface.
 *
 * For V > 0 the real and imaginary parts are obtained by calling the
 * real-coefficient `columnSolutionPositiveV` twice and combining:
 * `Re χ = χ(c₁=1, c₂=0)`, `Im χ = χ(c₁=0, c₂=1)` — the linearity of
 * the Langer prefactor and the bilinearity of Airy evaluation make this
 * decomposition exact (no precision loss vs a hypothetical
 * complex-coefficient evaluator).
 *
 * @param args - `{ a, phi1, phi2, m, lambda, asymmetry? }`.
 * @returns Complex `{ chi, dChi }` with `Im χ' ∝ +√|U|·χ`.
 */
export function vilenkinLangerSeed(args: ColumnArgs): ColumnSample {
  const { a, phi1, phi2, m, lambda } = args
  const asymmetry = args.asymmetry ?? 1
  const V = wdwPotential(phi1, phi2, m, lambda, asymmetry)

  if (V > WDW_LANGER_V_ZERO_THRESHOLD) {
    // V > 0: Ai + i·Bi Langer combination.
    //   Re χ = pref·Ai(ζ) = columnSolutionPositiveV(1, 0)
    //   Im χ = pref·Bi(ζ) = columnSolutionPositiveV(0, 1)
    // Derivatives split identically.
    const re = columnSolutionPositiveV(args, 1, 0)
    const im = columnSolutionPositiveV(args, 0, 1)
    return {
      chi: { re: re.chi.re, im: im.chi.re },
      dChi: { re: re.dChi.re, im: im.dChi.re },
    }
  }

  const env = gaussianEnvelope(phi1, phi2)
  if (V < -WDW_LANGER_V_ZERO_THRESHOLD) {
    // V < 0: env · |U|^{-1/4} · exp(+i·Φ_L) = A·cos + B·sin with
    // A = env, B = i·env.
    const A: ComplexPair = { re: env, im: 0 }
    const B: ComplexPair = { re: 0, im: env }
    return columnSolutionNegativeV(args, A, B)
  }

  // V = 0: env · √a · H_{1/4}^{(1)}(3π·a²) = env·√a·(J + i·Y).
  //   A = env (coef of J), B = i·env (coef of Y).
  const A: ComplexPair = { re: env, im: 0 }
  const B: ComplexPair = { re: 0, im: env }
  return columnSolutionZeroV(a, A, B)
}
