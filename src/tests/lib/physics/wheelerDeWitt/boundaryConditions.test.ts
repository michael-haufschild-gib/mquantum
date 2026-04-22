import { describe, expect, it } from 'vitest'

import {
  buildWdwBoundary,
  deWittBoundary,
  hartleHawkingBoundary,
  vilenkinBoundary,
  WDW_G_PREFACTOR,
  wdwPotential,
} from '@/lib/physics/wheelerDeWitt/boundaryConditions'

const INPUT = {
  Nphi: 16,
  phiExtent: 2.0,
  aMin: 0.05,
  mass: 0.3,
  lambda: 0.05,
}

/** |mean(arg(χ))| over the grid. */
function meanAbsPhase(chi: Float32Array): number {
  let sum = 0
  let count = 0
  for (let i = 0; i < chi.length; i += 2) {
    const re = chi[i] ?? 0
    const im = chi[i + 1] ?? 0
    if (re * re + im * im > 1e-12) {
      sum += Math.abs(Math.atan2(im, re))
      count++
    }
  }
  return count > 0 ? sum / count : 0
}

describe('Hartle–Hawking boundary', () => {
  it('produces real-valued initial data with decaying-branch derivative', () => {
    const { chi, chiDeriv } = hartleHawkingBoundary(INPUT)
    // χ is real.
    for (let i = 0; i < chi.length; i += 2) {
      expect(chi[i + 1]).toBeCloseTo(0, 6)
    }
    // χ' imaginary part is zero everywhere.
    for (let i = 1; i < chiDeriv.length; i += 2) {
      expect(chiDeriv[i]).toBeCloseTo(0, 6)
    }
    // χ' real part follows the decaying-branch WKB formula inside the bounce,
    // zero otherwise. Reconstruct per-cell via INPUT.
    const { Nphi, phiExtent, aMin, mass, lambda } = INPUT
    const a2 = aMin * aMin
    let insideBounceCells = 0
    for (let i1 = 0; i1 < Nphi; i1++) {
      const phi1 = -phiExtent + (2 * phiExtent * i1) / (Nphi - 1)
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi2 = -phiExtent + (2 * phiExtent * i2) / (Nphi - 1)
        const V = wdwPotential(phi1, phi2, mass, lambda)
        const idx = i1 * Nphi + i2
        const actual = chiDeriv[2 * idx] ?? 0
        if (V > 1e-12) {
          const arg = 1.0 - a2 * WDW_G_PREFACTOR * V
          if (arg > 0) {
            insideBounceCells++
            const amp = chi[2 * idx] ?? 0
            const expected = -WDW_G_PREFACTOR * aMin * Math.sqrt(arg) * amp
            expect(actual).toBeCloseTo(expected, 5)
            continue
          }
        }
        expect(actual).toBeCloseTo(0, 6)
      }
    }
    // With m=0.3, Λ=0.05, aMin=0.05 every cell should be inside the bounce.
    expect(insideBounceCells).toBeGreaterThan(0)
  })
  it('amplitude is bounded in [0, 1]', () => {
    const { chi } = hartleHawkingBoundary(INPUT)
    for (let i = 0; i < chi.length; i += 2) {
      const amp = Math.abs(chi[i] ?? 0)
      expect(amp).toBeGreaterThanOrEqual(0)
      expect(amp).toBeLessThanOrEqual(1 + 1e-6)
    }
  })

  it('is continuous at the V = 0 origin cell for Λ = 0, m > 0', () => {
    // Regression guard: the legacy V ≤ 1e-12 fallback set
    // `amp = exp(-½|φ|²)` and `dChi = 0` at cells where V ≈ 0, while
    // neighbouring V > 1e-12 cells used the full WKB formula giving
    // `amp = exp(-K·a²/2)·(1 + O(V))` and
    // `dChi = -K·a·amp·(1 + O(V))`. For Λ = 0, m > 0 configs this put
    // a step discontinuity at exactly the grid origin. The new
    // small-V expansion drives both branches to the same limit, so
    // amp and dChi should be continuous from origin to the inner
    // ring (first off-origin cells).
    const input = {
      Nphi: 17, // odd so the origin cell lands at (8, 8) exactly
      phiExtent: 3.5,
      aMin: 0.1,
      mass: 0.3,
      lambda: 0.0,
    }
    const { chi, chiDeriv } = hartleHawkingBoundary(input)
    const centre = 8 * 17 + 8
    const inner = 8 * 17 + 9 // adjacent cell at (i1=8, i2=9) with φ₁=0, φ₂=0.4375
    const ampCentre = chi[2 * centre]!
    const ampInner = chi[2 * inner]!
    const dChiCentre = chiDeriv[2 * centre]!
    const dChiInner = chiDeriv[2 * inner]!
    // Continuity: origin-to-inner jump must be small (O(V·a²)).
    expect(Math.abs(ampCentre - ampInner)).toBeLessThan(0.02)
    expect(Math.abs(dChiCentre - dChiInner)).toBeLessThan(0.5)
    // Specific-value check: at V = 0 exactly the small-V expansion
    // predicts `amp = exp(-K·a²/2)` and `dChi = -K·a·amp`. Both must
    // evaluate to their predicted limits, not 1 / 0 from the legacy
    // fallback.
    const K = (8 * Math.PI) / 3
    expect(ampCentre).toBeCloseTo(Math.exp(-0.5 * K * 0.01), 6)
    expect(dChiCentre).toBeCloseTo(-K * 0.1 * Math.exp(-0.5 * K * 0.01), 6)
  })

  it('uses HH WKB seed on outer V > 0 columns even when Λ < 0', () => {
    // Regression guard: previously `isAdsCase = lambda < 0` flipped every
    // cell to the Gaussian envelope on any Λ < 0 config, including outer
    // columns where V = 0.5·m²·(φ₁²+φ₂²) + Λ > 0 has a genuine turning
    // surface. Those columns legitimately want the HH V-dependent seed;
    // the global flag suppressed their φ-structure.
    //
    // Config: m = 1.0, Λ = -0.2. Inner cells have V < 0; outer-φ cells
    // have V > 0 as soon as |φ|² > -2Λ/m² = 0.4, i.e., |φ| > 0.63.
    const negLambdaInput = {
      Nphi: 17,
      phiExtent: 2.0,
      aMin: 0.1,
      mass: 1.0,
      lambda: -0.2,
    }
    const { chi, chiDeriv } = hartleHawkingBoundary(negLambdaInput)
    const { Nphi, aMin } = negLambdaInput
    // Pick an outer cell with V > 0 (V(φ=1.0, φ=1.0) = 0.5·1·2 - 0.2 = 0.8)
    // and assert it received the V-dependent seed. φ=1.0 on our grid
    // corresponds to i = 8 + round(1.0 / (4/16)) = 12 (since dphi = 0.25).
    const outerI = 12
    const outerIdx = outerI * Nphi + outerI
    const outerPhi = -2.0 + (2 * 2.0 * outerI) / (Nphi - 1)
    const V = wdwPotential(outerPhi, outerPhi, 1.0, -0.2)
    expect(V).toBeGreaterThan(0)
    // With V > 0, HH predicts `amp = exp(-|S_E|)` where S_E is the
    // instanton action. The Gaussian envelope would give
    // `exp(-|outerPhi|²)` ≈ exp(-2) ≈ 0.135 — distinguishably different
    // from the WKB value for our parameters (V = 0.8 at this cell).
    const ampAtOuter = chi[2 * outerIdx]!
    const gaussianEnvPrediction = Math.exp(-outerPhi * outerPhi)
    expect(Math.abs(ampAtOuter - gaussianEnvPrediction)).toBeGreaterThan(1e-3)
    // The WKB derivative at a V > 0 cell is non-zero; the Gaussian
    // branch forces it to zero.
    const dChi = chiDeriv[2 * outerIdx]!
    expect(Math.abs(dChi)).toBeGreaterThan(1e-3)
    // Derivative value check: HH predicts
    //   dChi = -K·a·sqrt(1 - K·V·a²)·amp
    const K = WDW_G_PREFACTOR
    const arg = 1.0 - K * V * aMin * aMin
    if (arg > 0) {
      const predicted = -K * aMin * Math.sqrt(arg) * ampAtOuter
      expect(dChi).toBeCloseTo(predicted, 5)
    }
  })

  it('retains the Gaussian envelope for the free regime (m = 0, Λ = 0)', () => {
    // The free case has V ≡ 0 across the whole grid — no classical
    // turning surface exists, so the WKB instanton formula is
    // inapplicable. The generator falls back to an envelope-damped
    // Gaussian with zero initial a-derivative; this is the gauge
    // choice the Rust WASM cross-validator was pinned against in
    // `solverWasmComparison.test.ts`.
    // Use odd Nphi so the exact origin lands on the central cell and
    // the Gaussian peak is assertable without interpolation slack.
    const Nphi = 17
    const phiExtent = 2.0
    const freeInput = {
      Nphi,
      phiExtent,
      aMin: 0.05,
      mass: 0,
      lambda: 0,
    }
    const { chi, chiDeriv } = hartleHawkingBoundary(freeInput)
    const cMid = Math.floor(Nphi / 2)
    const centreIdx = cMid * Nphi + cMid
    const cornerIdx = 0
    // Origin cell φ = (0, 0) → amp = exp(0) = 1.
    expect(chi[2 * centreIdx]!).toBeCloseTo(1.0, 6)
    // Corner cell at φ = (-phiExtent, -phiExtent) → env = exp(-phiExtent²).
    const cornerEnv = Math.exp(-0.5 * (phiExtent ** 2 + phiExtent ** 2))
    expect(chi[2 * cornerIdx]!).toBeCloseTo(cornerEnv, 3)
    // Full-grid derivative check: every cell has near-zero a-derivative.
    // Use toBeCloseTo so floating-point noise from the envelope eval can't
    // break the strict-zero pinning even though the analytic value is 0.
    for (let i = 0; i < chiDeriv.length; i += 2) {
      expect(chiDeriv[i]!).toBeCloseTo(0, 10)
      expect(chiDeriv[i + 1]!).toBeCloseTo(0, 10)
    }
  })

  it('retains the Gaussian envelope for Λ-dominated AdS regime (Λ < 0)', () => {
    // When V < 0 at the origin (Λ negative and |Λ| > m²·φ²), no
    // classical turning surface exists and the WKB formula is
    // inapplicable. The generator falls back to the Gaussian envelope
    // (continuous with the legacy V < 0 path). Asserts the
    // `antiDeSitterContracting` preset (HH BC, Λ = −0.5) reduces to
    // the same gauge choice as the free case at the grid origin.
    const Nphi = 17
    const adsInput = {
      Nphi,
      phiExtent: 2.0,
      aMin: 0.1,
      mass: 0.3,
      lambda: -0.5,
    }
    const { chi, chiDeriv } = hartleHawkingBoundary(adsInput)
    const cMid = Math.floor(Nphi / 2)
    const centreIdx = cMid * Nphi + cMid
    // Origin cell φ = (0, 0) → V = -0.5 < 0 → Gaussian envelope, amp = 1.
    expect(chi[2 * centreIdx]!).toBeCloseTo(1.0, 6)
    expect(chiDeriv[2 * centreIdx]!).toBeCloseTo(0, 10)
  })
})

describe('Vilenkin boundary', () => {
  it('has non-trivial mean phase magnitude > 0', () => {
    const { chi } = vilenkinBoundary(INPUT)
    const meanPhase = meanAbsPhase(chi)
    // Without Λ the small-a expansion gives a small phase. With Λ=0.05 and
    // a_min=0.05 the seed phase S_L(0,0) = (a_min³/3)·Λ ≈ 2e-6 — too small
    // to assert. Use a higher lambda for this assertion:
    const withLambda = vilenkinBoundary({ ...INPUT, lambda: 10, aMin: 0.8 })
    const meanPhaseHigh = meanAbsPhase(withLambda.chi)
    expect(meanPhaseHigh).toBeGreaterThan(0.5)
    expect(meanPhase).toBeGreaterThanOrEqual(0)
  })
  it('has non-zero imaginary amplitude somewhere', () => {
    const { chi } = vilenkinBoundary({ ...INPUT, lambda: 10, aMin: 0.5 })
    let maxAbsIm = 0
    for (let i = 1; i < chi.length; i += 2) {
      const a = Math.abs(chi[i] ?? 0)
      if (a > maxAbsIm) maxAbsIm = a
    }
    expect(maxAbsIm).toBeGreaterThan(0.01)
  })
})

describe('DeWitt boundary', () => {
  it('bootstraps a non-trivial linear-in-a profile', () => {
    const { chi, chiDeriv } = deWittBoundary(INPUT)
    let maxAmp = 0
    for (let i = 0; i < chi.length; i += 2) {
      const amp = Math.abs(chi[i] ?? 0)
      if (amp > maxAmp) maxAmp = amp
    }
    // χ(a_min) = a_min · env, with env peak ≈ 1 at φ=0, so peak ≈ aMin.
    expect(maxAmp).toBeGreaterThan(0)
    expect(maxAmp).toBeLessThanOrEqual(INPUT.aMin * 1.1)
    // Derivative is the envelope (no a_min factor)
    let maxDeriv = 0
    for (let i = 0; i < chiDeriv.length; i += 2) {
      const v = Math.abs(chiDeriv[i] ?? 0)
      if (v > maxDeriv) maxDeriv = v
    }
    expect(maxDeriv).toBeGreaterThan(INPUT.aMin)
  })
})

describe('buildWdwBoundary dispatch', () => {
  it('dispatches each BC to the correct generator', () => {
    const hh = buildWdwBoundary('noBoundary', INPUT)
    const vil = buildWdwBoundary('tunneling', INPUT)
    const dw = buildWdwBoundary('deWitt', INPUT)
    const directDw = deWittBoundary(INPUT)
    expect(hh.chi.length).toBe(vil.chi.length)
    expect(hh.chi.length).toBe(dw.chi.length)
    // Proves the 'deWitt' branch actually invokes deWittBoundary — a
    // regression that silently dispatched to hartleHawking would still
    // match lengths but not these per-element values.
    expect(Array.from(dw.chi)).toEqual(Array.from(directDw.chi))
    expect(Array.from(dw.chiDeriv)).toEqual(Array.from(directDw.chiDeriv))
    // HH vs Vilenkin should produce different fields
    let diff = 0
    for (let i = 0; i < hh.chi.length; i++) {
      diff += Math.abs((hh.chi[i] ?? 0) - (vil.chi[i] ?? 0))
    }
    expect(diff).toBeGreaterThan(0)
  })
})
