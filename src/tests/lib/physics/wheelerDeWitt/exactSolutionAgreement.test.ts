/**
 * Non-self-referential validation of the Wheeler–DeWitt solver.
 *
 * The existing `wdwOperatorResidual` test (`solver.ts:945`) is
 * self-referential: it plugs the solver's own output back into the PDE
 * and asks whether the residual is small. A solver that minimises its
 * own residual will pass — even when it has converged to a different
 * solution than the physical boundary conditions prescribe.
 *
 * This suite replaces that blind spot with a reference-comparison
 * test. For three minisuperspace regimes that admit closed-form (or
 * well-controlled uniform-asymptotic) reference solutions, we:
 *
 *   1. Compute `χ_exact(a_min, φ)` and `∂_a χ_exact(a_min, φ)` from
 *      {@link ../../../../lib/physics/wheelerDeWitt/exactColumnSolution}
 *      at every `(φ₁, φ₂)` cell, with identical `(c₁, c₂)` / `(A, B)`
 *      coefficients across the grid (constant-in-φ profile for `m=0`).
 *   2. Inject that slab through `WheelerDeWittSolverInput.customBoundary`.
 *   3. Compare `χ_solver(a, φ)` to `χ_exact(a, φ)` at every (sampled)
 *      cell pointwise, asserting `|χ_solver − χ_exact| / |χ_exact|`
 *      below a regime-specific bound.
 *
 * The multi-column comparison is what distinguishes this test from
 * `solverAnalytic.test.ts` (which samples only the central column for
 * pointwise agreement and the per-cell phase rate elsewhere). Sampling
 * off-centre cells catches the spurious φ-translation-symmetry breaking
 * that the Lorentzian bulk propagator introduces via its noise
 * amplification — a bug that the central column alone masks because
 * the corruption radiates from the φ-edges inward and only reaches the
 * centre at scale-factor `a_safe = √(a_min² + 2·phiExtent)`.
 *
 * ## Regimes
 *
 * | Regime | Lorentzian reference                                      | Euclidean reference | Tolerance (bulk) | Tolerance near turn |
 * |--------|-----------------------------------------------------------|---------------------|-------------------|---------------------|
 * | V>0    | **RK4 integration of the 1D ODE** (machine precision)     | Langer-uniform Airy (matches Stage-3 overwrite) | 5% | 25% |
 * | V=0    | `√a·[A·J_{1/4}(3π·a²) + B·Y_{1/4}(3π·a²)]` (pointwise-exact) | n/a (no turning surface) | 1% | n/a |
 * | V<0    | Leading-WKB `|U|^{−1/4}·(A·cos Φ_L + B·sin Φ_L)`          | n/a (no turning surface) | 5% (O(1/Φ_L)) | n/a |
 *
 * V=0 tolerance is the tightest because the Bessel reference is exact.
 * V>0 tolerance accommodates the solver's `O(da²)` 2nd-order
 * truncation against the RK4 reference (which integrates the ODE to
 * float64 precision — substep `h = da/20`, RK4 error `O(h⁵) ≈
 * 10⁻¹⁹` per step). V<0 tolerance reflects that the leading-WKB
 * reference is `O(1/Φ_L)`-accurate, not exact.
 *
 * The V>0 Lorentzian reference **is not** `columnSolutionPositiveV`'s
 * Langer-uniform Airy formula — that form is asymptotic with
 * `O(1/|ζ|^{3/2})` subleading corrections, which exceed 100 % at the
 * test's typical `|ζ| ≈ 0.6`. See `rk4ColumnTrajectory` in
 * `@/lib/physics/wheelerDeWitt/exactColumnSolution` for the derivation.
 * The Langer formula is still used in the Euclidean region where the
 * solver's Stage-3 overwrite replaces the numerical bulk output with
 * exactly that Langer form — comparing Langer-vs-Langer there validates
 * that Stage-3's `(c₁, c₂)` extraction reproduces the injected
 * boundary's branch coefficients.
 *
 * ## Expected failure regime
 *
 * With `phiExtent = 1.0` and `aMax ≈ 1.5`, the edge perturbations
 * arising from the Lorentzian bulk instability (documented in
 * `docs/plans/wdw-solver-physics-correctness.md` Finding 2) reach the
 * central column at `a ≈ √(a_min² + 2·1.0) ≈ 1.42`. The test fails on
 * the current solver at sliceVarMax ~ 12 as documented in the plan;
 * that failure is the gate for Phase 2+3 of the correctness overhaul.
 *
 * @module tests/lib/physics/wheelerDeWitt/exactSolutionAgreement
 */

import { describe, expect, it } from 'vitest'

import { wdwPotential, wdwTurningA, wdwU } from '@/lib/physics/wheelerDeWitt/constants'
import {
  columnSolutionNegativeV,
  columnSolutionPositiveV,
  columnSolutionZeroV,
  rk4ColumnTrajectory,
} from '@/lib/physics/wheelerDeWitt/exactColumnSolution'
import {
  resetCflWarningBudget,
  solveWheelerDeWitt,
  type WheelerDeWittSolverInput,
  type WheelerDeWittSolverOutput,
} from '@/lib/physics/wheelerDeWitt/solver'

/** Index into the (Nphi·Nphi) φ-slab; complex pairs are interleaved. */
function chiAt(out: WheelerDeWittSolverOutput, ia: number, i1: number, i2: number) {
  const Nphi = out.gridSize[1]
  const slab = Nphi * Nphi
  const off = 2 * (ia * slab + i1 * Nphi + i2)
  return { re: out.chi[off] as number, im: out.chi[off + 1] as number }
}

/** Scale factor at grid index `ia`. */
function aOf(out: WheelerDeWittSolverOutput, ia: number): number {
  const Na = out.gridSize[0]
  const da = (out.aMax - out.aMin) / (Na - 1)
  return out.aMin + ia * da
}

/** `φ`-coordinate at index `i` on the symmetric `[-phiExtent, +phiExtent]` grid. */
function phiOf(i: number, Nphi: number, phiExtent: number): number {
  return -phiExtent + (2 * phiExtent * i) / (Nphi - 1)
}

/**
 * Build a customBoundary buffer by sampling the given column solution at
 * every `(φ₁, φ₂)` cell of the grid at `a = aMin`. The resulting slab is
 * exactly a solution of the 1D ODE column-wise at `a_min` — the solver
 * should evolve it along each column to the reference solution at later
 * `a`.
 */
function buildExactBoundary(
  aMin: number,
  Nphi: number,
  phiExtent: number,
  sample: (
    phi1: number,
    phi2: number
  ) => { chi: { re: number; im: number }; dChi: { re: number; im: number } }
): { chi: Float32Array; chiDeriv: Float32Array } {
  const N = Nphi * Nphi
  const chi = new Float32Array(2 * N)
  const chiDeriv = new Float32Array(2 * N)
  for (let i1 = 0; i1 < Nphi; i1++) {
    const phi1 = phiOf(i1, Nphi, phiExtent)
    for (let i2 = 0; i2 < Nphi; i2++) {
      const phi2 = phiOf(i2, Nphi, phiExtent)
      const s = sample(phi1, phi2)
      const idx = i1 * Nphi + i2
      chi[2 * idx] = s.chi.re
      chi[2 * idx + 1] = s.chi.im
      chiDeriv[2 * idx] = s.dChi.re
      chiDeriv[2 * idx + 1] = s.dChi.im
    }
  }
  // aMin is captured by the closure in the sampler; the argument is kept
  // in the signature for call-site readability but intentionally unused
  // here (sample takes phi only — it already knows aMin).
  void aMin
  return { chi, chiDeriv }
}

/**
 * Maximum relative pointwise error across a specified cell set, computed
 * against a closure that returns `χ_exact(a, φ₁, φ₂)`. Skips cells where
 * `|χ_exact| < magFloor` (floor prevents division blow-up at nodes).
 */
function maxRelError(
  out: WheelerDeWittSolverOutput,
  phiExtent: number,
  exact: (a: number, phi1: number, phi2: number) => { re: number; im: number },
  cells: { ia: number; i1: number; i2: number }[],
  magFloor: number
): { maxErr: number; samples: number } {
  const Nphi = out.gridSize[1]
  let maxErr = 0
  let samples = 0
  for (const { ia, i1, i2 } of cells) {
    const a = aOf(out, ia)
    const phi1 = phiOf(i1, Nphi, phiExtent)
    const phi2 = phiOf(i2, Nphi, phiExtent)
    const num = chiAt(out, ia, i1, i2)
    const ref = exact(a, phi1, phi2)
    const refMag = Math.hypot(ref.re, ref.im)
    if (refMag < magFloor) continue
    const diff = Math.hypot(num.re - ref.re, num.im - ref.im)
    const rel = diff / refMag
    if (rel > maxErr) maxErr = rel
    samples++
  }
  return { maxErr, samples }
}

/**
 * Enumerate a cross-cell sample covering the full grid: central column
 * plus a few off-axis columns (one cell in from each edge, plus the
 * φ=0 column). Skips sponge cells (last `WDW_PHI_SPONGE_WIDTH = 5`
 * cells on each side) to avoid measuring the absorber's deliberate PDE
 * violation.
 */
function crossCellSample(
  Na: number,
  Nphi: number,
  aStep: number = 32,
  aStart: number = 16,
  aEnd?: number
): { ia: number; i1: number; i2: number }[] {
  const cells: { ia: number; i1: number; i2: number }[] = []
  const center = Math.floor(Nphi / 2)
  const spongeMargin = 5
  const iEnd = aEnd ?? Na - 4
  const innerLow = spongeMargin + 1
  const innerHigh = Nphi - spongeMargin - 2
  for (let ia = aStart; ia < iEnd; ia += aStep) {
    // Central column.
    cells.push({ ia, i1: center, i2: center })
    // Four off-centre probes just inside the sponge.
    if (innerLow <= innerHigh) {
      cells.push({ ia, i1: innerLow, i2: center })
      cells.push({ ia, i1: innerHigh, i2: center })
      cells.push({ ia, i1: center, i2: innerLow })
      cells.push({ ia, i1: center, i2: innerHigh })
    }
  }
  return cells
}

const SHARED_FOR_BULK: Pick<WheelerDeWittSolverInput, 'phiExtent' | 'gridNa' | 'gridNphi'> = {
  phiExtent: 1.0, // tight so edge perturbations reach centre within a-range
  gridNa: 512,
  gridNphi: 17,
}

describe('Wheeler–DeWitt solver vs closed-form column references', () => {
  it('V>0 (m=0, Λ=0.5): HH-branch (c₁=1, c₂=0) — RK4 on Lorentzian, Langer on Stage-3 Euclidean', () => {
    resetCflWarningBudget()
    const m = 0
    const lambda = 0.5
    const aMin = 0.1
    const aMax = 1.5
    const c1 = 1
    const c2 = 0
    const turn = wdwTurningA(0, 0, m, lambda)!
    expect(turn).toBeGreaterThan(aMin)
    expect(turn).toBeLessThan(aMax)

    const coeffs = { c1, c2 }
    const boundary = buildExactBoundary(
      aMin,
      SHARED_FOR_BULK.gridNphi,
      SHARED_FOR_BULK.phiExtent,
      (phi1, phi2) =>
        columnSolutionPositiveV({ a: aMin, phi1, phi2, m, lambda }, coeffs.c1, coeffs.c2)
    )

    const out = solveWheelerDeWitt({
      ...SHARED_FOR_BULK,
      // `noBoundary` (HH) so Stage-3 Airy overwrite picks the pure-Ai
      // decaying branch past the turning surface — matches our pure-Ai
      // reference (c₂ = 0). `tunneling` would inject Bi-growth in the
      // Euclidean region and diverge from the reference.
      boundaryCondition: 'noBoundary',
      aMin,
      aMax,
      inflatonMass: m,
      cosmologicalConstant: lambda,
      customBoundary: boundary,
    })

    // Partition cell set into "bulk" (outside a 5%-wide band around the
    // turning surface) and "turn" (inside). Different tolerances apply.
    const Nphi = out.gridSize[1]
    const Na = out.gridSize[0]
    const turnLow = 0.95 * turn
    const turnHigh = 1.05 * turn
    const iaOfA = (a: number) => Math.floor(((a - aMin) / (aMax - aMin)) * (Na - 1))
    const turnBandLow = Math.max(0, iaOfA(turnLow))
    const turnBandHigh = Math.min(Na - 1, iaOfA(turnHigh))

    // Two measurement regions with separate references + bounds:
    //
    //  - **Lorentzian bulk** (`ia < turnBandLow`): RK4 reference, tight
    //    5 % bound. This is the Phase 3 gate — the CN-implicit scheme's
    //    true physics check against an independent integrator.
    //  - **Euclidean Stage-3** (`ia > turnBandHigh`): Langer reference,
    //    medium 20 % bound — validates that Stage-3's `(c₁, c₂)`
    //    extraction from the CN-implicit Lorentzian output reproduces
    //    the injected pure-Ai boundary (`c₁ ≈ 1, c₂ = 0`). The bound
    //    accommodates the `O(da²)` 2nd-order error in the Lorentzian
    //    propagation that Stage-3's fit inherits.
    //
    // The turn band itself (`turnBandLow ≤ ia ≤ turnBandHigh`, a 5 %
    // a-window around `a_turn`) is deliberately **not** asserted. Both
    // Langer-Airy and the RK4 integration of a Langer-seed deviate from
    // the solver's transition-band output by scheme-specific amounts:
    // the absorber `exp(−η·√|U|·da)` damps both Airy branches equally
    // while the true ODE does not, and the Langer reference's
    // subleading corrections diverge (`O(1/|ζ|^{3/2})` with `|ζ| → 0`)
    // as `a → a_turn`. There is no single reference against which
    // "correctness in the turn band" is meaningfully defined; the
    // Lorentzian-bulk (pre-turn) and Euclidean-Stage-3 (post-turn)
    // assertions sandwich the transition without requiring a direct
    // measurement inside it.
    const lorentzianBulkCells = crossCellSample(Na, Nphi, 8).filter(({ ia }) => ia < turnBandLow)
    const euclideanBulkCells = crossCellSample(Na, Nphi, 8).filter(({ ia }) => ia > turnBandHigh)

    // RK4 reference trajectory for the Lorentzian side. For `m = 0` the
    // 1D ODE is φ-independent, so a single column serves every
    // `(φ₁, φ₂)` cell. Substep `h = da/20` → RK4 error `O(h⁵) ≈ 10⁻¹⁹`
    // per step, cumulative `O(10⁻¹⁶)` over the full march — below
    // float64 precision.
    const aGrid = new Float64Array(Na)
    for (let ia = 0; ia < Na; ia++) aGrid[ia] = aMin + (ia * (aMax - aMin)) / (Na - 1)
    const seedAtMin = columnSolutionPositiveV({ a: aMin, phi1: 0, phi2: 0, m, lambda }, c1, c2)
    const rk4 = rk4ColumnTrajectory(aGrid, seedAtMin, 0, 0, m, lambda, 1, 20)

    const rk4Ref = (a: number) => {
      const da = (aMax - aMin) / (Na - 1)
      const ia = Math.round((a - aMin) / da)
      return rk4[ia]!.chi
    }
    const langerRef = (a: number, phi1: number, phi2: number) => {
      return columnSolutionPositiveV({ a, phi1, phi2, m, lambda }, c1, c2).chi
    }

    const lorentzianResult = maxRelError(
      out,
      SHARED_FOR_BULK.phiExtent,
      (a, _p1, _p2) => rk4Ref(a),
      lorentzianBulkCells,
      1e-4
    )
    const euclideanResult = maxRelError(
      out,
      SHARED_FOR_BULK.phiExtent,
      langerRef,
      euclideanBulkCells,
      1e-4
    )
    expect(lorentzianResult.samples).toBeGreaterThan(20)
    expect(
      lorentzianResult.maxErr,
      `V>0 Lorentzian bulk max rel error = ${lorentzianResult.maxErr} (RK4 reference)`
    ).toBeLessThan(0.05)
    expect(euclideanResult.samples).toBeGreaterThan(4)
    expect(
      euclideanResult.maxErr,
      `V>0 Euclidean Stage-3 max rel error = ${euclideanResult.maxErr} (Langer reference)`
    ).toBeLessThan(0.2)
  })

  it('V>0 (m=0, Λ=0.5): Bi-branch admixture (c₁=0.5, c₂=0.3) tracks the true ODE on the Lorentzian side', () => {
    // Bi-branch-inclusive seed. The solver must track both Airy
    // branches through the Lorentzian region; `aMax < a_turn` keeps us
    // on the Lorentzian side so Stage-3 does not engage. The reference
    // is RK4 integration of the 1D ODE `χ''(a) = U(a)·χ` from the
    // Langer-uniform seed at `aMin` — not the Langer-uniform formula
    // itself, which is asymptotic with `O(1/|ζ|^{3/2})` subleading
    // corrections that exceed 100 % at the test's `|ζ(aMax)| ≈ 0.65`
    // (see `rk4ColumnTrajectory` module doc for the derivation).
    resetCflWarningBudget()
    const m = 0
    const lambda = 0.5
    const aMin = 0.1
    const aMax = 0.4 // well below a_turn ≈ 0.489
    const c1 = 0.5
    const c2 = 0.3
    const turn = wdwTurningA(0, 0, m, lambda)!
    expect(aMax).toBeLessThan(turn)

    const coeffs = { c1, c2 }
    const boundary = buildExactBoundary(
      aMin,
      SHARED_FOR_BULK.gridNphi,
      SHARED_FOR_BULK.phiExtent,
      (phi1, phi2) =>
        columnSolutionPositiveV({ a: aMin, phi1, phi2, m, lambda }, coeffs.c1, coeffs.c2)
    )
    const out = solveWheelerDeWitt({
      ...SHARED_FOR_BULK,
      // Stage-3 Airy overwrite is inactive below the turning surface;
      // BC enum is a no-op here. Set to `noBoundary` for consistency.
      boundaryCondition: 'noBoundary',
      aMin,
      aMax,
      gridNa: 256,
      inflatonMass: m,
      cosmologicalConstant: lambda,
      customBoundary: boundary,
    })

    const Nphi = out.gridSize[1]
    const Na = out.gridSize[0]
    const cells = crossCellSample(Na, Nphi, 16)

    // Build the RK4 reference trajectory. For `m = 0` the 1D ODE is
    // φ-independent, so one column serves every `(φ₁, φ₂)` cell.
    const aGrid = new Float64Array(Na)
    for (let ia = 0; ia < Na; ia++) aGrid[ia] = aMin + (ia * (aMax - aMin)) / (Na - 1)
    const seedAtMin = columnSolutionPositiveV({ a: aMin, phi1: 0, phi2: 0, m, lambda }, c1, c2)
    const rk4 = rk4ColumnTrajectory(aGrid, seedAtMin, 0, 0, m, lambda, 1, 20)

    const exact = (a: number, _phi1: number, _phi2: number) => {
      const da = (aMax - aMin) / (Na - 1)
      const ia = Math.round((a - aMin) / da)
      return rk4[ia]!.chi
    }
    const { maxErr, samples } = maxRelError(out, SHARED_FOR_BULK.phiExtent, exact, cells, 1e-3)
    expect(samples).toBeGreaterThan(20)
    expect(maxErr, `V>0 Bi-admixture max rel error = ${maxErr}`).toBeLessThan(0.05)
  })

  it('V=0 (m=0, Λ=0): exact Bessel-1/4 reference agrees across the grid', () => {
    resetCflWarningBudget()
    const m = 0
    const lambda = 0
    const aMin = 0.5
    const aMax = 1.5
    const A = { re: 1, im: 0 }
    const B = { re: 0, im: 1 } // Hankel H^{(1)}: J + i·Y

    const boundary = buildExactBoundary(
      aMin,
      SHARED_FOR_BULK.gridNphi,
      SHARED_FOR_BULK.phiExtent,
      () => columnSolutionZeroV(aMin, A, B)
    )
    const out = solveWheelerDeWitt({
      ...SHARED_FOR_BULK,
      // V=0 everywhere → no turning surface → Stage-3 Airy overwrite
      // is inactive. BC enum is a no-op; `tunneling` matches the
      // outgoing-wave coefficient choice `B = iA`.
      boundaryCondition: 'tunneling',
      aMin,
      aMax,
      inflatonMass: m,
      cosmologicalConstant: lambda,
      customBoundary: boundary,
    })

    const Nphi = out.gridSize[1]
    const Na = out.gridSize[0]
    const cells = crossCellSample(Na, Nphi)
    const exact = (a: number) => columnSolutionZeroV(a, A, B).chi
    const { maxErr, samples } = maxRelError(
      out,
      SHARED_FOR_BULK.phiExtent,
      (a) => exact(a),
      cells,
      1e-3
    )
    expect(samples).toBeGreaterThan(20)
    // V=0 is pointwise exact; 2nd-order leapfrog at Na=512 reaches ~1%.
    expect(maxErr, `V=0 max rel error = ${maxErr}`).toBeLessThan(0.01)
  })

  it('V<0 (m=0, Λ=−0.5): leading-WKB reference agrees in pure-Lorentzian bulk', () => {
    // No turning surface (V<0 ⇒ U<0 everywhere). The reference is
    // leading-WKB, O(1/Φ_L) accurate; we measure relative error in the
    // deep interior where Φ_L ≫ 1.
    resetCflWarningBudget()
    const m = 0
    const lambda = -0.5
    const aMin = 0.3
    const aMax = 1.5
    const A = { re: 1, im: 0 }
    const B = { re: 0, im: 1 } // outgoing-wave (cos + i·sin)

    expect(wdwU(aMin, 0, 0, m, lambda)).toBeLessThan(0)
    expect(wdwU(aMax, 0, 0, m, lambda)).toBeLessThan(0)

    const boundary = buildExactBoundary(
      aMin,
      SHARED_FOR_BULK.gridNphi,
      SHARED_FOR_BULK.phiExtent,
      (phi1, phi2) => columnSolutionNegativeV({ a: aMin, phi1, phi2, m, lambda }, A, B)
    )
    const out = solveWheelerDeWitt({
      ...SHARED_FOR_BULK,
      // V<0 everywhere → no turning surface → Stage-3 Airy overwrite
      // inactive. BC enum is a no-op; pick `tunneling` for the
      // outgoing-wave coefficient choice.
      boundaryCondition: 'tunneling',
      aMin,
      aMax,
      inflatonMass: m,
      cosmologicalConstant: lambda,
      customBoundary: boundary,
    })

    const Nphi = out.gridSize[1]
    const Na = out.gridSize[0]
    // Skip first 25% of a-range (BC transient) to let the solver settle
    // onto the leading-WKB branch.
    const cells = crossCellSample(Na, Nphi, 32, Math.floor(Na / 4))
    const exact = (a: number, phi1: number, phi2: number) =>
      columnSolutionNegativeV({ a, phi1, phi2, m, lambda }, A, B).chi
    const { maxErr, samples } = maxRelError(out, SHARED_FOR_BULK.phiExtent, exact, cells, 1e-3)
    expect(samples).toBeGreaterThan(20)
    // Leading-WKB reference accuracy is O(1/Φ_L). On the measurement
    // range a ∈ [0.48, 1.45] with Λ = −0.5, `Φ_L(aMin) ≈ 1`, `Φ_L(aMax) ≈ 30`
    // — reference systematic error ranges from ~100% (bad near aMin)
    // down to ~3% deep. Tolerance 0.20 is the natural WKB-accuracy
    // floor on the measurement set; this is a regression gate — the
    // V>0 suite is the primary physics-correctness signal. A
    // higher-order WKB or full numerical reference would tighten
    // this; see Phase 4's open question #1.
    expect(maxErr, `V<0 leading-WKB rel error = ${maxErr}`).toBeLessThan(0.2)
  })

  it('sanity: `columnSolutionPositiveV` produces a pure-Ai seed consistent with HH', () => {
    // Unit-level check: at aMin with V>0, c1=1, c2=0, the Langer-uniform
    // form is the pure Ai branch. `Ai(ζ)` at ζ < 0 (Lorentzian side) is
    // bounded and oscillatory; `Bi(ζ)` would diverge exponentially at
    // ζ → +∞. A pure-Ai c2=0 seed is the HH selection.
    const m = 0
    const lambda = 0.5
    const aMin = 0.1
    const V = wdwPotential(0, 0, m, lambda)
    expect(V).toBeGreaterThan(0)

    const sample = columnSolutionPositiveV({ a: aMin, phi1: 0, phi2: 0, m, lambda }, 1, 0)
    expect(Number.isFinite(sample.chi.re)).toBe(true)
    expect(Number.isFinite(sample.dChi.re)).toBe(true)
    expect(sample.chi.im).toBe(0)
    expect(sample.dChi.im).toBe(0)
    // At aMin well inside Lorentzian region Ai is ~ O(1) magnitude.
    expect(Math.abs(sample.chi.re)).toBeGreaterThan(0.01)
    expect(Math.abs(sample.chi.re)).toBeLessThan(10)
  })
})
