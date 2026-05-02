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
 * ## Module layout
 *
 * The solver was originally a single 1100-line file. It is now split
 * across siblings; each piece has a focused responsibility:
 *
 * - `./solverTypes`       — public + internal type declarations.
 * - `./solverConstants`   — magic numbers + the rate-limited CFL warning budget.
 * - `./phiLaplacian`      — Neumann-ghost ∇²_φ stencil (the inner-loop hot path).
 * - `./columnWkb`         — per-column Stage-2 state machinery (turning
 *                           surface, transition absorber, deep-band
 *                           analytic propagator, match capture, band classifier).
 * - `./phiSponge`         — φ-boundary absorbing-sponge helpers.
 *
 * This file only contains `WDW_SOLVER_VERSION`, `solveWheelerDeWitt`
 * (the orchestrator), and re-exports of the public surface. Nothing
 * about behaviour or numerical output changed in the split — every
 * test in `src/tests/lib/physics/wheelerDeWitt/` and `src/tests/lib/
 * physics/srmt/` still passes byte-identically.
 *
 * @module lib/physics/wheelerDeWitt/solver
 */

import { logger } from '@/lib/logger'

import {
  type ColumnAiryInfo,
  emptyColumnAiry,
  extractColumnAiry,
  langerEvaluate,
} from './airyConnection'
import { buildWdwBoundary, type WdwBoundaryField } from './boundaryConditions'
import {
  applyTransitionAbsorber,
  captureMatch,
  classifyCellBand,
  initColumnWkbStates,
  propagateWkbTail,
} from './columnWkb'
import { wdwEuclideanWkbAction, wdwU } from './constants'
import {
  allocImplicitBulkScratch,
  type ImplicitBulkScratch,
  solveADILaplacianNeumann2D,
} from './implicitBulk'
import { phiLaplacianAt } from './phiLaplacian'
import { buildPhiSpongeDamping, isConstantInPhiSlab } from './phiSponge'
import { WDW_CFL_BUDGET, WDW_CFL_WARN_BUDGET } from './solverConstants'
import {
  BandKind,
  type WheelerDeWittSolverInput,
  type WheelerDeWittSolverOutput,
} from './solverTypes'

// Re-export the public surface so existing consumers keep their
// `from '@/lib/physics/wheelerDeWitt/solver'` imports working.
export { wdwU } from './constants'
export { phiLaplacianAt } from './phiLaplacian'
export { effectiveSpongeWidth } from './phiSponge'
export { resetCflWarningBudget } from './solverConstants'
export {
  BandKind,
  type ColumnWkbState,
  type ComplexPair,
  type WheelerDeWittSolverInput,
  type WheelerDeWittSolverOutput,
} from './solverTypes'

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
  // the `symmetryPreservation` Phase 1 bound. See `isConstantInPhiSlab`.
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

// Diagnostic helpers (`wdwOperatorResidual`, `countEuclideanDeepCells`,
// `maxEuclideanChiSquared`) live in `./solverDiagnostics` to keep this
// module under the `max-lines` lint cap. Import them from there directly
// — re-exporting here would create a value-import cycle with
// `solverDiagnostics.ts`, which already imports value symbols from this
// module.
