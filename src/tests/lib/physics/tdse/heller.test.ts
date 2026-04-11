/**
 * Tests for the Heller Wavepacket Spectrometer pure-logic core.
 *
 * Covers the ring buffer, Hann window, synthetic multi-tone recovery,
 * pure-phase recovery, edge cases, and peak extraction.
 *
 * @module tests/lib/physics/tdse/heller
 */

import { describe, expect, it } from 'vitest'

import {
  computeHellerSpectrum,
  createHellerBuffer,
  extractSpectrumPeaks,
  hannWindow,
  HELLER_MAX_INTERPOLATION_FRACTION,
  type HellerRingBuffer,
  pushAutocorrelationSample,
  resetHellerBuffer,
} from '@/lib/physics/tdse/heller'

describe('hannWindow', () => {
  it('returns an empty array for n=0', () => {
    expect(hannWindow(0)).toHaveLength(0)
  })

  it('returns [1] for n=1 (degenerate window)', () => {
    const w = hannWindow(1)
    expect(w).toHaveLength(1)
    expect(w[0]).toBe(1)
  })

  it('is zero at the endpoints and symmetric for even n', () => {
    const n = 16
    const w = hannWindow(n)
    expect(w).toHaveLength(n)
    expect(w[0]).toBe(0)
    expect(w[n - 1]).toBe(0)
    // Symmetric: w[k] == w[n-1-k]
    for (let k = 0; k < n; k++) {
      expect(w[k]).toBeCloseTo(w[n - 1 - k]!, 12)
    }
  })

  it('matches the closed-form formula at interior bins', () => {
    // The PRD's quick-check value of 0.958 for N=16, k=7 is not correct
    // for the textbook Hann window w[k] = 0.5·(1 − cos(2π·k/(N−1))).
    // We validate against the exact closed-form value.
    const n = 16
    const w = hannWindow(n)
    const expect7 = 0.5 * (1 - Math.cos((2 * Math.PI * 7) / (n - 1)))
    const expect8 = 0.5 * (1 - Math.cos((2 * Math.PI * 8) / (n - 1)))
    expect(w[7]).toBeCloseTo(expect7, 12)
    expect(w[8]).toBeCloseTo(expect8, 12)
    // Value is ≈0.989 (definitely not ≈0.958) — sanity check.
    expect(w[7]!).toBeGreaterThan(0.98)
    expect(w[7]!).toBeLessThan(1.0)
  })
})

describe('createHellerBuffer', () => {
  it('defaults to capacity 1024 with zeroed counters', () => {
    const buf = createHellerBuffer()
    expect(buf.capacity).toBe(1024)
    expect(buf.cRe).toHaveLength(1024)
    expect(buf.cIm).toHaveLength(1024)
    expect(buf.times).toHaveLength(1024)
    expect(buf.head).toBe(0)
    expect(buf.count).toBe(0)
  })

  it('accepts a custom capacity', () => {
    const buf = createHellerBuffer(32)
    expect(buf.capacity).toBe(32)
    expect(buf.cRe).toHaveLength(32)
  })

  it('rejects invalid capacity', () => {
    expect(() => createHellerBuffer(0)).toThrow()
    expect(() => createHellerBuffer(-1)).toThrow()
    expect(() => createHellerBuffer(3.5)).toThrow()
  })
})

describe('pushAutocorrelationSample', () => {
  it('wraps around and overwrites oldest entries past capacity', () => {
    const buf = createHellerBuffer(1024)
    const total = 1100
    for (let i = 0; i < total; i++) {
      pushAutocorrelationSample(buf, i, i * 0.1, i * 0.01)
    }
    expect(buf.count).toBe(1024)
    // Head wrapped: total % capacity == 1100 % 1024 == 76
    expect(buf.head).toBe(76)
    // The first 76 entries were overwritten: buf.cRe[0] now holds the
    // value from iteration 1024, and buf.cRe[75] holds iteration 1099.
    expect(buf.cRe[0]).toBe(1024)
    expect(buf.cRe[75]).toBe(1099)
    // The oldest surviving entry lives at buf.head (index 76) with value 76.
    expect(buf.cRe[76]).toBe(76)
  })
})

describe('resetHellerBuffer', () => {
  it('clears counts but preserves backing allocations', () => {
    const buf = createHellerBuffer(32)
    for (let i = 0; i < 10; i++) pushAutocorrelationSample(buf, i, -i, i * 0.5)
    expect(buf.count).toBe(10)
    expect(buf.head).toBe(10)
    const reRef = buf.cRe
    const imRef = buf.cIm
    const tRef = buf.times
    resetHellerBuffer(buf)
    expect(buf.count).toBe(0)
    expect(buf.head).toBe(0)
    expect(buf.cRe).toBe(reRef) // same allocation
    expect(buf.cIm).toBe(imRef)
    expect(buf.times).toBe(tRef)
    // Values zeroed.
    for (let i = 0; i < 10; i++) {
      expect(buf.cRe[i]).toBe(0)
      expect(buf.cIm[i]).toBe(0)
      expect(buf.times[i]).toBe(0)
    }
  })
})

/**
 * Populate a ring buffer with the classical Heller autocorrelation for a
 * uniform superposition of K eigenstates at energies `energies`.
 *
 * C(t) = (1/K) · Σₖ exp(−i·Eₖ·t)
 *
 * @param buf - Ring buffer to fill (must be at least `n` in capacity)
 * @param energies - List of eigenenergies
 * @param n - Number of samples to push
 * @param dt - Time spacing
 */
function fillMultitoneBuffer(
  buf: HellerRingBuffer,
  energies: readonly number[],
  n: number,
  dt: number
): void {
  const k = energies.length
  const invK = 1 / k
  for (let sample = 0; sample < n; sample++) {
    const t = sample * dt
    let cRe = 0
    let cIm = 0
    for (let m = 0; m < k; m++) {
      const phase = -energies[m]! * t
      cRe += Math.cos(phase)
      cIm += Math.sin(phase)
    }
    pushAutocorrelationSample(buf, cRe * invK, cIm * invK, t)
  }
}

describe('computeHellerSpectrum', () => {
  it('recovers the five input energies of a harmonic-oscillator-like superposition', () => {
    const buf = createHellerBuffer(1024)
    const energies = [0.5, 1.5, 2.5, 3.5, 4.5]
    fillMultitoneBuffer(buf, energies, 1024, 0.1)

    const spectrum = computeHellerSpectrum(buf)
    // Clean capture → nUsed equals the raw sample count (grid length)
    // and no interpolation was needed.
    expect(spectrum.nUsed).toBe(1024)
    expect(spectrum.nInterpolated).toBe(0)
    expect(spectrum.dt).toBeCloseTo(0.1, 10)
    // Five distinct peaks expected; we asked for top 6 but only 5 exist.
    expect(spectrum.peaks.length).toBeGreaterThanOrEqual(5)

    // Each input energy must be within 0.15 of at least one of the top 5 peaks.
    // We compute the minimum frequency distance explicitly so the assertion
    // compares a concrete numeric bound (not a "truthy" existence check).
    const topFive = spectrum.peaks.slice(0, 5)
    for (const e of energies) {
      let minErr = Infinity
      for (const p of topFive) {
        const err = Math.abs(p.omega - e)
        if (err < minErr) minErr = err
      }
      expect(
        minErr,
        `no peak near E=${e}; got ${topFive.map((p) => p.omega.toFixed(3)).join(', ')}`
      ).toBeLessThan(0.15)
    }
  })

  it('recovers a single pure phase exp(-i·E·t)', () => {
    const buf = createHellerBuffer(512)
    const E = 2.0
    const dt = 0.05
    const n = 512
    for (let i = 0; i < n; i++) {
      const t = i * dt
      pushAutocorrelationSample(buf, Math.cos(-E * t), Math.sin(-E * t), t)
    }
    const spectrum = computeHellerSpectrum(buf)
    expect(spectrum.nUsed).toBe(512)
    expect(spectrum.peaks.length).toBeGreaterThanOrEqual(1)
    // Frequency resolution Δω = 2π / (N·dt) = 2π / 25.6 ≈ 0.2454
    const deltaOmega = (2 * Math.PI) / (n * dt)
    const top = spectrum.peaks[0]!
    expect(Math.abs(top.omega - E)).toBeLessThan(deltaOmega + 1e-6)
  })

  it('peak bin matches the closed-form bin index k = round(E·N_fft·dt/2π)', () => {
    // Sample count is a power of two to pin nFft === n (no zero-padding),
    // and E is chosen so the nominal bin index is an exact integer — this
    // removes window leakage from the assertion so we can test the bin
    // formula with zero tolerance instead of a loose "within Δω" bound.
    const n = 256
    const dt = 0.1
    const binK = 17 // target bin
    const E = (2 * Math.PI * binK) / (n * dt) // exact bin frequency
    const buf = createHellerBuffer(n)
    for (let i = 0; i < n; i++) {
      const t = i * dt
      pushAutocorrelationSample(buf, Math.cos(-E * t), Math.sin(-E * t), t)
    }
    const spectrum = computeHellerSpectrum(buf)
    // nFft is next power of two ≥ n; since n = 256 is already a power of
    // two, nFft === n and the bin index formula holds exactly.
    const nFft = n
    expect(spectrum.nUsed).toBe(n)
    expect(spectrum.dt).toBeCloseTo(dt, 12)

    const expectedOmega = (2 * Math.PI * binK) / (nFft * dt)
    const top = spectrum.peaks[0]!
    // Top peak must sit at exactly the target bin (no off-by-one).
    expect(top.omega).toBeCloseTo(expectedOmega, 12)
    expect(top.omega).toBeCloseTo(E, 12)

    // And the omega array must be uniformly spaced by Δω = 2π / (N·dt).
    const deltaOmega = (2 * Math.PI) / (nFft * dt)
    for (let k = 1; k < spectrum.omega.length; k++) {
      expect(spectrum.omega[k]! - spectrum.omega[k - 1]!).toBeCloseTo(deltaOmega, 12)
    }
  })

  it('maps a distinct two-tone superposition to the correct non-adjacent bins', () => {
    // Two distinct tones on exact bins. The peak list must include both
    // binK values in the expected order (higher power first when weights
    // are equal, but since both tones have identical amplitudes they end
    // up tied — so we assert set membership instead of ordering).
    const n = 512
    const dt = 0.1
    const binA = 23
    const binB = 71
    const EA = (2 * Math.PI * binA) / (n * dt)
    const EB = (2 * Math.PI * binB) / (n * dt)
    const buf = createHellerBuffer(n)
    for (let i = 0; i < n; i++) {
      const t = i * dt
      const cRe = 0.5 * (Math.cos(-EA * t) + Math.cos(-EB * t))
      const cIm = 0.5 * (Math.sin(-EA * t) + Math.sin(-EB * t))
      pushAutocorrelationSample(buf, cRe, cIm, t)
    }
    const spectrum = computeHellerSpectrum(buf)
    // Top two peaks must be the two injected tones — tight tolerance
    // because Hann-windowed amplitudes are equal and both land on exact
    // bins (no intra-bin leakage).
    const omegas = spectrum.peaks.slice(0, 2).map((p) => p.omega)
    const tol = 1e-9
    const hasA = omegas.some((w) => Math.abs(w - EA) < tol)
    const hasB = omegas.some((w) => Math.abs(w - EB) < tol)
    expect(hasA, `top peaks ${omegas} do not contain EA=${EA}`).toBe(true)
    expect(hasB, `top peaks ${omegas} do not contain EB=${EB}`).toBe(true)
  })

  it('returns an empty spectrum when fewer than minSamples samples are present', () => {
    const buf = createHellerBuffer(1024)
    for (let i = 0; i < 32; i++) pushAutocorrelationSample(buf, 1, 0, i * 0.1)
    const spectrum = computeHellerSpectrum(buf, 64)
    expect(spectrum.nUsed).toBe(0)
    expect(spectrum.nInterpolated).toBe(0)
    expect(spectrum.omega).toHaveLength(0)
    expect(spectrum.power).toHaveLength(0)
    expect(spectrum.peaks).toEqual([])
  })

  it('returns an empty spectrum for all-zero input (no peaks above noise floor)', () => {
    const buf = createHellerBuffer(256)
    for (let i = 0; i < 256; i++) pushAutocorrelationSample(buf, 0, 0, i * 0.1)
    const spectrum = computeHellerSpectrum(buf)
    expect(spectrum.peaks).toEqual([])
    // Power array exists but is identically zero.
    for (let k = 0; k < spectrum.power.length; k++) {
      expect(spectrum.power[k]).toBe(0)
    }
  })

  it('returns an empty spectrum when all samples share the same time (dt=0 guard)', () => {
    const buf = createHellerBuffer(128)
    for (let i = 0; i < 128; i++) pushAutocorrelationSample(buf, 1, 0, 0)
    const spectrum = computeHellerSpectrum(buf)
    expect(spectrum.omega).toHaveLength(0)
    expect(spectrum.peaks).toEqual([])
  })

  it('interpolates across a single dropped-slot integer-multiple gap', () => {
    // Capture n-1 samples of a clean single-tone trace but skip one
    // slot in the middle — simulating exactly one back-pressure drop.
    // The surviving gap is 2·dt, an integer multiple of the nominal
    // period. The robust `computeHellerSpectrum` must align everything
    // onto a uniform grid, linearly interpolate the missing sample,
    // and recover the tone peak at the correct frequency.
    const n = 256
    const dt = 0.1
    const E = 2.0
    const buf = createHellerBuffer(n)
    const dropIdx = Math.floor(n / 2)
    for (let i = 0; i < n - 1; i++) {
      // Source index in the original uniform timeline: skip dropIdx.
      const k = i < dropIdx ? i : i + 1
      const t = k * dt
      pushAutocorrelationSample(buf, Math.cos(-E * t), Math.sin(-E * t), t)
    }
    const spectrum = computeHellerSpectrum(buf)
    // One slot was interpolated onto the n-point grid.
    expect(spectrum.nUsed).toBe(n)
    expect(spectrum.nInterpolated).toBe(1)
    expect(spectrum.dt).toBeCloseTo(dt, 10)
    // The tone peak must still land near E (within one Δω bin) because
    // linear interpolation of a single slot is a tiny perturbation on
    // the sinusoid and the FFT grid bin positions are unchanged.
    const deltaOmega = (2 * Math.PI) / (n * dt)
    const top = spectrum.peaks[0]!
    expect(Math.abs(top.omega - E)).toBeLessThan(2 * deltaOmega)
  })

  it('rejects a non-integer-multiple anomaly (genuine cadence change)', () => {
    // A trace whose gaps are neither `dt` nor an integer multiple of
    // `dt` (e.g. a paused-then-nudged capture that landed at 1.5·dt)
    // is real non-uniformity and must be rejected — interpolating
    // would map energies onto a fictitious grid and shift peaks.
    const n = 256
    const dt = 0.1
    const E = 2.0
    const buf = createHellerBuffer(n)
    for (let i = 0; i < n; i++) {
      const t = i * dt
      pushAutocorrelationSample(buf, Math.cos(-E * t), Math.sin(-E * t), t)
    }
    // Offset the second half by a non-integer fraction of dt — 0.5 dt.
    // This cannot be explained by any dropped slot pattern.
    const gapIdx = Math.floor(n / 2)
    for (let i = gapIdx; i < n; i++) {
      buf.times[i] = buf.times[i]! + 0.5 * dt
    }
    const spectrum = computeHellerSpectrum(buf)
    expect(spectrum.nUsed).toBe(0)
    expect(spectrum.omega).toHaveLength(0)
    expect(spectrum.peaks).toEqual([])
  })

  it(`rejects a trace with more than ${HELLER_MAX_INTERPOLATION_FRACTION * 100}% interpolated slots`, () => {
    // Sanity cap on interpolation: if the capture is so sparse that
    // most of the FFT grid is synthesised, the result biases toward
    // zero and would lie to the user. The guard must reject.
    //
    // Pattern: pairs of samples at adjacent grid positions, but each
    // pair is separated by a 6·dt gap. Minimum gap = dt, so the
    // nominal grid spacing resolves to dt and the 5·dt gaps between
    // pairs expand to 5 interpolated slots each. 64 samples → 32 pairs
    // → grid length 0, 1, 6, 7, 12, 13, …, 187 → nGrid = 188,
    // nInterpolated = 124 / 188 ≈ 66% >> 20%.
    const pairs = 32
    const dt = 0.1
    const E = 2.0
    const buf = createHellerBuffer(256)
    for (let p = 0; p < pairs; p++) {
      const k0 = 6 * p
      const t0 = k0 * dt
      const t1 = (k0 + 1) * dt
      pushAutocorrelationSample(buf, Math.cos(-E * t0), Math.sin(-E * t0), t0)
      pushAutocorrelationSample(buf, Math.cos(-E * t1), Math.sin(-E * t1), t1)
    }
    const spectrum = computeHellerSpectrum(buf)
    expect(spectrum.nUsed).toBe(0)
    expect(spectrum.nInterpolated).toBe(0)
    expect(spectrum.omega).toHaveLength(0)
  })

  it('accepts a near-uniform trace with small floating-point jitter', () => {
    // Sanity check the uniformity tolerance: a trace whose inter-sample
    // deltas fluctuate by a tiny float64 roundoff still aligns onto the
    // same integer grid with zero interpolation and produces a valid
    // spectrum. 0.05% jitter is well inside HELLER_UNIFORMITY_TOLERANCE.
    const n = 256
    const dt = 0.1
    const E = 2.0
    const buf = createHellerBuffer(n)
    for (let i = 0; i < n; i++) {
      // Deterministic pattern — no PRNG. Amplitude small enough that
      // every sample still rounds to the same integer multiple of
      // dtNominal.
      const jitter = i === 0 ? 0 : (i % 2 === 0 ? 1 : -1) * dt * 0.0003
      const t = i * dt + jitter
      pushAutocorrelationSample(buf, Math.cos(-E * t), Math.sin(-E * t), t)
    }
    const spectrum = computeHellerSpectrum(buf)
    expect(spectrum.nUsed).toBe(n)
    expect(spectrum.nInterpolated).toBe(0)
    expect(spectrum.peaks.length).toBeGreaterThanOrEqual(1)
  })
})

describe('extractSpectrumPeaks', () => {
  it('returns hand-crafted peaks sorted by power descending', () => {
    //       k:   0   1   2   3   4   5   6
    const power = [0, 10, 0, 5, 0, 8, 0]
    const omega = [0, 1, 2, 3, 4, 5, 6]
    const peaks = extractSpectrumPeaks(omega, power, 6, 0.01)
    expect(peaks.length).toBe(3)
    expect(peaks[0]).toEqual({ omega: 1, power: 10 })
    expect(peaks[1]).toEqual({ omega: 5, power: 8 })
    expect(peaks[2]).toEqual({ omega: 3, power: 5 })
  })

  it('rejects peaks below the noise floor', () => {
    const power = [0, 100, 0, 0.5, 0, 0.1, 0]
    const omega = [0, 1, 2, 3, 4, 5, 6]
    const peaks = extractSpectrumPeaks(omega, power, 6, 0.01)
    // Only the k=1 peak clears noiseFloor * 100 = 1. k=3 has 0.5 (reject),
    // k=5 has 0.1 (reject).
    expect(peaks).toEqual([{ omega: 1, power: 100 }])
  })

  it('truncates to topN', () => {
    const power = [0, 10, 0, 9, 0, 8, 0, 7, 0, 6, 0]
    const omega = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const peaks = extractSpectrumPeaks(omega, power, 3, 0.01)
    expect(peaks.map((p) => p.power)).toEqual([10, 9, 8])
  })

  it('returns empty for arrays shorter than 3', () => {
    expect(extractSpectrumPeaks([], [], 6, 0.01)).toEqual([])
    expect(extractSpectrumPeaks([1], [1], 6, 0.01)).toEqual([])
    expect(extractSpectrumPeaks([1, 2], [1, 2], 6, 0.01)).toEqual([])
  })

  it('never reports first or last bin as a peak', () => {
    const power = [10, 5, 10]
    const omega = [0, 1, 2]
    expect(extractSpectrumPeaks(omega, power, 6, 0.01)).toEqual([])
  })
})
