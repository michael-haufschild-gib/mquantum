/**
 * Heller Wavepacket Spectrometer — pure-logic core.
 *
 * Implements the classical Heller wavepacket autocorrelation spectroscopy
 * theorem: if ψ(t) evolves under a time-independent Hamiltonian H with
 * eigenstates |Eₙ⟩, then the autocorrelation
 *
 *   C(t) = ⟨ψ(0)|ψ(t)⟩ = Σₙ |⟨ψ₀|Eₙ⟩|² · exp(−i·Eₙ·t)
 *
 * is a sum of pure tones at the eigenfrequencies Eₙ weighted by the
 * initial overlaps. Taking |ℱ[C(t)](ω)|² yields a spectrum whose peaks
 * sit at the eigenvalues Eₙ, broadened by the finite observation window.
 *
 * This module provides:
 *   - a ring buffer for streaming C(t) samples captured from GPU
 *   - a Hann window helper
 *   - a spectrum builder: windowed FFT + positive-frequency power + peak
 *     extraction
 *
 * Physics / sign convention:
 * C(t) has the form Σ aₖ · exp(−i·Eₖ·t). Our 1D `fft` uses the standard
 * signal-processing forward kernel X[k] = Σ x[n]·exp(−i·2π·k·n/N). A
 * signal exp(−i·ω·t) sampled at t_n = n·dt therefore produces a peak in
 * the *upper* half of the DFT (the "negative frequency" bins). To keep
 * positive energies on the positive k-axis as expected by the UI, we
 * feed conj(C) into the forward FFT: conj(C(t)) = Σ aₖ · exp(+i·Eₖ·t),
 * whose DFT peaks lie at k = round(Eₖ · N · dt / 2π), k ∈ [0, N/2). This
 * is equivalent to σ(ω) = ∫ exp(+iωt)·C(t)·dt, the usual Heller kernel.
 *
 * @module lib/physics/tdse/heller
 */

import { fft } from '@/lib/math/fft'

/** Default capacity of the autocorrelation ring buffer. */
export const HELLER_DEFAULT_CAPACITY = 1024

/**
 * Maximum fractional deviation from the mean sample period allowed by
 * `computeHellerSpectrum`'s uniformity check. 5% matches "one frame of
 * drift at a 20-frame decimation" — tight enough to catch back-pressure
 * gaps, loose enough to tolerate the usual stepsPerFrame jitter.
 */
export const HELLER_UNIFORMITY_TOLERANCE = 0.05

/**
 * Minimum sample count required before `computeHellerSpectrum` will
 * return anything non-empty. Exported so the UI `Compute spectrum`
 * button and the pure-logic entry point agree on the gate without
 * drifting apart.
 */
export const HELLER_DEFAULT_MIN_SAMPLES = 64

/** @deprecated use {@link HELLER_DEFAULT_CAPACITY}. */
const DEFAULT_CAPACITY = HELLER_DEFAULT_CAPACITY
/** @deprecated use {@link HELLER_DEFAULT_MIN_SAMPLES}. */
const DEFAULT_MIN_SAMPLES = HELLER_DEFAULT_MIN_SAMPLES

/** Default number of peaks returned by `extractSpectrumPeaks`. */
const DEFAULT_TOP_N = 6

/** Default noise-floor fraction of max power for peak detection. */
const DEFAULT_NOISE_FLOOR = 0.01

/**
 * Fixed-size circular buffer of complex autocorrelation samples C(t) and
 * their associated observation times (stored as offsets from the first
 * captured sample, so `times[0] === 0`).
 */
export interface HellerRingBuffer {
  /** Maximum number of samples retained. */
  capacity: number
  /** Real parts of stored C(t) samples, length `capacity`. */
  cRe: Float64Array
  /** Imaginary parts of stored C(t) samples, length `capacity`. */
  cIm: Float64Array
  /** Observation times (relative to first sample), length `capacity`. */
  times: Float64Array
  /** Next write index in `[0, capacity)`. */
  head: number
  /** Number of valid samples currently stored in `[0, capacity]`. */
  count: number
}

/**
 * Create an empty Heller ring buffer.
 *
 * @param capacity - Maximum number of retained samples (default 1024)
 * @returns Newly allocated buffer with `head = 0` and `count = 0`
 */
export function createHellerBuffer(capacity: number = DEFAULT_CAPACITY): HellerRingBuffer {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new Error(`HellerRingBuffer capacity must be a positive integer, got ${capacity}`)
  }
  return {
    capacity,
    cRe: new Float64Array(capacity),
    cIm: new Float64Array(capacity),
    times: new Float64Array(capacity),
    head: 0,
    count: 0,
  }
}

/**
 * Push a new sample into the ring buffer, overwriting the oldest entry
 * once capacity is reached.
 *
 * @param buf - Ring buffer to mutate
 * @param cRe - Real part of C(t)
 * @param cIm - Imaginary part of C(t)
 * @param simTime - Observation time (any monotone scalar)
 */
export function pushAutocorrelationSample(
  buf: HellerRingBuffer,
  cRe: number,
  cIm: number,
  simTime: number
): void {
  buf.cRe[buf.head] = cRe
  buf.cIm[buf.head] = cIm
  buf.times[buf.head] = simTime
  buf.head = (buf.head + 1) % buf.capacity
  if (buf.count < buf.capacity) buf.count++
}

/**
 * Reset the ring buffer to empty, preserving the backing allocations.
 *
 * @param buf - Ring buffer to clear
 */
export function resetHellerBuffer(buf: HellerRingBuffer): void {
  buf.head = 0
  buf.count = 0
  // Zero the stored values so a stale pointer cannot leak old data into
  // a newly computed spectrum if the consumer indexes past `count`.
  buf.cRe.fill(0)
  buf.cIm.fill(0)
  buf.times.fill(0)
}

/**
 * Hann window: `w[k] = 0.5·(1 − cos(2π·k/(n−1)))` for `k ∈ [0, n)`.
 *
 * Edge cases: `n = 0` returns an empty array; `n = 1` returns `[1]`
 * (degenerate single-sample window).
 *
 * @param n - Window length
 * @returns Float64Array of length n
 */
export function hannWindow(n: number): Float64Array {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`hannWindow length must be a non-negative integer, got ${n}`)
  }
  const w = new Float64Array(n)
  if (n === 0) return w
  if (n === 1) {
    w[0] = 1
    return w
  }
  const twoPiOverNm1 = (2 * Math.PI) / (n - 1)
  for (let k = 0; k < n; k++) {
    w[k] = 0.5 * (1 - Math.cos(twoPiOverNm1 * k))
  }
  return w
}

/** Single spectral peak. */
export interface HellerSpectrumPeak {
  /** Angular frequency ω of the peak. */
  omega: number
  /** Peak power `|P(ω)|²` in the same units as the spectrum array. */
  power: number
}

/** Result of a Heller spectrum computation. */
export interface HellerSpectrum {
  /** Positive angular frequencies ω_k = 2π·k/(N·dt), k = 0..N/2. */
  omega: Float64Array
  /** Power values `|P(ω_k)|²`. Same length as `omega`. */
  power: Float64Array
  /** Mean sampling interval used for the transform (0 if unavailable). */
  dt: number
  /** Top peaks extracted from the positive-frequency half. */
  peaks: HellerSpectrumPeak[]
  /** Number of samples used for the FFT (post-window, pre-pad). */
  nUsed: number
}

/**
 * Build a Heller power spectrum from the current ring buffer contents.
 *
 * Returns an empty spectrum (zero-length arrays, empty peaks) whenever
 * there are fewer than `minSamples` valid entries or the computed mean
 * sampling interval is non-positive.
 *
 * Procedure:
 *   1. Extract samples in chronological order (oldest first).
 *   2. Estimate `dt` from the stored times: `(t_last − t_first)/(n−1)`.
 *   3. Apply Hann window.
 *   4. Negate imaginary parts (sign convention — see module header).
 *   5. Zero-pad to the next power of two.
 *   6. Run a 1-D forward FFT via `@/lib/math/fft`.
 *   7. Emit positive-frequency ω_k and `|P|²/N` for k ∈ [0, N/2].
 *   8. Run local-max peak detection and take the top `topN` peaks.
 *
 * @param buf - Ring buffer with captured autocorrelation samples
 * @param minSamples - Minimum number of valid samples required
 * @returns Spectrum, possibly empty
 */
export function computeHellerSpectrum(
  buf: HellerRingBuffer,
  minSamples: number = DEFAULT_MIN_SAMPLES
): HellerSpectrum {
  const empty: HellerSpectrum = {
    omega: new Float64Array(0),
    power: new Float64Array(0),
    dt: 0,
    peaks: [],
    nUsed: 0,
  }
  const n = buf.count
  if (n < minSamples) return empty

  // Extract samples in chronological order. If the buffer has wrapped,
  // the oldest entry lives at `head`; otherwise it lives at 0.
  const start = n === buf.capacity ? buf.head : 0
  const cRe = new Float64Array(n)
  const cIm = new Float64Array(n)
  const times = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const src = (start + i) % buf.capacity
    cRe[i] = buf.cRe[src]!
    cIm[i] = buf.cIm[src]!
    times[i] = buf.times[src]!
  }

  const dt = (times[n - 1]! - times[0]!) / (n - 1)
  if (!(dt > 0) || !Number.isFinite(dt)) return empty

  // Uniformity guard. The FFT below assumes the samples sit on a
  // uniform time grid with spacing `dt`. Under GPU back-pressure, the
  // readback scheduler may drop samples (see `TDSEHellerReadback`),
  // producing gaps that are integer multiples of the nominal period.
  // Collapsing such a trace to the mean dt would shift peak locations
  // on the ω axis, so we reject the whole trace here and let the user
  // capture a fresh one.
  const uniformityTol = HELLER_UNIFORMITY_TOLERANCE * dt
  for (let i = 1; i < n; i++) {
    const dti = times[i]! - times[i - 1]!
    if (!(dti > 0) || Math.abs(dti - dt) > uniformityTol) return empty
  }

  // Windowed, sign-corrected, zero-padded FFT input.
  const w = hannWindow(n)
  let nFft = 1
  while (nFft < n) nFft *= 2
  const fftBuf = new Float64Array(2 * nFft)
  for (let i = 0; i < n; i++) {
    const wi = w[i]!
    fftBuf[2 * i] = cRe[i]! * wi
    // Conjugate convention: negate imaginary component before the
    // forward FFT so that positive eigenenergies appear in positive k.
    fftBuf[2 * i + 1] = -cIm[i]! * wi
  }
  // Remaining entries already zero from Float64Array allocation.

  fft(fftBuf, nFft)

  // Positive-frequency half (k = 0..N/2 inclusive).
  const half = nFft / 2
  const omega = new Float64Array(half + 1)
  const power = new Float64Array(half + 1)
  const invN = 1 / nFft
  const twoPiOverNdt = (2 * Math.PI) / (nFft * dt)
  for (let k = 0; k <= half; k++) {
    const re = fftBuf[2 * k]!
    const im = fftBuf[2 * k + 1]!
    omega[k] = twoPiOverNdt * k
    power[k] = (re * re + im * im) * invN
  }

  const peaks = extractSpectrumPeaks(omega, power, DEFAULT_TOP_N, DEFAULT_NOISE_FLOOR)
  return { omega, power, dt, peaks, nUsed: n }
}

/**
 * Local-maximum peak detector.
 *
 * A bin `k` is reported as a peak when
 *   `P[k] > P[k−1]`, `P[k] > P[k+1]`, and `P[k] > noiseFloor · max(P)`.
 * The first and last bins are never reported because their neighbours
 * are undefined. The returned peaks are sorted by `power` descending
 * and truncated to `topN` entries.
 *
 * @param omega - Angular frequencies (monotonically increasing)
 * @param power - Corresponding power values, same length as `omega`
 * @param topN - Maximum number of peaks to return (default 6)
 * @param noiseFloor - Fraction of max power below which peaks are rejected (default 0.01)
 * @returns Peaks sorted by power descending
 */
export function extractSpectrumPeaks(
  omega: readonly number[] | Float64Array,
  power: readonly number[] | Float64Array,
  topN: number = DEFAULT_TOP_N,
  noiseFloor: number = DEFAULT_NOISE_FLOOR
): HellerSpectrumPeak[] {
  const n = Math.min(omega.length, power.length)
  if (n < 3) return []

  let maxPower = 0
  for (let k = 0; k < n; k++) {
    const p = power[k]!
    if (p > maxPower) maxPower = p
  }
  if (!(maxPower > 0)) return []
  const threshold = noiseFloor * maxPower

  const peaks: HellerSpectrumPeak[] = []
  for (let k = 1; k < n - 1; k++) {
    const p = power[k]!
    if (p > threshold && p > power[k - 1]! && p > power[k + 1]!) {
      peaks.push({ omega: omega[k]!, power: p })
    }
  }
  peaks.sort((a, b) => b.power - a.power)
  if (peaks.length > topN) peaks.length = topN
  return peaks
}
