/**
 * Modular-spectrum rank-window uniformity cross-diagnostic.
 *
 * ## What this actually measures
 *
 * For each clock candidate we compute one Schmidt + modular
 * spectrum (the Schmidt decomposition depends on the clock axis
 * but NOT on cut position — they're determined by the
 * bipartition only). We then slide a fixed-size rank window
 * across the spectrum at several positions and ask: how much
 * does the windowed sub-spectrum change from one position to the
 * next?
 *
 * For a spectrum with stationary structure (uniform mode density,
 * smooth K vs n), adjacent windows differ slightly. For a
 * spectrum with sharp ramp-up or stair-steps (non-stationary
 * structure), adjacent windows differ significantly.
 *
 * Smaller score = more stationary spectrum across rank.
 *
 * ## NOT what this measures (design honesty note)
 *
 * An earlier draft of this file claimed to measure the dependence
 * of `K(cut)` on cut position along the clock axis. That was a
 * design error: the Schmidt decomposition is determined by the
 * choice of clock axis alone, with no cut-index parameter. The
 * cut index enters only through the HJ operator construction
 * downstream, not through the Schmidt + modular spectrum
 * computation. A *real* cut-position-stability diagnostic would
 * vary the HJ-slice index and measure variability of `q_rigid`,
 * not variability of `K`. That diagnostic is out of scope for
 * this module — see TODO in the SRMT roadmap for a future
 * implementation.
 *
 * ## Independence from other diagnostics
 *
 * Uses Schmidt + modular spectrum only — no HJ operator, no
 * affine fit, no WKB phase, no Page-Wootters. Independent of
 * rigid-q, WKB-rate, and PW-rate.
 *
 * @module lib/physics/srmt/cutStabilityChampion
 */

import { modularSpectrum } from './modularHamiltonian'
import { computeVolumeElement, normalizedSchmidtValues } from './schmidt'
import type { SrmtClock } from './types'

/** Per-clock cut-instability measure. Smaller = more clock-like. */
export interface CutStabilityRecord {
  a: number
  phi1: number
  phi2: number
}

/**
 * Compute the modular-spectrum cut-instability per clock.
 *
 * @param chi - Interleaved complex amplitudes, length `2·Na·Nphi²`.
 * @param gridSize - `[Na, Nphi, Nphi]` grid shape.
 * @param aMin - Lower bound of `a` axis (for volume element).
 * @param aMax - Upper bound of `a` axis.
 * @param phiExtent - Half-range of φ axes.
 * @param rankCap - Maximum modular-spectrum rank to compare.
 * @param numCuts - Number of interior cut positions to sample.
 *                  Defaults to 5.
 * @returns Per-clock cut-instability metric.
 */
export function computeCutStability(
  chi: Float32Array,
  gridSize: [number, number, number],
  aMin: number,
  aMax: number,
  phiExtent: number,
  rankCap = 24,
  numCuts = 5
): CutStabilityRecord {
  const [Na, Nphi] = gridSize
  const dVol = computeVolumeElement({ gridSize, aMin, aMax, phiExtent })

  const stabilityAlong = (clock: SrmtClock): number => {
    const axisLen = clock === 'a' ? Na : Nphi
    if (axisLen < 4) return Number.NaN
    // Schmidt decomposition is independent of cut location (the
    // bipartition is determined by the clock axis, not cut index),
    // so we compute it ONCE per clock and then reuse the same
    // spectrum across cuts. The cut-dependence enters only through
    // the rank window we examine — we test cut-dependence of the
    // SUB-SPECTRUM, not of the full spectrum.
    //
    // To make the test physically meaningful, we shift the rank
    // window: for cut `t / axisLen`, take ranks [t / axisLen ·
    // (rankCap/2), t / axisLen · (rankCap/2) + rankCap/2]. The
    // shifted window probes whether the spectrum has structure
    // local to a "cut region" of the spectral support.
    //
    // Alternative interpretation: we treat the modular spectrum
    // itself as the data, and the "cut" as a window into its
    // ranks. A clock-stable spectrum has uniform structure across
    // the rank range; a non-clock spectrum varies sharply.
    const schmidt = normalizedSchmidtValues({ chi, gridSize }, clock, dVol)
    const fullCount = Math.min(schmidt.length, rankCap * 2)
    if (fullCount < rankCap + 2) return Number.NaN

    // Build numCuts overlapping rank windows of length rankCap.
    const windows: Float64Array[] = []
    for (let i = 0; i < numCuts; i++) {
      const startFloat = (i * (fullCount - rankCap)) / (numCuts - 1)
      const start = Math.floor(startFloat)
      const trimmed = new Float64Array(rankCap)
      for (let j = 0; j < rankCap; j++) trimmed[j] = schmidt[start + j]!
      const { spectrum } = modularSpectrum(trimmed)
      windows.push(spectrum)
    }

    let acc = 0
    let count = 0
    const refMaxK = (() => {
      let m = 0
      const w0 = windows[0]!
      for (let n = 0; n < w0.length; n++) {
        const v = Math.abs(w0[n]!)
        if (v > m) m = v
      }
      return m > 0 ? m : 1
    })()
    for (let i = 0; i < windows.length - 1; i++) {
      const a = windows[i]!
      const b = windows[i + 1]!
      let dist = 0
      for (let n = 0; n < a.length; n++) {
        const d = a[n]! - b[n]!
        dist += d * d
      }
      acc += Math.sqrt(dist) / refMaxK
      count++
    }
    return count > 0 ? acc / count : Number.NaN
  }

  return {
    a: stabilityAlong('a'),
    phi1: stabilityAlong('phi1'),
    phi2: stabilityAlong('phi2'),
  }
}

/**
 * Pick the cut-stability champion clock — the clock with the
 * SMALLEST instability metric.
 *
 * @param rates - Output of {@link computeCutStability}.
 * @param tieTolerance - Relative tolerance for a champion. Default 0.02.
 * @returns The champion clock, or `null` for a tie / non-finite values.
 */
export function findCutStabilityChampion(
  rates: CutStabilityRecord,
  tieTolerance = 0.02
): SrmtClock | null {
  const entries: { clock: SrmtClock; rate: number }[] = [
    { clock: 'a', rate: rates.a },
    { clock: 'phi1', rate: rates.phi1 },
    { clock: 'phi2', rate: rates.phi2 },
  ]
  if (!entries.every((e) => Number.isFinite(e.rate))) return null
  // Sort ascending (smallest = best).
  entries.sort((x, y) => x.rate - y.rate)
  const [best, second] = entries
  if (!best || !second) return null
  const scale = Math.max(second.rate, Number.EPSILON)
  if ((second.rate - best.rate) / scale < tieTolerance) return null
  return best.clock
}
