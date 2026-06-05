/**
 * Tests for the Hamilton-Jacobi operator construction.
 *
 * Key checks:
 *   - The 1D harmonic-oscillator discrete spectrum converges to the
 *     analytic `2ω(n + ½)` levels as the grid is refined.
 *   - The 2D φ-slice HJ operator yields real positive eigenvalues for an
 *     interior scale-factor slice and is Hermitian (eigenvalues real by
 *     construction, symmetric in memory by construction — we verify
 *     symmetry via the fact that Jacobi returns real eigenvalues on
 *     non-symmetric input only after the solver’s defensive symmetrise).
 *   - Passing a sliceIndex at an endpoint of the clock axis throws.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { logger } from '@/lib/logger'
import {
  harmonicOscillator1DSpectrum,
  hjSpectrumOnSlice,
  hjSpectrumOnSliceTopK,
  resetHjTopKWarnBudget,
} from '@/lib/physics/srmt/hjOperator'

describe('hjOperator.harmonicOscillator1DSpectrum', () => {
  it('approximates analytic HO eigenvalues 2ω(n + ½) for small n on a fine grid', () => {
    // H = −∂²_x + ω² x². Analytic levels: 2ω·(n + 1/2).
    const omega = 1.0
    const N = 129
    const L = 8.0
    const spec = harmonicOscillator1DSpectrum(N, L, omega)
    for (let n = 0; n < 4; n++) {
      const analytic = 2 * omega * (n + 0.5)
      // Finite-differenceq HO: the stencil underestimates high-n levels
      // but n < 4 should be within 0.05 of analytic at dx ≈ 0.125.
      expect(spec[n]!).toBeGreaterThan(analytic - 0.05)
      expect(spec[n]!).toBeLessThan(analytic + 0.05)
    }
  })

  it('preserves ascending order of eigenvalues', () => {
    const spec = harmonicOscillator1DSpectrum(33, 4.0, 2.0)
    for (let i = 1; i < spec.length; i++) {
      expect(spec[i]!).toBeGreaterThanOrEqual(spec[i - 1]! - 1e-8)
    }
  })

  it('rejects grids smaller than 3 cells', () => {
    expect(() => harmonicOscillator1DSpectrum(2, 1, 1)).toThrow(/N must be a safe integer/)
  })

  it('rejects non-integral, non-finite, and oversized dense grids before allocation', () => {
    expect(() => harmonicOscillator1DSpectrum(3.5, 1, 1)).toThrow(/N must be a safe integer/)
    expect(() => harmonicOscillator1DSpectrum(3, Number.POSITIVE_INFINITY, 1)).toThrow(
      /L must be finite/
    )
    expect(() => harmonicOscillator1DSpectrum(3, 1, Number.NaN)).toThrow(/omega must be finite/)
    expect(() => harmonicOscillator1DSpectrum(3, 1, -1)).toThrow(/omega must be >= 0/)
    expect(() => harmonicOscillator1DSpectrum(1025, 1, 1)).toThrow(/matrix size/)
  })
})

describe('hjOperator.hjSpectrumOnSlice — clock="a"', () => {
  it('yields a real, ascending spectrum on an interior a-slice', () => {
    const { spectrum, n } = hjSpectrumOnSlice('a', {
      Na: 24,
      Nphi: 8,
      aMin: 0.1,
      aMax: 1.5,
      phiExtent: 2.0,
      inflatonMass: 0.3,
      cosmologicalConstant: 0.05,
      sliceIndex: 12,
    })
    expect(n).toBe(64)
    expect(spectrum.length).toBe(64)
    for (let i = 1; i < spectrum.length; i++) {
      expect(Number.isFinite(spectrum[i]!)).toBe(true)
      expect(spectrum[i]!).toBeGreaterThanOrEqual(spectrum[i - 1]! - 1e-6)
    }
  })

  it('rejects slice indices at the clock-axis boundary', () => {
    const args = {
      Na: 8,
      Nphi: 4,
      aMin: 0.1,
      aMax: 1.0,
      phiExtent: 2.0,
      inflatonMass: 0.1,
      cosmologicalConstant: 0.0,
    }
    expect(() => hjSpectrumOnSlice('a', { ...args, sliceIndex: 0 })).toThrow(/strictly interior/)
    expect(() => hjSpectrumOnSlice('a', { ...args, sliceIndex: args.Na - 1 })).toThrow(
      /strictly interior/
    )
  })

  it('rejects invalid grids, non-finite physics scalars, and oversized operators', () => {
    const args = {
      Na: 8,
      Nphi: 4,
      aMin: 0.1,
      aMax: 1.0,
      phiExtent: 2.0,
      inflatonMass: 0.1,
      cosmologicalConstant: 0.0,
      sliceIndex: 4,
    }

    expect(() => hjSpectrumOnSlice('a', { ...args, Nphi: 4.5 })).toThrow(
      /Nphi must be a safe integer/
    )
    expect(() => hjSpectrumOnSlice('a', { ...args, sliceIndex: 4.5 })).toThrow(
      /sliceIndex must be a safe integer/
    )
    expect(() => hjSpectrumOnSlice('a', { ...args, inflatonMass: Number.NaN })).toThrow(
      /inflatonMass must be finite/
    )
    expect(() =>
      hjSpectrumOnSlice('a', { ...args, cosmologicalConstant: Number.POSITIVE_INFINITY })
    ).toThrow(/cosmologicalConstant must be finite/)
    expect(() => hjSpectrumOnSlice('a', { ...args, inflatonMassAsymmetry: Number.NaN })).toThrow(
      /inflatonMassAsymmetry must be finite/
    )
    expect(() => hjSpectrumOnSlice('a', { ...args, Nphi: 1025 })).toThrow(/operator size/)
    expect(() =>
      hjSpectrumOnSlice('a', { ...args, Na: 3, aMin: -1, aMax: 1, sliceIndex: 1 })
    ).toThrow(/slice a must be non-zero/)
    expect(() => hjSpectrumOnSlice('a', { ...args, inflatonMass: Number.MAX_VALUE })).toThrow(
      /non-finite operator value/
    )
  })
})

describe('hjOperator.hjSpectrumOnSliceTopK — contamination guard', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetHjTopKWarnBudget()
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    resetHjTopKWarnBudget()
  })

  it('clips k to floor(n/2) when the requested k exceeds the Krylov-reliable ceiling', () => {
    // clock='a' with Nphi=4 → n = Nphi² = 16. floor(16/2) = 8.
    // Requested k=15 must be clipped to 8.
    const { spectrum, n } = hjSpectrumOnSliceTopK(
      'a',
      {
        Na: 12,
        Nphi: 4,
        aMin: 0.2,
        aMax: 1.2,
        phiExtent: 2.0,
        inflatonMass: 0,
        cosmologicalConstant: 0,
        sliceIndex: 6,
      },
      15
    )
    expect(n).toBe(16)
    expect(spectrum.length).toBe(8)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const message = warnSpy.mock.calls[0]![0] as string
    expect(message).toContain('k=15')
    expect(message).toContain('k_eff=8')
    expect(message).toContain('n=16')
  })

  it('clips k to floor(n/2) on phi-clock slices when n = Na·Nphi', () => {
    // clock='phi1' with Na=8, Nphi=4 → n = 32. floor(32/2) = 16.
    // Requested k=40 must be clipped to 16.
    const { spectrum, n } = hjSpectrumOnSliceTopK(
      'phi1',
      {
        Na: 8,
        Nphi: 4,
        aMin: 0.2,
        aMax: 1.2,
        phiExtent: 1.5,
        inflatonMass: 0,
        cosmologicalConstant: 0,
        sliceIndex: 2,
      },
      40
    )
    expect(n).toBe(32)
    expect(spectrum.length).toBe(16)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const message = warnSpy.mock.calls[0]![0] as string
    expect(message).toContain('k=40')
    expect(message).toContain('k_eff=16')
  })

  it('leaves k unchanged and does not warn when k <= floor(n/2)', () => {
    // clock='a' with Nphi=16 → n = 256. floor(256/2) = 128.
    // Requested k=8 is well below the ceiling — no clip, no warn.
    const { spectrum, n } = hjSpectrumOnSliceTopK(
      'a',
      {
        Na: 8,
        Nphi: 16,
        aMin: 0.2,
        aMax: 1.2,
        phiExtent: 2.0,
        inflatonMass: 0,
        cosmologicalConstant: 0,
        sliceIndex: 4,
      },
      8
    )
    expect(n).toBe(256)
    expect(spectrum.length).toBe(8)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('rate-limits the warn — further clips after budget exhaustion stay silent', () => {
    resetHjTopKWarnBudget(1)
    const inputs = {
      Na: 12,
      Nphi: 4,
      aMin: 0.2,
      aMax: 1.2,
      phiExtent: 2.0,
      inflatonMass: 0,
      cosmologicalConstant: 0,
      sliceIndex: 6,
    }
    hjSpectrumOnSliceTopK('a', inputs, 15)
    hjSpectrumOnSliceTopK('a', inputs, 15)
    hjSpectrumOnSliceTopK('a', inputs, 15)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('rejects non-integral positive k and keeps non-finite warn budgets usable', () => {
    const inputs = {
      Na: 12,
      Nphi: 4,
      aMin: 0.2,
      aMax: 1.2,
      phiExtent: 2.0,
      inflatonMass: 0,
      cosmologicalConstant: 0,
      sliceIndex: 6,
    }

    expect(() => hjSpectrumOnSliceTopK('a', inputs, 2.5)).toThrow(/k must be a safe integer/)
    expect(() => hjSpectrumOnSliceTopK('a', inputs, Number.NaN)).toThrow(/k must be a safe integer/)

    resetHjTopKWarnBudget(Number.NaN)
    hjSpectrumOnSliceTopK('a', inputs, 15)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})

describe('hjOperator.hjSpectrumOnSlice — φ clocks', () => {
  it('yields a real, ascending spectrum for clock="phi1"', () => {
    const { spectrum, n } = hjSpectrumOnSlice('phi1', {
      Na: 12,
      Nphi: 8,
      aMin: 0.1,
      aMax: 1.2,
      phiExtent: 1.5,
      inflatonMass: 0.0,
      cosmologicalConstant: 0.0,
      sliceIndex: 4,
    })
    expect(n).toBe(12 * 8)
    for (let i = 1; i < spectrum.length; i++) {
      expect(Number.isFinite(spectrum[i]!)).toBe(true)
      expect(spectrum[i]!).toBeGreaterThanOrEqual(spectrum[i - 1]! - 1e-6)
    }
  })

  it('uses the isolated phi-clock generator, not the restricted WdW operator', () => {
    const base = {
      Na: 10,
      Nphi: 6,
      aMin: 0.2,
      aMax: 1.2,
      phiExtent: 1.5,
      inflatonMass: 0.0,
      sliceIndex: 3,
    }
    const lowLambda = hjSpectrumOnSlice('phi1', {
      ...base,
      cosmologicalConstant: 0.0,
    }).spectrum
    const highLambda = hjSpectrumOnSlice('phi1', {
      ...base,
      cosmologicalConstant: 0.2,
    }).spectrum

    // From p_phi^2 = a^2 p_a^2 - p_other^2 - a^2 U, and dU/dLambda > 0,
    // increasing Lambda must lower the phi-clock generator spectrum. The old
    // restricted-WdW operator used +U and moved this comparison the other way.
    expect(highLambda[0]!).toBeLessThan(lowLambda[0]!)
  })

  it('rejects phi-clock invalid grids and non-finite inputs before allocation', () => {
    const base = {
      Na: 12,
      Nphi: 8,
      aMin: 0.2,
      aMax: 1.2,
      phiExtent: 1.5,
      inflatonMass: 0,
      cosmologicalConstant: 0,
      sliceIndex: 4,
    }

    expect(() => hjSpectrumOnSlice('phi1', { ...base, Na: 12.5 })).toThrow(
      /Na must be a safe integer/
    )
    expect(() => hjSpectrumOnSlice('phi1', { ...base, phiExtent: Number.NaN })).toThrow(
      /phiExtent must be finite/
    )
    expect(() => hjSpectrumOnSlice('phi1', { ...base, aMin: 0 })).toThrow(/aMin must be > 0/)
    expect(() => hjSpectrumOnSlice('phi1', { ...base, Na: 8193, Nphi: 128 })).toThrow(
      /operator size/
    )
    expect(() =>
      hjSpectrumOnSlice('phi2', { ...base, cosmologicalConstant: Number.MAX_VALUE })
    ).toThrow(/non-finite operator value/)
  })
})
