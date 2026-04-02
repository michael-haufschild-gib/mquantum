import { describe, expect, it } from 'vitest'

import {
  clampFiniteOrFallback,
  clampToRange,
  normalizeCosineVector,
} from '@/stores/utils/presetNormalizationShared'

describe('clampToRange', () => {
  it('returns the value when within range', () => {
    expect(clampToRange(5, 0, 10)).toBe(5)
  })

  it('clamps to min when below', () => {
    expect(clampToRange(-3, 0, 10)).toBe(0)
  })

  it('clamps to max when above', () => {
    expect(clampToRange(15, 0, 10)).toBe(10)
  })

  it('returns min when value equals min', () => {
    expect(clampToRange(0, 0, 10)).toBe(0)
  })

  it('returns max when value equals max', () => {
    expect(clampToRange(10, 0, 10)).toBe(10)
  })

  it('handles negative ranges', () => {
    expect(clampToRange(-5, -10, -1)).toBe(-5)
    expect(clampToRange(-15, -10, -1)).toBe(-10)
    expect(clampToRange(0, -10, -1)).toBe(-1)
  })
})

describe('clampFiniteOrFallback', () => {
  it('returns the clamped value for a finite number', () => {
    expect(clampFiniteOrFallback(5, 0, 10, 99)).toBe(5)
  })

  it('clamps a finite number to range', () => {
    expect(clampFiniteOrFallback(15, 0, 10, 99)).toBe(10)
  })

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
  it('returns the vector when valid and within range', () => {
    const result = normalizeCosineVector([0.5, 1.0, 1.5], [0, 0, 0])
    expect(result).toEqual([0.5, 1.0, 1.5])
  })

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
