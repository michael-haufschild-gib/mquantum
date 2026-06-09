/**
 * Coherence Horizon URL sub-block serializer / deserializer.
 *
 * Mirrors `adsSerializer.ts`: the `ch_*` params are emitted only while
 * `qm=coherenceHorizon` (caller-gated) and parsed unconditionally for
 * forward compatibility.
 *
 * @module lib/url/coherenceHorizonSerializer
 */

import type { CoherenceHorizonPresetName } from '@/lib/geometry/extended/coherenceHorizon'
import {
  COHERENCE_HORIZON_PRESETS,
  COHERENCE_HORIZON_RANGES,
} from '@/lib/geometry/extended/coherenceHorizon'

import { parseFloatParam, setFloatParam } from './paramHelpers'

/** Shareable Coherence Horizon fields folded into the parent state type. */
export interface CoherenceHorizonUrlState {
  /** Named preset id; emitted when a non-`custom` preset is active. */
  coherenceHorizonPreset?: CoherenceHorizonPresetName
  /** Decoherence δ ∈ [0, 1]. */
  coherenceHorizonDecoherence?: number
  /** Branch separation s ∈ [0.5, 3]. */
  coherenceHorizonSeparation?: number
  /** Gaussian branch width w ∈ [0.15, 1.2]. */
  coherenceHorizonWidth?: number
  /** Fringe wavenumber k ∈ [0, 12]. */
  coherenceHorizonWaveNumber?: number
  /** Horizon scale (r_h at full coherence) ∈ [0, 1.2]. */
  coherenceHorizonScale?: number
  /** Photon-ring gain ∈ [0, 4]. */
  coherenceHorizonRingGain?: number
  /** Cloud glow ∈ [0.2, 4]. */
  coherenceHorizonGlow?: number
}

/**
 * Emit the `ch_*` sub-block. Callers gate on
 * `state.quantumMode === 'coherenceHorizon'`. Floats use 3-decimal precision
 * (matches the AdS wire convention).
 */
export function serializeCoherenceHorizon(
  params: URLSearchParams,
  state: CoherenceHorizonUrlState
): void {
  if (state.coherenceHorizonPreset !== undefined && state.coherenceHorizonPreset !== 'custom') {
    params.set('ch_preset', state.coherenceHorizonPreset)
  }
  setFloatParam(params, 'ch_dec', state.coherenceHorizonDecoherence, false, 3)
  setFloatParam(params, 'ch_sep', state.coherenceHorizonSeparation, false, 3)
  setFloatParam(params, 'ch_w', state.coherenceHorizonWidth, false, 3)
  setFloatParam(params, 'ch_k', state.coherenceHorizonWaveNumber, false, 3)
  setFloatParam(params, 'ch_hs', state.coherenceHorizonScale, false, 3)
  setFloatParam(params, 'ch_rg', state.coherenceHorizonRingGain, false, 3)
  setFloatParam(params, 'ch_glow', state.coherenceHorizonGlow, false, 3)
}

/**
 * Parse the `ch_*` sub-block into state. Malformed values fall back to
 * undefined (forward-compatibility rule); out-of-range values are clamped to
 * the documented ranges, and the store's clamped setters re-enforce the
 * invariants on apply.
 */
export function deserializeCoherenceHorizon(
  params: URLSearchParams,
  state: CoherenceHorizonUrlState
): void {
  const presetRaw = params.get('ch_preset')
  if (presetRaw && Object.prototype.hasOwnProperty.call(COHERENCE_HORIZON_PRESETS, presetRaw)) {
    state.coherenceHorizonPreset = presetRaw as CoherenceHorizonPresetName
  }
  const R = COHERENCE_HORIZON_RANGES
  state.coherenceHorizonDecoherence = parseFloatParam(
    params,
    'ch_dec',
    R.decoherence.min,
    R.decoherence.max
  )
  state.coherenceHorizonSeparation = parseFloatParam(
    params,
    'ch_sep',
    R.separation.min,
    R.separation.max
  )
  state.coherenceHorizonWidth = parseFloatParam(params, 'ch_w', R.width.min, R.width.max)
  state.coherenceHorizonWaveNumber = parseFloatParam(
    params,
    'ch_k',
    R.waveNumber.min,
    R.waveNumber.max
  )
  state.coherenceHorizonScale = parseFloatParam(
    params,
    'ch_hs',
    R.horizonScale.min,
    R.horizonScale.max
  )
  state.coherenceHorizonRingGain = parseFloatParam(params, 'ch_rg', R.ringGain.min, R.ringGain.max)
  state.coherenceHorizonGlow = parseFloatParam(params, 'ch_glow', R.glow.min, R.glow.max)
}
