import { describe, expect, it } from 'vitest'

import {
  clampFiniteOrFallback,
  normalizeCosineVector,
} from '@/stores/utils/presetNormalizationShared'

describe('clampFiniteOrFallback', () => {
  it('returns fallback for NaN', () => {
    expect(clampFiniteOrFallback(NaN, 0, 10, 99)).toBe(99)
  })

  it('returns fallback for Infinity', () => {
    expect(clampFiniteOrFallback(Infinity, 0, 10, 99)).toBe(99)
  })

  it('returns fallback for -Infinity', () => {
    expect(clampFiniteOrFallback(-Infinity, 0, 10, 99)).toBe(99)
  })

  it('returns fallback for non-number types', () => {
    expect(clampFiniteOrFallback('hello', 0, 10, 99)).toBe(99)
    expect(clampFiniteOrFallback(null, 0, 10, 99)).toBe(99)
    expect(clampFiniteOrFallback(undefined, 0, 10, 99)).toBe(99)
    expect(clampFiniteOrFallback(true, 0, 10, 99)).toBe(99)
    expect(clampFiniteOrFallback({}, 0, 10, 99)).toBe(99)
  })
})

describe('normalizeCosineVector', () => {
  it('clamps elements to [0, 2]', () => {
    const result = normalizeCosineVector([-1, 3, 1], [0.5, 0.5, 0.5])
    expect(result).toEqual([0, 2, 1])
  })

  it('returns fallback for non-array input', () => {
    const fallback: [number, number, number] = [0.1, 0.2, 0.3]
    expect(normalizeCosineVector('not an array', fallback)).toEqual(fallback)
    expect(normalizeCosineVector(42, fallback)).toEqual(fallback)
    expect(normalizeCosineVector(null, fallback)).toEqual(fallback)
  })

  it('returns fallback for array of wrong length', () => {
    const fallback: [number, number, number] = [0.1, 0.2, 0.3]
    expect(normalizeCosineVector([1, 2], fallback)).toEqual(fallback)
    expect(normalizeCosineVector([1, 2, 3, 4], fallback)).toEqual(fallback)
    expect(normalizeCosineVector([], fallback)).toEqual(fallback)
  })

  it('uses element-level fallback for non-finite elements', () => {
    const fallback: [number, number, number] = [0.1, 0.2, 0.3]
    const result = normalizeCosineVector([NaN, 1.0, 'x'], fallback)
    expect(result).toEqual([0.1, 1.0, 0.3])
  })
})
