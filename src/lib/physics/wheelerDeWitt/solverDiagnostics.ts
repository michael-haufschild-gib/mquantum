/**
 * Diagnostic metrics for the Wheeler–DeWitt leapfrog solver output.
 *
 * All helpers operate on an already-computed
 * {@link WheelerDeWittSolverOutput} and never re-run the solver. They
 * exist in a sibling module (rather than in {@link ./solver}) so the
 * core solver file stays under the project's `max-lines` lint cap
 * while still giving tests and the benchmark harness access to the
 * per-cell residual, deep-band counter, and Euclidean amplitude
 * bounds.
 *
 * ## Phase 3 note on {@link wdwOperatorResidual}
 *
 * `wdwOperatorResidual` plugs the solver's output back into the
 * **continuous** Wheeler–DeWitt operator `−∂²_a χ + (1/a²)·∇²_φ χ
 * + U·χ` cell-by-cell and returns `‖res‖₂ / ‖U·χ‖₂`. Under the Phase
 * 3 semi-implicit Crank–Nicolson scheme the discrete identity satisfied
 * by the scheme is
 *
 *     (χ_next − 2·χ_cur + χ_prev)/da² = (1/2)·(L_next·χ_next + L_prev·χ_prev) + U_cur·χ_cur
 *
 * with `L = (1/a²)·∇²_φ`. Substituting the `∂²_a` stencil from that
 * identity into the residual formula yields
 *
 *     res = L_cur·χ_cur − (1/2)·(L_next·χ_next + L_prev·χ_prev)   = O(da²·∂²_a L·χ)
 *
 * so the metric measures a scheme-dependent truncation, not a physics
 * violation. The Phase 1 tests that previously asserted `res < 5%`
 * now accept `res < 10` — the intent is catching NaN / Inf / gross
 * scheme breakdown, not validating physics. The authoritative
 * per-regime physics check is
 * `src/tests/lib/physics/wheelerDeWitt/exactSolutionAgreement.test.ts`.
 *
 * @module lib/physics/wheelerDeWitt/solverDiagnostics
 */

import { wdwU } from './constants'
import {
  BandKind,
  effectiveSpongeWidth,
  phiLaplacianAt,
  type WheelerDeWittSolverInput,
  type WheelerDeWittSolverOutput,
} from './solver'

/**
 * Residual check: plug the solution back into the WdW equation and
 * return the relative L² residual across the interior of the grid.
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

  // Skip sponge-affected cells: the φ-Laplacian reads (i1±1, i2±1),
  // so the margin must be sponge width + 1 to avoid contamination.
  const spongeMargin = effectiveSpongeWidth(Nphi) + 1
  const phiLo = Math.max(1, spongeMargin)
  const phiHi = Math.min(Nphi - 1, Nphi - spongeMargin)

  for (let ia = 1; ia < Na - 1; ia++) {
    const a = output.aMin + ia * da
    const invAsq = 1 / (a * a)
    for (let i1 = phiLo; i1 < phiHi; i1++) {
      const phi1 = -output.phiExtent + i1 * dphi
      for (let i2 = phiLo; i2 < phiHi; i2++) {
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

        const U = wdwU(
          a,
          phi1,
          phi2,
          input.inflatonMass,
          input.cosmologicalConstant,
          input.inflatonMassAsymmetry ?? 1
        )

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
