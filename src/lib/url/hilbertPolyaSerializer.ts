/**
 * Hilbert–Pólya Spectrum URL sub-block serializer / deserializer.
 *
 * Mirrors `riemannZetaSerializer.ts`: the `hp_*` params are emitted only
 * while `qm=hilbertPolya` (caller-gated) and parsed unconditionally for
 * forward compatibility.
 *
 * @module lib/url/hilbertPolyaSerializer
 */

import type { HilbertPolyaPresetName } from '@/lib/geometry/extended/hilbertPolya'
import { HILBERT_POLYA_PRESETS, HILBERT_POLYA_RANGES } from '@/lib/geometry/extended/hilbertPolya'

import {
  parseBoolParam,
  parseFloatParam,
  parseIntParam,
  setBoolParam,
  setFloatParam,
  setIntParam,
} from './paramHelpers'

/** Shareable Hilbert–Pólya fields folded into the parent state type. */
export interface HilbertPolyaUrlState {
  /** Named preset id; emitted when a non-`custom` preset is active. */
  hilbertPolyaPreset?: HilbertPolyaPresetName
  /** Upper Re z bound of the spectral window ∈ [40, 240]. */
  hilbertPolyaZMax?: number
  /** Half-extent of the Im z axis ∈ [0.6, 1.2]. */
  hilbertPolyaYExtent?: number
  /** Gaussian filament half-width in Re z units ∈ [0.05, 0.5]. */
  hilbertPolyaFilamentWidth?: number
  /** Filament emission gain ∈ [0.2, 4]. */
  hilbertPolyaGlow?: number
  /** Veil (cancellation-noise fog) emission gain ∈ [0, 2]. */
  hilbertPolyaFogGain?: number
  /** Critical-plane marker at Im z = 0 (render-only). */
  hilbertPolyaPlaneMarker?: boolean
}

/**
 * Emit the `hp_*` sub-block. Callers gate on
 * `state.quantumMode === 'hilbertPolya'`. Floats use 3-decimal precision
 * (matches the AdS / horizon-mode wire convention); `hp_zmax` is rounded to
 * an integer on emit so non-integer store values are never silently dropped
 * by the integer wire format.
 */
export function serializeHilbertPolya(params: URLSearchParams, state: HilbertPolyaUrlState): void {
  if (state.hilbertPolyaPreset !== undefined && state.hilbertPolyaPreset !== 'custom') {
    params.set('hp_preset', state.hilbertPolyaPreset)
  }
  setIntParam(
    params,
    'hp_zmax',
    state.hilbertPolyaZMax === undefined ? undefined : Math.round(state.hilbertPolyaZMax)
  )
  setFloatParam(params, 'hp_y', state.hilbertPolyaYExtent, false, 3)
  setFloatParam(params, 'hp_fw', state.hilbertPolyaFilamentWidth, false, 3)
  setFloatParam(params, 'hp_glow', state.hilbertPolyaGlow, false, 3)
  setFloatParam(params, 'hp_fog', state.hilbertPolyaFogGain, false, 3)
  setBoolParam(params, 'hp_plane', state.hilbertPolyaPlaneMarker)
}

/**
 * Parse the `hp_*` sub-block into state. Malformed values fall back to
 * undefined (forward-compatibility rule); out-of-range values are clamped to
 * `HILBERT_POLYA_RANGES`, and the store's clamped setters re-enforce the
 * invariants on apply. Unknown preset ids are dropped.
 */
export function deserializeHilbertPolya(
  params: URLSearchParams,
  state: HilbertPolyaUrlState
): void {
  const presetRaw = params.get('hp_preset')
  if (presetRaw && Object.prototype.hasOwnProperty.call(HILBERT_POLYA_PRESETS, presetRaw)) {
    state.hilbertPolyaPreset = presetRaw as HilbertPolyaPresetName
  }
  const R = HILBERT_POLYA_RANGES
  state.hilbertPolyaZMax = parseIntParam(params, 'hp_zmax', R.zMax.min, R.zMax.max)
  state.hilbertPolyaYExtent = parseFloatParam(params, 'hp_y', R.yExtent.min, R.yExtent.max)
  state.hilbertPolyaFilamentWidth = parseFloatParam(
    params,
    'hp_fw',
    R.filamentWidth.min,
    R.filamentWidth.max
  )
  state.hilbertPolyaGlow = parseFloatParam(params, 'hp_glow', R.glow.min, R.glow.max)
  state.hilbertPolyaFogGain = parseFloatParam(params, 'hp_fog', R.fogGain.min, R.fogGain.max)
  state.hilbertPolyaPlaneMarker = parseBoolParam(params, 'hp_plane')
}
