/**
 * Tier-2 verification tests for the Wheeler–DeWitt boundary-condition
 * generators. Pins the signs and magnitudes that downstream physics
 * (SRMT clock flip, tunneling-BC outgoing-wave selection) depend on.
 *
 * These tests complement {@link ./boundaryConditions.test.ts} by:
 *
 *  1. Pinning the *sign* of the WKB phase gradient for `tunneling` —
 *     the "outgoing = +a direction" convention — to closed-form values
 *     instead of just asserting nonzero imaginary parts.
 *  2. Checking that the outgoing-wave phase grows monotonically across
 *     the Lorentzian band after the solver has marched — a genuine
 *     post-integration signature of outgoing boundary data.
 *  3. Verifying that both `noBoundary` and `tunneling` produce
 *     low-residual weak solutions of the WdW PDE in the Lorentzian
 *     band, using the existing {@link wdwOperatorResidual} check.
 *
 * The "χ_noBoundary + χ_tunneling = analytic superposition on dS" claim
 * from the original task spec cannot be asserted at `a_min` directly:
 * HH at `a_min` is the decaying-branch Euclidean-side boundary datum,
 * not the cos(S_L) Lorentzian standing wave. The residual test below is
 * the rigorous substitute — it checks both BCs produce PDE-satisfying
 * solutions on the same background, which is the physically-meaningful
 * consistency property that "superposition" is gesturing at.
 */
import { describe, expect, it } from 'vitest'

import {
  buildWdwBoundary,
  hartleHawkingBoundary,
  vilenkinBoundary,
} from '@/lib/physics/wheelerDeWitt/boundaryConditions'
import { WDW_C_U, WDW_G_PREFACTOR, wdwTurningA, wdwU } from '@/lib/physics/wheelerDeWitt/constants'
import {
  columnSolutionNegativeV,
  columnSolutionPositiveV,
  columnSolutionZeroV,
} from '@/lib/physics/wheelerDeWitt/exactColumnSolution'
import {
  resetCflWarningBudget,
  solveWheelerDeWitt,
  wdwOperatorResidual,
} from '@/lib/physics/wheelerDeWitt/solver'

/**
 * Grid parameters chosen so the central column is in the Lorentzian
 * band at `a_min` for Λ > 0: `a_turn(0, 0, m=0, Λ=0.5) = 1/√(K·Λ) =
 * 1/√(4π/3 · 0.5) ≈ 0.691`. With `a_min = 0.05` the bounce is fully
 * classical at `a_min`.
 */
const LORENTZIAN_DS = {
  Nphi: 17,
  phiExtent: 2.0,
  aMin: 0.05,
  mass: 0,
  lambda: 0.5,
}

describe('Tunneling BC: outgoing-wave phase sign at a_min', () => {
  it('χ′/χ has Im > 0 on the central column and matches Langer-uniform reference', () => {
    // Phase 2: the Vilenkin seed is now the Langer-uniform outgoing
    // combination `(ζ/U)^{1/4}·(Ai(ζ) + i·Bi(ζ))`. The leading-WKB
    // prediction `Im(χ′/χ) = +√|U|` is the |ζ| → ∞ asymptotic limit
    // only; at the typical `a_min = 0.05, Λ = 0.5` cell `|ζ| ≈ 1.7`,
    // where the Langer form has an O(1/ζ³/²) correction (~2%) relative
    // to leading WKB. Test against the exact Langer reference and also
    // verify it sits within the leading-WKB tolerance band.
    const { chi, chiDeriv } = vilenkinBoundary(LORENTZIAN_DS)
    const { Nphi, aMin, mass, lambda } = LORENTZIAN_DS
    const c = (Nphi - 1) >> 1
    const idx = c * Nphi + c
    const cre = chi[2 * idx]!
    const cim = chi[2 * idx + 1]!
    const dre = chiDeriv[2 * idx]!
    const dim = chiDeriv[2 * idx + 1]!

    // (χ′ / χ) = (χ′ · conj(χ)) / |χ|²
    const denom = cre * cre + cim * cim
    expect(denom).toBeGreaterThan(1e-12)
    const ratioRe = (dre * cre + dim * cim) / denom
    const ratioIm = (dim * cre - dre * cim) / denom

    // Langer-uniform reference: build the Ai + i·Bi seed directly and
    // compute the same ratio from its analytic derivative.
    const reSample = columnSolutionPositiveV({ a: aMin, phi1: 0, phi2: 0, m: mass, lambda }, 1, 0)
    const imSample = columnSolutionPositiveV({ a: aMin, phi1: 0, phi2: 0, m: mass, lambda }, 0, 1)
    const refCre = reSample.chi.re
    const refCim = imSample.chi.re
    const refDre = reSample.dChi.re
    const refDim = imSample.dChi.re
    const refDen = refCre * refCre + refCim * refCim
    const refRatioRe = (refDre * refCre + refDim * refCim) / refDen
    const refRatioIm = (refDim * refCre - refDre * refCim) / refDen

    // Sign: the outgoing (+a) branch selection.
    expect(ratioIm).toBeGreaterThan(0)

    // Exact Langer-uniform match (f32-storage tolerance, ~1e-4 relative).
    expect(ratioIm).toBeCloseTo(refRatioIm, 3)
    expect(ratioRe).toBeCloseTo(refRatioRe, 3)

    // Leading-WKB check: the Langer ratio should sit within ~5 % of the
    // asymptotic `+√|U|` / `−(∂_a|U|)/(4|U|)` expressions. A regression
    // that flipped the Vilenkin sign (c₂ = +i → c₂ = −i) would fail the
    // positivity check above; a regression that broke the Langer
    // derivative chain-rule would fail this bounds check without
    // necessarily breaking the exact-reference match.
    const U0 = wdwU(aMin, 0, 0, mass, lambda)
    expect(U0).toBeLessThan(0)
    const absU = -U0
    const a2 = aMin * aMin
    const V = lambda // V(0,0) = Λ at m = 0.
    const dUda = -2 * WDW_C_U * aMin * (1 - 2 * WDW_G_PREFACTOR * V * a2)
    const wkbIm = Math.sqrt(absU)
    const wkbRe = -(-dUda) / (4 * absU)
    expect(Math.abs(ratioIm - wkbIm) / Math.abs(wkbIm)).toBeLessThan(0.05)
    expect(Math.abs(ratioRe - wkbRe) / Math.abs(wkbRe)).toBeLessThan(0.05)
  })
})

describe('Tunneling BC: post-integration phase accumulates in +a direction', () => {
  it('net phase at a_max − phase at a_min has the outgoing (+) sign', () => {
    // Pick aMax strictly below a_turn so the entire marched column is
    // Lorentzian — no Euclidean band, no Stage-3 Airy overwrite, so the
    // phase we read back reflects the marched wave.
    //
    // Note: the explicit leapfrog on a Dirichlet-ghost φ grid admits a
    // measurable incoming-branch admixture from BC-gradient mismatch.
    // The *sign* of the accumulated phase is what selects the outgoing
    // (Vilenkin) vs the incoming branch — that is what this test pins.
    // The magnitude (WKB-exact value) is affected by dispersion, so we
    // bound only the sign, not the exact accumulated phase.
    //
    // The {@link wdwOperatorResidual} test below asserts the solution
    // is a valid weak solution of the WdW PDE at all — that is the
    // separate correctness invariant.
    resetCflWarningBudget()
    const mass = 0
    const lambda = 0.2
    // a_turn(0, 0) = 1/√(K·Λ) with K = 8π/3 ≈ 8.378.
    //   K·Λ = 8.378·0.2 = 1.676  ⇒  a_turn ≈ 0.773.
    // So aMax = 0.6 sits comfortably inside the Lorentzian band.
    const aTurn = wdwTurningA(0, 0, mass, lambda)!
    expect(aTurn).toBeGreaterThan(0.7)
    const aMin = 0.05
    const aMax = 0.6
    const out = solveWheelerDeWitt({
      boundaryCondition: 'tunneling',
      inflatonMass: mass,
      cosmologicalConstant: lambda,
      aMin,
      aMax,
      gridNa: 192,
      gridNphi: 17,
      phiExtent: 2.0,
    })
    const [Na, Nphi] = out.gridSize
    const slab = Nphi * Nphi
    const c = (Nphi - 1) >> 1

    // Unwrap phase across the column, stopping BEFORE the φ-edge
    // reflection reaches the centre. Character speed of the φ-axis
    // PDE is `dφ/da = 1/a`, so the edge-to-centre travel time from
    // `a_min = 0.05` across `Δφ = phiExtent = 2` is
    // `Δa = a_min·(exp(Δφ) − 1) = 0.05·(e² − 1) ≈ 0.32`. The
    // centre becomes edge-contaminated from `a ≈ 0.37` onward
    // (slab ≈ 111 of 192). We stop at slab 96 (just below that) so
    // the unwrapped phase reflects the **marched outgoing wave**
    // alone, not a superposition with the boundary-reflected wave.
    //
    // Drift comment: the prior version used `iaEnd = Na − 4`, which
    // integrated all the way to `aMax`. That worked under ghost-zero
    // Dirichlet only because Dirichlet reflects with a π phase flip,
    // and the accumulated reflected-wave phase happened to preserve
    // the net-positive sign by coincidence. Under the updated Neumann
    // ghost (which reflects without a phase flip) the outgoing and
    // reflected waves interfere constructively into a standing-wave
    // pattern whose unwrapped phase at the centre drifts around zero.
    // Restricting the window to the causally-uncontaminated region
    // makes the test diagnostic of the BC sign alone, as originally
    // intended.
    const iaStart = 8
    const iaEnd = Math.min(96, Na - 4)
    let unwrapped = 0
    let prev = 0
    for (let ia = iaStart; ia < iaEnd; ia++) {
      const off = 2 * (ia * slab + c * Nphi + c)
      const re = out.chi[off]!
      const im = out.chi[off + 1]!
      const mag2 = re * re + im * im
      expect(mag2).toBeGreaterThan(1e-12)
      const phi = Math.atan2(im, re)
      if (ia > iaStart) {
        let delta = phi - prev
        while (delta > Math.PI) delta -= 2 * Math.PI
        while (delta < -Math.PI) delta += 2 * Math.PI
        unwrapped += delta
      }
      prev = phi
    }
    // The outgoing branch (Vilenkin) gives a NET POSITIVE accumulated
    // phase across the Lorentzian band. The incoming branch (the
    // unphysical option that the tunneling proposal rejects) would
    // give a net negative phase. This sign is the diagnostic: a
    // regression that flipped `phaseRate = +√|U|` to `−√|U|` in
    // vilenkinBoundary would fail this test.
    expect(unwrapped).toBeGreaterThan(0.2)
  })
})

describe('HH vs tunneling: marched imaginary amplitude differs as a diagnostic', () => {
  it('HH marches with ≈0 imaginary part; tunneling marches with O(1) imaginary part', () => {
    // Cross-BC diagnostic. HH boundary data is purely real
    // (boundaryConditions.ts:110,113) and the WdW PDE preserves that
    // reality on a real-coefficient background — so the HH-marched χ
    // should stay essentially real. Tunneling boundary data is complex
    // with +i·√|U| phase gradient (see test above) and must produce
    // O(1) imaginary amplitude on the marched column.
    //
    // The check `|Im χ| ≈ 0 for HH` is the single most load-bearing
    // property separating the two BCs in the Lorentzian band. A
    // regression in vilenkinBoundary that accidentally produced real
    // output (e.g. dropped the `sinS` term) would be invisible in the
    // `vilenkin alone` tests above but detected here by the
    // differential.
    resetCflWarningBudget()
    const shared = {
      inflatonMass: 0,
      cosmologicalConstant: 0.2,
      aMin: 0.05,
      aMax: 0.6, // Pure Lorentzian — a_turn ≈ 0.773 at Λ=0.2.
      gridNa: 192,
      gridNphi: 17,
      phiExtent: 2.0,
    }
    const peakImag = (bc: 'noBoundary' | 'tunneling'): number => {
      const out = solveWheelerDeWitt({ ...shared, boundaryCondition: bc })
      const [Na, Nphi] = out.gridSize
      const slab = Nphi * Nphi
      const c = (Nphi - 1) >> 1
      let maxIm = 0
      for (let ia = 8; ia < Na - 4; ia++) {
        const off = 2 * (ia * slab + c * Nphi + c)
        const imV = Math.abs(out.chi[off + 1] ?? 0)
        if (imV > maxIm) maxIm = imV
      }
      return maxIm
    }
    const peakHH = peakImag('noBoundary')
    const peakVil = peakImag('tunneling')
    // HH imaginary part stays tiny (numerical leak only) — effectively
    // zero to rounding at float32 storage precision.
    expect(peakHH).toBeLessThan(0.01)
    // Vilenkin imaginary part is O(10⁻¹) — the outgoing phase is populated
    // throughout the marched column. Threshold at 0.05 leaves margin for
    // the observed `~0.084` peak on the Nphi=17 grid.
    expect(peakVil).toBeGreaterThan(0.05)
    // Ratio ≫ 1 — the differential signature of complex vs real BC.
    expect(peakVil / Math.max(peakHH, 1e-12)).toBeGreaterThan(5)
  })
})

describe('BC consistency: both HH and tunneling solve the WdW PDE', () => {
  it('wdwOperatorResidual is small on the Lorentzian band for both BCs', () => {
    // SELF-REFERENTIAL (Phase 1 migration note): see
    // `docs/plans/wdw-solver-physics-correctness.md` Finding 3. A small
    // residual here does not imply the solver satisfies the HH or
    // Vilenkin boundary condition — any self-consistent PDE solution
    // (including Bi-branch contaminated HH) passes. The reference-
    // comparison test is `exactSolutionAgreement.test.ts`; retained
    // here as coarse sanity.
    //
    // Run both BCs on the same de-Sitter background. Residual is the
    // natural "is this a valid WdW wavefunction" metric — it replaces
    // the naive superposition identity, which doesn't hold at a_min
    // because HH at a_min is the decaying-branch datum (see module
    // header comment).
    resetCflWarningBudget()
    const shared = {
      inflatonMass: 0,
      cosmologicalConstant: 0.2,
      aMin: 0.05,
      aMax: 0.6, // Pure Lorentzian run: a_turn ≈ 0.773 at Λ=0.2.
      gridNa: 192,
      gridNphi: 17,
      phiExtent: 2.0,
    }
    const outHH = solveWheelerDeWitt({ ...shared, boundaryCondition: 'noBoundary' })
    const outVil = solveWheelerDeWitt({ ...shared, boundaryCondition: 'tunneling' })

    const resHH = wdwOperatorResidual(outHH, { ...shared, boundaryCondition: 'noBoundary' })
    const resVil = wdwOperatorResidual(outVil, { ...shared, boundaryCondition: 'tunneling' })

    // Residual is the L² ratio of the PDE LHS to the `‖U·χ‖` scale on
    // all-Lorentzian stencils. < 0.1 means ≤10% residual — well within
    // leapfrog's O(da²) accuracy at this grid (da ≈ 0.003).
    expect(resHH).toBeLessThan(0.1)
    expect(resVil).toBeLessThan(0.1)
    // Lower bound makes the assertion non-trivial — a test that passed
    // on zero residual would indicate the solver produced all-zero χ.
    expect(resHH).toBeGreaterThan(0)
    expect(resVil).toBeGreaterThan(0)
  })
})

describe('buildWdwBoundary dispatch: tunneling preserves outgoing sign', () => {
  it('chiDeriv imaginary part sign is positive on interior column via dispatcher', () => {
    // Redundant-on-purpose regression: buildWdwBoundary is the dispatcher
    // the solver uses. A refactor that accidentally routed 'tunneling' to
    // the wrong generator would flip signs of the phase gradient.
    const direct = vilenkinBoundary(LORENTZIAN_DS)
    const viaDispatch = buildWdwBoundary('tunneling', LORENTZIAN_DS)
    // Verify full buffer equality so a silent swap to hartleHawking would
    // be caught by the imaginary-part discriminator.
    expect(Array.from(viaDispatch.chi)).toEqual(Array.from(direct.chi))
    expect(Array.from(viaDispatch.chiDeriv)).toEqual(Array.from(direct.chiDeriv))

    // And an independent sign check via hartleHawking for completeness:
    // HH's chiDeriv is PURELY REAL (see boundaryConditions.ts:111). If
    // 'tunneling' ever dispatched to HH we'd see zero imaginary parts
    // everywhere in the 'tunneling' output.
    const hh = hartleHawkingBoundary(LORENTZIAN_DS)
    let maxHhDerivIm = 0
    for (let i = 1; i < hh.chiDeriv.length; i += 2) {
      const v = Math.abs(hh.chiDeriv[i] ?? 0)
      if (v > maxHhDerivIm) maxHhDerivIm = v
    }
    expect(maxHhDerivIm).toBeCloseTo(0, 8)

    let maxVilenkinDerivIm = 0
    for (let i = 1; i < direct.chiDeriv.length; i += 2) {
      const v = Math.abs(direct.chiDeriv[i] ?? 0)
      if (v > maxVilenkinDerivIm) maxVilenkinDerivIm = v
    }
    // Vilenkin has genuine imaginary derivative — substantial, not zero.
    // Expected magnitude is ~√|U(a_min, 0, 0)| · amp_envelope ≈ 0.94 on
    // the central column at this grid; threshold at 0.5 leaves margin
    // for rounding while catching regressions that zero the imaginary
    // derivative.
    expect(maxVilenkinDerivIm).toBeGreaterThan(0.5)
  })
})

describe('Langer-uniform HH seed: pure Ai branch selection (Phase 2)', () => {
  // The Hartle-Hawking proposal's defining selection is the **pure Ai
  // branch** of the Langer-uniform Airy form. Equivalently, fitting the
  // seed at a column (a_min, φ) against the basis `{Ai(ζ), Bi(ζ)}`
  // must give `|c₂/c₁| < ε` for some small ε — the old leading-WKB
  // seed gave ε ≈ 0.53 (53 % Bi contamination, see plan §Finding 1).
  // The new seed gives `c₂ = 0` by construction; we assert that here.
  it('hartleHawkingBoundary fits the pure Ai branch (c₂/c₁ = 0) on V>0 columns', () => {
    // Set up a grid with every cell in the V > 0 regime (no V=0 branch
    // cells). Config: m=0, Λ=0.5, aMin=0.1 → V ≡ 0.5, a_turn ≈ 0.489,
    // so a_min = 0.1 < a_turn (Lorentzian seed) and ζ ≈ -1.7 (not
    // asymptotic — any leading-WKB seed would show measurable Bi
    // admixture).
    const input = { Nphi: 17, phiExtent: 1.0, aMin: 0.1, mass: 0, lambda: 0.5 }
    const { chi, chiDeriv } = hartleHawkingBoundary(input)

    const c = (input.Nphi - 1) >> 1
    const idx = c * input.Nphi + c

    const refAi = columnSolutionPositiveV(
      { a: input.aMin, phi1: 0, phi2: 0, m: input.mass, lambda: input.lambda },
      1,
      0
    )
    const refBi = columnSolutionPositiveV(
      { a: input.aMin, phi1: 0, phi2: 0, m: input.mass, lambda: input.lambda },
      0,
      1
    )

    // Two-coefficient fit: find (c1, c2) minimising
    //   (chi  − c1·refAi.chi.re − c2·refBi.chi.re)²
    // + (dChi − c1·refAi.dChi.re − c2·refBi.dChi.re)².
    // Closed-form least squares on a 2×2 system.
    const M11 = refAi.chi.re ** 2 + refAi.dChi.re ** 2
    const M22 = refBi.chi.re ** 2 + refBi.dChi.re ** 2
    const M12 = refAi.chi.re * refBi.chi.re + refAi.dChi.re * refBi.dChi.re
    const y1 = chi[2 * idx]! * refAi.chi.re + chiDeriv[2 * idx]! * refAi.dChi.re
    const y2 = chi[2 * idx]! * refBi.chi.re + chiDeriv[2 * idx]! * refBi.dChi.re
    const det = M11 * M22 - M12 * M12
    expect(Math.abs(det)).toBeGreaterThan(1e-6)
    const c1 = (M22 * y1 - M12 * y2) / det
    const c2 = (-M12 * y1 + M11 * y2) / det
    // c1 should be ~1 (pure Ai); c2 should be ~0 (no Bi). Tolerance
    // covers f32 storage noise (~1e-6 relative).
    expect(c1).toBeCloseTo(1, 4)
    expect(Math.abs(c2)).toBeLessThan(1e-4)
  })
})

describe('Langer-uniform seeds: reduction to classical instanton at small a (Phase 2)', () => {
  // At a → 0⁺ (well below the turning surface) the Lorentzian Langer
  // variable ζ → ζ₀ < 0 finite, Ai(ζ₀) is finite, U → 0 so the
  // prefactor (ζ/U)^{1/4} → ∞ as a^{-1/2}. The physical Ψ = χ/a^{3/2}
  // remains finite; the χ blow-up is an artefact of the χ = a^{3/2}·Ψ
  // reduction. We assert the decaying-branch Euclidean signature:
  // for V > 0 cells past a_turn, the Langer-Ai form decays like
  // |U|^{-1/4}·(1/(2√π))·exp(-S_E). That matches the leading-WKB
  // envelope in the deep Euclidean limit.
  it('HH seed at a > a_turn matches the Euclidean decaying branch', () => {
    // Pick V, a so a_min is well past a_turn → column is Euclidean.
    // V = 5, a_min = 0.8: a_turn(V=5) = 1/√(K·5) = 1/√(4.19) ≈ 0.489.
    // So a_min = 0.8 > a_turn — Euclidean regime.
    const input = { Nphi: 5, phiExtent: 0.5, aMin: 0.8, mass: 0, lambda: 5.0 }
    const { chi, chiDeriv } = hartleHawkingBoundary(input)
    const c = (input.Nphi - 1) >> 1
    const idx = c * input.Nphi + c
    const seed = chi[2 * idx]!
    const dSeed = chiDeriv[2 * idx]!
    // Reference: Ai(ζ) with ζ > 0 decays exponentially — pure
    // decaying branch. A test that sampled the Bi contaminated
    // growing branch would detect it here as seed magnitude well
    // above the Ai prediction.
    const ref = columnSolutionPositiveV(
      { a: input.aMin, phi1: 0, phi2: 0, m: input.mass, lambda: input.lambda },
      1,
      0
    )
    expect(seed).toBeCloseTo(ref.chi.re, 5)
    expect(dSeed).toBeCloseTo(ref.dChi.re, 5)
    // Decaying branch: derivative sign is negative (Ai(ζ) is positive
    // and decreasing for ζ > 0), consistent with the Euclidean decaying
    // classical instanton.
    expect(seed).toBeGreaterThan(0)
    expect(dSeed).toBeLessThan(0)
  })
})

describe('Langer-uniform seeds: three-regime continuity (Phase 2)', () => {
  // The V > 0, V = 0, V < 0 regimes are dispatched to three different
  // forms (Langer-Ai, Bessel-¼, leading-WKB-cos). On a grid that
  // spans the V = 0 boundary, the seed magnitudes across adjacent
  // cells should be within the same order of magnitude — any
  // regression that introduced a step-discontinuity at a regime
  // boundary would be caught here.
  it('HH seed magnitudes are of the same order across a V-sign boundary', () => {
    // m = 1.0, Λ = -0.3, phiExtent = 1.5 → V(φ=0) = -0.3 < 0 (inner
    // cells), V(φ=1) = 0.5·1·2 − 0.3 = 0.7 > 0 (outer cells).
    // Crossing occurs at |φ|² = 0.6 → |φ| ≈ 0.775.
    const input = { Nphi: 21, phiExtent: 1.5, aMin: 0.1, mass: 1.0, lambda: -0.3 }
    const { chi } = hartleHawkingBoundary(input)
    // Walk across the central row; collect |χ| on cells whose V
    // changes sign. Expect the amplitudes to stay within an order of
    // magnitude across the crossing.
    const cMid = (input.Nphi - 1) >> 1
    let maxAmp = 0
    let minAmp = Infinity
    for (let i1 = 0; i1 < input.Nphi; i1++) {
      const amp = Math.abs(chi[2 * (i1 * input.Nphi + cMid)]!)
      if (amp > 1e-8) {
        if (amp > maxAmp) maxAmp = amp
        if (amp < minAmp) minAmp = amp
      }
    }
    // Wide band (factor 100) — the V>0 Langer-Ai and V<0 Gaussian·cos
    // gauge differ by O(1) but not by orders of magnitude.
    expect(maxAmp / minAmp).toBeLessThan(100)
    expect(maxAmp).toBeGreaterThan(0)
  })

  it('Vilenkin seed magnitudes are finite and nonzero across all three regimes', () => {
    // Free case: V ≡ 0 everywhere.
    const freeInput = { Nphi: 7, phiExtent: 1.0, aMin: 0.1, mass: 0, lambda: 0 }
    const free = vilenkinBoundary(freeInput)
    let maxFreeIm = 0
    for (let i = 1; i < free.chi.length; i += 2) {
      const v = Math.abs(free.chi[i] ?? 0)
      if (v > maxFreeIm) maxFreeIm = v
    }
    // V = 0 Vilenkin = env · √a · H^{(1)}_{1/4}(3πa²). Im = env · √a · Y.
    // Reference at origin: columnSolutionZeroV with A=1, B=i.
    const freeRef = columnSolutionZeroV(freeInput.aMin, { re: 1, im: 0 }, { re: 0, im: 1 })
    expect(maxFreeIm).toBeGreaterThan(Math.abs(freeRef.chi.im) * 0.1)
    expect(Number.isFinite(maxFreeIm)).toBe(true)

    // Pure AdS (V < 0 everywhere).
    const adsInput = { Nphi: 7, phiExtent: 1.0, aMin: 0.1, mass: 0, lambda: -0.5 }
    const ads = vilenkinBoundary(adsInput)
    let maxAdsIm = 0
    for (let i = 1; i < ads.chi.length; i += 2) {
      const v = Math.abs(ads.chi[i] ?? 0)
      if (v > maxAdsIm) maxAdsIm = v
    }
    const adsRef = columnSolutionNegativeV(
      { a: adsInput.aMin, phi1: 0, phi2: 0, m: 0, lambda: -0.5 },
      { re: 1, im: 0 },
      { re: 0, im: 1 }
    )
    expect(maxAdsIm).toBeGreaterThan(Math.abs(adsRef.chi.im) * 0.1)
    expect(Number.isFinite(maxAdsIm)).toBe(true)
  })
})
