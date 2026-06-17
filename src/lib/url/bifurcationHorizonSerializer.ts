/**
 * Bifurcation Horizon URL sub-block serializer / deserializer.
 *
 * Mirrors `riemannZetaSerializer.ts`: the `bh_*` params are emitted only
 * while `qm=bifurcationHorizon` (caller-gated) and parsed unconditionally for
 * forward compatibility.
 *
 * ⚠️ The keys `bh_m`, `bh_l`, `bh_s` are already owned by the TDSE
 * black-hole-ringdown serializer; this mode uses the disjoint `bh_neck`,
 * `bh_throat`, `bh_glow`, `bh_flow`, `bh_swirl`, `bh_rs`, `bh_off`, `bh_wind`,
 * `bh_therm`, `bh_preset` keys instead.
 *
 * @module lib/url/bifurcationHorizonSerializer
 */

import type { BifurcationHorizonPresetName } from '@/lib/geometry/extended/bifurcationHorizon'
import {
  BIFURCATION_HORIZON_PRESETS,
  BIFURCATION_HORIZON_RANGES,
} from '@/lib/geometry/extended/bifurcationHorizon'

import { parseFloatParam, setFloatParam } from './paramHelpers'

/** Shareable Bifurcation Horizon fields folded into the parent state type. */
export interface BifurcationHorizonUrlState {
  /** Named preset id; emitted when a non-`custom` preset is active. */
  bifurcationHorizonPreset?: BifurcationHorizonPresetName
  /** Neck radius factor r₀ ∈ [0.05, 0.6] (the bifurcation surface). */
  bifurcationHorizonNeckRadius?: number
  /** Throat-membrane Gaussian half-width ∈ [0.05, 0.6]. */
  bifurcationHorizonThroatWidth?: number
  /** Cloud emission gain ∈ [0.2, 4]. */
  bifurcationHorizonGlow?: number
  /** Modular dilation flow rate ∈ [0, 1.5]. */
  bifurcationHorizonFlowRate?: number
  /** Azimuthal swirl ∈ [0, 2]. */
  bifurcationHorizonSwirl?: number
  /** Extremal redshift radius ∈ [0, 1]. */
  bifurcationHorizonRedshiftRadius?: number
  /** Off-line ring displacement ∈ [0, 0.6] (0 = RH on-line case). */
  bifurcationHorizonOffLine?: number
  /** Phase winding along the throat ∈ [0, 4]. */
  bifurcationHorizonWinding?: number
  /** KMS thermal-wedge haze gain ∈ [0, 2]. */
  bifurcationHorizonThermalGain?: number
}

/**
 * Emit the `bh_*` sub-block. Callers gate on
 * `state.quantumMode === 'bifurcationHorizon'`. Floats use 3-decimal
 * precision (matches the AdS / Coherence / Arithmetic Horizon wire
 * convention).
 */
export function serializeBifurcationHorizon(
  params: URLSearchParams,
  state: BifurcationHorizonUrlState
): void {
  if (state.bifurcationHorizonPreset !== undefined && state.bifurcationHorizonPreset !== 'custom') {
    params.set('bh_preset', state.bifurcationHorizonPreset)
  }
  setFloatParam(params, 'bh_neck', state.bifurcationHorizonNeckRadius, false, 3)
  setFloatParam(params, 'bh_throat', state.bifurcationHorizonThroatWidth, false, 3)
  setFloatParam(params, 'bh_glow', state.bifurcationHorizonGlow, false, 3)
  setFloatParam(params, 'bh_flow', state.bifurcationHorizonFlowRate, false, 3)
  setFloatParam(params, 'bh_swirl', state.bifurcationHorizonSwirl, false, 3)
  setFloatParam(params, 'bh_rs', state.bifurcationHorizonRedshiftRadius, false, 3)
  setFloatParam(params, 'bh_off', state.bifurcationHorizonOffLine, false, 3)
  setFloatParam(params, 'bh_wind', state.bifurcationHorizonWinding, false, 3)
  setFloatParam(params, 'bh_therm', state.bifurcationHorizonThermalGain, false, 3)
}

/**
 * Parse the `bh_*` sub-block into state. Malformed values fall back to
 * undefined (forward-compatibility rule); out-of-range values are clamped to
 * `BIFURCATION_HORIZON_RANGES`, and the store's clamped setters re-enforce the
 * invariants on apply. Unknown preset ids are dropped.
 */
export function deserializeBifurcationHorizon(
  params: URLSearchParams,
  state: BifurcationHorizonUrlState
): void {
  const presetRaw = params.get('bh_preset')
  if (presetRaw && Object.prototype.hasOwnProperty.call(BIFURCATION_HORIZON_PRESETS, presetRaw)) {
    state.bifurcationHorizonPreset = presetRaw as BifurcationHorizonPresetName
  }
  const R = BIFURCATION_HORIZON_RANGES
  state.bifurcationHorizonNeckRadius = parseFloatParam(
    params,
    'bh_neck',
    R.neckRadius.min,
    R.neckRadius.max
  )
  state.bifurcationHorizonThroatWidth = parseFloatParam(
    params,
    'bh_throat',
    R.throatWidth.min,
    R.throatWidth.max
  )
  state.bifurcationHorizonGlow = parseFloatParam(params, 'bh_glow', R.glow.min, R.glow.max)
  state.bifurcationHorizonFlowRate = parseFloatParam(
    params,
    'bh_flow',
    R.flowRate.min,
    R.flowRate.max
  )
  state.bifurcationHorizonSwirl = parseFloatParam(params, 'bh_swirl', R.swirl.min, R.swirl.max)
  state.bifurcationHorizonRedshiftRadius = parseFloatParam(
    params,
    'bh_rs',
    R.redshiftRadius.min,
    R.redshiftRadius.max
  )
  state.bifurcationHorizonOffLine = parseFloatParam(params, 'bh_off', R.offLine.min, R.offLine.max)
  state.bifurcationHorizonWinding = parseFloatParam(params, 'bh_wind', R.winding.min, R.winding.max)
  state.bifurcationHorizonThermalGain = parseFloatParam(
    params,
    'bh_therm',
    R.thermalGain.min,
    R.thermalGain.max
  )
}
