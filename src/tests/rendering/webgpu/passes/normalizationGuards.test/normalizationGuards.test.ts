import { describe, expect, it } from 'vitest'

import {
  finiteNonNegativeReadbackOrZero,
  finiteReadbackOrZero,
  finiteReadbackRatioOrZero,
  finiteUnitReadbackRatioOrZero,
  isFinitePositiveNorm,
  MAX_SAFE_RENORMALIZE_NORM,
  smoothPositiveReadbackPeak,
} from '@/rendering/webgpu/passes/normalizationGuards'

describe('normalizationGuards', () => {
  it('limits renormalization norms to finite positive values below the safety cap', () => {
    expect(isFinitePositiveNorm(1)).toBe(true)
    expect(isFinitePositiveNorm(0)).toBe(false)
    expect(isFinitePositiveNorm(Number.NaN)).toBe(false)
    expect(isFinitePositiveNorm(Number.POSITIVE_INFINITY)).toBe(false)
    expect(isFinitePositiveNorm(MAX_SAFE_RENORMALIZE_NORM)).toBe(false)
  })

  it('sanitizes finite and non-negative GPU readback scalars', () => {
    expect(finiteReadbackOrZero(-2)).toBe(-2)
    expect(finiteReadbackOrZero(Number.NaN)).toBe(0)
    expect(finiteNonNegativeReadbackOrZero(3)).toBe(3)
    expect(finiteNonNegativeReadbackOrZero(-1)).toBe(0)
    expect(finiteNonNegativeReadbackOrZero(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('computes finite ratios without allowing NaN or Inf through', () => {
    expect(finiteReadbackRatioOrZero(3, 2)).toBe(1.5)
    expect(finiteReadbackRatioOrZero(3, 0)).toBe(0)
    expect(finiteReadbackRatioOrZero(Number.POSITIVE_INFINITY, 2)).toBe(0)
    expect(finiteUnitReadbackRatioOrZero(3, 2)).toBe(1)
    expect(finiteUnitReadbackRatioOrZero(-1, 2)).toBe(0)
  })

  it('smooths positive peaks while sanitizing poisoned state', () => {
    expect(smoothPositiveReadbackPeak(1, 2)).toBe(2)
    expect(smoothPositiveReadbackPeak(2, 1)).toBeCloseTo(1.6)
    expect(smoothPositiveReadbackPeak(Number.POSITIVE_INFINITY, 1)).toBe(1)
    expect(smoothPositiveReadbackPeak(2, Number.NaN)).toBe(2)
  })
})
