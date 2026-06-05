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
import { modularSpectrum } from '@/lib/physics/srmt/modularHamiltonian'

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

function buildDiagonalChi(shape: [number, number, number], singularValues: number[]): Float32Array {
  const [Na, Nphi1, Nphi2] = shape
  const cols = Nphi1 * Nphi2
  const out = new Float32Array(2 * Na * cols)
  for (let i = 0; i < Math.min(Na, cols, singularValues.length); i++) {
    out[2 * (i * cols + i)] = singularValues[i]!
  }
  return out
}

function buildPhi2DiagonalChi(
  shape: [number, number, number],
  singularValues: number[]
): Float32Array {
  const [Na, Nphi1, Nphi2] = shape
  const out = new Float32Array(2 * Na * Nphi1 * Nphi2)
  for (let i = 0; i < Math.min(Nphi2, Na * Nphi1, singularValues.length); i++) {
    const ia = Math.floor(i / Nphi1)
    const i1 = i % Nphi1
    const i2 = i
    const idx = 2 * (ia * Nphi1 * Nphi2 + i1 * Nphi2 + i2)
    out[idx] = singularValues[i]!
  }
  return out
}

function manualWindowUniformity(
  singularValues: number[],
  rankCap: number,
  starts: number[]
): number {
  const norm = Math.sqrt(singularValues.reduce((acc, value) => acc + value * value, 0))
  const schmidt = singularValues.map((value) => value / norm)
  const windows = starts.map((start) => {
    const trimmed = new Float64Array(rankCap)
    for (let i = 0; i < rankCap; i++) trimmed[i] = schmidt[start + i]!
    return modularSpectrum(trimmed).spectrum
  })
  let refMaxK = 0
  for (const value of windows[0]!) refMaxK = Math.max(refMaxK, Math.abs(value))
  if (!(refMaxK > 0)) refMaxK = 1

  let acc = 0
  for (let i = 0; i < windows.length - 1; i++) {
    let dist = 0
    for (let j = 0; j < rankCap; j++) {
      const d = windows[i]![j]! - windows[i + 1]![j]!
      dist += d * d
    }
    acc += Math.sqrt(dist) / refMaxK
  }
  return acc / (windows.length - 1)
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

  it('does not duplicate rank-window starts when spectrum barely clears rankCap', () => {
    const shape: [number, number, number] = [6, 3, 2]
    const singularValues = [1, 0.48, 0.22, 0.11, 0.045, 0.018]
    const chi = buildDiagonalChi(shape, singularValues)

    const rates = computeCutStability(chi, shape, 0.1, 1.5, 2.0, 4, 5)
    const expected = manualWindowUniformity(singularValues, 4, [0, 1, 2])

    expect(rates.a).toBeCloseTo(expected, 8)
  })

  it('uses the actual phi2 axis length on rectangular phi grids', () => {
    const shape: [number, number, number] = [6, 2, 6]
    const chi = buildPhi2DiagonalChi(shape, [1, 0.48, 0.22, 0.11, 0.045, 0.018])

    const rates = computeCutStability(chi, shape, 0.1, 1.5, 2.0, 4, 5)

    expect(rates.phi1).toBeNaN()
    expect(rates.phi2).toBeGreaterThanOrEqual(0)
  })
})
