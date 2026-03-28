import { describe, expect, it } from 'vitest'

import {
  classifyLocalization,
  computeLevelSpacing,
  type LevelSpacingResult,
} from '@/lib/physics/tdse/levelSpacing'

describe('computeLevelSpacing', () => {
  it('computes unfolded spacings from sorted energies', () => {
    // Equally spaced: spacings all = 1 after unfolding
    const result = computeLevelSpacing([1, 2, 3, 4, 5])
    expect(result.spacings).toHaveLength(4)
    for (const s of result.spacings) {
      expect(s).toBeCloseTo(1.0, 10)
    }
    expect(result.meanSpacing).toBeCloseTo(1.0, 10)
  })

  it('sorts energies before computing spacings', () => {
    const result = computeLevelSpacing([5, 1, 3, 2, 4])
    expect(result.energies).toEqual([1, 2, 3, 4, 5])
  })

  it('returns high β for equally-spaced levels (rigid, not Poisson)', () => {
    // Harmonic oscillator: E_n = (n + 0.5)ω — perfectly regular spacing
    // Constant spacings are NOT Poisson (which predicts exponential gaps).
    // They have maximum level rigidity, similar to Wigner-Dyson or higher β.
    const energies = Array.from({ length: 20 }, (_, n) => (n + 0.5) * 1.0)
    const result = computeLevelSpacing(energies)
    expect(result.brodyBeta).toBeGreaterThan(0.5)
  })

  it('classifies Wigner-distributed levels as wigner-dyson (chaotic)', () => {
    // Generate spacings from Wigner surmise: P(s) = (π/2)s·exp(-πs²/4)
    // CDF: F(s) = 1 - exp(-πs²/4), so s = sqrt(-4·ln(1-u)/π)
    const seed = 12345
    const N = 50
    const energies: number[] = [0]
    let rng = seed
    for (let i = 1; i < N; i++) {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff
      const u = rng / 0x7fffffff
      const s = Math.sqrt((-4 * Math.log(1 - u * 0.999)) / Math.PI)
      energies.push(energies[i - 1]! + s)
    }
    const result = computeLevelSpacing(energies)
    expect(result.brodyBeta).toBeGreaterThan(0.5)
    expect(result.classification).not.toBe('poisson')
  })

  it('handles minimum 3 energies', () => {
    const result = computeLevelSpacing([1, 3, 6])
    expect(result.spacings).toHaveLength(2)
    expect(result.meanSpacing).toBeCloseTo(2.5, 10)
    expect(result.brodyBeta).toBeGreaterThanOrEqual(0)
    expect(result.brodyBeta).toBeLessThanOrEqual(1)
  })

  it('returns NaN meanIPR when no IPRs provided', () => {
    const result = computeLevelSpacing([1, 2, 3])
    expect(result.meanIPR).toBeNaN()
  })

  it('computes mean IPR when provided', () => {
    const result = computeLevelSpacing([1, 2, 3], [0.1, 0.2, 0.3])
    expect(result.meanIPR).toBeCloseTo(0.2, 10)
  })

  it('classifies Poisson-distributed levels correctly', () => {
    // Generate exponential spacings: P(s) = exp(-s), CDF = 1 - exp(-s)
    // Inverse CDF: s = -ln(1-u)
    const seed = 54321
    const N = 60
    const energies: number[] = [0]
    let rng = seed
    for (let i = 1; i < N; i++) {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff
      const u = rng / 0x7fffffff
      const s = -Math.log(1 - u * 0.999) // Exponential spacing
      energies.push(energies[i - 1]! + s)
    }
    const result = computeLevelSpacing(energies)
    expect(result.brodyBeta).toBeLessThan(0.4)
    expect(result.classification).toBe('poisson')
  })

  it('classification thresholds are consistent', () => {
    const checkClassification = (r: LevelSpacingResult) => {
      if (r.brodyBeta < 0.3) expect(r.classification).toBe('poisson')
      else if (r.brodyBeta > 0.7) expect(r.classification).toBe('wigner-dyson')
      else expect(r.classification).toBe('intermediate')
    }

    // Intermediate case: mix of regular and irregular
    const mixed = computeLevelSpacing([0, 1, 2.5, 3, 5, 6, 8.2, 9, 11, 12])
    checkClassification(mixed)
  })
})

describe('classifyLocalization', () => {
  it('classifies extended states (low IPR × N)', () => {
    expect(classifyLocalization(1 / 1000, 1000)).toBe('extended')
  })

  it('classifies localized states (high IPR × N)', () => {
    expect(classifyLocalization(0.5, 100)).toBe('localized')
  })

  it('classifies critical states (intermediate IPR × N)', () => {
    expect(classifyLocalization(5 / 1000, 1000)).toBe('critical')
  })

  it('handles NaN IPR as critical', () => {
    expect(classifyLocalization(NaN, 1000)).toBe('critical')
  })

  it('handles zero totalSites as critical', () => {
    expect(classifyLocalization(0.1, 0)).toBe('critical')
  })
})
