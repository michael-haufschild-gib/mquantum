import { describe, expect, it } from 'vitest'
import {
  coherentFockCoefficients,
  computeEnergy,
  computeOccupation,
  computeSecondQuantMetrics,
  computeUncertainties,
  squeezedFockCoefficients,
} from '@/lib/math/secondQuantization'

// ============================================================================
// coherentFockCoefficients
// ============================================================================
describe('coherentFockCoefficients', () => {
  it('returns vacuum state when alpha = 0', () => {
    const coeffs = coherentFockCoefficients(0, 0, 5)
    // |alpha=0> = |0>, so c_0 = 1, c_n = 0 for n > 0
    expect(coeffs[0].re).toBeCloseTo(1, 10)
    expect(coeffs[0].im).toBeCloseTo(0, 10)
    for (let n = 1; n < 5; n++) {
      expect(coeffs[n].re).toBeCloseTo(0, 10)
      expect(coeffs[n].im).toBeCloseTo(0, 10)
    }
  })

  it('produces coefficients that sum to 1 (normalization)', () => {
    const coeffs = coherentFockCoefficients(1.5, 0.7, 20)
    const totalProb = coeffs.reduce((sum, c) => sum + c.re * c.re + c.im * c.im, 0)
    // With 20 terms and |alpha|^2 = 2.74, this should be very close to 1
    expect(totalProb).toBeCloseTo(1, 4)
  })

  it('gives Poissonian distribution with mean |alpha|^2', () => {
    const alpha = 2.0
    const coeffs = coherentFockCoefficients(alpha, 0, 30)
    const probs = coeffs.map((c) => c.re * c.re + c.im * c.im)
    // Mean of the distribution should be |alpha|^2 = 4
    const mean = probs.reduce((sum, p, n) => sum + n * p, 0)
    expect(mean).toBeCloseTo(alpha * alpha, 2)
  })

  it('handles purely imaginary alpha', () => {
    const coeffs = coherentFockCoefficients(0, 1, 10)
    const totalProb = coeffs.reduce((sum, c) => sum + c.re * c.re + c.im * c.im, 0)
    expect(totalProb).toBeCloseTo(1, 4)
    // c_1 should be proportional to i (imaginary alpha)
    expect(coeffs[1].im).not.toBeCloseTo(0, 2)
  })
})

// ============================================================================
// squeezedFockCoefficients
// ============================================================================
describe('squeezedFockCoefficients', () => {
  it('returns vacuum state when r = 0', () => {
    const coeffs = squeezedFockCoefficients(0, 0, 6)
    expect(coeffs[0].re).toBeCloseTo(1, 10)
    for (let n = 1; n < 6; n++) {
      expect(coeffs[n].re).toBeCloseTo(0, 10)
      expect(coeffs[n].im).toBeCloseTo(0, 10)
    }
  })

  it('has zero coefficients for odd Fock states', () => {
    const coeffs = squeezedFockCoefficients(0.8, 0, 10)
    for (let n = 0; n < 10; n++) {
      if (n % 2 === 1) {
        expect(coeffs[n].re).toBeCloseTo(0, 10)
        expect(coeffs[n].im).toBeCloseTo(0, 10)
      }
    }
  })

  it('produces coefficients that approximately sum to 1', () => {
    const coeffs = squeezedFockCoefficients(0.5, 0, 20)
    const totalProb = coeffs.reduce((sum, c) => sum + c.re * c.re + c.im * c.im, 0)
    // With moderate squeeze and 20 terms, should be close to 1
    expect(totalProb).toBeCloseTo(1, 3)
  })

  it('mean occupation number matches sinh^2(r) from distribution', () => {
    const r = 0.7
    const coeffs = squeezedFockCoefficients(r, 0, 30)
    const probs = coeffs.map((c) => c.re * c.re + c.im * c.im)
    const mean = probs.reduce((sum, p, n) => sum + n * p, 0)
    expect(mean).toBeCloseTo(Math.sinh(r) ** 2, 2)
  })
})

// ============================================================================
// computeOccupation
// ============================================================================
describe('computeOccupation', () => {
  const baseParams = {
    n: 3,
    alphaRe: 0,
    alphaIm: 0,
    squeezeR: 0,
    squeezeTheta: 0,
    omega: 1,
  }

  it('returns n for Fock state', () => {
    expect(computeOccupation('fock', { ...baseParams, n: 5 })).toBe(5)
  })

  it('returns |alpha|^2 for coherent state', () => {
    const occ = computeOccupation('coherent', { ...baseParams, alphaRe: 2, alphaIm: 1 })
    expect(occ).toBeCloseTo(5, 10) // 4 + 1
  })

  it('returns sinh^2(r) for squeezed state', () => {
    const r = 1.0
    const occ = computeOccupation('squeezed', { ...baseParams, squeezeR: r })
    expect(occ).toBeCloseTo(Math.sinh(r) ** 2, 10)
  })
})

// ============================================================================
// computeEnergy
// ============================================================================
describe('computeEnergy', () => {
  it('returns hbar*omega*(n+0.5) for given occupation', () => {
    expect(computeEnergy(3, 1)).toBeCloseTo(3.5, 10)
    expect(computeEnergy(0, 2)).toBeCloseTo(1.0, 10)
    expect(computeEnergy(1, 0.5)).toBeCloseTo(0.75, 10)
  })
})

// ============================================================================
// computeUncertainties
// ============================================================================
describe('computeUncertainties', () => {
  const baseParams = {
    n: 0,
    alphaRe: 0,
    alphaIm: 0,
    squeezeR: 0,
    squeezeTheta: 0,
    omega: 1,
  }

  it('gives equal DeltaX = DeltaP = sqrt((2n+1)/2) for Fock states', () => {
    const u = computeUncertainties('fock', { ...baseParams, n: 3 })
    const expected = Math.sqrt(7 / 2) // sqrt((2*3+1)/2)
    expect(u.deltaX).toBeCloseTo(expected, 10)
    expect(u.deltaP).toBeCloseTo(expected, 10)
    expect(u.means.x).toBe(0)
    expect(u.means.p).toBe(0)
  })

  it('gives vacuum (n=0) Fock with DeltaX = DeltaP = 1/sqrt(2)', () => {
    const u = computeUncertainties('fock', { ...baseParams, n: 0 })
    expect(u.deltaX).toBeCloseTo(1 / Math.SQRT2, 10)
    expect(u.deltaP).toBeCloseTo(1 / Math.SQRT2, 10)
    expect(u.product).toBeCloseTo(0.5, 10)
  })

  it('gives minimum uncertainty product = 1/2 for coherent state', () => {
    const u = computeUncertainties('coherent', { ...baseParams, alphaRe: 3, alphaIm: -1 })
    expect(u.product).toBeCloseTo(0.5, 10)
    expect(u.deltaX).toBeCloseTo(1 / Math.SQRT2, 10)
    expect(u.deltaP).toBeCloseTo(1 / Math.SQRT2, 10)
    // Means displaced
    expect(u.means.x).toBeCloseTo(Math.SQRT2 * 3, 10)
    expect(u.means.p).toBeCloseTo(Math.SQRT2 * -1, 10)
  })

  it('produces squeezed uncertainty with DeltaX < 1/sqrt(2) for theta=0', () => {
    const r = 1.0
    const u = computeUncertainties('squeezed', { ...baseParams, squeezeR: r, squeezeTheta: 0 })
    // theta=0: DeltaX = e^{-r}/sqrt(2), DeltaP = e^{r}/sqrt(2)
    expect(u.deltaX).toBeCloseTo(Math.exp(-r) / Math.SQRT2, 8)
    expect(u.deltaP).toBeCloseTo(Math.exp(r) / Math.SQRT2, 8)
    // Product should still be >= 1/2 (minimum uncertainty for squeezed vacuum)
    expect(u.product).toBeCloseTo(0.5, 8)
    expect(u.means.x).toBe(0)
    expect(u.means.p).toBe(0)
  })

  it('squeezed vacuum is always minimum-uncertainty (Robertson-Schrodinger)', () => {
    // Test multiple squeeze angles — all should satisfy RS invariant = 1/4
    const angles = [0, Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI / 2, Math.PI, 1.7]
    for (const theta of angles) {
      const u = computeUncertainties('squeezed', {
        ...baseParams,
        squeezeR: 1.0,
        squeezeTheta: theta,
      })
      // RS invariant: Var(X)*Var(P) - Cov(X,P)^2 = 1/4
      expect(u.robertsonSchrodinger).toBeCloseTo(0.25, 6)
      expect(u.isMinimumUncertainty).toBe(true)
    }
  })

  it('rotated squeezed state has nonzero covariance', () => {
    const u = computeUncertainties('squeezed', {
      ...baseParams,
      squeezeR: 1.0,
      squeezeTheta: Math.PI / 4,
    })
    // For theta = pi/4 and r > 0, covariance should be nonzero
    expect(Math.abs(u.covariance)).toBeGreaterThan(0.1)
    // But product ΔX·ΔP > 1/2 (Heisenberg product is larger for rotated squeezing)
    expect(u.product).toBeGreaterThan(0.5 + 0.01)
    // Yet still minimum-uncertainty in Robertson-Schrodinger sense
    expect(u.isMinimumUncertainty).toBe(true)
  })

  it('Fock |n=0> is minimum-uncertainty, |n>1> is not', () => {
    const u0 = computeUncertainties('fock', { ...baseParams, n: 0 })
    expect(u0.isMinimumUncertainty).toBe(true)
    expect(u0.covariance).toBe(0)

    const u3 = computeUncertainties('fock', { ...baseParams, n: 3 })
    expect(u3.isMinimumUncertainty).toBe(false)
    expect(u3.covariance).toBe(0)
  })

  it('coherent state is always minimum-uncertainty with zero covariance', () => {
    const u = computeUncertainties('coherent', { ...baseParams, alphaRe: 3, alphaIm: -2 })
    expect(u.isMinimumUncertainty).toBe(true)
    expect(u.covariance).toBe(0)
    expect(u.robertsonSchrodinger).toBeCloseTo(0.25, 10)
  })

  it('squeezed state with theta=pi reverses squeezing direction', () => {
    const r = 0.5
    const u0 = computeUncertainties('squeezed', {
      ...baseParams,
      squeezeR: r,
      squeezeTheta: 0,
    })
    const uPi = computeUncertainties('squeezed', {
      ...baseParams,
      squeezeR: r,
      squeezeTheta: Math.PI,
    })
    // theta=pi should swap which quadrature is squeezed
    expect(uPi.deltaX).toBeCloseTo(u0.deltaP, 8)
    expect(uPi.deltaP).toBeCloseTo(u0.deltaX, 8)
  })
})

// ============================================================================
// computeSecondQuantMetrics
// ============================================================================
describe('computeSecondQuantMetrics', () => {
  it('returns correct bundle for vacuum Fock state', () => {
    const m = computeSecondQuantMetrics('fock', {
      n: 0,
      alphaRe: 0,
      alphaIm: 0,
      squeezeR: 0,
      squeezeTheta: 0,
      omega: 1,
    })
    expect(m.occupation).toBe(0)
    expect(m.energy).toBeCloseTo(0.5, 10) // zero-point energy
    expect(m.fockDistribution[0]).toBeCloseTo(1, 10)
    expect(m.fockDistribution[1]).toBeCloseTo(0, 10)
  })

  it('returns Poissonian Fock distribution for coherent state', () => {
    const m = computeSecondQuantMetrics('coherent', {
      n: 0,
      alphaRe: 1,
      alphaIm: 0,
      squeezeR: 0,
      squeezeTheta: 0,
      omega: 2,
    })
    // |alpha|^2 = 1
    expect(m.occupation).toBeCloseTo(1, 10)
    expect(m.energy).toBeCloseTo(2 * 1.5, 10) // omega * (1 + 0.5) = 3
    // P(0) = e^{-1}, P(1) = e^{-1}
    expect(m.fockDistribution[0]).toBeCloseTo(Math.exp(-1), 4)
    expect(m.fockDistribution[1]).toBeCloseTo(Math.exp(-1), 4)
  })

  it('returns even-only Fock distribution for squeezed state', () => {
    const m = computeSecondQuantMetrics('squeezed', {
      n: 0,
      alphaRe: 0,
      alphaIm: 0,
      squeezeR: 0.5,
      squeezeTheta: 0,
      omega: 1,
    })
    // Odd terms should be zero
    expect(m.fockDistribution[1]).toBeCloseTo(0, 10)
    expect(m.fockDistribution[3]).toBeCloseTo(0, 10)
    // Even terms should be nonzero
    expect(m.fockDistribution[0]).toBeGreaterThan(0.5) // vacuum component dominates for small r
    expect(m.fockDistribution[2]).toBeGreaterThan(0)
  })
})
