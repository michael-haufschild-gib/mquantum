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
 * The φ-Laplacian uses 2nd-order central differences with **Neumann
 * (zero-flux) ghost** conditions at the outer φ-edges — cells one step
 * beyond the grid are treated as equal to the adjacent interior-edge
 * cell (`χ_ghost = χ_edge`, so `dχ/dφ = 0` at the boundary face) when
 * computing the Laplacian at edge cells `i1 ∈ {0, Nphi-1}` or
 * `i2 ∈ {0, Nphi-1}`. This replaces the earlier ghost-zero Dirichlet
 * rule (`χ_ghost = 0`), which was found to drive non-monotone
 * `q_a(phiExtent)` behaviour in SRMT sensitivity sweeps: the χ tail
 * was artificially clipped at the boundary, producing a hump around
 * `phiExtent ≈ 3` before falling (see `/tmp/srmt-phiextent-plateau-results.json`).
 *
 * Neumann is the correct approximation of "χ → 0 smoothly past the
 * window" for a bound-state envelope that has physical mass at the
 * grid edge: the ghost inherits the edge value rather than forcing a
 * discontinuity-at-cliff. Edge cells still evolve under the PDE (they
 * are not pinned), so the non-trivial Gaussian-in-φ envelope supplied
 * by the boundary generators is preserved without the Dirichlet sink.
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
import { buildWdwBoundary, type WdwBoundaryField } from './boundaryConditions'
import { WDW_C_U, wdwEuclideanWkbAction, wdwTurningA, wdwU } from './constants'
import {
  allocImplicitBulkScratch,
  type ImplicitBulkScratch,
  solveADILaplacianNeumann2D,
} from './implicitBulk'

// Re-export for downstream consumers that import `wdwU` from the solver
// module (e.g. tests that need the operator alongside the solver output).
export { wdwU } from './constants'

/**
 * Semver tag of the Wheeler–DeWitt solver implementation. Bumped when
 * output semantics change (grid layout, stencil order, BC projection,
 * analytic-tail formulation). Surfaced in the SRMT sweep reproducibility
 * manifest so archived CSVs can be pinned to the exact code revision
 * that produced them.
 *
 * Convention: major for output-incompatible changes, minor for added
 * invariants that preserve existing output, patch for internal cleanup
 * with byte-identical output.
 */
export const WDW_SOLVER_VERSION = '3.0.0'

/**
 * Advisory CFL threshold for the Lorentzian bulk `da²·(1/aMin²)·8/dphi²`.
 *
 * **Phase 3 note**: the bulk is now propagated with semi-implicit
 * Crank–Nicolson (via ADI, see `./implicitBulk`), which is
 * unconditionally stable — the CFL number no longer bounds a stability
 * envelope. The warning is retained as an **accuracy** hint: at high
 * CFL the trapezoidal scheme is still second-order but resolves high-k
 * dynamics less faithfully (numerical dispersion grows as `(κ·|λ_k|)²`).
 * The threshold `4` is kept for backwards compatibility with the pre-Phase-3
 * diagnostic and as an order-of-magnitude indicator; exceeding it does
 * not imply instability.
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
 * Width (in grid cells) of the φ-boundary absorbing sponge layer.
 * Waves reaching the outer φ-cells are damped by a quadratic-profile
 * exponential `exp(−γ_max · d²)` per leapfrog step, where
 * `d = (cells from sponge inner edge) / spongeWidth ∈ [0, 1]`.
 *
 * **Phase 3 retune** (docs/physics/wdw-bulk-stability.md): dropped from
 * 5 to 3. The semi-implicit CN bulk propagator damps high-k noise in
 * the interior on its own (factor `1/(1 + κ̂·|λ_k|)` per step with
 * `κ̂·|λ_k| ~ O(1)` at `k = N/2`), so the sponge no longer needs to
 * double as a noise filter — it only has to absorb legitimately
 * outgoing bulk modes at the domain boundary. A narrower layer leaves
 * more cells in the unity-factor interior for the symmetry-preservation
 * test. The sponge is NOT applied to the initial slabs (`ia = 0, 1`):
 * they carry the physical boundary condition exactly, and damping them
 * would re-introduce the φ-translation-symmetry-breaking perturbation
 * the Phase 3 rewrite removed.
 */
const WDW_PHI_SPONGE_WIDTH = 3

/**
 * Per-step peak damping rate at the outermost φ-cell. The effective
 * damping at cell `k` from the grid edge (k=0 at the edge) is
 * `exp(−γ_max · ((spongeWidth − k) / spongeWidth)²)`.
 *
 * **Phase 3 retune**: raised from 0.15 to 0.45 — heavier absorption to
 * compensate for the narrower layer. Total damping over `N_a = 128`
 * steps at the outermost cell is `exp(−0.45 · 128) ≈ 10⁻²⁵`; the
 * innermost sponge cell (depth = W-1 out of W=3) sees
 * `exp(−0.45 · (1/3)² · 128) = exp(−6.4) ≈ 10⁻³` per full march —
 * enough one-sided attenuation to damp outgoing waves without creating
 * a texture-visible boundary.
 */
const WDW_PHI_SPONGE_GAMMA = 0.45

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
  /**
   * Per-axis effective-mass ratio `α` applied to the φ₂ component of the
   * potential `V(φ) = ½m²·φ₁² + ½(m·α)²·φ₂² + Λ`. Optional; defaults
   * to `1` (isotropic) which reproduces the pre-asymmetry behaviour
   * bit-identically (multiplication by the exact IEEE-754 constant `1`
   * is a no-op). Values `α ≠ 1` break the φ₁↔φ₂ exchange symmetry of
   * `χ` so the SRMT diagnostic can distinguish clocks `phi1` and
   * `phi2`.
   */
  inflatonMassAsymmetry?: number
  cosmologicalConstant: number
  aMin: number
  aMax: number
  gridNa: number
  gridNphi: number
  phiExtent: number
  /**
   * Optional override for the initial slab `χ(a_min, φ)` and its
   * `a`-derivative. When supplied, the solver bypasses
   * `buildWdwBoundary(boundaryCondition, …)` and consumes these buffers
   * directly. Provided for analytic-fixture validation: tests need to
   * inject a constant-in-φ slab so the φ-Laplacian term contributes
   * exactly zero everywhere, isolating the 1D problem `−χ'' + U(a)·χ
   * = 0` for pointwise comparison against closed-form Bessel/Hankel
   * solutions (see `analyticFixtures.ts` and `solverAnalytic.test.ts`).
   *
   * Buffer layout MUST match the BC-generator output: each entry is an
   * interleaved `(re, im)` complex pair indexed by
   * `i = i_phi1 * Nphi + i_phi2`. Total length per buffer:
   * `2 · Nphi · Nphi`. Mismatched lengths throw.
   *
   * **Caveat**: Stage-3 Airy/Langer overwrite still consults
   * `boundaryCondition` for the per-BC c1/c2 branch selection rule
   * (`airyConnection.ts:applyBcWeighting`). If a custom boundary is
   * combined with a BC enum that disagrees with the physical BC the
   * boundary actually represents, the Stage-3 overwrite will pick the
   * wrong branch in dS columns. Pure-Lorentzian regimes (`Λ ≤ 0` at
   * `m = 0`) skip Stage-3 entirely — for those tests the BC enum is a
   * no-op label.
   */
  customBoundary?: WdwBoundaryField
  /**
   * When `true`, the absorbing sponge layer on the φ-boundary is
   * disabled. Used by the JS↔Rust cross-validation tests: the Rust
   * validator does not yet implement the sponge, so enabling it in the
   * JS solver would create a systematic mismatch that masks real bugs.
   * Production code should never set this.
   */
  disableSponge?: boolean
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
 * Compute the Neumann-ghost φ-Laplacian stencil at grid point
 * `(i1, i2)` reading complex pairs from a contiguous slab buffer.
 *
 * Ghost rule: cells whose required neighbour would sit outside the grid
 * inherit the value of the adjacent interior-edge cell (so the ghost
 * takes the centre cell's value when `i1 = 0` or `i1 = Nphi-1`, and
 * likewise for `i2`). This imposes `dχ/dφ = 0` at the outer boundary
 * face (first-order accurate at the edge, second-order accurate at
 * all interior points) — a reflecting / zero-flux boundary condition.
 *
 * This replaces the prior ghost-zero Dirichlet rule (`χ_ghost = 0`),
 * which artificially clipped the χ tail at the boundary and produced
 * non-monotone `q_a(phiExtent)` in SRMT sensitivity sweeps (see the
 * module-level docstring for the physics rationale). Under Neumann,
 * a constant-in-φ seed is an exact eigenfunction of `∇²_φ` with
 * eigenvalue `0` at every cell including the edges, so the
 * analytic-comparison tests in `solverAnalytic.test.ts` are no longer
 * contaminated by a `−2·const/dφ²` edge leak.
 *
 * Edge-cell stencil algebra: at `i1 = 0` the `−2·c` axis-1 term
 * collapses to `(c + n − 2c) = (n − c)`, since the missing `p`
 * neighbour contributes `c` rather than `0`. The axis-2 contribution
 * is unchanged for interior `i2`. Corner cells get the reduction on
 * both axes.
 *
 * @param slab - Interleaved-complex slab buffer of length `2·Nphi²`.
 * @param slabBase - Offset into `slab` for the φ-plane being laplacianised.
 * @param i1 - Row index along the first inflaton axis.
 * @param i2 - Column index along the second inflaton axis.
 * @param Nphi - φ-grid dimension.
 * @param invDphi2 - `1 / dφ²`; caller precomputes once per solve.
 * @returns `(Re, Im)` pair of `∇²_φ χ` at `(i1, i2)`.
 */
export function phiLaplacianAt(
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

  // Neumann ghost: when a neighbour would sit outside the grid, fall
  // back to the centre-cell value so the stencil contribution is
  // `(c + c − 2c) = 0` on that side and the one-sided difference on
  // the other side dominates.
  const pre1 = i1 > 0 ? (slab[slabBase + 2 * ((i1 - 1) * Nphi + i2)] ?? 0) : cre
  const pim1 = i1 > 0 ? (slab[slabBase + 2 * ((i1 - 1) * Nphi + i2) + 1] ?? 0) : cim
  const nre1 = i1 < Nphi - 1 ? (slab[slabBase + 2 * ((i1 + 1) * Nphi + i2)] ?? 0) : cre
  const nim1 = i1 < Nphi - 1 ? (slab[slabBase + 2 * ((i1 + 1) * Nphi + i2) + 1] ?? 0) : cim
  const pre2 = i2 > 0 ? (slab[slabBase + 2 * (i1 * Nphi + i2 - 1)] ?? 0) : cre
  const pim2 = i2 > 0 ? (slab[slabBase + 2 * (i1 * Nphi + i2 - 1) + 1] ?? 0) : cim
  const nre2 = i2 < Nphi - 1 ? (slab[slabBase + 2 * (i1 * Nphi + i2 + 1)] ?? 0) : cre
  const nim2 = i2 < Nphi - 1 ? (slab[slabBase + 2 * (i1 * Nphi + i2 + 1) + 1] ?? 0) : cim

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
export enum BandKind {
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
  lambda: number,
  asymmetry: number = 1
): ColumnWkbState[] {
  const states: ColumnWkbState[] = new Array(Nphi * Nphi)
  const dphi = Nphi > 1 ? (2 * phiExtent) / (Nphi - 1) : 0
  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = -phiExtent + i1 * dphi
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = -phiExtent + i2 * dphi
      const aTurn = wdwTurningA(phi1, phi2, m, lambda, asymmetry)
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
 * Build a per-cell multiplicative sponge-damping table for the φ-grid.
 * Each entry is in `(0, 1]`: `1.0` in the bulk, smoothly decreasing
 * toward the grid edges via a quadratic profile. The caller multiplies
 * `(re, im)` by this factor after each leapfrog step.
 *
 * Profile: for a cell at distance `k` from the nearest edge (k=0 at
 * the edge), the factor is `exp(−γ · d²)` where `d = max(0, 1 − k/W)`
 * and W = {@link WDW_PHI_SPONGE_WIDTH}. Cells with `k ≥ W` get 1.0.
 *
 * @returns Float32Array of length `Nphi²`, indexed `i1 * Nphi + i2`.
 */
/**
 * Effective sponge width for a given `Nphi`. Exported so the
 * {@link wdwOperatorResidual} function can skip sponge-affected cells
 * when computing the PDE residual.
 */
export function effectiveSpongeWidth(Nphi: number): number {
  return Math.min(WDW_PHI_SPONGE_WIDTH, Math.floor(Nphi / 6))
}

/**
 * Detect whether an interleaved-complex boundary slab is constant in
 * the φ grid (within `Float32` precision).
 *
 * Used by {@link solveWheelerDeWitt} to auto-disable the φ-boundary
 * sponge on initial data that has no φ-variation — when V(φ) is
 * independent of φ (the `m = 0` regime, {@link ./hhLangerSeed}
 * delegating to `columnSolutionPositiveV`/`columnSolutionZeroV`/
 * `columnSolutionNegativeV` with Λ-only inputs produces a slab that is
 * exactly constant over every `(φ₁, φ₂)`) there are no outgoing φ-waves
 * for the sponge to absorb, and the sponge's multiplicative damping
 * only seeds a spurious edge-to-bulk wave that violates φ-translation
 * symmetry.
 *
 * Tolerance is an absolute+relative check: deviations below `1e-6` of
 * the centre-cell magnitude count as constant. Float32 round-off on the
 * BC generator's trig + Airy evaluations bounds the natural spread to
 * the `~1e-7` level, so the tolerance has a comfortable margin above
 * precision noise.
 *
 * @param chi  Interleaved `(re, im)` slab, length `2·Nphi²`.
 * @param Nphi Grid size.
 * @returns `true` iff every cell agrees with the centre cell within
 *   tolerance.
 */
function isConstantInPhiSlab(chi: Float32Array, Nphi: number): boolean {
  if (Nphi < 2) return true
  const center = Math.floor(Nphi / 2)
  const centerOff = 2 * (center * Nphi + center)
  const refRe = chi[centerOff] ?? 0
  const refIm = chi[centerOff + 1] ?? 0
  const refMag = Math.hypot(refRe, refIm)
  const absTol = 1e-10
  const relTol = 1e-6
  const tol = Math.max(absTol, relTol * refMag)
  const N = Nphi * Nphi
  for (let idx = 0; idx < N; idx++) {
    const re = chi[2 * idx] ?? 0
    const im = chi[2 * idx + 1] ?? 0
    if (Math.abs(re - refRe) > tol || Math.abs(im - refIm) > tol) {
      return false
    }
  }
  return true
}

function buildPhiSpongeDamping(Nphi: number): Float32Array {
  const sponge = new Float32Array(Nphi * Nphi)
  const W = effectiveSpongeWidth(Nphi)
  for (let i1 = 0; i1 < Nphi; i1++) {
    const d1 = Math.min(i1, Nphi - 1 - i1)
    const s1 = d1 < W ? Math.exp(-WDW_PHI_SPONGE_GAMMA * Math.pow(1 - d1 / W, 2)) : 1
    for (let i2 = 0; i2 < Nphi; i2++) {
      const d2 = Math.min(i2, Nphi - 1 - i2)
      const s2 = d2 < W ? Math.exp(-WDW_PHI_SPONGE_GAMMA * Math.pow(1 - d2 / W, 2)) : 1
      sponge[i1 * Nphi + i2] = s1 * s2
    }
  }
  return sponge
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
  // Default `inflatonMassAsymmetry` to 1 (isotropic) when the caller
  // omits it. Multiplication by the exact IEEE-754 value `1` is a no-op
  // inside `wdwPotential` / `wdwU`, so the output stays bit-identical
  // to the pre-asymmetry code path.
  const inflatonMassAsymmetry = input.inflatonMassAsymmetry ?? 1

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
          `Recommend aMin ≥ 0.1, gridNphi ≤ 48, gridNa ≤ 256, phiExtent ≥ 2.0. ` +
          `Current: aMin=${aMin}, aMax=${aMax}, gridNa=${gridNa}, gridNphi=${gridNphi}, phiExtent=${phiExtent}.`
      )
    }
  }

  // Absorbing sponge layer: per-cell multiplicative damping applied
  // after each leapfrog step. Disabled when `customBoundary` is supplied
  // (analytic-fixture tests inject constant-in-φ slabs), when
  // `disableSponge` is explicitly set (JS↔Rust parity tests), or when
  // the BC generator produced a constant-in-φ slab (typically `m = 0`
  // with V = Λ = const) — the dynamics are then φ-translation-invariant
  // and the sponge would seed a spurious edge-to-bulk wave that breaks
  // the `symmetryPreservation` Phase 1 bound. See `isConstantPhiSlab`.
  let spongeEnabled = !input.customBoundary && !input.disableSponge

  // Stage-2 per-column WKB state (turning point, α, pending match).
  const columnStates = initColumnWkbStates(
    Nphi,
    phiExtent,
    inflatonMass,
    cosmologicalConstant,
    inflatonMassAsymmetry
  )

  // Initial slab: either a caller-supplied override or the dispatched
  // BC generator. See {@link WheelerDeWittSolverInput#customBoundary}
  // for the override contract (primarily used by analytic-fixture tests
  // to inject a constant-in-φ slab that isolates the 1D WdW problem).
  const expectedInitialLen = 2 * slabSize
  let initial: WdwBoundaryField
  if (input.customBoundary) {
    const custom = input.customBoundary
    if (custom.chi.length !== expectedInitialLen) {
      throw new Error(
        `customBoundary.chi length ${custom.chi.length} does not match ` +
          `expected 2·Nphi·Nphi = ${expectedInitialLen}`
      )
    }
    if (custom.chiDeriv.length !== expectedInitialLen) {
      throw new Error(
        `customBoundary.chiDeriv length ${custom.chiDeriv.length} does not match ` +
          `expected 2·Nphi·Nphi = ${expectedInitialLen}`
      )
    }
    initial = custom
  } else {
    initial = buildWdwBoundary(boundaryCondition, {
      Nphi,
      phiExtent,
      aMin,
      mass: inflatonMass,
      lambda: cosmologicalConstant,
      asymmetry: inflatonMassAsymmetry,
    })
  }

  // Copy χ(a_min, ·) into slab 0 unchanged — this is the physical
  // boundary condition, and Phase 3 removes the sponge damping of the
  // initial slab that earlier versions applied. Retaining the damping
  // broke the φ-translation-invariance of a constant-in-φ seed (the
  // `m = 0` regime, V(φ) = Λ = const) before the first leapfrog step,
  // seeding the spurious sliceVarMax = 13.7× structure documented in
  // the plan's Finding 2.
  chi.set(initial.chi, 0)

  // Case 3 sponge-disable detection (see `spongeEnabled` comment above):
  // skip the absorbing layer when the BC generator produced a slab
  // that is φ-constant to within f32 precision. The test is a max-diff
  // scan against the centre cell; its cost is `O(Nphi²)` and pays for
  // itself against the `O(Nphi²·Na)` sponge-propagation work it avoids.
  if (spongeEnabled && isConstantInPhiSlab(initial.chi, Nphi)) {
    spongeEnabled = false
  }
  const phiSponge: Float32Array | null = spongeEnabled ? buildPhiSpongeDamping(Nphi) : null

  // Classify slab 0 up front so the bandKind output is complete.
  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = -phiExtent + i1 * dphi
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = -phiExtent + i2 * dphi
      const idx = i1 * Nphi + i2
      const U0 = wdwU(aMin, phi1, phi2, inflatonMass, cosmologicalConstant, inflatonMassAsymmetry)
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

      const U0 = wdwU(a0, phi1, phi2, inflatonMass, cosmologicalConstant, inflatonMassAsymmetry)
      const U1 = wdwU(a1, phi1, phi2, inflatonMass, cosmologicalConstant, inflatonMassAsymmetry)

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
        captureMatch(
          state,
          a1,
          phi1,
          phi2,
          inflatonMass,
          cosmologicalConstant,
          inflatonMassAsymmetry,
          U1,
          nextRe,
          nextIm
        )
      }

      // Slab 1 is a Taylor extrapolation of slab 0 — preserving the
      // physical boundary's φ-translation structure (constant-in-φ at
      // m = 0, Gaussian-enveloped at m > 0) matters as much here as on
      // slab 0 itself, so the sponge is also deferred to the CN-implicit
      // update from slab 2 onward.
      chi[complexSlabFloats + 2 * idx] = nextRe
      chi[complexSlabFloats + 2 * idx + 1] = nextIm
      mask[slabSize + idx] = U1 < 0 ? 1 : 0
      bandKind[slabSize + idx] = band
    }
  }

  // Pre-allocated ADI workspace for the Crank–Nicolson bulk propagator.
  // Reused across every a-step; sized once for the φ-grid.
  const adiScratch: ImplicitBulkScratch = allocImplicitBulkScratch(Nphi)
  const adiRhs = new Float32Array(complexSlabFloats)
  const adiOut = new Float32Array(complexSlabFloats)
  const da2 = da * da
  const halfDa2 = 0.5 * da2

  // Main loop for slabs ia = 2 .. Na-1. Lorentzian cells use the
  // semi-implicit Crank–Nicolson update solved by the ADI propagator;
  // Euclidean transition cells fall back to the explicit leapfrog +
  // soft absorber; Euclidean deep cells continue to receive the
  // analytic WKB propagator from their per-column match coefficient.
  for (let ia = 2; ia < Na; ia++) {
    // Leapfrog variable naming: `next` (slab ia, being computed),
    // `cur` (slab ia-1, the midpoint of the 3-point stencil), `prev`
    // (slab ia-2). The CN trapezoidal rule on `(1/a²)·∇²_φ χ` averages
    // the term between `next` and `prev`; `U·χ` is kept explicit at
    // `cur`.
    const aNext = aMin + ia * da
    const aCur = aMin + (ia - 1) * da
    const aPrev = aMin + (ia - 2) * da
    const invAcurSq = 1 / (aCur * aCur)
    const invAprevSq = 1 / (aPrev * aPrev)
    const prevSlabBase = (ia - 2) * complexSlabFloats
    const curSlabBase = (ia - 1) * complexSlabFloats
    const nextSlabBase = ia * complexSlabFloats
    const maskBase = ia * slabSize

    // CN-implicit operator coefficient for this a-step:
    //   κ̂ = (da²/2)·(1/aNext²)·(1/dphi²)
    // Same value for every (i1, i2) on the slab (grid is uniform).
    const kappaNext = (halfDa2 * (1 / (aNext * aNext))) / (dphi * dphi)
    // Explicit L_prev·χ_prev scaling (trapezoidal):
    //   (da²/2)·(1/aPrev²) · (∇²_φ χ_prev)
    const lapPrevScale = halfDa2 * invAprevSq

    // Step A — Assemble RHS for the ADI solve on every (i1, i2):
    //   RHS = 2·χ_cur − χ_prev + (da²/2)·(1/aPrev²)·∇²_φ χ_prev
    //                         + da²·U_cur·χ_cur
    // Identical structure for Lorentzian, transition, and deep-band
    // cells — the band-specific overrides come in Step C.
    for (let i1 = 0; i1 < Nphi; i1++) {
      const phi1 = -phiExtent + i1 * dphi
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi2 = -phiExtent + i2 * dphi
        const idx = i1 * Nphi + i2

        const Ucur = wdwU(
          aCur,
          phi1,
          phi2,
          inflatonMass,
          cosmologicalConstant,
          inflatonMassAsymmetry
        )

        const curRe = chi[curSlabBase + 2 * idx] ?? 0
        const curIm = chi[curSlabBase + 2 * idx + 1] ?? 0
        const prevRe = chi[prevSlabBase + 2 * idx] ?? 0
        const prevIm = chi[prevSlabBase + 2 * idx + 1] ?? 0

        const lapPrev = phiLaplacianAt(chi, prevSlabBase, i1, i2, Nphi, invDphi2)

        adiRhs[2 * idx] = 2 * curRe - prevRe + lapPrevScale * lapPrev.re + da2 * Ucur * curRe
        adiRhs[2 * idx + 1] = 2 * curIm - prevIm + lapPrevScale * lapPrev.im + da2 * Ucur * curIm
      }
    }

    // Step B — ADI solve `(I − κ̂·D_x)(I − κ̂·D_y)·χ_next = RHS`.
    // Writes to `adiOut`. The splitting residual `κ̂²·D_x·D_y·χ` is
    // below the scheme's `O(da²)` truncation error at default grids;
    // see `./implicitBulk` module docstring for the bound.
    solveADILaplacianNeumann2D(adiRhs, adiOut, Nphi, kappaNext, adiScratch)

    // Step C — Per-cell band classification and band-specific update.
    // Lorentzian cells (the bulk) keep the CN-implicit ADI output;
    // Euclidean transition cells recompute the explicit leapfrog + soft
    // absorber (the CN implicit result is discarded for these cells);
    // Euclidean deep cells receive the analytic WKB propagator or
    // capture the match coefficient on their first deep-band slab.
    for (let i1 = 0; i1 < Nphi; i1++) {
      const phi1 = -phiExtent + i1 * dphi
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi2 = -phiExtent + i2 * dphi
        const idx = i1 * Nphi + i2

        const Ucur = wdwU(
          aCur,
          phi1,
          phi2,
          inflatonMass,
          cosmologicalConstant,
          inflatonMassAsymmetry
        )
        const Unext = wdwU(
          aNext,
          phi1,
          phi2,
          inflatonMass,
          cosmologicalConstant,
          inflatonMassAsymmetry
        )

        const state = columnStates[idx]!
        const band = classifyCellBand(state, aNext, Unext)

        let nextRe: number
        let nextIm: number

        if (band === BandKind.Lorentzian) {
          // Use the Crank–Nicolson ADI result directly.
          nextRe = adiOut[2 * idx] ?? 0
          nextIm = adiOut[2 * idx + 1] ?? 0
        } else if (band === BandKind.EuclideanTransition) {
          // Fall back to the explicit leapfrog + soft Euclidean absorber.
          // The CN-implicit scheme smoothes the Euclidean-growing branch
          // too aggressively near the turning surface where the absorber
          // already violates the PDE by construction; keeping the old
          // transition-band rule preserves the Stage-2 match-cell handoff
          // semantics unchanged.
          const curRe = chi[curSlabBase + 2 * idx] ?? 0
          const curIm = chi[curSlabBase + 2 * idx + 1] ?? 0
          const prevRe = chi[prevSlabBase + 2 * idx] ?? 0
          const prevIm = chi[prevSlabBase + 2 * idx + 1] ?? 0
          const lapCur = phiLaplacianAt(chi, curSlabBase, i1, i2, Nphi, invDphi2)
          const chiDDotRe = invAcurSq * lapCur.re + Ucur * curRe
          const chiDDotIm = invAcurSq * lapCur.im + Ucur * curIm
          const explicitRe = 2 * curRe - prevRe + da2 * chiDDotRe
          const explicitIm = 2 * curIm - prevIm + da2 * chiDDotIm
          const damped = applyTransitionAbsorber(explicitRe, explicitIm, Unext, da)
          nextRe = damped.re
          nextIm = damped.im
        } else {
          // EuclideanDeep. On the first deep-band slab capture the
          // current numerical χ as the match coefficient (we use the
          // CN-implicit ADI output here — it is a smoother, noise-free
          // numerical χ than the explicit leapfrog would give, but
          // represents the same physical χ at the match threshold).
          // Subsequent slabs receive the analytic WKB propagator.
          if (!state.matched) {
            nextRe = adiOut[2 * idx] ?? 0
            nextIm = adiOut[2 * idx + 1] ?? 0
            captureMatch(
              state,
              aNext,
              phi1,
              phi2,
              inflatonMass,
              cosmologicalConstant,
              inflatonMassAsymmetry,
              Unext,
              nextRe,
              nextIm
            )
          } else {
            const S = wdwEuclideanWkbAction(
              aNext,
              phi1,
              phi2,
              inflatonMass,
              cosmologicalConstant,
              inflatonMassAsymmetry
            )
            const propagated = propagateWkbTail(state, S, Unext)
            nextRe = propagated.re
            nextIm = propagated.im
          }
        }

        // Step D — Apply the φ-boundary absorbing sponge post-hoc.
        // Sponge parameters are Phase 3-retuned (narrower + heavier,
        // see WDW_PHI_SPONGE_WIDTH / _GAMMA constants above). The
        // initial slabs (ia = 0, 1) are NOT sponged so a physically
        // constant-in-φ boundary condition is propagated with exact
        // φ-translation symmetry through at least the first
        // CN-implicit step.
        const spongeFactor = phiSponge ? phiSponge[idx]! : 1
        chi[nextSlabBase + 2 * idx] = nextRe * spongeFactor
        chi[nextSlabBase + 2 * idx + 1] = nextIm * spongeFactor
        mask[maskBase + idx] = Unext < 0 ? 1 : 0
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
          asymmetry: inflatonMassAsymmetry,
        },
        boundaryCondition
      )
      columnAiry[slabIndex] = info
      if (!info.hasOverwrite) continue
      // Overwrite every Euclidean cell (a > a_turn) in this column.
      for (let ia = 0; ia < Na; ia++) {
        const a = aMin + ia * da
        if (a <= info.aTurn!) continue
        const { re, im } = langerEvaluate(
          info,
          a,
          phi1,
          phi2,
          inflatonMass,
          cosmologicalConstant,
          inflatonMassAsymmetry
        )
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
  asymmetry: number,
  U: number,
  chiRe: number,
  chiIm: number
): void {
  state.matched = true
  state.sEucAtMatch = wdwEuclideanWkbAction(a, phi1, phi2, m, lambda, asymmetry)
  state.uPrefactorAtMatch = Math.pow(Math.abs(U), 0.25)
  state.chiReAtMatch = chiRe
  state.chiImAtMatch = chiIm
}

// Diagnostic helpers (`wdwOperatorResidual`, `countEuclideanDeepCells`,
// `maxEuclideanChiSquared`) live in `./solverDiagnostics` to keep this
// module under the `max-lines` lint cap. Import them from there directly
// — re-exporting here would create a value-import cycle with
// `solverDiagnostics.ts`, which already imports value symbols from this
// module.
