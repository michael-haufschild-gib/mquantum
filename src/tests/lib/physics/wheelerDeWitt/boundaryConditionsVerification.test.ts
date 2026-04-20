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
  it('χ′/χ has Im > 0 on the central column (outgoing = +a direction)', () => {
    const { chi, chiDeriv } = vilenkinBoundary(LORENTZIAN_DS)
    const { Nphi, aMin, mass, lambda } = LORENTZIAN_DS
    const c = (Nphi - 1) >> 1
    const idx = c * Nphi + c
    const cre = chi[2 * idx]!
    const cim = chi[2 * idx + 1]!
    const dre = chiDeriv[2 * idx]!
    const dim = chiDeriv[2 * idx + 1]!

    // (χ′ / χ) = (d · conj(χ)) / |χ|²
    const denom = cre * cre + cim * cim
    expect(denom).toBeGreaterThan(1e-12)
    const ratioRe = (dre * cre + dim * cim) / denom
    const ratioIm = (dim * cre - dre * cim) / denom

    // Closed-form expected values from boundaryConditions.ts:171-184:
    //   Im(χ′/χ) = +√|U(a_min, 0, 0)|   (outgoing WKB branch)
    //   Re(χ′/χ) = −(∂_a|U|)/(4·|U|)    (prefactor |U|^{−1/4} logarithmic deriv)
    const U0 = wdwU(aMin, 0, 0, mass, lambda)
    expect(U0).toBeLessThan(0)
    const absU = -U0
    const a2 = aMin * aMin
    // V(0,0) = Λ when m=0.
    const V = lambda
    // ∂_a U = −2·c_U·a·(1 − 2·K·V·a²) — see boundaryConditions.ts:177
    const dUda = -2 * WDW_C_U * aMin * (1 - 2 * WDW_G_PREFACTOR * V * a2)
    const expectedIm = Math.sqrt(absU)
    const expectedRe = -(-dUda) / (4 * absU)

    // Sign of the imaginary part is the load-bearing assertion — that is
    // what selects the outgoing branch. A test that only checks magnitude
    // would pass for the incoming (−√|U|) branch too.
    // Float32Array storage caps precision at ~1e-6 relative; use digits=5
    // so the assertion is tight enough to catch wrong-sign or
    // wrong-formula regressions but loose enough to tolerate f32 rounding.
    expect(ratioIm).toBeGreaterThan(0)
    expect(ratioIm).toBeCloseTo(expectedIm, 5)
    expect(ratioRe).toBeCloseTo(expectedRe, 5)
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
