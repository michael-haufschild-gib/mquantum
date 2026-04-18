/**
 * Champion-clock selection for the SRMT diagnostic.
 *
 * Given an affine-match quality score for each of the three clocks
 * (`a`, `φ₁`, `φ₂`), "champion" is the clock with the LOWEST score
 * (better fit = smaller residual). A champion is only declared when all
 * three qualities are finite AND the leader's advantage over the
 * runner-up exceeds {@link DEFAULT_CHAMPION_TIE_TOLERANCE} — inside the
 * tolerance the three are considered tied and we return `null`.
 *
 * This helper is the ONE source of truth consumed by both the worker
 * dispatcher (telemetry) and the UI (highlighted row). Before
 * extraction, two byte-identical copies of the logic lived in
 * `rendering/.../WheelerDeWittSrmtWorker.ts` and
 * `components/.../SrmtSpectrumPanel.tsx` — any future change would have
 * risked drift between the two and visible UI/telemetry disagreement.
 *
 * @module lib/physics/srmt/championClock
 */

import type { SrmtClock } from './types'

/**
 * Minimum advantage (in affine-match quality units) required for a clock
 * to be declared the champion. The tolerance is chosen deliberately
 * tighter than typical near-ties in real WdW data but loose enough to
 * absorb numerical noise from the Lanczos eigensolver.
 */
export const DEFAULT_CHAMPION_TIE_TOLERANCE = 0.02

/**
 * Shape consumed by {@link findChampionClock}. The store's
 * `SrmtClockQuality` interface and the worker's `qualityFromResults`
 * output both satisfy this shape.
 */
export interface ClockQualityRecord {
  a: number
  phi1: number
  phi2: number
}

/**
 * Pick the champion clock — the one with the minimum (= best) affine
 * match quality. Returns `null` when fewer than three clocks have finite
 * entries, or when the top two are within `tieTolerance` of each other.
 *
 * The strict-less-than comparison mirrors the historical contract: a
 * margin of exactly `tieTolerance` is enough to name the champion (real
 * collisions are rarer than clean wins by the tolerance).
 *
 * @param quality - Per-clock affine match qualities.
 * @param tieTolerance - Minimum margin for a champion to emerge. Defaults
 *   to {@link DEFAULT_CHAMPION_TIE_TOLERANCE}.
 * @returns The champion clock, or `null` if no clear winner.
 */
export function findChampionClock(
  quality: ClockQualityRecord,
  tieTolerance: number = DEFAULT_CHAMPION_TIE_TOLERANCE
): SrmtClock | null {
  const entries: { clock: SrmtClock; q: number }[] = [
    { clock: 'a', q: quality.a },
    { clock: 'phi1', q: quality.phi1 },
    { clock: 'phi2', q: quality.phi2 },
  ]
  if (!entries.every((e) => Number.isFinite(e.q))) return null
  entries.sort((x, y) => x.q - y.q)
  const [best, second] = entries
  if (!best || !second) return null
  if (second.q - best.q < tieTolerance) return null
  return best.clock
}
