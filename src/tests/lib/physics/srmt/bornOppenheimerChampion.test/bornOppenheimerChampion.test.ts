/**
 * Unit tests for the Born-Oppenheimer cross-diagnostic.
 *
 * @module tests/lib/physics/srmt/bornOppenheimerChampion
 */

import { describe, expect, it } from 'vitest'

import {
  computeBornOppenheimerRates,
  findBornOppenheimerChampion,
} from '@/lib/physics/srmt/bornOppenheimerChampion'

function buildChi(
  shape: [number, number, number],
  fn: (i0: number, i1: number, i2: number) => [number, number]
): Float32Array {
  const [N0, N1, N2] = shape
  const out = new Float32Array(2 * N0 * N1 * N2)
  for (let i0 = 0; i0 < N0; i0++) {
    for (let i1 = 0; i1 < N1; i1++) {
      for (let i2 = 0; i2 < N2; i2++) {
        const [re, im] = fn(i0, i1, i2)
        const idx = 2 * (i0 * N1 * N2 + i1 * N2 + i2)
        out[idx] = re
        out[idx + 1] = im
      }
    }
  }
  return out
}

describe('Born-Oppenheimer cross-diagnostic', () => {
  it('pure heavy-WKB phase along axis 0 has zero residual infidelity along that axis', () => {
    // χ(i0, i1, i2) = e^{i k i0} · g(i1, i2) — heavy phase depends only
    // on i0, light envelope independent of i0. Dividing out the
    // reference phase at (i1=0, i2=0, i0=t) cancels e^{i k t},
    // leaving the same g(i1, i2) for every t → residual infidelity
    // along axis 0 is 0.
    const shape: [number, number, number] = [8, 8, 8]
    const k = 0.7
    const chi = buildChi(shape, (i0, i1, i2) => {
      const phase = k * i0
      const envelope = Math.exp(-((i1 - 4) ** 2 + (i2 - 4) ** 2) / 8)
      return [envelope * Math.cos(phase), envelope * Math.sin(phase)]
    })
    const rates = computeBornOppenheimerRates(chi, shape)
    // BO infidelity along axis 0 should be ~0 (pure WKB factorisation).
    expect(rates.a).toBeLessThan(0.05)
  })

  it('returns finite rates in [0, 1] for a structured input', () => {
    const shape: [number, number, number] = [8, 8, 8]
    const chi = buildChi(shape, (i0, i1, i2) => {
      const phase = 0.3 * i0 + 0.2 * i1
      const envelope = Math.exp(-((i2 - 4) ** 2) / 4)
      return [envelope * Math.cos(phase), envelope * Math.sin(phase)]
    })
    const rates = computeBornOppenheimerRates(chi, shape)
    for (const v of [rates.a, rates.phi1, rates.phi2]) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1.000001)
    }
  })

  it('findBornOppenheimerChampion picks the clock with smallest infidelity', () => {
    expect(findBornOppenheimerChampion({ a: 0.01, phi1: 0.5, phi2: 0.7 })).toBe('a')
    expect(findBornOppenheimerChampion({ a: 0.5, phi1: 0.02, phi2: 0.7 })).toBe('phi1')
  })

  it('does not score Born-Oppenheimer drift across zero-probability clock slices', () => {
    const shape: [number, number, number] = [6, 6, 6]
    const chi = buildChi(shape, (i0) => (i0 === 0 ? [1, 0] : [0, 0]))
    const rates = computeBornOppenheimerRates(chi, shape)

    expect(rates.a).toBeNaN()
    expect(findBornOppenheimerChampion(rates)).toBeNull()
  })

  it('findBornOppenheimerChampion returns null on a tie within tolerance', () => {
    expect(findBornOppenheimerChampion({ a: 0.5, phi1: 0.5 * 1.001, phi2: 0.7 })).toBeNull()
  })

  it('findBornOppenheimerChampion returns null when any rate is non-finite', () => {
    expect(findBornOppenheimerChampion({ a: 0.5, phi1: Number.NaN, phi2: 0.3 })).toBeNull()
  })
})
