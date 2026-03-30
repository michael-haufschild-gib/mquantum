/**
 * Tests for Kaluza-Klein compactification utilities.
 */

import { describe, expect, it } from 'vitest'

import {
  buildCompactDimsMask,
  computeEffectiveSpacing,
  computeKKSpectrum,
} from '@/lib/physics/compactification'

describe('computeEffectiveSpacing', () => {
  it('returns original spacing when no dimensions are compact', () => {
    const result = computeEffectiveSpacing(
      [64, 64, 64],
      [0.1, 0.1, 0.1],
      [false, false, false],
      [1.0, 1.0, 1.0],
      3
    )
    expect(result).toEqual([0.1, 0.1, 0.1])
  })

  it('overrides spacing for compact dimensions with 2πR/N', () => {
    const R = 0.5
    const N = 64
    const expected = (2 * Math.PI * R) / N

    const result = computeEffectiveSpacing(
      [N, N, N],
      [0.1, 0.1, 0.1],
      [false, true, false],
      [1.0, R, 1.0],
      3
    )

    expect(result[0]).toBe(0.1)
    expect(result[1]).toBeCloseTo(expected, 10)
    expect(result[2]).toBe(0.1)
  })

  it('clamps compact radius to minimum 0.01', () => {
    const result = computeEffectiveSpacing(
      [32],
      [0.1],
      [true],
      [0.001], // below minimum
      1
    )
    // Should use R = 0.01, not 0.001
    expect(result[0]).toBeCloseTo((2 * Math.PI * 0.01) / 32, 10)
  })

  it('handles undefined compactDims/compactRadii gracefully', () => {
    const result = computeEffectiveSpacing([64, 64], [0.2, 0.3], undefined, undefined, 2)
    expect(result).toEqual([0.2, 0.3])
  })

  it('handles mixed compact and extended in higher dimensions', () => {
    const result = computeEffectiveSpacing(
      [32, 32, 32, 32, 32],
      [0.1, 0.1, 0.1, 0.1, 0.1],
      [false, false, false, true, true],
      [1.0, 1.0, 1.0, 0.2, 0.5],
      5
    )
    expect(result[0]).toBe(0.1)
    expect(result[3]).toBeCloseTo((2 * Math.PI * 0.2) / 32, 10)
    expect(result[4]).toBeCloseTo((2 * Math.PI * 0.5) / 32, 10)
  })
})

describe('buildCompactDimsMask', () => {
  it('returns 0 when no dimensions are compact', () => {
    expect(buildCompactDimsMask([false, false, false], 3)).toBe(0)
  })

  it('sets correct bits for compact dimensions', () => {
    // Dim 0 and 2 compact → bits 0 and 2 → 0b101 = 5
    expect(buildCompactDimsMask([true, false, true], 3)).toBe(5)
  })

  it('returns 0 for undefined compactDims', () => {
    expect(buildCompactDimsMask(undefined, 3)).toBe(0)
  })

  it('respects latticeDim boundary', () => {
    // compactDims has 5 entries but latticeDim is 3 — only first 3 count
    expect(buildCompactDimsMask([true, false, true, true, true], 3)).toBe(5)
  })

  it('handles all compact dimensions', () => {
    expect(buildCompactDimsMask([true, true, true], 3)).toBe(7)
  })
})

describe('computeKKSpectrum', () => {
  it('returns correct number of levels', () => {
    const levels = computeKKSpectrum(1.0, 1.0, 1.0, 5)
    expect(levels).toHaveLength(6) // n = 0..5
  })

  it('has zero energy for n=0', () => {
    const levels = computeKKSpectrum(1.0, 1.0, 1.0, 3)
    expect(levels[0]!.n).toBe(0)
    expect(levels[0]!.energy).toBe(0)
  })

  it('computes E_n = (nℏ)²/(2mR²)', () => {
    const R = 0.5
    const hbar = 1.0
    const mass = 2.0
    const levels = computeKKSpectrum(R, hbar, mass, 3)

    for (const { n, energy } of levels) {
      const expected = (n * hbar) ** 2 / (2 * mass * R * R)
      expect(energy).toBeCloseTo(expected, 10)
    }
  })

  it('produces quadratically growing spectrum', () => {
    const levels = computeKKSpectrum(1.0, 1.0, 1.0, 4)
    // E_n ∝ n² → ratios should be 0:1:4:9:16
    expect(levels[1]!.energy).toBeGreaterThan(0)
    expect(levels[2]!.energy / levels[1]!.energy).toBeCloseTo(4, 5)
    expect(levels[3]!.energy / levels[1]!.energy).toBeCloseTo(9, 5)
    expect(levels[4]!.energy / levels[1]!.energy).toBeCloseTo(16, 5)
  })

  it('smaller R gives larger mass gap', () => {
    const small = computeKKSpectrum(0.1, 1.0, 1.0, 1)
    const large = computeKKSpectrum(10.0, 1.0, 1.0, 1)
    expect(small[1]!.energy).toBeGreaterThan(large[1]!.energy)
  })
})
