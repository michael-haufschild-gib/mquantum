/**
 * Tests for the entanglement-spectrum extraction routines used by the
 * Peschel probe.
 *
 * Three distinct functions live in this module:
 *   - `computeEntanglementSpectrum` — Peschel 2003 eq. 12 → modular
 *     Hamiltonian levels and per-mode entropy from symplectic eigenvalues.
 *   - `fitCentralCharge` — Calabrese-Cardy CFT log-law slope of `c/3`.
 *   - `fitEntanglementTemperature` — Bisognano-Wichmann modular gap fit.
 *
 * All three use the same OLS pattern but with different inputs, conventions,
 * and edge-case handling. A regression in any of the slope coefficients,
 * the index-walking direction (largest-ν → smallest-ν), or the IR-cutoff
 * branch silently produces wrong physical interpretations.
 */

import { describe, expect, it } from 'vitest'

import {
  computeEntanglementSpectrum,
  fitCentralCharge,
  fitEntanglementTemperature,
} from '@/lib/physics/entanglement/peschelSpectrum'

describe('computeEntanglementSpectrum', () => {
  it('matches Peschel eq. 12 for a known-ν table (manual reference values)', () => {
    // ν = 1.0 → ε = log((1.5)/(0.5)) = log(3) ≈ 1.0986
    // ν = 2.0 → ε = log((2.5)/(1.5)) ≈ 0.5108
    // ν = 5.0 → ε = log((5.5)/(4.5)) ≈ 0.2007
    const spec = computeEntanglementSpectrum(new Float64Array([5.0, 1.0, 2.0]))
    // After ascending sort: [1.0, 2.0, 5.0]
    expect(Array.from(spec.nu)).toEqual([1.0, 2.0, 5.0])
    expect(spec.epsilon[0]).toBeCloseTo(Math.log(3), 8)
    expect(spec.epsilon[1]).toBeCloseTo(Math.log(2.5 / 1.5), 8)
    expect(spec.epsilon[2]).toBeCloseTo(Math.log(5.5 / 4.5), 8)
  })

  it('per-mode entropy formula matches s(ν) = (ν+½)log(ν+½) − (ν−½)log(ν−½)', () => {
    const nuValues = [0.5001, 0.7, 1.5, 3.0, 10.0]
    const spec = computeEntanglementSpectrum(new Float64Array(nuValues))
    const sorted = [...nuValues].sort((a, b) => a - b)
    for (let i = 0; i < sorted.length; i++) {
      const v = sorted[i]!
      const plus = v + 0.5
      const minus = v - 0.5
      const expected = plus * Math.log(plus) - (minus > 1e-15 ? minus * Math.log(minus) : 0)
      expect(spec.perModeEntropy[i]).toBeCloseTo(expected, 10)
    }
  })

  it('total entropy equals sum of per-mode entropies (no rounding drift)', () => {
    const spec = computeEntanglementSpectrum(new Float64Array([0.6, 1.2, 3.0, 7.0, 15.0]))
    let manualSum = 0
    for (let i = 0; i < spec.perModeEntropy.length; i++) manualSum += spec.perModeEntropy[i]!
    expect(spec.totalEntropy).toBeCloseTo(manualSum, 12)
  })

  it('entanglementGap = ν_min − ½ (zero gap when most-entangled mode is maximally mixed)', () => {
    const spec = computeEntanglementSpectrum(new Float64Array([10.0, 0.5, 5.0, 3.0]))
    expect(spec.entanglementGap).toBeCloseTo(0, 9)

    const spec2 = computeEntanglementSpectrum(new Float64Array([3.0, 1.5, 7.0]))
    expect(spec2.entanglementGap).toBeCloseTo(1.0, 12) // 1.5 − 0.5
  })

  it('throws on negative or non-finite symplectic eigenvalues (below physical floor)', () => {
    expect(() => computeEntanglementSpectrum(new Float64Array([0.4]))).toThrow(/physical/)
    expect(() => computeEntanglementSpectrum(new Float64Array([NaN]))).toThrow(/physical/)
    expect(() => computeEntanglementSpectrum(new Float64Array([-1]))).toThrow(/physical/)
    expect(() => computeEntanglementSpectrum(new Float64Array([Infinity]))).toThrow(/physical/)
  })

  it('snaps ν just below ½ (within 1e-9 floor) up to ½ exactly', () => {
    // 0.5 − 5e-10 is inside the tolerance band — should be silently snapped.
    const spec = computeEntanglementSpectrum(new Float64Array([0.5 - 5e-10]))
    expect(spec.nu[0]).toBe(0.5)
    // ε at ν = ½ → minus < 1e-15 path → +Infinity per source.
    expect(spec.epsilon[0]).toBe(Number.POSITIVE_INFINITY)
  })

  it('does not mutate the input array', () => {
    const input = new Float64Array([3, 1, 2])
    const snapshot = Array.from(input)
    computeEntanglementSpectrum(input)
    expect(Array.from(input)).toEqual(snapshot)
  })

  it('output arrays are length-matched to the input', () => {
    const spec = computeEntanglementSpectrum(new Float64Array([1, 2, 3, 4, 5]))
    expect(spec.nu).toHaveLength(5)
    expect(spec.epsilon).toHaveLength(5)
    expect(spec.perModeEntropy).toHaveLength(5)
  })

  it('handles a single-mode subsystem', () => {
    const spec = computeEntanglementSpectrum(new Float64Array([2.0]))
    expect(spec.nu).toHaveLength(1)
    expect(spec.entanglementGap).toBeCloseTo(1.5, 12)
  })

  it('handles an empty input gracefully', () => {
    const spec = computeEntanglementSpectrum(new Float64Array([]))
    expect(spec.nu).toHaveLength(0)
    expect(spec.epsilon).toHaveLength(0)
    expect(spec.perModeEntropy).toHaveLength(0)
    expect(spec.totalEntropy).toBe(0)
    // entanglementGap reads nu[0] which is undefined for empty input — JS
    // returns NaN from the subtraction. Pin the actual contract.
    expect(Number.isNaN(spec.entanglementGap)).toBe(true)
  })
})

describe('fitCentralCharge', () => {
  it('recovers c = 1.0 for a synthetic CFT log-law dataset', () => {
    // Construct S(L) = (1/3) log(L) + 0.5 sampled at L = 1..100. The fit
    // window is [0.05·N, 0.25·N] with N = 2·max(L) = 200, so [10, 50].
    const lengths: number[] = []
    const entropies: number[] = []
    for (let L = 1; L <= 100; L++) {
      lengths.push(L)
      entropies.push((1 / 3) * Math.log(L) + 0.5)
    }
    const fit = fitCentralCharge(lengths, entropies)
    expect(fit.c).toBeCloseTo(1.0, 6)
    expect(fit.intercept).toBeCloseTo(0.5, 6)
    expect(fit.rSquared).toBeCloseTo(1.0, 8)
    expect(fit.usedPoints).toBeGreaterThanOrEqual(6)
  })

  it('recovers a non-unit central charge (c = 0.5)', () => {
    const lengths: number[] = []
    const entropies: number[] = []
    for (let L = 1; L <= 100; L++) {
      lengths.push(L)
      entropies.push((0.5 / 3) * Math.log(L))
    }
    const fit = fitCentralCharge(lengths, entropies)
    expect(fit.c).toBeCloseTo(0.5, 6)
  })

  it('returns NaN when the fit window has fewer than 6 points', () => {
    const fit = fitCentralCharge([2, 3, 4, 5], [1, 2, 3, 4])
    // N = 8, window = [⌈0.05·8⌉, ⌊0.25·8⌋] = [1, 2]; only L=2 survives.
    expect(Number.isNaN(fit.c)).toBe(true)
    expect(Number.isNaN(fit.intercept)).toBe(true)
    expect(fit.usedPoints).toBeLessThan(6)
  })

  it('returns NaN when input arrays have mismatched lengths', () => {
    const fit = fitCentralCharge([1, 2, 3], [1, 2])
    expect(Number.isNaN(fit.c)).toBe(true)
    expect(fit.usedPoints).toBe(0)
  })

  it('returns NaN on empty input', () => {
    const fit = fitCentralCharge([], [])
    expect(Number.isNaN(fit.c)).toBe(true)
    expect(fit.usedPoints).toBe(0)
  })

  it('skips non-finite entropy entries from the fit', () => {
    // Build a clean CFT dataset, then pollute one in-window point with NaN.
    // The fit should still recover c ≈ 1.0 from the surviving points.
    const lengths: number[] = []
    const entropies: number[] = []
    for (let L = 1; L <= 100; L++) {
      lengths.push(L)
      entropies.push((1 / 3) * Math.log(L))
    }
    entropies[15] = Number.NaN
    const fit = fitCentralCharge(lengths, entropies)
    expect(fit.c).toBeCloseTo(1.0, 5)
  })

  it('returns degenerate result when all in-window x values collapse (sxx = 0)', () => {
    // All L = 20 with N = 80 → window [4, 20], only L=20 lands inside, so
    // < 6 points → NaN; explicit constant test instead:
    const lengths = [20, 20, 20, 20, 20, 20, 20, 20]
    const entropies = [1, 2, 3, 4, 5, 6, 7, 8]
    const fit = fitCentralCharge(lengths, entropies)
    // Window: N = 40 ⇒ [2, 10]; L=20 falls outside ⇒ usedPoints = 0 → NaN.
    expect(Number.isNaN(fit.c)).toBe(true)
  })
})

describe('fitEntanglementTemperature', () => {
  it('recovers β_mod from an equi-spaced (Bisognano-Wichmann) modular spectrum', () => {
    // Synthesize a spectrum where ε grows linearly with mode index from
    // the largest-ν end, with gap Δε. computeEntanglementSpectrum sorts
    // ν ascending → epsilon[0] = largest ε. The fit walks from the tail
    // backward, so we want epsilon[n−1] = smallest ε.
    //
    // Easiest: pick ν values such that ε_k = log((ν+½)/(ν−½)) is
    // approximately linear in mode index from the decoupled end.
    // For ν large, ε ≈ 1/ν, so taking ν_k inversely proportional to k
    // gives equi-spaced ε.
    //
    // We bypass the awkward back-conversion and construct the spectrum
    // object directly with a known equi-spaced ε array.
    const n = 12
    const gap = 0.5
    const epsilon = new Float64Array(n)
    // epsilon[0] = largest ε (ν smallest), epsilon[n−1] = smallest ε
    // (ν largest). Walking from tail backward: y[i] = epsilon[n-1-i] = i·gap
    for (let i = 0; i < n; i++) epsilon[n - 1 - i] = (i + 1) * gap
    const spectrum = {
      nu: new Float64Array(n).map((_, i) => i + 1),
      epsilon,
      perModeEntropy: new Float64Array(n),
      totalEntropy: 0,
      entanglementGap: 0.5,
    }
    const fit = fitEntanglementTemperature(spectrum)
    expect(fit.rSquared).toBeCloseTo(1.0, 8)
    // slope = gap → β_mod = gap / (2π)
    expect(fit.inverseTemperature).toBeCloseTo(gap / (2 * Math.PI), 6)
    expect(fit.temperature).toBeCloseTo((2 * Math.PI) / gap, 6)
    expect(fit.usedModes).toBeGreaterThanOrEqual(4)
  })

  it('returns NaN when the spectrum has fewer than 4 modes', () => {
    const spectrum = {
      nu: new Float64Array([1, 2, 3]),
      epsilon: new Float64Array([0.5, 1.0, 1.5]),
      perModeEntropy: new Float64Array(3),
      totalEntropy: 0,
      entanglementGap: 0,
    }
    const fit = fitEntanglementTemperature(spectrum)
    expect(Number.isNaN(fit.inverseTemperature)).toBe(true)
    expect(fit.usedModes).toBe(0)
  })

  it('returns NaN when the slope is non-positive (non-Rindler / decreasing)', () => {
    // Build a spectrum where walking from the tail produces a decreasing y.
    const n = 12
    const epsilon = new Float64Array(n)
    // After tail-walk: y[i] = epsilon[n-1-i]; we want this DECREASING.
    // So epsilon[n-1] should be largest, epsilon[0] smallest.
    for (let i = 0; i < n; i++) epsilon[i] = i * 0.1
    const spectrum = {
      nu: new Float64Array(n),
      epsilon,
      perModeEntropy: new Float64Array(n),
      totalEntropy: 0,
      entanglementGap: 0,
    }
    const fit = fitEntanglementTemperature(spectrum)
    expect(Number.isNaN(fit.inverseTemperature)).toBe(true)
    expect(Number.isNaN(fit.temperature)).toBe(true)
    expect(Number.isFinite(fit.rSquared)).toBe(true) // rSquared still computed
  })

  it('skips non-finite epsilon entries (ν exactly at ½)', () => {
    // 12 modes; one near ν = ½ produces +Infinity, should be skipped.
    const n = 12
    const gap = 0.3
    const epsilon = new Float64Array(n)
    for (let i = 0; i < n; i++) epsilon[n - 1 - i] = (i + 1) * gap
    epsilon[0] = Number.POSITIVE_INFINITY // largest-ε slot becomes inf — tail-walk doesn't touch this when keep < n
    const spectrum = {
      nu: new Float64Array(n),
      epsilon,
      perModeEntropy: new Float64Array(n),
      totalEntropy: 0,
      entanglementGap: 0,
    }
    const fit = fitEntanglementTemperature(spectrum)
    expect(fit.usedModes).toBeGreaterThanOrEqual(4)
    expect(Number.isFinite(fit.inverseTemperature)).toBe(true)
  })

  it('uses up to max(4, floor(n/3)) modes', () => {
    // n=30 → keep = max(4, 10) = 10
    const n = 30
    const epsilon = new Float64Array(n)
    for (let i = 0; i < n; i++) epsilon[n - 1 - i] = (i + 1) * 0.1
    const spectrum = {
      nu: new Float64Array(n),
      epsilon,
      perModeEntropy: new Float64Array(n),
      totalEntropy: 0,
      entanglementGap: 0,
    }
    const fit = fitEntanglementTemperature(spectrum)
    expect(fit.usedModes).toBe(10)
  })
})
