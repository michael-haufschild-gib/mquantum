/**
 * Page–Wootters cross-diagnostic: which clock generates the most
 * distinguishable conditional-state evolution?
 *
 * ## Physics
 *
 * Page and Wootters (1983) proposed that time emerges in a quantum
 * universe when one chooses a "clock" subsystem A and looks at the
 * conditional state of the rest of the universe:
 *
 *   `|ψ_rest(t)⟩ ∝ ⟨A = t | Ψ⟩`
 *
 * A *good* clock is one whose conditional states at different times
 * are nearly orthogonal — different `t` should correspond to genuinely
 * different "rest of universe" configurations. We quantify this by
 * the support-weighted step-to-step autocorrelation across the clock axis:
 *
 *   `C(x) = Σ w_i |⟨ψ_rest(t_i)|ψ_rest(t_{i+1})⟩|² / Σ w_i`
 *
 * with each conditional state L²-normalised first so the sum is
 * bounded in `[0, 1]`, and `w_i = sqrt(P(t_i)P(t_{i+1}))`. Adjacent
 * pairs with zero clock probability do not define conditional states
 * and therefore do not vote. A clock with `C ≈ 1` is a poor clock —
 * its conditional states barely change. A clock with `C ≪ 1` is a good
 * clock — adjacent supported conditional states are nearly orthogonal.
 *
 * The Page–Wootters champion is the clock with the **smallest** C
 * (most distinguishing).
 *
 * ## Independence from other diagnostics
 *
 * Page–Wootters uses only `χ` directly — no Schmidt decomposition,
 * no Hamilton-Jacobi operator, no rigid fit, no WKB phase. It is
 * therefore a **third independent diagnostic** that can be compared
 * against the rigid-q champion and the WKB phase-rate champion. The
 * SRMT conjecture is strengthened (resp. weakened) if PW agrees
 * (resp. disagrees) with rigid-q.
 *
 * @module lib/physics/srmt/pageWoottersChampion
 */

import type { SrmtClock } from './types'

/**
 * Support-weighted step-to-step autocorrelation of the conditional
 * `|ψ_rest⟩` states along each clock axis. Smaller = better clock.
 */
export interface PageWoottersRecord {
  a: number
  phi1: number
  phi2: number
}

function strideForAxis(
  shape: [number, number, number],
  axis: 0 | 1 | 2
): { axisStride: number; axisLen: number; sliceSize: number } {
  const [N0, N1, N2] = shape
  const strides = [N1 * N2, N2, 1]
  return {
    axisStride: strides[axis]!,
    axisLen: [N0, N1, N2][axis]!,
    sliceSize: (N0 * N1 * N2) / [N0, N1, N2][axis]!,
  }
}

interface ConditionalSlice {
  values: Float64Array
  norm: number
}

/**
 * Extract a normalised conditional state at clock-axis index `t`
 * along axis `axis`. The conditional state is the complex χ slice at
 * the clock value, then L²-normalised on the remaining 2D plane.
 *
 * Returns interleaved (re, im) values for the slice, length
 * `2 · sliceSize`.
 */
function conditionalSliceComplex(
  chi: Float32Array,
  shape: [number, number, number],
  axis: 0 | 1 | 2,
  t: number
): ConditionalSlice {
  const [N0, N1, N2] = shape
  const { sliceSize, axisStride } = strideForAxis(shape, axis)
  const out = new Float64Array(2 * sliceSize)

  let w = 0
  // Enumerate all grid points whose clock-axis coordinate is `t`.
  // Order doesn't matter for the inner product as long as both
  // slices use the same order.
  if (axis === 0) {
    // Slice over (φ₁, φ₂) at a = t.
    const base = t * N1 * N2
    for (let i1 = 0; i1 < N1; i1++) {
      for (let i2 = 0; i2 < N2; i2++) {
        const src = 2 * (base + i1 * N2 + i2)
        out[2 * w] = chi[src]!
        out[2 * w + 1] = chi[src + 1]!
        w++
      }
    }
  } else if (axis === 1) {
    // Slice over (a, φ₂) at φ₁ = t.
    for (let i0 = 0; i0 < N0; i0++) {
      for (let i2 = 0; i2 < N2; i2++) {
        const src = 2 * (i0 * N1 * N2 + t * N2 + i2)
        out[2 * w] = chi[src]!
        out[2 * w + 1] = chi[src + 1]!
        w++
      }
    }
  } else {
    // Slice over (a, φ₁) at φ₂ = t.
    for (let i0 = 0; i0 < N0; i0++) {
      for (let i1 = 0; i1 < N1; i1++) {
        const src = 2 * (i0 * N1 * N2 + i1 * N2 + t)
        out[2 * w] = chi[src]!
        out[2 * w + 1] = chi[src + 1]!
        w++
      }
    }
  }
  // Reference `axisStride` to keep the import meaningful for future
  // alternative iteration strategies; current row-major enumeration
  // does not directly need it.
  void axisStride

  // L²-normalise.
  let norm = 0
  for (let i = 0; i < sliceSize; i++) {
    const re = out[2 * i]!
    const im = out[2 * i + 1]!
    norm += re * re + im * im
  }
  if (norm > 0) {
    const inv = 1 / Math.sqrt(norm)
    for (let i = 0; i < 2 * sliceSize; i++) out[i] = out[i]! * inv
  }
  return { values: out, norm }
}

/**
 * Absolute squared overlap `|⟨ψ₁|ψ₂⟩|²` of two complex amplitude
 * arrays of equal length (interleaved re/im storage).
 */
function overlapSquared(a: Float64Array, b: Float64Array): number {
  let re = 0
  let im = 0
  const n = a.length / 2
  for (let i = 0; i < n; i++) {
    const ar = a[2 * i]!
    const ai = a[2 * i + 1]!
    const br = b[2 * i]!
    const bi = b[2 * i + 1]!
    re += ar * br + ai * bi
    im += ar * bi - ai * br
  }
  return re * re + im * im
}

/**
 * Compute the Page–Wootters mean step-to-step autocorrelation for
 * each candidate clock. Smaller = better clock under PW.
 *
 * @param chi - Interleaved complex `χ` amplitudes, length `2·Na·Nphi²`.
 * @param shape - `[Na, Nphi, Nphi]`.
 * @returns Per-clock support-weighted adjacent-conditional-state overlap.
 *          Returns `NaN` for an axis with no adjacent supported clock
 *          slices.
 */
export function computePageWoottersRates(
  chi: Float32Array,
  shape: [number, number, number]
): PageWoottersRecord {
  const meanAutocorrAlongAxis = (axis: 0 | 1 | 2): number => {
    const { axisLen } = strideForAxis(shape, axis)
    if (axisLen < 2) return Number.NaN
    let sum = 0
    let weightSum = 0
    let prev = conditionalSliceComplex(chi, shape, axis, 0)
    for (let t = 1; t < axisLen; t++) {
      const next = conditionalSliceComplex(chi, shape, axis, t)
      const pairWeight = Math.sqrt(prev.norm * next.norm)
      const o = overlapSquared(prev.values, next.values)
      if (Number.isFinite(o) && Number.isFinite(pairWeight) && pairWeight > 0) {
        sum += pairWeight * o
        weightSum += pairWeight
      }
      prev = next
    }
    return weightSum > 0 ? sum / weightSum : Number.NaN
  }

  return {
    a: meanAutocorrAlongAxis(0),
    phi1: meanAutocorrAlongAxis(1),
    phi2: meanAutocorrAlongAxis(2),
  }
}

/**
 * Find the Page–Wootters champion clock — the clock with the
 * SMALLEST mean adjacent-conditional-state overlap.
 *
 * Returns `null` when fewer than three rates are finite, or when
 * the top two clocks differ by less than `tieTolerance · max_rate`.
 *
 * @param rates - Output of {@link computePageWoottersRates}.
 * @param tieTolerance - Relative tolerance for a champion. Default 0.02.
 */
export function findPageWoottersChampion(
  rates: PageWoottersRecord,
  tieTolerance = 0.02
): SrmtClock | null {
  const entries: { clock: SrmtClock; rate: number }[] = [
    { clock: 'a', rate: rates.a },
    { clock: 'phi1', rate: rates.phi1 },
    { clock: 'phi2', rate: rates.phi2 },
  ]
  if (!entries.every((e) => Number.isFinite(e.rate))) return null
  // Sort ascending (smallest first — smallest overlap = best clock).
  entries.sort((x, y) => x.rate - y.rate)
  const [best, second] = entries
  if (!best || !second) return null
  // Use the larger rate as the scale for relative tolerance.
  const scale = Math.max(second.rate, Number.EPSILON)
  if ((second.rate - best.rate) / scale < tieTolerance) return null
  return best.clock
}
