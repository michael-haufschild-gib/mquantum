/**
 * WKB-phase cross-diagnostic: which clock is "most time-like" in the
 * semiclassical Hamilton-Jacobi sense?
 *
 * ## Physics
 *
 * In the semiclassical limit the Wheeler-DeWitt wavefunction factorises
 * as `χ(a, φ) = R(a, φ) · exp(i S(a, φ))` with slowly-varying amplitude
 * `R` and rapidly-oscillating phase `S`. The phase `S` is the
 * Hamilton-Jacobi action; its gradient with respect to a coordinate
 * `x` is the momentum conjugate to `x`:
 *
 *   `p_x = ∂S/∂x`
 *
 * On a classical trajectory in superspace, the variable along which
 * `S` winds most rapidly is the variable whose conjugate momentum
 * dominates — the natural Hamiltonian "time" for that trajectory. For
 * the SRMT conjecture to be on physical grounds, the DeWitt-timelike
 * coordinate `a` should be the variable along which `S` accumulates
 * most rapidly, integrated over the grid.
 *
 * ## Independence from the modular/HJ diagnostic
 *
 * This score is computed entirely from `arg(χ)` — it does NOT use the
 * Schmidt decomposition, modular spectrum, Hamilton-Jacobi operator,
 * or any affine fit. Agreement between the WKB champion (this module)
 * and the rigid-fit champion (the main SRMT diagnostic) is therefore
 * INDEPENDENT evidence for SRMT — two unrelated constructions both
 * picking `a` is the kind of cross-check that turns a numerical
 * coincidence into a physical signal.
 *
 * @module lib/physics/srmt/wkbChampion
 */

import type { SrmtClock } from './types'
import { extractWkbPhase } from './wkbPhase'

/**
 * Mean of `|∂S/∂x|` over the grid, for each clock candidate.
 *
 * For each clock `x ∈ {a, φ₁, φ₂}` we extract the WKB phase `S(a, φ)`
 * unwrapped along axis `x`, then average the absolute finite-difference
 * gradient in the `x` direction over all interior cells. The
 * normalisation is per-cell so grids of different shape can be
 * compared directly.
 *
 * The clock with the largest score is the "WKB-natural" clock —
 * the variable along which the semiclassical action accumulates
 * most rapidly per grid-cell, hence the variable with the
 * largest conjugate momentum.
 *
 * Edge cases:
 *  - When `arg(χ)` is dominated by numerical noise (very small `|χ|`)
 *    the unwrap may be unstable; the smoothing in `extractWkbPhase`
 *    helps but does not eliminate this. Treat results from regions of
 *    very low density with caution.
 *  - The score is sign-invariant (`|∂S/∂x|`) — counter-circulating
 *    classical trajectories do not cancel.
 */
export interface WkbPhaseRateRecord {
  a: number
  phi1: number
  phi2: number
}

function meanAbsGradientAlongAxis(
  S: Float64Array,
  shape: [number, number, number],
  axis: 0 | 1 | 2
): number {
  const [N0, N1, N2] = shape
  // Stride-major: row-major with order (a, φ₁, φ₂).
  const strides: [number, number, number] = [N1 * N2, N2, 1]
  const axisStride = strides[axis]!
  const axisLen = [N0, N1, N2][axis]!
  if (axisLen < 2) return 0

  let count = 0
  let sum = 0
  for (let i0 = 0; i0 < N0; i0++) {
    for (let i1 = 0; i1 < N1; i1++) {
      for (let i2 = 0; i2 < N2; i2++) {
        const coord = [i0, i1, i2][axis]!
        if (coord >= axisLen - 1) continue
        const idx = i0 * strides[0]! + i1 * strides[1]! + i2 * strides[2]!
        const next = idx + axisStride
        const grad = S[next]! - S[idx]!
        if (Number.isFinite(grad)) {
          sum += Math.abs(grad)
          count++
        }
      }
    }
  }
  return count > 0 ? sum / count : 0
}

/**
 * Compute the WKB phase-rate (mean `|∂S/∂x|`) for each candidate clock.
 *
 * @param chi - Interleaved complex `χ` amplitudes, length `2·Na·Nphi²`.
 * @param shape - `[Na, Nphi, Nphi]` grid shape.
 * @param aMin - Lower bound of the `a` axis (passed through to
 *               {@link extractWkbPhase}; used only for boundary checks).
 * @param aMax - Upper bound of the `a` axis.
 * @param sigmaCells - Gaussian smoothing width for the unwrap step.
 *               Defaults to `1.0`. Set to `0` to disable smoothing.
 * @returns Per-clock mean phase rate. Larger = the clock is more
 *          "time-like" in the semiclassical sense.
 */
export function computeWkbPhaseRates(
  chi: Float32Array,
  shape: [number, number, number],
  aMin: number,
  aMax: number,
  sigmaCells = 1.0
): WkbPhaseRateRecord {
  const S_a = extractWkbPhase(chi, shape, aMin, aMax, 'a', sigmaCells)
  const S_phi1 = extractWkbPhase(chi, shape, aMin, aMax, 'phi1', sigmaCells)
  const S_phi2 = extractWkbPhase(chi, shape, aMin, aMax, 'phi2', sigmaCells)
  return {
    a: meanAbsGradientAlongAxis(S_a, shape, 0),
    phi1: meanAbsGradientAlongAxis(S_phi1, shape, 1),
    phi2: meanAbsGradientAlongAxis(S_phi2, shape, 2),
  }
}

/**
 * Pick the WKB-natural clock — the one with the largest mean
 * `|∂S/∂x|`. This is the "champion" under the WKB cross-diagnostic.
 *
 * Returns `null` when fewer than three rates are finite, or when the
 * top two rates differ by less than `tieTolerance · max_rate`
 * (relative tolerance — phase rates are dimensionful but their
 * relative magnitude is what carries physical content).
 *
 * @param rates - Output of {@link computeWkbPhaseRates}.
 * @param tieTolerance - Relative margin for a champion to emerge.
 *               Defaults to 0.02 (2 %).
 * @returns The WKB champion clock, or `null`.
 */
export function findWkbChampion(rates: WkbPhaseRateRecord, tieTolerance = 0.02): SrmtClock | null {
  const entries: { clock: SrmtClock; rate: number }[] = [
    { clock: 'a', rate: rates.a },
    { clock: 'phi1', rate: rates.phi1 },
    { clock: 'phi2', rate: rates.phi2 },
  ]
  if (!entries.every((e) => Number.isFinite(e.rate))) return null
  // Sort descending (largest first).
  entries.sort((x, y) => y.rate - x.rate)
  const [best, second] = entries
  if (!best || !second) return null
  if (best.rate <= 0) return null
  if ((best.rate - second.rate) / best.rate < tieTolerance) return null
  return best.clock
}
