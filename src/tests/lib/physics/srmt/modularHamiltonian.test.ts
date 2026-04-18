/**
 * Tests for the modular-Hamiltonian spectrum derivation.
 *
 * Verifies:
 *   - `K_n = −log(s_n² + ε)` on a hand-checked sequence.
 *   - Monotone non-decreasing when `s_n` is sorted descending.
 *   - ε scales with the dominant Schmidt value² (relative floor).
 *   - Rank-threshold finds the first index where s_r² < τ · s_0².
 *   - Empty input returns empty output.
 */

import { describe, expect, it } from 'vitest'

import { modularSpectrum } from '@/lib/physics/srmt/modularHamiltonian'

describe('modularHamiltonian.modularSpectrum', () => {
  it('computes K_n = −log(s_n² + ε) for a short known sequence', () => {
    // s = [1.0, 0.5, 0.1], s² = [1, 0.25, 0.01].
    // ε = 1e-14 · 1 = 1e-14.
    const schmidt = new Float64Array([1.0, 0.5, 0.1])
    const { spectrum, epsilon } = modularSpectrum(schmidt)
    expect(epsilon).toBeCloseTo(1e-14, 20)
    expect(spectrum[0]!).toBeCloseTo(-Math.log(1.0 + 1e-14), 10)
    expect(spectrum[1]!).toBeCloseTo(-Math.log(0.25 + 1e-14), 10)
    expect(spectrum[2]!).toBeCloseTo(-Math.log(0.01 + 1e-14), 10)
  })

  it('produces a monotone non-decreasing spectrum', () => {
    const schmidt = new Float64Array([5, 3, 2, 1, 0.5, 0.1, 0.01, 0.001])
    const { spectrum } = modularSpectrum(schmidt)
    for (let i = 1; i < spectrum.length; i++) {
      expect(spectrum[i]!).toBeGreaterThanOrEqual(spectrum[i - 1]! - 1e-10)
    }
  })

  it('regularises zeros via epsilon — K stays finite', () => {
    const schmidt = new Float64Array([2, 1, 0, 0])
    const { spectrum, epsilon } = modularSpectrum(schmidt)
    for (const k of spectrum) expect(Number.isFinite(k)).toBe(true)
    // Leading eigenvalue s² = 4 so ε = 1e-14 · 4 = 4e-14. K for s=0 is
    // −log(4e-14) ≈ 30.85.
    expect(spectrum[2]!).toBeCloseTo(-Math.log(epsilon), 6)
    expect(spectrum[3]!).toBeCloseTo(-Math.log(epsilon), 6)
  })

  it('identifies the rank threshold at the first s_n below the relative cutoff', () => {
    const schmidt = new Float64Array([1.0, 0.5, 0.1, 0.01, 0.001])
    // s_n² / s_0² = 1, 0.25, 0.01, 1e-4, 1e-6.
    const { rankThreshold } = modularSpectrum(schmidt, 5e-3)
    expect(rankThreshold).toBe(3) // s_3² = 1e-4 < 5e-3
  })

  it('returns rankThreshold === length when no index falls below the cutoff', () => {
    const schmidt = new Float64Array([1, 0.95, 0.9, 0.85])
    const { rankThreshold } = modularSpectrum(schmidt, 1e-3)
    expect(rankThreshold).toBe(4)
  })

  it('handles empty input', () => {
    const { spectrum, epsilon, rankThreshold } = modularSpectrum(new Float64Array(0))
    expect(spectrum.length).toBe(0)
    expect(epsilon).toBe(0)
    expect(rankThreshold).toBe(0)
  })
})
