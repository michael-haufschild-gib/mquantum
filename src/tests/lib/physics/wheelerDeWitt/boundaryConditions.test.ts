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
    expect(hh.chi.length).toBe(vil.chi.length)
    expect(hh.chi.length).toBe(dw.chi.length)
    // HH vs Vilenkin should produce different fields
    let diff = 0
    for (let i = 0; i < hh.chi.length; i++) {
      diff += Math.abs((hh.chi[i] ?? 0) - (vil.chi[i] ?? 0))
    }
    expect(diff).toBeGreaterThan(0)
  })
})
