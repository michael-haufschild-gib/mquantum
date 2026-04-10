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
    expect(coeffs[0]!.re).toBeCloseTo(1, 10)
    expect(coeffs[0]!.im).toBeCloseTo(0, 10)
    for (let n = 1; n < 5; n++) {
      expect(coeffs[n]!.re).toBeCloseTo(0, 10)
      expect(coeffs[n]!.im).toBeCloseTo(0, 10)
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

  it('large displacement |α|=4: normalization holds with enough terms', () => {
    // |alpha|² = 16, Poisson mean = 16
    // Need many terms for normalization: P(n<30) should capture most probability
    const coeffs = coherentFockCoefficients(4, 0, 40)
    const totalProb = coeffs.reduce((sum, c) => sum + c.re * c.re + c.im * c.im, 0)
    expect(totalProb).toBeCloseTo(1, 2)
    // Mean should be |alpha|² = 16
    const probs = coeffs.map((c) => c.re * c.re + c.im * c.im)
    const mean = probs.reduce((sum, p, n) => sum + n * p, 0)
    expect(mean).toBeCloseTo(16, 1)
  })

  it('variance of coherent state distribution equals |α|²', () => {
    const alpha = 2.0
    const coeffs = coherentFockCoefficients(alpha, 0, 30)
    const probs = coeffs.map((c) => c.re * c.re + c.im * c.im)
    const mean = probs.reduce((sum, p, n) => sum + n * p, 0)
    const meanSq = probs.reduce((sum, p, n) => sum + n * n * p, 0)
    const variance = meanSq - mean * mean
    // Poissonian: variance = mean = |alpha|²
    expect(variance).toBeCloseTo(alpha * alpha, 1)
  })

  it('handles purely imaginary alpha', () => {
    const coeffs = coherentFockCoefficients(0, 1, 10)
    const totalProb = coeffs.reduce((sum, c) => sum + c.re * c.re + c.im * c.im, 0)
    expect(totalProb).toBeCloseTo(1, 4)
    // c_1 should be proportional to i (imaginary alpha)
    expect(coeffs[1]!.im).not.toBeCloseTo(0, 2)
  })
})

// ============================================================================
// squeezedFockCoefficients
// ============================================================================
describe('squeezedFockCoefficients', () => {
  it('returns vacuum state when r = 0', () => {
    const coeffs = squeezedFockCoefficients(0, 0, 6)
    expect(coeffs[0]!.re).toBeCloseTo(1, 10)
    for (let n = 1; n < 6; n++) {
      expect(coeffs[n]!.re).toBeCloseTo(0, 10)
      expect(coeffs[n]!.im).toBeCloseTo(0, 10)
    }
  })

  it('has zero coefficients for odd Fock states', () => {
    const coeffs = squeezedFockCoefficients(0.8, 0, 10)
    for (let n = 0; n < 10; n++) {
      if (n % 2 === 1) {
        expect(coeffs[n]!.re).toBeCloseTo(0, 10)
        expect(coeffs[n]!.im).toBeCloseTo(0, 10)
      }
    }
  })

  it('produces coefficients that approximately sum to 1', () => {
    const coeffs = squeezedFockCoefficients(0.5, 0, 20)
    const totalProb = coeffs.reduce((sum, c) => sum + c.re * c.re + c.im * c.im, 0)
    // With moderate squeeze and 20 terms, should be close to 1
    expect(totalProb).toBeCloseTo(1, 3)
  })

  it('large squeeze r=1.5: coefficients remain finite', () => {
    const coeffs = squeezedFockCoefficients(1.5, 0, 30)
    for (let n = 0; n < 30; n++) {
      expect(Number.isFinite(coeffs[n]!.re)).toBe(true)
      expect(Number.isFinite(coeffs[n]!.im)).toBe(true)
    }
    // Even terms should be nonzero for moderate n
    expect(Math.abs(coeffs[0]!.re)).toBeGreaterThan(0.1)
    expect(Math.abs(coeffs[2]!.re)).toBeGreaterThan(0.01)
  })

  it('squeeze angle theta=pi rotates the phase of coefficients', () => {
    const r = 0.5
    const coeffs0 = squeezedFockCoefficients(r, 0, 10)
    const coeffsPi = squeezedFockCoefficients(r, Math.PI, 10)
    // At theta=0: mu = -tanh(r) (real negative)
    // At theta=pi: mu = +tanh(r) (real positive)
    // c_2 should have different signs
    expect(coeffs0[2]!.re * coeffsPi[2]!.re).toBeLessThan(0)
    // Magnitudes should be equal (same |mu|)
    const mag0 = Math.sqrt(coeffs0[2]!.re ** 2 + coeffs0[2]!.im ** 2)
    const magPi = Math.sqrt(coeffsPi[2]!.re ** 2 + coeffsPi[2]!.im ** 2)
    expect(mag0).toBeCloseTo(magPi, 8)
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

  it('coherent state with large |α| = 5 adapts Fock length to capture the bulk', () => {
    const m = computeSecondQuantMetrics('coherent', {
      n: 0,
      alphaRe: 5,
      alphaIm: 0,
      squeezeR: 0,
      squeezeTheta: 0,
      omega: 1,
    })
    // |alpha|² = 25 → Poisson mean 25, std dev 5. computeSecondQuantMetrics
    // now lengthens the distribution adaptively (mean + 6*sigma + 4 ≈ 59),
    // so the normalization should be essentially exact rather than the
    // pre-fix ~e-22 leakage that happened with the hardcoded maxN=12.
    expect(m.occupation).toBeCloseTo(25, 8)
    expect(m.energy).toBeCloseTo(25.5, 8)
    expect(m.fockDistribution.length).toBeGreaterThan(40)
    const totalProb = m.fockDistribution.reduce((s, p) => s + p, 0)
    expect(totalProb).toBeCloseTo(1, 4)
    // The Poisson peak lives near n=25 — the previous hardcoded maxN=12
    // truncated the distribution before the peak entirely. Confirm the
    // peak is now inside the returned array.
    let peakIdx = 0
    let peakVal = 0
    for (let i = 0; i < m.fockDistribution.length; i++) {
      const v = m.fockDistribution[i] ?? 0
      if (v > peakVal) {
        peakVal = v
        peakIdx = i
      }
    }
    expect(peakIdx).toBeGreaterThan(15)
    expect(peakVal).toBeGreaterThan(0.05)
  })

  it('squeezed state with large r=2 captures the bulk in the adaptive Fock window', () => {
    const m = computeSecondQuantMetrics('squeezed', {
      n: 0,
      alphaRe: 0,
      alphaIm: 0,
      squeezeR: 2,
      squeezeTheta: 0,
      omega: 1,
    })
    // ⟨n⟩ = sinh²(2) ≈ 13.15, but the squeezed-vacuum number-distribution
    // is super-Poissonian: Var(n) = 2·sinh²·cosh² ≈ 372. The adaptive
    // length now uses *that* variance instead of √⟨n⟩, so capture
    // climbs from ~67% (old hardcoded maxN=12) to ≥99%. Two decimal
    // places is the right ceiling at this slider value — we hit the
    // FOCK_MAX_LENGTH cap before fully converging the heavy tail.
    expect(m.fockDistribution.length).toBeGreaterThan(30)
    const totalProb = m.fockDistribution.reduce((s, p) => s + p, 0)
    expect(totalProb).toBeGreaterThan(0.99)
    expect(totalProb).toBeLessThanOrEqual(1.0001)
    // Squeezed vacuum has only even-n components.
    for (let i = 1; i < m.fockDistribution.length; i += 2) {
      expect(m.fockDistribution[i]).toBeCloseTo(0, 10)
    }
  })

  it('Fock distribution length stays bounded even at the slider limits', () => {
    // Drive both alpha and r to the UI maximums (alpha=5+5i, r=3) to make
    // sure the adaptive length never explodes past FOCK_MAX_LENGTH.
    const bigCoherent = computeSecondQuantMetrics('coherent', {
      n: 0,
      alphaRe: 5,
      alphaIm: 5,
      squeezeR: 0,
      squeezeTheta: 0,
      omega: 1,
    })
    expect(bigCoherent.fockDistribution.length).toBeLessThanOrEqual(160)
    expect(bigCoherent.fockDistribution.every((p) => Number.isFinite(p) && p >= 0)).toBe(true)

    const bigSqueezed = computeSecondQuantMetrics('squeezed', {
      n: 0,
      alphaRe: 0,
      alphaIm: 0,
      squeezeR: 3,
      squeezeTheta: 0,
      omega: 1,
    })
    expect(bigSqueezed.fockDistribution.length).toBeLessThanOrEqual(160)
    expect(bigSqueezed.fockDistribution.every((p) => Number.isFinite(p) && p >= 0)).toBe(true)
  })

  it('squeezed state with large r=2 remains finite and physical', () => {
    const m = computeSecondQuantMetrics('squeezed', {
      n: 0,
      alphaRe: 0,
      alphaIm: 0,
      squeezeR: 2.0,
      squeezeTheta: 0,
      omega: 1,
    })
    // <n> = sinh²(2) ≈ 13.15
    expect(m.occupation).toBeCloseTo(Math.sinh(2) ** 2, 4)
    expect(Number.isFinite(m.energy)).toBe(true)
    // Fock distribution should be finite at all indices
    for (const p of m.fockDistribution) {
      expect(Number.isFinite(p)).toBe(true)
      expect(p).toBeGreaterThanOrEqual(0)
    }
    // Only even terms should be nonzero
    for (let i = 0; i < m.fockDistribution.length; i++) {
      if (i % 2 === 1) expect(m.fockDistribution[i]).toBeCloseTo(0, 10)
    }
  })

  it('Heisenberg uncertainty ΔxΔp ≥ 0.5 for all state types', () => {
    const states: Array<{
      mode: 'fock' | 'coherent' | 'squeezed'
      params: Record<string, number>
    }> = [
      { mode: 'fock', params: { n: 0 } },
      { mode: 'fock', params: { n: 5 } },
      { mode: 'coherent', params: { alphaRe: 3, alphaIm: -2 } },
      { mode: 'coherent', params: { alphaRe: 0, alphaIm: 0 } },
      { mode: 'squeezed', params: { squeezeR: 0.5, squeezeTheta: 0 } },
      { mode: 'squeezed', params: { squeezeR: 2.0, squeezeTheta: Math.PI / 3 } },
    ]
    const base = { n: 0, alphaRe: 0, alphaIm: 0, squeezeR: 0, squeezeTheta: 0, omega: 1 }
    for (const { mode, params } of states) {
      const u = computeUncertainties(mode, { ...base, ...params })
      expect(u.product).toBeGreaterThanOrEqual(0.5 - 1e-6)
    }
  })

  it('Robertson-Schrodinger invariant ≥ 0.25 for all states', () => {
    const states: Array<{
      mode: 'fock' | 'coherent' | 'squeezed'
      params: Record<string, number>
    }> = [
      { mode: 'fock', params: { n: 0 } },
      { mode: 'fock', params: { n: 10 } },
      { mode: 'coherent', params: { alphaRe: 5, alphaIm: 3 } },
      { mode: 'squeezed', params: { squeezeR: 1.5, squeezeTheta: Math.PI / 4 } },
    ]
    const base = { n: 0, alphaRe: 0, alphaIm: 0, squeezeR: 0, squeezeTheta: 0, omega: 1 }
    for (const { mode, params } of states) {
      const u = computeUncertainties(mode, { ...base, ...params })
      expect(u.robertsonSchrodinger).toBeGreaterThanOrEqual(0.25 - 1e-6)
    }
  })

  it('sanitizes invalid Fock n values to non-negative integers', () => {
    const negative = computeSecondQuantMetrics('fock', {
      n: -2.4,
      alphaRe: 0,
      alphaIm: 0,
      squeezeR: 0,
      squeezeTheta: 0,
      omega: 1,
    })
    expect(negative.occupation).toBe(0)
    expect(negative.energy).toBeCloseTo(0.5, 10)
    expect(negative.fockDistribution[0]).toBe(1)

    const fractional = computeSecondQuantMetrics('fock', {
      n: 2.9,
      alphaRe: 0,
      alphaIm: 0,
      squeezeR: 0,
      squeezeTheta: 0,
      omega: 1,
    })
    expect(fractional.occupation).toBe(2)
    expect(fractional.energy).toBeCloseTo(2.5, 10)
    expect(fractional.fockDistribution[2]).toBe(1)
  })

  it('exact Fock state with n past the soft display cap still populates its bin', () => {
    // Regression: `chooseFockLength` used to clamp all modes (including
    // exact Fock) at FOCK_MAX_LENGTH=160, so `n = 200` produced an
    // all-zero `fockDistribution` even though the state |200⟩ is
    // perfectly well-defined. The math function no longer soft-caps for
    // mode='fock'; any display-side window cap must happen in the UI.
    const large = computeSecondQuantMetrics('fock', {
      n: 200,
      alphaRe: 0,
      alphaIm: 0,
      squeezeR: 0,
      squeezeTheta: 0,
      omega: 1,
    })
    expect(large.occupation).toBe(200)
    expect(large.energy).toBeCloseTo(200.5, 10)
    expect(large.fockDistribution[200]).toBe(1)
    // Length must be large enough to include the occupied index.
    expect(large.fockDistribution.length).toBeGreaterThan(200)
  })

  it('throws a RangeError for exact Fock n past FOCK_MAX_SAFE_LENGTH', () => {
    // Safety guardrail: without this cap, `n = 1_000_000` would try to
    // allocate a million-entry probability vector and lock the tab before
    // the UI windowing layer could intervene. The math function fails
    // fast so the UI can display an "out of range" state instead of
    // silently triggering memory pressure.
    expect(() =>
      computeSecondQuantMetrics('fock', {
        n: 1_000_000,
        alphaRe: 0,
        alphaIm: 0,
        squeezeR: 0,
        squeezeTheta: 0,
        omega: 1,
      })
    ).toThrow(RangeError)
  })
})
