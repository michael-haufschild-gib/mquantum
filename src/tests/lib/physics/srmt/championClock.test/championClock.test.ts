/**
 * Tests for SRMT champion-clock selection.
 *
 * `findChampionClock` was extracted from two byte-identical inline copies
 * (worker dispatcher + UI panel) — keeping it tested ensures the worker
 * telemetry and the highlighted-row UI never disagree. The selection
 * inverts the more-is-better intuition (LOWER quality = better fit) and
 * uses a strict-less-than tie-tolerance gate, which is exactly the kind
 * of two-line function that silently flips polarity in a refactor.
 */

import { describe, expect, it } from 'vitest'

import {
  type ClockQualityRecord,
  DEFAULT_CHAMPION_TIE_TOLERANCE,
  findChampionClock,
} from '@/lib/physics/srmt/championClock'

describe('findChampionClock', () => {
  it('picks the clock with the minimum quality (lower = better)', () => {
    expect(findChampionClock({ a: 0.01, phi1: 0.5, phi2: 0.7 })).toBe('a')
    expect(findChampionClock({ a: 0.5, phi1: 0.01, phi2: 0.7 })).toBe('phi1')
    expect(findChampionClock({ a: 0.5, phi1: 0.7, phi2: 0.01 })).toBe('phi2')
  })

  it('returns null when fewer than three clocks have finite quality', () => {
    expect(findChampionClock({ a: NaN, phi1: 0.1, phi2: 0.2 })).toBeNull()
    expect(findChampionClock({ a: 0.1, phi1: Infinity, phi2: 0.2 })).toBeNull()
    expect(findChampionClock({ a: 0.1, phi1: 0.2, phi2: -Infinity })).toBeNull()
  })

  it('returns null when the leader margin is below tieTolerance', () => {
    // Default tolerance = 0.02 — these three are within 0.01 of each other.
    expect(findChampionClock({ a: 0.5, phi1: 0.51, phi2: 0.515 })).toBeNull()
  })

  it('declares a champion when leader margin clearly exceeds tieTolerance', () => {
    // Source: `if (second.q - best.q < tieTolerance) return null`. Use a
    // margin well above the tolerance to dodge FP rounding (0.12 - 0.10 in
    // f64 is 0.01999... < 0.02 → returns null even though the algebra is
    // 0.02). This pins the contract direction: clear-margin → champion.
    const result = findChampionClock({ a: 0.1, phi1: 0.15, phi2: 0.5 })
    expect(result).toBe('a')
  })

  it('returns null when margin is strictly less than tieTolerance', () => {
    // 0.019 < 0.02 ⇒ tie
    expect(findChampionClock({ a: 0.1, phi1: 0.119, phi2: 0.5 })).toBeNull()
  })

  it('respects custom tieTolerance', () => {
    // Margin = 0.05; with default tolerance (0.02) this is a champion.
    expect(findChampionClock({ a: 0.1, phi1: 0.15, phi2: 0.5 })).toBe('a')
    // With tolerance 0.10, the same input is a tie (0.05 < 0.10).
    expect(findChampionClock({ a: 0.1, phi1: 0.15, phi2: 0.5 }, 0.1)).toBeNull()
  })

  it('does not consider non-leader pairs for tie tolerance (only leader vs runner-up)', () => {
    // best = 0.01 (a), second = 0.5 (phi1), third = 0.51 (phi2)
    // The 0.01 gap between phi1 and phi2 is irrelevant; champion = a.
    expect(findChampionClock({ a: 0.01, phi1: 0.5, phi2: 0.51 })).toBe('a')
  })

  it('handles all-equal qualities as a tie (returns null)', () => {
    expect(findChampionClock({ a: 0.5, phi1: 0.5, phi2: 0.5 })).toBeNull()
  })

  it('handles two clocks tied for first (returns null because best vs second margin is 0)', () => {
    expect(findChampionClock({ a: 0.1, phi1: 0.1, phi2: 0.5 })).toBeNull()
  })

  it('treats negative qualities consistently (lower is still better)', () => {
    expect(findChampionClock({ a: -0.5, phi1: 0.1, phi2: 0.2 })).toBe('a')
    // Margin = 0.6 ⇒ champion is `a`.
  })

  it('exports the documented default tolerance constant', () => {
    expect(DEFAULT_CHAMPION_TIE_TOLERANCE).toBe(0.02)
  })

  it('does not mutate the input record', () => {
    const input: ClockQualityRecord = { a: 0.5, phi1: 0.1, phi2: 0.7 }
    const snapshot = { ...input }
    findChampionClock(input)
    expect(input).toEqual(snapshot)
  })

  it('returns null when ALL three are non-finite', () => {
    expect(findChampionClock({ a: NaN, phi1: NaN, phi2: NaN })).toBeNull()
    expect(findChampionClock({ a: Infinity, phi1: Infinity, phi2: Infinity })).toBeNull()
  })

  it('zero tolerance: any positive margin declares a champion; zero margin still declares one (strict-less-than gate)', () => {
    // tolerance = 0; margin = 0 ⇒ 0 < 0 is false ⇒ returns best ('a').
    // The two values are bit-identical so sort is stable and 'a' is the
    // first inserted entry. This documents (not validates) a quirk of
    // the strict-less-than tolerance gate at zero.
    expect(findChampionClock({ a: 0.1, phi1: 0.1, phi2: 0.5 }, 0)).toBe('a')
    expect(findChampionClock({ a: 0.1, phi1: 0.11, phi2: 0.5 }, 0)).toBe('a')
  })
})
