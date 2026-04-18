/**
 * End-to-end test for `computeSrmtDiagnostic`.
 *
 * Approach: generate a synthetic WdW-like output (χ on a small grid with
 * a plausible spatial profile), run the diagnostic for each of the three
 * clock axes, and assert:
 *   1. Output array lengths agree with the SrmtResult contract:
 *      schmidtValues and kSpectrum both ≤ rankCap; hjSpectrum size =
 *      slice dimension; sliceK has exactly Nphi² entries.
 *   2. The affine-match quality metric is finite and non-negative.
 *   3. The slicePlane tag matches the chosen clock axis.
 *   4. The SRMT clock-preference conjecture cannot be falsified on the
 *      synthetic input: at least one clock produces a DIFFERENT quality
 *      score than the others (proves the metric is not a clock-invariant
 *      constant). We do not test which clock wins on random input — the
 *      physics-based differential is a Phase-3 result.
 */

import { describe, expect, it } from 'vitest'

import { computeSrmtDiagnostic } from '@/lib/physics/srmt/diagnostic'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'

/** Deterministic LCG. */
function lcgRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/** Build a synthetic WdW-like output on a small grid. */
function makeSyntheticOutput(Na: number, Nphi: number): WheelerDeWittSolverOutput {
  const rng = lcgRng(0x0c0ffee0)
  const slabSize = Nphi * Nphi
  const chi = new Float32Array(2 * Na * slabSize)
  const mask = new Uint8Array(Na * slabSize)
  let maxSq = 0
  for (let ia = 0; ia < Na; ia++) {
    const a = 0.1 + ia * (1.4 / (Na - 1))
    for (let i1 = 0; i1 < Nphi; i1++) {
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi1 = -1.5 + i1 * (3.0 / (Nphi - 1))
        const phi2 = -1.5 + i2 * (3.0 / (Nphi - 1))
        // Amplitude: Gaussian in (a, φ) with a tiny random perturbation.
        const env = Math.exp(-0.5 * (a * a + phi1 * phi1 + phi2 * phi2))
        const phase = 0.3 * a + 0.2 * phi1 + 0.1 * phi2
        const noise = 0.01 * (rng() - 0.5)
        const re = env * Math.cos(phase) + noise
        const im = env * Math.sin(phase) + noise
        const dst = 2 * (ia * slabSize + i1 * Nphi + i2)
        chi[dst] = re
        chi[dst + 1] = im
        const sq = re * re + im * im
        if (sq > maxSq) maxSq = sq
        mask[ia * slabSize + i1 * Nphi + i2] = 1
      }
    }
  }
  return {
    chi,
    lorentzianMask: mask,
    gridSize: [Na, Nphi, Nphi],
    aMin: 0.1,
    aMax: 1.5,
    phiExtent: 1.5,
    maxDensity: maxSq,
  }
}

describe('computeSrmtDiagnostic', () => {
  const Na = 20
  const Nphi = 6
  const output = makeSyntheticOutput(Na, Nphi)
  const rankCap = 12

  it('respects all output array lengths for clock = "a"', () => {
    const result = computeSrmtDiagnostic(output, {
      clock: 'a',
      cutIndex: 10,
      rankCap,
    })
    expect(result.schmidtValues.length).toBeLessThanOrEqual(rankCap)
    expect(result.schmidtValues.length).toBe(result.kSpectrum.length)
    // HJ spectrum is now top-rankCap via Lanczos (length ≤ rankCap, never
    // the full slice dimension Nphi²).
    expect(result.hjSpectrum.length).toBeLessThanOrEqual(rankCap)
    expect(result.hjSpectrum.length).toBeGreaterThan(0)
    expect(result.sliceK.length).toBe(Nphi * Nphi)
    expect(result.slicePlane).toBe('phi-phi')
    expect(Number.isFinite(result.affineMatchQuality)).toBe(true)
    expect(result.affineMatchQuality).toBeGreaterThanOrEqual(0)
  })

  it('respects all output array lengths for clock = "phi1"', () => {
    const result = computeSrmtDiagnostic(output, {
      clock: 'phi1',
      cutIndex: 3,
      rankCap,
    })
    expect(result.schmidtValues.length).toBeLessThanOrEqual(rankCap)
    expect(result.hjSpectrum.length).toBeLessThanOrEqual(rankCap)
    expect(result.hjSpectrum.length).toBeGreaterThan(0)
    expect(result.slicePlane).toBe('a-phi2')
    expect(Number.isFinite(result.affineMatchQuality)).toBe(true)
  })

  it('respects all output array lengths for clock = "phi2"', () => {
    const result = computeSrmtDiagnostic(output, {
      clock: 'phi2',
      cutIndex: 3,
      rankCap,
    })
    expect(result.schmidtValues.length).toBeLessThanOrEqual(rankCap)
    expect(result.hjSpectrum.length).toBeLessThanOrEqual(rankCap)
    expect(result.hjSpectrum.length).toBeGreaterThan(0)
    expect(result.slicePlane).toBe('a-phi1')
  })

  it('produces differing affine-match scores across clock choices (metric is not clock-invariant)', () => {
    const qa = computeSrmtDiagnostic(output, {
      clock: 'a',
      cutIndex: 10,
      rankCap,
    }).affineMatchQuality
    const qp1 = computeSrmtDiagnostic(output, {
      clock: 'phi1',
      cutIndex: 3,
      rankCap,
    }).affineMatchQuality
    const qp2 = computeSrmtDiagnostic(output, {
      clock: 'phi2',
      cutIndex: 3,
      rankCap,
    }).affineMatchQuality
    const maxSpread = Math.max(Math.abs(qa - qp1), Math.abs(qp1 - qp2), Math.abs(qa - qp2))
    expect(maxSpread).toBeGreaterThan(0)
  })

  it('rejects non-positive cutIndex', () => {
    expect(() => computeSrmtDiagnostic(output, { clock: 'a', cutIndex: 0, rankCap })).toThrow(
      /cutIndex/
    )
  })

  it('rejects non-positive rankCap', () => {
    expect(() => computeSrmtDiagnostic(output, { clock: 'a', cutIndex: 5, rankCap: 0 })).toThrow(
      /rankCap/
    )
  })

  it('passes physics context to the HJ operator (non-zero Λ changes spectrum)', () => {
    const zero = computeSrmtDiagnostic(output, {
      clock: 'a',
      cutIndex: 10,
      rankCap,
    })
    const shifted = computeSrmtDiagnostic(
      output,
      { clock: 'a', cutIndex: 10, rankCap },
      { inflatonMass: 0, cosmologicalConstant: 5.0 }
    )
    // Adding Λ shifts U → U' = U − c_U · a² · (8πG/3) · a² · Λ (different
    // by a constant), so each eigenvalue is shifted by the same
    // amount. The two spectra must therefore differ somewhere.
    let diff = 0
    for (let i = 0; i < zero.hjSpectrum.length; i++) {
      diff += Math.abs(zero.hjSpectrum[i]! - shifted.hjSpectrum[i]!)
    }
    expect(diff).toBeGreaterThan(0)
  })
})
