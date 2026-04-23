/**
 * φ-translation symmetry preservation test for the Wheeler–DeWitt solver.
 *
 * When the inflaton mass `m = 0`, the minisuperspace potential reduces
 * to `V(φ) = Λ = const`. The Wheeler–DeWitt equation
 *
 *     −∂²_a χ + (1/a²)·∇²_φ χ + U(a)·χ = 0
 *
 * then commutes exactly with φ-translations: `U(a)` is independent of
 * φ, and the Laplacian is translation-invariant on the regular grid.
 * A constant-in-φ initial slab `χ(a_min, φ) = χ₀`,
 * `∂_a χ(a_min, φ) = χ'₀` must therefore remain constant in φ at every
 * later `a`:
 *
 *     χ(a, φ₁, φ₂) = χ_exact(a)    for all (φ₁, φ₂).
 *
 * ## Why this falsifies the Lorentzian-bulk stability bug
 *
 * The current solver (documented in
 * `docs/plans/wdw-solver-physics-correctness.md` Finding 2) admits a
 * spurious φ-structure of `sliceVarMax = 107` at `(m = 0, Λ = 0.5,
 * HH BC, Na = 512, Nphi = 17, phiExtent = 1.0)`. That variation cannot
 * be physical because every mechanism in the PDE commutes with
 * φ-translations; the structure is noise from the sponge absorber's
 * per-cell multiplicative damping, seeded by the HH χ' momentum, and
 * amplified by the undamped explicit leapfrog.
 *
 * A correct solver (post-Phase 3, with either semi-implicit scheme or
 * Kreiss–Oliger dissipation) must satisfy `sliceVarMax < 1e-3` on the
 * same grid. This test asserts exactly that.
 *
 * **This test is expected to FAIL on the current (pre-Phase-3) solver.**
 * That failure is the gate for accepting the Phase 3 rewrite.
 *
 * ## Two complementary regimes
 *
 * The test is split into two sub-suites:
 *
 *  1. **`real HH BC, V > 0`**: runs the solver through its normal HH
 *     boundary-generator path. At `m = 0, Λ > 0` the HH BC generator
 *     produces a constant-in-φ slab with physically-scaled amplitudes
 *     (`exp(−|S_E|)` classical-instanton prefactor and the matching
 *     WKB χ' momentum). The full bug-2 instability fires in this path.
 *     Assertion: `sliceVarMax < 1e-3`.
 *
 *  2. **`customBoundary analytic seeds, all V sign`**: injects a
 *     constant-in-φ slab derived from
 *     {@link ../../../../lib/physics/wheelerDeWitt/exactColumnSolution}
 *     for every `m = 0, Λ ∈ {-0.5, 0, 0.5, 0.8}` case. This is a
 *     forward-looking regression gate: after Phase 2 rewrites the HH
 *     BC as Langer-uniform (producing constant-φ slabs for every Λ
 *     sign), the bulk propagator must still preserve φ-invariance for
 *     every amplitude scale — including the smaller-amplitude Langer
 *     normalisation that suite 1 does not probe.
 *
 * Suite 2 is not expected to fire the bug on the current solver
 * (amplitudes are smaller; noise amplification stays below the 1e-3
 * bound). It is retained to catch regressions introduced by future
 * work on either the BC generators or the bulk propagator.
 *
 * @module tests/lib/physics/wheelerDeWitt/symmetryPreservation
 */

import { describe, expect, it } from 'vitest'

import {
  columnSolutionNegativeV,
  columnSolutionPositiveV,
  columnSolutionZeroV,
  type ComplexPair,
} from '@/lib/physics/wheelerDeWitt/exactColumnSolution'
import {
  effectiveSpongeWidth,
  resetCflWarningBudget,
  solveWheelerDeWitt,
  type WheelerDeWittSolverOutput,
} from '@/lib/physics/wheelerDeWitt/solver'

const SYMMETRY_BOUND = 1e-3
/**
 * Floor on `|χ(a_center)|` below which a sliceVarMax ratio is not
 * meaningful (any spurious edge value becomes O(1) relative to a near-zero
 * centre). We skip those slices entirely — they happen near solution nodes.
 */
const CENTER_MAG_FLOOR = 1e-6

/** Read χ complex pair at (ia, i1, i2). */
function chiAt(out: WheelerDeWittSolverOutput, ia: number, i1: number, i2: number) {
  const Nphi = out.gridSize[1]
  const slab = Nphi * Nphi
  const off = 2 * (ia * slab + i1 * Nphi + i2)
  return { re: out.chi[off] as number, im: out.chi[off + 1] as number }
}

/**
 * Build a constant-in-φ custom boundary: every cell `(i1, i2)` gets the
 * same `(chi, chiDeriv)` pair. This is an exact eigenfunction of the
 * φ-Laplacian with eigenvalue 0 — perfect test seed for symmetry
 * preservation.
 */
function constantPhiSlab(
  Nphi: number,
  chi0: ComplexPair,
  dChi0: ComplexPair
): { chi: Float32Array; chiDeriv: Float32Array } {
  const N = Nphi * Nphi
  const chi = new Float32Array(2 * N)
  const chiDeriv = new Float32Array(2 * N)
  for (let i = 0; i < N; i++) {
    chi[2 * i] = chi0.re
    chi[2 * i + 1] = chi0.im
    chiDeriv[2 * i] = dChi0.re
    chiDeriv[2 * i + 1] = dChi0.im
  }
  return { chi, chiDeriv }
}

/**
 * Construct the analytically-consistent `(χ(aMin), χ'(aMin))` pair for
 * a given `(m, Λ)`:
 *
 *  - Λ > 0, m = 0: Langer-uniform HH-branch `(c₁ = 1, c₂ = 0)`.
 *  - Λ = 0, m = 0: Hankel `H_{1/4}^{(1)}` (A = 1, B = i), the Vilenkin
 *    outgoing-wave combination.
 *  - Λ < 0, m = 0: leading-WKB cos-branch (A = 1, B = 0).
 *
 * At `m = 0` every (φ₁, φ₂) cell has the same V = Λ, so this single
 * sample is the constant-in-φ slab.
 */
function analyticSeed(
  aMin: number,
  m: number,
  lambda: number
): { chi: ComplexPair; dChi: ComplexPair } {
  if (lambda > 0) {
    return columnSolutionPositiveV({ a: aMin, phi1: 0, phi2: 0, m, lambda }, 1, 0)
  }
  if (lambda === 0) {
    return columnSolutionZeroV(aMin, { re: 1, im: 0 }, { re: 0, im: 1 })
  }
  return columnSolutionNegativeV(
    { a: aMin, phi1: 0, phi2: 0, m, lambda },
    { re: 1, im: 0 },
    { re: 0, im: 0 }
  )
}

/**
 * Compute `sliceVarMax` at a single `a`-index: the maximum over
 * `(i1, i2)` (restricted to the non-sponge interior) of
 * `|χ(a, i1, i2) − χ(a, center, center)| / max(|χ(a, center, center)|, floor)`.
 *
 * Returns 0 when the centre magnitude is below `CENTER_MAG_FLOOR`
 * (signals a node in the solution; slice is uninformative).
 */
function sliceVarMaxAt(out: WheelerDeWittSolverOutput, ia: number): number {
  const Nphi = out.gridSize[1]
  const center = Math.floor(Nphi / 2)
  const refC = chiAt(out, ia, center, center)
  const refMag = Math.hypot(refC.re, refC.im)
  if (refMag < CENTER_MAG_FLOOR) return 0

  const spongeMargin = effectiveSpongeWidth(Nphi)
  const iMin = spongeMargin + 1
  const iMax = Nphi - spongeMargin - 2
  let worst = 0
  for (let i1 = iMin; i1 <= iMax; i1++) {
    for (let i2 = iMin; i2 <= iMax; i2++) {
      if (i1 === center && i2 === center) continue
      const cell = chiAt(out, ia, i1, i2)
      const diff = Math.hypot(cell.re - refC.re, cell.im - refC.im)
      const rel = diff / refMag
      if (rel > worst) worst = rel
    }
  }
  return worst
}

/** Max over all `ia` of `sliceVarMaxAt(ia)`, plus the `ia` where it was hit. */
function trackedMaxSliceVar(out: WheelerDeWittSolverOutput): { maxVar: number; iaWhere: number } {
  const Na = out.gridSize[0]
  let maxVar = 0
  let iaWhere = 0
  // Skip first 4 cells (BC transient) and last 4 (edge).
  for (let ia = 4; ia < Na - 4; ia++) {
    const v = sliceVarMaxAt(out, ia)
    if (v > maxVar) {
      maxVar = v
      iaWhere = ia
    }
  }
  return { maxVar, iaWhere }
}

describe('Wheeler–DeWitt solver preserves φ-translation symmetry', () => {
  describe('real HH BC, V > 0 (the Lorentzian bulk instability gate)', () => {
    it.each([
      { lambda: 0.5, label: 'dS standard' },
      { lambda: 0.8, label: 'dS strong-curvature' },
    ])(
      'm = 0, Λ = $lambda ($label): HH BC slab is constant-in-φ; solver must preserve',
      ({ lambda }) => {
        resetCflWarningBudget()
        const Nphi = 17
        const aMin = 0.1
        const aMax = 1.5
        const Na = 512
        const phiExtent = 1.0

        // Real HH BC path — no customBoundary. At m = 0, Λ > 0 the HH BC
        // generator produces an exactly constant-in-φ slab
        // (`V(φ) = Λ = const` ⇒ amplitude and derivative are both
        // φ-independent). This is the plan Finding 2 setup verbatim.
        const out = solveWheelerDeWitt({
          boundaryCondition: 'noBoundary',
          inflatonMass: 0,
          cosmologicalConstant: lambda,
          aMin,
          aMax,
          gridNa: Na,
          gridNphi: Nphi,
          phiExtent,
        })

        const { maxVar, iaWhere } = trackedMaxSliceVar(out)
        expect(
          maxVar,
          `sliceVarMax = ${maxVar} at ia=${iaWhere} (a=${(aMin + ((aMax - aMin) * iaWhere) / (Na - 1)).toFixed(3)}); ` +
            `must be < ${SYMMETRY_BOUND} for φ-translation symmetry preservation. ` +
            `Current (pre-Phase-3) solver produces O(10¹–10²) at Λ=0.5; Λ=0.8 ` +
            `may be even larger.`
        ).toBeLessThan(SYMMETRY_BOUND)
      }
    )
  })

  describe('customBoundary analytic seeds (forward-looking regression gate)', () => {
    it.each([
      { lambda: -0.5, label: 'pure AdS (leading-WKB cos seed)' },
      { lambda: 0, label: 'free / flat (Hankel seed)' },
      { lambda: 0.5, label: 'dS standard (Langer-uniform HH seed)' },
      { lambda: 0.8, label: 'dS strong-curvature (Langer-uniform HH seed)' },
    ])('m = 0, Λ = $lambda ($label): constant-φ custom slab preserved', ({ lambda }) => {
      resetCflWarningBudget()
      const Nphi = 17
      const aMin = 0.1
      const aMax = 1.5
      const Na = 512
      const phiExtent = 1.0

      const seed = analyticSeed(aMin, 0, lambda)
      const boundary = constantPhiSlab(Nphi, seed.chi, seed.dChi)

      const out = solveWheelerDeWitt({
        boundaryCondition: 'noBoundary',
        inflatonMass: 0,
        cosmologicalConstant: lambda,
        aMin,
        aMax,
        gridNa: Na,
        gridNphi: Nphi,
        phiExtent,
        customBoundary: boundary,
      })

      const { maxVar, iaWhere } = trackedMaxSliceVar(out)
      expect(
        maxVar,
        `sliceVarMax = ${maxVar} at ia=${iaWhere} (a=${(aMin + ((aMax - aMin) * iaWhere) / (Na - 1)).toFixed(3)}); ` +
          `custom-boundary constant-φ slab must be preserved to ${SYMMETRY_BOUND}. ` +
          `This test is a forward-looking regression gate — it currently ` +
          `passes because the analytic seed amplitude is ~O(0.2) at aMin, ` +
          `below the noise-amplification threshold the real HH BC excites.`
      ).toBeLessThan(SYMMETRY_BOUND)
    })
  })

  describe('exchange symmetry for inflaton-dependent potential', () => {
    it('m = 0.3, Λ = 0.5 (standard preset regime): φ₁↔φ₂ exchange preserved', () => {
      // For m > 0, V(φ) = ½m²|φ|² + Λ depends on φ — full φ-translation
      // invariance is lost. But the PDE still commutes with φ₁↔φ₂
      // exchange: V, U, and ∇²_φ are all symmetric under
      // (φ₁, φ₂) → (φ₂, φ₁). A (φ₁↔φ₂)-symmetric initial slab must
      // evolve to a (φ₁↔φ₂)-symmetric solution.
      resetCflWarningBudget()
      const Nphi = 17
      const aMin = 0.1
      const aMax = 1.5
      const Na = 512
      const phiExtent = 1.0

      const seed = analyticSeed(aMin, 0.3, 0.5)
      const boundary = constantPhiSlab(Nphi, seed.chi, seed.dChi)
      const out = solveWheelerDeWitt({
        boundaryCondition: 'noBoundary',
        inflatonMass: 0.3,
        cosmologicalConstant: 0.5,
        aMin,
        aMax,
        gridNa: Na,
        gridNphi: Nphi,
        phiExtent,
        customBoundary: boundary,
      })

      const spongeMargin = effectiveSpongeWidth(Nphi)
      const iMin = spongeMargin + 1
      const iMax = Nphi - spongeMargin - 2
      let maxAsym = 0
      let iaWhere = 0
      for (let ia = 4; ia < Na - 4; ia++) {
        for (let i1 = iMin; i1 <= iMax; i1++) {
          for (let i2 = i1 + 1; i2 <= iMax; i2++) {
            const a12 = chiAt(out, ia, i1, i2)
            const a21 = chiAt(out, ia, i2, i1)
            const mag = Math.max(Math.hypot(a12.re, a12.im), Math.hypot(a21.re, a21.im))
            if (mag < CENTER_MAG_FLOOR) continue
            const diff = Math.hypot(a12.re - a21.re, a12.im - a21.im)
            const rel = diff / mag
            if (rel > maxAsym) {
              maxAsym = rel
              iaWhere = ia
            }
          }
        }
      }

      expect(
        maxAsym,
        `φ₁↔φ₂ asymmetry = ${maxAsym} at ia=${iaWhere}; a symmetric ` +
          `starting condition evolved under a φ₁↔φ₂-symmetric PDE must ` +
          `remain symmetric. Bound 1e-3 is the numerical floor for a ` +
          `stable 2nd-order scheme.`
      ).toBeLessThan(1e-3)
    })
  })
})
