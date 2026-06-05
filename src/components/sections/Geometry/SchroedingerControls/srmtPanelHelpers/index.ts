/**
 * Pure helpers shared by the SRMT spectrum panel components.
 *
 * Lives in a `.ts` file (no JSX) so HMR fast-refresh works correctly on
 * the colocated `.tsx` components — `react-refresh/only-export-components`
 * forbids exporting non-components from a `.tsx` file.
 *
 * @module components/sections/Geometry/SchroedingerControls/srmtPanelHelpers
 */

import type { SrmtClock } from '@/lib/physics/srmt'
import { DEFAULT_CHAMPION_TIE_TOLERANCE, findChampionClock } from '@/lib/physics/srmt'
import type { SrmtClockQuality } from '@/stores/diagnostics/srmtDiagnosticStore'

/** Discrete visual tier mapped from a numeric quality score. */
export type SrmtQualityTier = 'good' | 'marginal' | 'poor' | 'pending'

/**
 * Map an affine-match quality score to a discrete colour tier. `NaN`
 * maps to `pending` so cross-clock placeholders never flash the
 * good-green chip before their replies arrive.
 */
export function qualityTier(q: number): SrmtQualityTier {
  if (!Number.isFinite(q)) return 'pending'
  if (q < 0.1) return 'good'
  if (q < 0.3) return 'marginal'
  return 'poor'
}

/**
 * Count clocks with finite affine-quality entries — used both for the
 * "Computing: N/3 clocks" progress strip and to gate the champion
 * highlight (champion only appears once all three are populated).
 */
export function countCompletedClocks(quality: SrmtClockQuality): number {
  let n = 0
  if (Number.isFinite(quality.a)) n++
  if (Number.isFinite(quality.phi1)) n++
  if (Number.isFinite(quality.phi2)) n++
  return n
}

/**
 * Determine the champion clock: the one with the minimum affine
 * quality that also leads the runner-up by at least
 * {@link DEFAULT_CHAMPION_TIE_TOLERANCE}. Returns `null` when fewer
 * than three clocks have finite values, or when the top two are within
 * tolerance. Delegates to the shared library so UI + telemetry agree.
 */
export function selectChampionClock(quality: SrmtClockQuality): SrmtClock | null {
  return findChampionClock(quality, DEFAULT_CHAMPION_TIE_TOLERANCE)
}
