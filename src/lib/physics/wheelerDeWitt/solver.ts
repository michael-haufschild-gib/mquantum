/**
 * Wheeler–DeWitt leapfrog solver (3D minisuperspace: a × φ₁ × φ₂).
 *
 * Reduced WdW equation (χ = a^{3/2} Ψ, conformal-minimal ordering):
 *
 *   [ −∂²_a + (1/a²)(∂²_{φ₁} + ∂²_{φ₂}) + U(a, φ) ] χ = 0
 *
 * with `U(a, φ) = −36π²·a²·(1 − (8πG/3)·a²·V(φ))` and
 * `V(φ) = ½m²(φ₁²+φ₂²) + Λ`. Physics constants, the operator itself, and
 * the analytic WKB helpers live in {@link ./constants}.
 *
 * Explicit second-order leapfrog in `a`:
 *
 *   χ(a+da, φ) = 2 χ(a, φ) − χ(a−da, φ) + da²·[ (1/a²)·∇²_φ χ − U·χ ]
 *
 * The φ-Laplacian uses 2nd-order central differences with ghost-zero
 * Dirichlet conditions at the outer φ-edges — cells one step beyond the
 * grid are treated as `χ = 0` when computing the Laplacian at edge cells
 * `i1 ∈ {0, Nphi-1}` or `i2 ∈ {0, Nphi-1}`. Edge cells themselves evolve
 * under the PDE (they are not pinned to zero), which preserves the
 * non-trivial Gaussian-in-φ envelope supplied by the boundary generators.
 *
 * ## Stage-2 deep-Euclidean analytic tail
 *
 * The Euclidean (`U > 0`) region hosts an exponentially-growing WKB
 * branch that the explicit leapfrog cannot cleanly suppress across the
 * ~50-slab Euclidean march at typical grids. Rather than mask the
 * runaway with an overflow clamp, the solver splits the Euclidean
 * portion of each φ-column into two regions at a per-column phase
 * threshold:
 *
 *  1. **Transition band** — cells with `0 < WKB_phase_since_turning
 *     < WDW_WKB_MATCH_PHASE_THRESHOLD`. Numerical leapfrog + soft
 *     Euclidean absorber (`exp(−η·√U·da)`) handles these; they are
 *     close enough to the turning surface that WKB prefactors diverge
 *     and the Airy asymptotics are not yet valid.
 *  2. **Deep band** — cells with `WKB_phase_since_turning ≥ THRESHOLD`.
 *     At the first crossing the solver captures the numerical χ as the
 *     match coefficient; deeper cells are overwritten with the analytic
 *     1D WKB propagator
 *
 *     ```
 *     χ(a, φ) = χ_match(φ) · (U_match / U(a))^{1/4} · exp(−(S(a) − S_match))
 *     ```
 *
 *     This is **boundary-condition-agnostic** — the match cell's complex
 *     value carries whatever branch content (HH decaying, Vilenkin
 *     outgoing-wave, DeWitt linear-in-a) the numerical integration
 *     produced. The propagator preserves that content while eliminating
 *     the runaway.
 *
 * With Stage-2 active the Euclidean amplitude at cube corners drops
 * from ~10⁶ (absorber-only, clamp-load-bearing) to ~10⁻¹² (physical
 * HH tail), so the three former overflow-guard thresholds
 * (`WDW_CHI_CLAMP`, `WDW_CHI_SOFT_CLAMP`, `WDW_RESIDUAL_CLAMP_GUARD`)
 * are no longer needed.
 *
 * Output: interleaved (re, im) Float32Array of shape (Na, Nphi, Nphi) in
 * row-major order `[ia, iPhi1, iPhi2]` with 2 floats per cell, plus a
 * per-cell Lorentzian mask (1 byte: 1 where `U < 0`, 0 otherwise).
 *
 * @module lib/physics/wheelerDeWitt/solver
 */

import type { WdwBoundaryCondition } from '@/lib/geometry/extended/wheelerDeWitt'
import { logger } from '@/lib/logger'

import {
  type ColumnAiryInfo,
  emptyColumnAiry,
  extractColumnAiry,
  langerEvaluate,
} from './airyConnection'
import { buildWdwBoundary } from './boundaryConditions'
import { WDW_C_U, wdwEuclideanWkbAction, wdwTurningA, wdwU } from './constants'

// Re-export for downstream consumers that import `wdwU` from the solver
// module (e.g. tests that need the operator alongside the solver output).
export { wdwU } from './constants'

/**
 * Explicit-leapfrog stability budget for the φ-Laplacian term
 * `da² · (1/aMin²) · 8/dphi²`. Empirically the solver stays well-behaved up
 * to ~4; values above that are flagged as borderline. The guard is
 * informational only (dev-only `logger.warn`) so existing callers —
 * including the in-app default config and unit tests — are never blocked.
 */
const WDW_CFL_BUDGET = 4

/**
 * Rate-limit the CFL warning so interactive parameter sweeps do not spam
 * the console. Each call to {@link solveWheelerDeWitt} consults + mutates
 * this counter through the {@link WDW_CFL_WARN_BUDGET} object so tests can
 * reset it via {@link resetCflWarningBudget} and assert behaviour
 * deterministically.
 */
interface CflWarningBudget {
  remaining: number
}

const WDW_CFL_WARN_DEFAULT = 3
const WDW_CFL_WARN_BUDGET: CflWarningBudget = { remaining: WDW_CFL_WARN_DEFAULT }

/**
 * Test helper: reset the CFL-warning budget to the initial value so
 * subsequent solves can observe the warning again. Safe to call from
 * production code — the default budget is small and exhausting it is
 * benign. Exported so the shared module state does not leak between
 * tests.
 */
export function resetCflWarningBudget(budget: number = WDW_CFL_WARN_DEFAULT): void {
  WDW_CFL_WARN_BUDGET.remaining = Math.max(0, Math.floor(budget))
}

/**
 * Soft absorber strength for the transition-band Euclidean cells (cells
 * with `0 < U` and WKB phase since turning below
 * {@link WDW_WKB_MATCH_PHASE_THRESHOLD}). At each leapfrog step, those
 * cells are multiplied by `exp(−η·√U·da)` to suppress the numerical
 * growing branch that the explicit scheme inherits from any boundary
 * data imperfectly projected onto the decaying branch.
 *
 * `η = 1.0` cancels the 1D WKB growth rate of the growing branch
 * exactly. The absorber is NOT branch-selective: it damps both branches
 * equally. In the transition band this is acceptable because it is a
 * narrow region near the turning surface; the physical amplitude there
 * is O(1) and the exp(−√U·da) damping is weak since √U is small near
 * `U = 0`. Deep-band cells bypass the absorber entirely — they receive
 * the analytic WKB propagator output instead.
 */
const WDW_EUCLIDEAN_ABSORBER_ETA = 1.0

/**
 * WKB-phase threshold past the Lorentzian-Euclidean turning surface at
 * which the analytic decaying-branch propagator takes over from the
 * numerical leapfrog.
 *
 * Threshold is expressed as the dimensionless WKB phase change since
 * the turning point:
 *
 *   phase_since_turning(a, φ) = (2/3) · √α(φ) · (a − a_turn(φ))^{3/2}
 *
 * where `α(φ) = ∂_a U|_{a_turn(φ)} = 2 · c_U · a_turn(φ)`. At
 * `phase = 2.0` the Airy asymptotic form is good to within ~1% of the
 * next-to-leading WKB correction, which is well below the amplitude
 * scale of the rendered density. Cells below this threshold receive the
 * numerical leapfrog + absorber (transition band); cells at or above
 * receive the analytic exp(−S_Euc) propagator from the per-column match
 * coefficient captured at the first threshold crossing.
 *
 * Raising the threshold widens the transition band and improves
 * near-turning fidelity at the cost of admitting more numerical
 * residual. Lowering it narrows the band and hands more of the march to
 * the analytic propagator at the cost of WKB-breakdown near the
 * turning surface (prefactor `U^{−1/4}` diverges as `U → 0`).
 */
const WDW_WKB_MATCH_PHASE_THRESHOLD = 2.0

/** Solver inputs mirroring the WdW config fields. */
export interface WheelerDeWittSolverInput {
  boundaryCondition: WdwBoundaryCondition
  inflatonMass: number
  cosmologicalConstant: number
  aMin: number
  aMax: number
  gridNa: number
  gridNphi: number
  phiExtent: number
}

/** Dense output of the Wheeler–DeWitt solver. */
export interface WheelerDeWittSolverOutput {
  /**
   * `χ(a, φ₁, φ₂)` as interleaved `(re, im)` pairs. Strides in units of
   * complex entries: `stride_a = Nphi·Nphi`, `stride_phi1 = Nphi`,
   * `stride_phi2 = 1`. Total floats = `2·Na·Nphi·Nphi`.
   */
  chi: Float32Array
  /** Per-cell mask: 1 when `U(a, φ) < 0` (Lorentzian), 0 otherwise (Euclidean). */
  lorentzianMask: Uint8Array
  /**
   * Per-cell band classification:
   *   0 = Lorentzian (`U < 0`).
   *   1 = Euclidean transition band (numerical + absorber).
   *   2 = Euclidean deep band (analytic WKB propagator).
   * Exposed so tests can validate band structure directly.
   */
  bandKind: Uint8Array
  /** Grid dimensions `(Na, Nphi, Nphi)`. */
  gridSize: [number, number, number]
  /** Physical grid extents (consumers read for coordinate mapping). */
  aMin: number
  aMax: number
  phiExtent: number
  /** Maximum `|χ|²` observed on the grid — for consumer-side normalization. */
  maxDensity: number
  /**
   * Per-column Airy/Langer connection state. Length `Nphi · Nphi`,
   * indexed `i1 * Nphi + i2`. Cells where `hasOverwrite` is `true` had
   * their Euclidean values overwritten with the BC-correct Langer
   * uniform formula; `false` columns kept the legacy
   * absorber + match-cell propagator path. Consumed by
   * {@link ./bogoliubov} for per-column α/β extraction.
   */
  columnAiry: ColumnAiryInfo[]
}

/** Result of the per-cell φ-Laplacian stencil: `(Re, Im)` pair. */
interface ComplexPair {
  re: number
  im: number
}

/**
 * Compute the ghost-zero Dirichlet φ-Laplacian stencil at grid point
 * `(i1, i2)` reading complex pairs from a contiguous slab buffer.
 *
 * Ghost rule: cells whose required neighbour would sit outside the grid
 * contribute `0` to the stencil sum — mathematically equivalent to
 * imposing `χ = 0` on the phantom cell one step past the boundary. The
 * subtraction `−2·c` is applied unconditionally for each axis so the
 * operator stays second-order accurate even at the edge (the missing
 * neighbour's contribution is exactly `(0 + c − 2c) = −c`, which equals
 * replacing the missing term with a literal zero).
 *
 * @param slab - Interleaved-complex slab buffer of length `2·Nphi²`.
 * @param slabBase - Offset into `slab` for the φ-plane being laplacianised.
 * @param i1 - Row index along the first inflaton axis.
 * @param i2 - Column index along the second inflaton axis.
 * @param Nphi - φ-grid dimension.
 * @param invDphi2 - `1 / dφ²`; caller precomputes once per solve.
 * @returns `(Re, Im)` pair of `∇²_φ χ` at `(i1, i2)`.
 */
function phiLaplacianAt(
  slab: Float32Array,
  slabBase: number,
  i1: number,
  i2: number,
  Nphi: number,
  invDphi2: number
): ComplexPair {
  const center = slabBase + 2 * (i1 * Nphi + i2)
  const cre = slab[center] ?? 0
  const cim = slab[center + 1] ?? 0

  const pre1 = i1 > 0 ? (slab[slabBase + 2 * ((i1 - 1) * Nphi + i2)] ?? 0) : 0
  const pim1 = i1 > 0 ? (slab[slabBase + 2 * ((i1 - 1) * Nphi + i2) + 1] ?? 0) : 0
  const nre1 = i1 < Nphi - 1 ? (slab[slabBase + 2 * ((i1 + 1) * Nphi + i2)] ?? 0) : 0
  const nim1 = i1 < Nphi - 1 ? (slab[slabBase + 2 * ((i1 + 1) * Nphi + i2) + 1] ?? 0) : 0
  const pre2 = i2 > 0 ? (slab[slabBase + 2 * (i1 * Nphi + i2 - 1)] ?? 0) : 0
  const pim2 = i2 > 0 ? (slab[slabBase + 2 * (i1 * Nphi + i2 - 1) + 1] ?? 0) : 0
  const nre2 = i2 < Nphi - 1 ? (slab[slabBase + 2 * (i1 * Nphi + i2 + 1)] ?? 0) : 0
  const nim2 = i2 < Nphi - 1 ? (slab[slabBase + 2 * (i1 * Nphi + i2 + 1) + 1] ?? 0) : 0

  return {
    re: (pre1 + nre1 - 2 * cre + pre2 + nre2 - 2 * cre) * invDphi2,
    im: (pim1 + nim1 - 2 * cim + pim2 + nim2 - 2 * cim) * invDphi2,
  }
}

/**
 * Per-column Stage-2 state. One entry per `(i1, i2)` cell indexed as
 * `i1 * Nphi + i2`. Tracks the analytic turning surface, the Airy
 * prefactor `α`, and the match coefficient captured at the first
 * deep-band crossing along `a`.
 */
interface ColumnWkbState {
  /** `a_turn(φ)` in physical units, or `null` when `V(φ) ≤ 0`. */
  aTurn: number | null
  /** `α = ∂_a U|_{a_turn} = 2·c_U·a_turn`, or `null` if `aTurn` is null. */
  alpha: number | null
  /** Set once the first deep-band slab is reached; frozen afterwards. */
  matched: boolean
  /** `S_Euc` at the match slab. */
  sEucAtMatch: number
  /** `|U|^{1/4}` at the match slab, cached for the prefactor ratio. */
  uPrefactorAtMatch: number
  /** `χ` at the match slab, captured from the numerical output. */
  chiReAtMatch: number
  chiImAtMatch: number
}

/** Band classification for a single cell. */
enum BandKind {
  Lorentzian = 0,
  EuclideanTransition = 1,
  EuclideanDeep = 2,
}

/**
 * Compute the dimensionless WKB phase since the turning surface at a
 * given `a`, used to classify cells as transition-band vs deep-band.
 */
function wkbPhaseSinceTurning(a: number, aTurn: number, alpha: number): number {
  const da = a - aTurn
  if (da <= 0) return 0
  return (2 / 3) * Math.sqrt(alpha) * Math.pow(da, 1.5)
}

/**
 * Apply the soft Euclidean absorber multiplicatively to a complex pair
 * when `U > 0`. Returns the damped pair unchanged in the Lorentzian
 * region, so callers can apply unconditionally inside the transition
 * band. Deep-band cells bypass this entirely (they are overwritten by
 * the analytic WKB propagator).
 */
function applyTransitionAbsorber(
  nextRe: number,
  nextIm: number,
  U: number,
  da: number
): ComplexPair {
  if (U > 0) {
    const damp = Math.exp(-WDW_EUCLIDEAN_ABSORBER_ETA * Math.sqrt(U) * da)
    return { re: nextRe * damp, im: nextIm * damp }
  }
  return { re: nextRe, im: nextIm }
}

/**
 * Overwrite a cell's χ value with the analytic 1D WKB propagator from
 * the captured match coefficient.
 *
 *   χ(a) = χ_match · (U_match / U(a))^{1/4} · exp(−(S(a) − S_match))
 */
function propagateWkbTail(state: ColumnWkbState, S: number, U: number): ComplexPair {
  const uPrefactorAtA = Math.pow(Math.abs(U), 0.25)
  const prefactorRatio = state.uPrefactorAtMatch / uPrefactorAtA
  const damp = Math.exp(-(S - state.sEucAtMatch))
  return {
    re: state.chiReAtMatch * prefactorRatio * damp,
    im: state.chiImAtMatch * prefactorRatio * damp,
  }
}

/**
 * Allocate the per-column Stage-2 state array for a given φ-grid at
 * fixed `(m, Λ)`.
 */
function initColumnWkbStates(
  Nphi: number,
  phiExtent: number,
  m: number,
  lambda: number
): ColumnWkbState[] {
  const states: ColumnWkbState[] = new Array(Nphi * Nphi)
  const dphi = Nphi > 1 ? (2 * phiExtent) / (Nphi - 1) : 0
  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = -phiExtent + i1 * dphi
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = -phiExtent + i2 * dphi
      const aTurn = wdwTurningA(phi1, phi2, m, lambda)
      const alpha = aTurn !== null ? 2 * WDW_C_U * aTurn : null
      states[i1 * Nphi + i2] = {
        aTurn,
        alpha,
        matched: false,
        sEucAtMatch: 0,
        uPrefactorAtMatch: 0,
        chiReAtMatch: 0,
        chiImAtMatch: 0,
      }
    }
  }
  return states
}

/**
 * Run the leapfrog Wheeler–DeWitt solver.
 *
 * @param input - Solver config.
 * @returns Dense `χ` grid and auxiliary metadata.
 */
export function solveWheelerDeWitt(input: WheelerDeWittSolverInput): WheelerDeWittSolverOutput {
  const {
    boundaryCondition,
    inflatonMass,
    cosmologicalConstant,
    aMin,
    aMax,
    gridNa,
    gridNphi,
    phiExtent,
  } = input

  if (gridNa < 3) throw new Error('gridNa must be >= 3')
  if (gridNphi < 3) throw new Error('gridNphi must be >= 3')
  if (!(aMax > aMin)) throw new Error('aMax must exceed aMin')

  const Na = gridNa
  const Nphi = gridNphi
  const slabSize = Nphi * Nphi
  const complexSlabFloats = 2 * slabSize

  const chi = new Float32Array(2 * Na * slabSize)
  const mask = new Uint8Array(Na * slabSize)
  const bandKind = new Uint8Array(Na * slabSize)

  const da = (aMax - aMin) / (Na - 1)
  const dphi = (2 * phiExtent) / (Nphi - 1)
  const invDphi2 = 1 / (dphi * dphi)

  // Explicit-leapfrog CFL diagnostic for the φ-Laplacian term:
  //   da² · max(1/a²) · 8/dphi²   (max(1/a²) attained at aMin).
  // > WDW_CFL_BUDGET flags marginal stability. Dev-only and rate-limited
  // through WDW_CFL_WARN_BUDGET.remaining so it never spams the console
  // during interactive parameter sweeps; reset the budget via
  // {@link resetCflWarningBudget} in tests.
  if (aMin > 0 && WDW_CFL_WARN_BUDGET.remaining > 0) {
    const cflPhi = (da * da * 8 * invDphi2) / (aMin * aMin)
    if (cflPhi > WDW_CFL_BUDGET) {
      WDW_CFL_WARN_BUDGET.remaining -= 1
      logger.warn(
        `[wdw] CFL margin tight: da²·(1/aMin²)·8/dphi² = ${cflPhi.toFixed(2)} (budget ${WDW_CFL_BUDGET}). ` +
          `Recommend aMin ≥ 0.1, gridNphi ≤ 32, gridNa ≤ 256, phiExtent ≥ 1.5. ` +
          `Current: aMin=${aMin}, aMax=${aMax}, gridNa=${gridNa}, gridNphi=${gridNphi}, phiExtent=${phiExtent}.`
      )
    }
  }

  // Stage-2 per-column WKB state (turning point, α, pending match).
  const columnStates = initColumnWkbStates(Nphi, phiExtent, inflatonMass, cosmologicalConstant)

  // Initial slab from the chosen boundary condition.
  const initial = buildWdwBoundary(boundaryCondition, {
    Nphi,
    phiExtent,
    aMin,
    mass: inflatonMass,
    lambda: cosmologicalConstant,
  })

  // Copy χ(a_min, ·) into slab 0.
  chi.set(initial.chi, 0)

  // Classify slab 0 up front so the bandKind output is complete.
  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = -phiExtent + i1 * dphi
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = -phiExtent + i2 * dphi
      const idx = i1 * Nphi + i2
      const U0 = wdwU(aMin, phi1, phi2, inflatonMass, cosmologicalConstant)
      mask[idx] = U0 < 0 ? 1 : 0
      bandKind[idx] = classifyCellBand(columnStates[idx]!, aMin, U0)
    }
  }

  // Second slab from Taylor expansion (the leapfrog 3-point recurrence
  // needs χ on two preceding slabs before it can march):
  //   χ(a_min + da) = χ(a_min) + da·χ'(a_min) + ½·da²·χ''(a_min)
  // with χ'' = (1/a²)·∇²_φ χ − U·χ from the WdW equation.
  const a0 = aMin
  const a1 = aMin + da
  const invA0Sq = 1 / (a0 * a0)

  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = -phiExtent + i1 * dphi
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = -phiExtent + i2 * dphi
      const idx = i1 * Nphi + i2

      const U0 = wdwU(a0, phi1, phi2, inflatonMass, cosmologicalConstant)
      const U1 = wdwU(a1, phi1, phi2, inflatonMass, cosmologicalConstant)

      const cre = initial.chi[2 * idx] ?? 0
      const cim = initial.chi[2 * idx + 1] ?? 0
      const lap = phiLaplacianAt(initial.chi, 0, i1, i2, Nphi, invDphi2)

      // Plugged into −∂²_a χ + (1/a²) ∇²_φ χ + U·χ = 0
      //   → ∂²_a χ = (1/a²) ∇²_φ χ + U·χ.
      const chiDDotRe = invA0Sq * lap.re + U0 * cre
      const chiDDotIm = invA0Sq * lap.im + U0 * cim

      const dre = initial.chiDeriv[2 * idx] ?? 0
      const dim = initial.chiDeriv[2 * idx + 1] ?? 0

      let nextRe = cre + da * dre + 0.5 * da * da * chiDDotRe
      let nextIm = cim + da * dim + 0.5 * da * da * chiDDotIm

      // Classify + apply Stage-2 logic on slab 1.
      const state = columnStates[idx]!
      const band = classifyCellBand(state, a1, U1)
      if (band === BandKind.EuclideanTransition) {
        const damped = applyTransitionAbsorber(nextRe, nextIm, U1, da)
        nextRe = damped.re
        nextIm = damped.im
      } else if (band === BandKind.EuclideanDeep) {
        // Slab 1 already past the match threshold (very small aMin or
        // very large V in this column). Capture the numerical result as
        // the match cell and leave nextRe/nextIm unchanged (the match
        // cell is NOT overwritten).
        captureMatch(state, a1, phi1, phi2, inflatonMass, cosmologicalConstant, U1, nextRe, nextIm)
      }

      chi[complexSlabFloats + 2 * idx] = nextRe
      chi[complexSlabFloats + 2 * idx + 1] = nextIm
      mask[slabSize + idx] = U1 < 0 ? 1 : 0
      bandKind[slabSize + idx] = band
    }
  }

  // Leapfrog main loop for slabs ia = 2 .. Na-1.
  for (let ia = 2; ia < Na; ia++) {
    const a = aMin + ia * da
    const aPrev = aMin + (ia - 1) * da
    const invAprevSq = 1 / (aPrev * aPrev)
    const prevSlabBase = (ia - 1) * complexSlabFloats
    const prevPrevSlabBase = (ia - 2) * complexSlabFloats
    const curSlabBase = ia * complexSlabFloats
    const maskBase = ia * slabSize

    for (let i1 = 0; i1 < Nphi; i1++) {
      const phi1 = -phiExtent + i1 * dphi
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi2 = -phiExtent + i2 * dphi
        const idx = i1 * Nphi + i2

        const Uprev = wdwU(aPrev, phi1, phi2, inflatonMass, cosmologicalConstant)
        const Ucur = wdwU(a, phi1, phi2, inflatonMass, cosmologicalConstant)

        const cre = chi[prevSlabBase + 2 * idx] ?? 0
        const cim = chi[prevSlabBase + 2 * idx + 1] ?? 0
        const prevRe = chi[prevPrevSlabBase + 2 * idx] ?? 0
        const prevIm = chi[prevPrevSlabBase + 2 * idx + 1] ?? 0

        const lap = phiLaplacianAt(chi, prevSlabBase, i1, i2, Nphi, invDphi2)

        // Leapfrog: χ_next = 2·χ_cur − χ_prev + da²·χ''
        const chiDDotRe = invAprevSq * lap.re + Uprev * cre
        const chiDDotIm = invAprevSq * lap.im + Uprev * cim
        let nextRe = 2 * cre - prevRe + da * da * chiDDotRe
        let nextIm = 2 * cim - prevIm + da * da * chiDDotIm

        const state = columnStates[idx]!
        const band = classifyCellBand(state, a, Ucur)

        if (band === BandKind.EuclideanTransition) {
          const damped = applyTransitionAbsorber(nextRe, nextIm, Ucur, da)
          nextRe = damped.re
          nextIm = damped.im
        } else if (band === BandKind.EuclideanDeep) {
          if (!state.matched) {
            // First deep-band slab: capture numerical χ as the match
            // coefficient and write the numerical value out unchanged.
            // Subsequent deep-band slabs receive the analytic propagator.
            captureMatch(
              state,
              a,
              phi1,
              phi2,
              inflatonMass,
              cosmologicalConstant,
              Ucur,
              nextRe,
              nextIm
            )
          } else {
            const S = wdwEuclideanWkbAction(a, phi1, phi2, inflatonMass, cosmologicalConstant)
            const propagated = propagateWkbTail(state, S, Ucur)
            nextRe = propagated.re
            nextIm = propagated.im
          }
        }

        chi[curSlabBase + 2 * idx] = nextRe
        chi[curSlabBase + 2 * idx + 1] = nextIm
        mask[maskBase + idx] = Ucur < 0 ? 1 : 0
        bandKind[maskBase + idx] = band
      }
    }
  }

  // Stage-3: Airy / Langer overwrite. For each column with a turning
  // surface and ≥ 2 Lorentzian-asymptotic cells, fit (A_c, A_s) on the
  // numerical Lorentzian wave, map to (c₁, c₂) via the Langer
  // connection, apply the per-BC branch policy, and overwrite every
  // Euclidean cell in the column with χ(a) = (ζ/U)^{1/4}·[c₁·Ai(ζ) +
  // c₂·Bi(ζ)]. Columns without a viable extraction keep the existing
  // numerical-leapfrog + analytic-tail values written by Stage-2 above.
  const columnAiry: ColumnAiryInfo[] = new Array(slabSize)
  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = -phiExtent + i1 * dphi
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = -phiExtent + i2 * dphi
      const slabIndex = i1 * Nphi + i2
      const info = extractColumnAiry(
        {
          chi,
          Na,
          slabSize,
          slabIndex,
          da,
          aMin,
          phi1,
          phi2,
          mass: inflatonMass,
          lambda: cosmologicalConstant,
        },
        boundaryCondition
      )
      columnAiry[slabIndex] = info
      if (!info.hasOverwrite) continue
      // Overwrite every Euclidean cell (a > a_turn) in this column.
      for (let ia = 0; ia < Na; ia++) {
        const a = aMin + ia * da
        if (a <= info.aTurn!) continue
        const { re, im } = langerEvaluate(info, a, phi1, phi2, inflatonMass, cosmologicalConstant)
        const cellOff = 2 * (ia * slabSize + slabIndex)
        chi[cellOff] = re
        chi[cellOff + 1] = im
      }
    }
  }
  for (let i = 0; i < columnAiry.length; i++) {
    if (columnAiry[i] === undefined) columnAiry[i] = emptyColumnAiry(null)
  }

  // Find max |χ|² over the full grid. With the Airy overwrite the
  // Euclidean amplitudes carry the physical BC-correct decaying tail
  // (HH/DeWitt) or the unitarity-respecting outgoing wave (Vilenkin),
  // so no Lorentzian-only fallback is needed.
  let maxDensity = 0
  for (let i = 0; i < chi.length; i += 2) {
    const re = chi[i] ?? 0
    const im = chi[i + 1] ?? 0
    const d = re * re + im * im
    if (d > maxDensity) maxDensity = d
  }

  return {
    chi,
    lorentzianMask: mask,
    bandKind,
    gridSize: [Na, Nphi, Nphi],
    aMin,
    aMax,
    phiExtent,
    maxDensity,
    columnAiry,
  }
}

/**
 * Classify a single cell's band without mutating state. Pure read.
 * Wrapped as a named function so the call-site inside the leapfrog loop
 * reads cleanly.
 */
function classifyCellBand(state: ColumnWkbState, a: number, U: number): BandKind {
  if (U <= 0) return BandKind.Lorentzian
  if (state.aTurn === null || state.alpha === null) return BandKind.EuclideanTransition
  const phase = wkbPhaseSinceTurning(a, state.aTurn, state.alpha)
  if (phase < WDW_WKB_MATCH_PHASE_THRESHOLD) return BandKind.EuclideanTransition
  return BandKind.EuclideanDeep
}

/**
 * Freeze the per-column match coefficient. Called exactly once per
 * column (guarded by `state.matched`), on the first deep-band slab. The
 * captured χ is written to the output grid unchanged; all deeper slabs
 * receive the analytic propagator output computed from this match.
 */
function captureMatch(
  state: ColumnWkbState,
  a: number,
  phi1: number,
  phi2: number,
  m: number,
  lambda: number,
  U: number,
  chiRe: number,
  chiIm: number
): void {
  state.matched = true
  state.sEucAtMatch = wdwEuclideanWkbAction(a, phi1, phi2, m, lambda)
  state.uPrefactorAtMatch = Math.pow(Math.abs(U), 0.25)
  state.chiReAtMatch = chiRe
  state.chiImAtMatch = chiIm
}

/**
 * Residual check: plug the solution back into the WdW equation and
 * return the relative L² residual across the interior of the grid.
 * Exposed for tests and the benchmark harness.
 *
 *   residual(a, φ) = −∂²_a χ + (1/a²)·∇²_φ χ + U·χ
 *
 * We restrict the measurement to cells whose stencil sits entirely in
 * one of the two WdW-equation-respecting bands:
 *
 *  - All three stencil points (ia−1, ia, ia+1) Lorentzian → residual
 *    measures leapfrog fidelity in the oscillating region.
 *  - All three stencil points deep-band Euclidean → residual measures
 *    the deviation of the analytic WKB propagator from the full PDE
 *    (the leading-WKB approximation has `O(1/U)` sub-leading terms
 *    that show up here).
 *
 * Transition-band stencils are excluded because the absorber violates
 * the raw PDE there by construction. The residual is normalised
 * against `‖U·χ‖₂` over the same included cells.
 *
 * @param output - Solver output.
 * @param input - Original solver input.
 * @returns Fractional residual (dimensionless), or `0` if no cells are
 *   included.
 */
export function wdwOperatorResidual(
  output: WheelerDeWittSolverOutput,
  input: WheelerDeWittSolverInput
): number {
  const Na = output.gridSize[0]
  const Nphi = output.gridSize[1]
  const slabSize = Nphi * Nphi
  const complexSlab = 2 * slabSize
  const da = (output.aMax - output.aMin) / (Na - 1)
  const dphi = (2 * output.phiExtent) / (Nphi - 1)
  const invDphi2 = 1 / (dphi * dphi)
  const invDa2 = 1 / (da * da)

  let resNorm = 0
  let ucNorm = 0

  for (let ia = 1; ia < Na - 1; ia++) {
    const a = output.aMin + ia * da
    const invAsq = 1 / (a * a)
    for (let i1 = 1; i1 < Nphi - 1; i1++) {
      const phi1 = -output.phiExtent + i1 * dphi
      for (let i2 = 1; i2 < Nphi - 1; i2++) {
        const phi2 = -output.phiExtent + i2 * dphi
        const idx = i1 * Nphi + i2
        const bandCur = output.bandKind[ia * slabSize + idx] ?? 0
        const bandPrev = output.bandKind[(ia - 1) * slabSize + idx] ?? 0
        const bandNext = output.bandKind[(ia + 1) * slabSize + idx] ?? 0

        // Only all-Lorentzian or all-deep-band stencils contribute. The
        // φ-Laplacian below reads (i1±1, i2) and (i1, i2±1), so those
        // neighbours must also be in the same valid band — otherwise the
        // residual is contaminated by transition-band cells where the
        // absorber intentionally violates the PDE.
        const allSameValid =
          (bandCur === BandKind.Lorentzian &&
            bandPrev === BandKind.Lorentzian &&
            bandNext === BandKind.Lorentzian) ||
          (bandCur === BandKind.EuclideanDeep &&
            bandPrev === BandKind.EuclideanDeep &&
            bandNext === BandKind.EuclideanDeep)
        if (!allSameValid) continue

        const samePhiStencil =
          (output.bandKind[ia * slabSize + (i1 - 1) * Nphi + i2] ?? 0) === bandCur &&
          (output.bandKind[ia * slabSize + (i1 + 1) * Nphi + i2] ?? 0) === bandCur &&
          (output.bandKind[ia * slabSize + i1 * Nphi + (i2 - 1)] ?? 0) === bandCur &&
          (output.bandKind[ia * slabSize + i1 * Nphi + (i2 + 1)] ?? 0) === bandCur
        if (!samePhiStencil) continue

        const cre = output.chi[ia * complexSlab + 2 * idx] ?? 0
        const cim = output.chi[ia * complexSlab + 2 * idx + 1] ?? 0
        const prevRe = output.chi[(ia - 1) * complexSlab + 2 * idx] ?? 0
        const prevIm = output.chi[(ia - 1) * complexSlab + 2 * idx + 1] ?? 0
        const nextRe = output.chi[(ia + 1) * complexSlab + 2 * idx] ?? 0
        const nextIm = output.chi[(ia + 1) * complexSlab + 2 * idx + 1] ?? 0

        const d2aRe = (nextRe - 2 * cre + prevRe) * invDa2
        const d2aIm = (nextIm - 2 * cim + prevIm) * invDa2

        const lap = phiLaplacianAt(output.chi, ia * complexSlab, i1, i2, Nphi, invDphi2)

        const U = wdwU(a, phi1, phi2, input.inflatonMass, input.cosmologicalConstant)

        const resRe = -d2aRe + invAsq * lap.re + U * cre
        const resIm = -d2aIm + invAsq * lap.im + U * cim
        resNorm += resRe * resRe + resIm * resIm
        ucNorm += U * U * (cre * cre + cim * cim)
      }
    }
  }

  if (ucNorm <= 0) return 0
  return Math.sqrt(resNorm / ucNorm)
}

/**
 * Count cells that have been overwritten by the Stage-2 analytic WKB
 * propagator (`bandKind === EuclideanDeep`, excluding the match slab).
 * The match slab itself is classified deep but written unchanged, so
 * this counter is a proxy for "how many cells carry the analytic tail";
 * exposed for tests that validate Stage-2 is actually engaging at
 * default parameters.
 *
 * @param output - Solver output.
 * @returns Number of deep-band cells.
 */
export function countEuclideanDeepCells(output: WheelerDeWittSolverOutput): number {
  let count = 0
  for (let i = 0; i < output.bandKind.length; i++) {
    if (output.bandKind[i] === BandKind.EuclideanDeep) count += 1
  }
  return count
}

/**
 * Maximum `|χ|²` over all Euclidean (non-Lorentzian) cells. With
 * Stage-2 active this reflects the physical exp(−S_Euc) tail, not a
 * numerical runaway; exposed so tests can assert the expected
 * astronomically-small amplitude at default parameters.
 *
 * @param output - Solver output.
 * @returns Max `|χ|²` in Euclidean cells.
 */
export function maxEuclideanChiSquared(output: WheelerDeWittSolverOutput): number {
  const chi = output.chi
  const mask = output.lorentzianMask
  let maxDensity = 0
  for (let i = 0; i < chi.length; i += 2) {
    const cellIdx = i >> 1
    if ((mask[cellIdx] ?? 0) !== 0) continue
    const re = chi[i] ?? 0
    const im = chi[i + 1] ?? 0
    const d = re * re + im * im
    if (d > maxDensity) maxDensity = d
  }
  return maxDensity
}
