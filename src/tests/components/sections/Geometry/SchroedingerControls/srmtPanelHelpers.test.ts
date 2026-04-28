/**
 * Tests for the SRMT spectrum panel helpers.
 *
 * `qualityTier` decides the chip color (green/yellow/red/grey) for each
 * clock row in the SRMT diagnostic panel. The bin boundaries (0.1, 0.3)
 * are user-visible: a regression that flips them silently mislabels every
 * physics result. `countCompletedClocks` gates the "Computing N/3" UI
 * indicator and the champion highlight; missing the NaN check would let
 * pending-state placeholders read as completed clocks. `selectChampionClock`
 * is a thin delegate to the shared library — verified to share the same
 * tolerance as the worker telemetry path.
 */

import { describe, expect, it } from 'vitest'

import {
  countCompletedClocks,
  qualityTier,
  selectChampionClock,
} from '@/components/sections/Geometry/SchroedingerControls/srmtPanelHelpers'

describe('qualityTier', () => {
  it('returns "good" for q < 0.1', () => {
    expect(qualityTier(0)).toBe('good')
    expect(qualityTier(0.05)).toBe('good')
    expect(qualityTier(0.099)).toBe('good')
  })

  it('returns "marginal" for 0.1 ≤ q < 0.3', () => {
    expect(qualityTier(0.1)).toBe('marginal') // boundary: not "good"
    expect(qualityTier(0.2)).toBe('marginal')
    expect(qualityTier(0.299)).toBe('marginal')
  })

  it('returns "poor" for q ≥ 0.3', () => {
    expect(qualityTier(0.3)).toBe('poor') // boundary: not "marginal"
    expect(qualityTier(1.0)).toBe('poor')
    expect(qualityTier(99)).toBe('poor')
  })

  it('returns "pending" for non-finite q (NaN, ±Infinity)', () => {
    // Regression guard: cross-clock placeholders use NaN; a missing finite
    // check would flash the good-green chip before the worker reply lands.
    expect(qualityTier(NaN)).toBe('pending')
    expect(qualityTier(Infinity)).toBe('pending')
    expect(qualityTier(-Infinity)).toBe('pending')
  })

  it('handles negative quality (treated as good — lower is better)', () => {
    // The contract is "lower q = better". Negative qualities are nonphysical
    // but should still tier as "good" so the panel doesn't crash on them.
    expect(qualityTier(-0.5)).toBe('good')
  })
})

describe('countCompletedClocks', () => {
  it('counts only clocks with finite quality', () => {
    expect(countCompletedClocks({ a: 0.1, phi1: 0.2, phi2: 0.3 })).toBe(3)
    expect(countCompletedClocks({ a: 0.1, phi1: NaN, phi2: 0.3 })).toBe(2)
    expect(countCompletedClocks({ a: NaN, phi1: NaN, phi2: 0.3 })).toBe(1)
    expect(countCompletedClocks({ a: NaN, phi1: NaN, phi2: NaN })).toBe(0)
  })

  it('treats Infinity as not completed (consistent with qualityTier→pending)', () => {
    expect(countCompletedClocks({ a: Infinity, phi1: 0.1, phi2: 0.2 })).toBe(2)
    expect(countCompletedClocks({ a: -Infinity, phi1: 0.1, phi2: 0.2 })).toBe(2)
  })

  it('counts 0 quality as completed (zero is a valid finite value)', () => {
    expect(countCompletedClocks({ a: 0, phi1: 0, phi2: 0 })).toBe(3)
  })

  it('treats negative qualities as completed (still finite)', () => {
    expect(countCompletedClocks({ a: -0.1, phi1: -1.0, phi2: 0.5 })).toBe(3)
  })
})

describe('selectChampionClock', () => {
  it('returns the clock with minimum quality when leader margin exceeds tolerance', () => {
    expect(selectChampionClock({ a: 0.01, phi1: 0.5, phi2: 0.5 })).toBe('a')
    expect(selectChampionClock({ a: 0.5, phi1: 0.01, phi2: 0.5 })).toBe('phi1')
    expect(selectChampionClock({ a: 0.5, phi1: 0.5, phi2: 0.01 })).toBe('phi2')
  })

  it('returns null when any clock has non-finite quality (NaN)', () => {
    expect(selectChampionClock({ a: NaN, phi1: 0.1, phi2: 0.2 })).toBeNull()
  })

  it('returns null when top two clocks are within DEFAULT_CHAMPION_TIE_TOLERANCE (0.02)', () => {
    // Margin = 0.005 < tolerance 0.02 → tie, no champion declared.
    expect(selectChampionClock({ a: 0.1, phi1: 0.105, phi2: 0.5 })).toBeNull()
  })

  it('declares a champion when leader margin clearly exceeds tolerance', () => {
    // Margin = 0.05 > tolerance 0.02 → 'a' wins.
    expect(selectChampionClock({ a: 0.1, phi1: 0.15, phi2: 0.5 })).toBe('a')
  })
})
