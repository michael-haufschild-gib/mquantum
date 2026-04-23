import { describe, expect, it } from 'vitest'

import {
  buildWdwBoundary,
  deWittBoundary,
  hartleHawkingBoundary,
  vilenkinBoundary,
  wdwPotential,
} from '@/lib/physics/wheelerDeWitt/boundaryConditions'
import {
  columnSolutionNegativeV,
  columnSolutionPositiveV,
  columnSolutionZeroV,
} from '@/lib/physics/wheelerDeWitt/exactColumnSolution'

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
  it('produces real-valued initial data matching the Langer-uniform pure-Ai seed', () => {
    // Phase 2 rewrite: the HH generator delegates to `hhLangerSeed`,
    // which produces `χ = (ζ/U)^{1/4}·Ai(ζ)` on V>0 cells (pure Ai
    // branch). χ and χ' are both real. Reference: `columnSolutionPositiveV`
    // with `c₁ = 1, c₂ = 0` reproduces the generator's output bit-identically
    // (up to f32 storage truncation).
    const { chi, chiDeriv } = hartleHawkingBoundary(INPUT)
    // χ and χ' are real-valued across the entire grid.
    for (let i = 0; i < chi.length; i += 2) {
      expect(chi[i + 1]).toBeCloseTo(0, 6)
    }
    for (let i = 1; i < chiDeriv.length; i += 2) {
      expect(chiDeriv[i]).toBeCloseTo(0, 6)
    }
    const { Nphi, phiExtent, aMin, mass, lambda } = INPUT
    // Per-cell exact agreement with the Langer-Ai reference. Every cell
    // has V > 0 at these parameters (m = 0.3, Λ = 0.05 makes V > 0
    // everywhere since V = 0.5·0.09·|φ|² + 0.05 ≥ 0.05).
    let langerCells = 0
    for (let i1 = 0; i1 < Nphi; i1++) {
      const phi1 = -phiExtent + (2 * phiExtent * i1) / (Nphi - 1)
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi2 = -phiExtent + (2 * phiExtent * i2) / (Nphi - 1)
        const V = wdwPotential(phi1, phi2, mass, lambda)
        expect(V).toBeGreaterThan(0)
        const ref = columnSolutionPositiveV({ a: aMin, phi1, phi2, m: mass, lambda }, 1, 0)
        const idx = i1 * Nphi + i2
        // f32 storage → absolute tolerance around 1e-5 of |ref| magnitude;
        // tolerate min tolerance 1e-6 for near-zero cells.
        const chiAbs = Math.abs(ref.chi.re)
        const dChiAbs = Math.abs(ref.dChi.re)
        const chiTol = Math.max(1e-6, 1e-5 * chiAbs)
        const dChiTol = Math.max(1e-6, 1e-5 * dChiAbs)
        expect(chi[2 * idx]! - ref.chi.re).toBeGreaterThan(-chiTol)
        expect(chi[2 * idx]! - ref.chi.re).toBeLessThan(chiTol)
        expect(chiDeriv[2 * idx]! - ref.dChi.re).toBeGreaterThan(-dChiTol)
        expect(chiDeriv[2 * idx]! - ref.dChi.re).toBeLessThan(dChiTol)
        langerCells++
      }
    }
    // Sanity: the loop actually ran over the full grid.
    expect(langerCells).toBe(Nphi * Nphi)
  })
  it('amplitude magnitude is bounded within the Langer-Ai range', () => {
    // The Langer-Ai amplitude |(ζ/U)^{1/4}·Ai(ζ)| is bounded in terms of
    // the Airy function magnitude. On the `INPUT` grid (V > 0 everywhere,
    // a_min = 0.05) the observed peak is ~0.5 — well below the old
    // bounded-[0,1] leading-WKB amplitude, reflecting the finite-ζ
    // oscillatory nature of Ai.
    const { chi } = hartleHawkingBoundary(INPUT)
    for (let i = 0; i < chi.length; i += 2) {
      const amp = Math.abs(chi[i] ?? 0)
      expect(amp).toBeGreaterThanOrEqual(0)
      // Loose ceiling: (ζ/U)^{1/4}·|Ai(ζ)| never exceeds ~2 in this regime.
      // The old leading-WKB bound `amp ≤ 1` is specific to the
      // `exp(−|S_E|)` envelope that the Phase 2 rewrite replaces.
      expect(amp).toBeLessThanOrEqual(2)
    }
  })

  it('V = 0 origin cell uses the exact √a·J_{1/4} Bessel seed (Λ = 0, m > 0)', () => {
    // Phase 2 rewrite: at V = 0 exactly (origin cell when Λ = 0, m > 0)
    // the HH seed is `env · √a · J_{1/4}(3π·a²)` from
    // `columnSolutionZeroV`. All off-origin cells of this config have
    // V > 0 and use the Langer-Ai seed. The origin-to-inner transition
    // is no longer "continuous amp" in the naive sense (the Langer-Ai
    // form at V = 1e-2 carries a different amplitude scale than the
    // V = 0 Bessel form) — continuity is instead guaranteed in the
    // V → 0⁺ asymptotic limit, not as a pointwise amp-match between
    // adjacent grid cells at finite spacing.
    const input = {
      Nphi: 17, // odd so the origin cell lands at (8, 8) exactly
      phiExtent: 3.5,
      aMin: 0.1,
      mass: 0.3,
      lambda: 0.0,
    }
    const { chi, chiDeriv } = hartleHawkingBoundary(input)
    const centre = 8 * 17 + 8
    const ampCentre = chi[2 * centre]!
    const dChiCentre = chiDeriv[2 * centre]!
    // Reference: origin cell has V = 0 exactly. Seed = env·√a·J_{1/4}(3π·a²)
    // with env = exp(-0) = 1.
    const ref = columnSolutionZeroV(input.aMin, { re: 1, im: 0 }, { re: 0, im: 0 })
    expect(ampCentre).toBeCloseTo(ref.chi.re, 5)
    expect(dChiCentre).toBeCloseTo(ref.dChi.re, 5)
    // Imaginary parts are zero for this HH seed.
    expect(chi[2 * centre + 1]).toBeCloseTo(0, 7)
    expect(chiDeriv[2 * centre + 1]).toBeCloseTo(0, 7)
  })

  it('outer V > 0 columns receive the Langer-Ai seed even when Λ < 0', () => {
    // Regression guard: V > 0 cells must route to the Langer-Ai path
    // regardless of grid-wide `lambda` sign (earlier `isAdsCase = lambda < 0`
    // gate wrongly routed them to the Gaussian envelope).
    //
    // Config: m = 1.0, Λ = -0.2. Inner cells have V < 0; outer-φ cells
    // have V > 0 once |φ|² > -2Λ/m² = 0.4, i.e., |φ| > 0.63.
    const negLambdaInput = {
      Nphi: 17,
      phiExtent: 2.0,
      aMin: 0.1,
      mass: 1.0,
      lambda: -0.2,
    }
    const { chi, chiDeriv } = hartleHawkingBoundary(negLambdaInput)
    const { Nphi, aMin, mass, lambda } = negLambdaInput
    // Pick an outer cell with V > 0 (V(φ=1.0, φ=1.0) = 0.5·1·2 - 0.2 = 0.8)
    // and assert it matches the Langer-Ai reference bit-for-bit (modulo
    // f32 storage).
    const outerI = 12
    const outerIdx = outerI * Nphi + outerI
    const outerPhi = -2.0 + (2 * 2.0 * outerI) / (Nphi - 1)
    const V = wdwPotential(outerPhi, outerPhi, mass, lambda)
    expect(V).toBeGreaterThan(0)
    const ampAtOuter = chi[2 * outerIdx]!
    const dChi = chiDeriv[2 * outerIdx]!
    // Distinguishable from the Gaussian-envelope gauge (env = exp(-|φ|²)
    // ≈ exp(-2) ≈ 0.135) — the Langer-Ai amplitude at this cell is
    // qualitatively different.
    const gaussianEnvPrediction = Math.exp(-outerPhi * outerPhi)
    expect(Math.abs(ampAtOuter - gaussianEnvPrediction)).toBeGreaterThan(1e-3)
    // Derivative value check: match the Langer-Ai analytic derivative.
    const ref = columnSolutionPositiveV(
      { a: aMin, phi1: outerPhi, phi2: outerPhi, m: mass, lambda },
      1,
      0
    )
    expect(ampAtOuter).toBeCloseTo(ref.chi.re, 5)
    expect(dChi).toBeCloseTo(ref.dChi.re, 5)
    // And nontrivial — ensure we're not comparing against a zero-valued
    // reference (which would make the closeness check trivially pass).
    expect(Math.abs(ref.dChi.re)).toBeGreaterThan(1e-3)
  })

  it('uses Gaussian-enveloped Bessel-¼ seed for the free regime (m = 0, Λ = 0)', () => {
    // The free case has V ≡ 0 across the whole grid — no classical
    // turning surface, so the Langer-Ai form is undefined. The
    // generator uses `env · √a · J_{1/4}(3π·a²)` on each cell (see
    // `hhLangerSeed`: V = 0 branch). `env = exp(-½|φ|²)` is the gauge.
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
    // Origin (φ = 0, env = 1): seed = √a·J_{1/4}(3π·a²). Reference via
    // `columnSolutionZeroV`.
    const centreRef = columnSolutionZeroV(freeInput.aMin, { re: 1, im: 0 }, { re: 0, im: 0 })
    expect(chi[2 * centreIdx]!).toBeCloseTo(centreRef.chi.re, 5)
    // Corner (φ = (-phiExtent, -phiExtent), env = exp(-phiExtent²)).
    const cornerEnv = Math.exp(-0.5 * (phiExtent ** 2 + phiExtent ** 2))
    const cornerRef = columnSolutionZeroV(
      freeInput.aMin,
      { re: cornerEnv, im: 0 },
      { re: 0, im: 0 }
    )
    expect(chi[2 * cornerIdx]!).toBeCloseTo(cornerRef.chi.re, 5)
    // Per-cell χ derivative matches the Bessel-¼ closed-form derivative.
    for (let i1 = 0; i1 < Nphi; i1++) {
      const phi1 = -phiExtent + (2 * phiExtent * i1) / (Nphi - 1)
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi2 = -phiExtent + (2 * phiExtent * i2) / (Nphi - 1)
        const env = Math.exp(-0.5 * (phi1 * phi1 + phi2 * phi2))
        const ref = columnSolutionZeroV(freeInput.aMin, { re: env, im: 0 }, { re: 0, im: 0 })
        const idx = i1 * Nphi + i2
        expect(chiDeriv[2 * idx]!).toBeCloseTo(ref.dChi.re, 5)
        expect(chiDeriv[2 * idx + 1]!).toBeCloseTo(0, 7)
      }
    }
  })

  it('Λ-dominated AdS regime (Λ < 0) origin cell matches Gaussian-enveloped cos·|U|^{-1/4} seed', () => {
    // V < 0 at the origin → no classical turning surface. `hhLangerSeed`
    // uses `env · |U|^{-1/4} · cos(Φ_L)` (real standing-wave gauge).
    const Nphi = 17
    const adsInput = {
      Nphi,
      phiExtent: 2.0,
      aMin: 0.1,
      mass: 0.3,
      lambda: -0.5,
    }
    const { chi, chiDeriv } = hartleHawkingBoundary(adsInput)
    const { mass, lambda, aMin } = adsInput
    const cMid = Math.floor(Nphi / 2)
    const centreIdx = cMid * Nphi + cMid
    // Origin cell has env = 1. Seed = |U|^{-1/4}·cos(Φ_L(a_min, 0, 0)).
    const ref = columnSolutionNegativeV(
      { a: aMin, phi1: 0, phi2: 0, m: mass, lambda },
      { re: 1, im: 0 },
      { re: 0, im: 0 }
    )
    expect(chi[2 * centreIdx]!).toBeCloseTo(ref.chi.re, 5)
    expect(chiDeriv[2 * centreIdx]!).toBeCloseTo(ref.dChi.re, 5)
    // Imaginary components remain zero.
    expect(chi[2 * centreIdx + 1]).toBeCloseTo(0, 7)
    expect(chiDeriv[2 * centreIdx + 1]).toBeCloseTo(0, 7)
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
