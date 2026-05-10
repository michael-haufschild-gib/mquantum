/**
 * Wheeler–DeWitt SRMT (Superspace-Relational Modular Time) URL sub-block.
 *
 * Extracted from `state-serializer.ts` so the main serializer stays under
 * its per-file `max-lines` budget. Follows the same pattern as
 * `adsSerializer.ts`: local parse helpers, single emit + parse function.
 *
 * ## Scope guard
 *
 * {@link serializeSrmt} accepts the current `quantumMode` and no-ops when
 * it is anything other than `'wheelerDeWitt'`. This moves the scope
 * decision from caller discipline (which was the cause of a repeated
 * "unguarded SRMT params emitted on a non-WdW link" class of bugs) into
 * the serializer itself.
 *
 * {@link deserializeSrmt} parses unconditionally — apply-time wiring
 * (`applyWdwParams`) scopes the parsed fields to `wheelerDeWitt` so
 * pre-existing links with SRMT params still restore correctly.
 *
 * @module lib/url/srmtSerializer
 */

import type { WdwSrmtClock } from '@/lib/geometry/extended/wheelerDeWitt'

import { parseBoolParam, parseFloatParam, parseIntParam } from './paramHelpers'

/** Valid SRMT clock axes, as accepted / emitted in URLs. */
export const VALID_SRMT_CLOCKS = ['a', 'phi1', 'phi2'] as const satisfies readonly WdwSrmtClock[]
/** URL-side clock type alias (mirrors `WdwSrmtClock`). */
export type UrlWdwSrmtClock = (typeof VALID_SRMT_CLOCKS)[number]

/** Shareable SRMT fields on the parent URL state type. */
export interface SrmtUrlState {
  wdwSrmtEnabled?: boolean
  wdwSrmtClock?: UrlWdwSrmtClock
  wdwSrmtCutNormalized?: number
  wdwSrmtRankCap?: number
  wdwSrmtHeatmapIntensity?: number
}

/**
 * Emit the SRMT sub-block. When `quantumMode` is not
 * `'wheelerDeWitt'` the function is a no-op — SRMT fields never pollute
 * links for unrelated modes, regardless of whether the state carries
 * stale SRMT values.
 *
 * @param params - Mutable URLSearchParams accumulator.
 * @param quantumMode - Active quantum mode; controls the scope guard.
 * @param state - Shareable state containing optional SRMT fields.
 */
export function serializeSrmt(
  params: URLSearchParams,
  quantumMode: string | undefined,
  state: SrmtUrlState
): void {
  if (quantumMode !== 'wheelerDeWitt') return
  if (state.wdwSrmtEnabled !== undefined) params.set('srmt', state.wdwSrmtEnabled ? '1' : '0')
  if (state.wdwSrmtClock !== undefined) params.set('srmt_c', state.wdwSrmtClock)
  if (state.wdwSrmtCutNormalized !== undefined)
    params.set('srmt_x', state.wdwSrmtCutNormalized.toFixed(2))
  if (state.wdwSrmtRankCap !== undefined) params.set('srmt_r', state.wdwSrmtRankCap.toString())
  if (state.wdwSrmtHeatmapIntensity !== undefined)
    params.set('srmt_h', state.wdwSrmtHeatmapIntensity.toFixed(2))
}

/**
 * Parse the SRMT sub-block. Parsed unconditionally — apply-time wiring
 * (`applyWdwParams`) scopes these fields to `wheelerDeWitt`.
 *
 * @param params - Read-only URLSearchParams source.
 * @param state - Mutable parsed state (SRMT fields added in-place).
 */
export function deserializeSrmt(params: URLSearchParams, state: SrmtUrlState): void {
  state.wdwSrmtEnabled = parseBoolParam(params, 'srmt')
  const clockRaw = params.get('srmt_c')
  state.wdwSrmtClock =
    clockRaw && (VALID_SRMT_CLOCKS as readonly string[]).includes(clockRaw)
      ? (clockRaw as UrlWdwSrmtClock)
      : undefined
  state.wdwSrmtCutNormalized = parseFloatParam(params, 'srmt_x', 0.1, 0.9)
  state.wdwSrmtRankCap = parseIntParam(params, 'srmt_r', 8, 256)
  state.wdwSrmtHeatmapIntensity = parseFloatParam(params, 'srmt_h', 0, 1)
}
