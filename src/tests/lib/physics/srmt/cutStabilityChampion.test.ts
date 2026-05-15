/**
 * Unit tests for the modular-spectrum rank-window uniformity
 * diagnostic.
 *
 * Note: this diagnostic was originally named "cut-stability" but
 * actually measures rank-window uniformity (see module docstring).
 * The tests focus on what it really does.
 *
 * @module tests/lib/physics/srmt/cutStabilityChampion
 */

import { describe, expect, it } from 'vitest'

import {
  computeCutStability,
  findCutStabilityChampion,
} from '@/lib/physics/srmt/cutStabilityChampion'

function buildSyntheticChi(
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

describe('cut-stability (rank-window uniformity) diagnostic', () => {
  it('returns finite values for an entangled non-degenerate input', () => {
    // Use a 2-mode entangled Gaussian so the Schmidt spectrum has
    // enough non-trivial modes to support a rank-window walk.
    const shape: [number, number, number] = [32, 16, 16]
    const chi = buildSyntheticChi(shape, (i0, i1, _i2) => {
      // Centered correlated Gaussian on (i0, i1) with i2 as a free
      // dimension.
      const cx = (i0 - 16) / 8
      const cy = (i1 - 8) / 4
      const re = Math.exp(-(cx * cx + cy * cy + 0.5 * cx * cy))
      return [re, 0]
    })
    const rates = computeCutStability(chi, shape, 0.1, 1.5, 2.0, 4, 4)
    // At least one clock should produce a finite rate; the other
    // axes may degenerate to NaN depending on rank availability.
    const finiteCount = [rates.a, rates.phi1, rates.phi2].filter(Number.isFinite).length
    expect(finiteCount).toBeGreaterThanOrEqual(1)
    for (const v of [rates.a, rates.phi1, rates.phi2]) {
      if (Number.isFinite(v)) expect(v).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns NaN for axis too short to support windowing', () => {
    const shape: [number, number, number] = [3, 3, 3]
    const chi = new Float32Array(2 * 27)
    chi[0] = 1
    const rates = computeCutStability(chi, shape, 0.1, 1.5, 2.0, 4, 3)
    // a axis (length 3) is too short.
    expect(rates.a).toBeNaN()
  })

  it('findCutStabilityChampion returns null when all rates are NaN', () => {
    expect(
      findCutStabilityChampion({ a: Number.NaN, phi1: Number.NaN, phi2: Number.NaN })
    ).toBeNull()
  })

  it('findCutStabilityChampion picks the clock with smallest stability metric', () => {
    expect(findCutStabilityChampion({ a: 0.1, phi1: 1.0, phi2: 1.5 })).toBe('a')
    expect(findCutStabilityChampion({ a: 1.5, phi1: 0.3, phi2: 1.0 })).toBe('phi1')
  })
})
