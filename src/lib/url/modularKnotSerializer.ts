/**
 * Modular Knot URL sub-block serializer / deserializer.
 *
 * Mirrors `bifurcationHorizonSerializer.ts`: the `mk_*` params are emitted only
 * while `qm=modularKnot` (caller-gated) and parsed unconditionally for forward
 * compatibility.
 *
 * The five keys `mk_glow`, `mk_flow`, `mk_len`, `mk_n`, `mk_tube` are disjoint
 * from every other mode's URL keys (verified against the existing serializers).
 * `mk_glow`, `mk_flow`, `mk_tube` are 3-decimal floats; `mk_len` and `mk_n` map
 * to the integer-valued `maxLen` / `geodesicCount` bake-affecting fields.
 *
 * @module lib/url/modularKnotSerializer
 */

import type { ModularKnotPresetName } from '@/lib/geometry/extended/modularKnot'
import { MODULAR_KNOT_PRESETS, MODULAR_KNOT_RANGES } from '@/lib/geometry/extended/modularKnot'

import { parseFloatParam, parseIntParam, setFloatParam, setIntParam } from './paramHelpers'

/** Shareable Modular Knot fields folded into the parent state type. */
export interface ModularKnotUrlState {
  /** Named preset id; emitted when a non-`custom` preset is active. */
  modularKnotPreset?: ModularKnotPresetName
  /** Cloud emission gain ∈ [0.2, 4]. */
  modularKnotGlow?: number
  /** Auto-rotation flow rate ∈ [0, 1.5]. */
  modularKnotFlow?: number
  /** Maximum geodesic word length ∈ [4, 10] (integer). Bake-affecting. */
  modularKnotMaxLen?: number
  /** Cap on the number of geodesics splatted ∈ [6, 64] (integer). Bake-affecting. */
  modularKnotGeodesicCount?: number
  /** Geodesic tube Gaussian radius ∈ [0.6, 3]. Bake-affecting. */
  modularKnotTubeWidth?: number
}

/**
 * Emit the `mk_*` sub-block. Callers gate on
 * `state.quantumMode === 'modularKnot'`. Floats use 3-decimal precision
 * (matches the AdS / Coherence / Bifurcation Horizon wire convention); the two
 * integer bake knobs are emitted as base-10 integers.
 */
export function serializeModularKnot(params: URLSearchParams, state: ModularKnotUrlState): void {
  if (state.modularKnotPreset !== undefined && state.modularKnotPreset !== 'custom') {
    params.set('mk_preset', state.modularKnotPreset)
  }
  setFloatParam(params, 'mk_glow', state.modularKnotGlow, false, 3)
  setFloatParam(params, 'mk_flow', state.modularKnotFlow, false, 3)
  setIntParam(params, 'mk_len', state.modularKnotMaxLen)
  setIntParam(params, 'mk_n', state.modularKnotGeodesicCount)
  setFloatParam(params, 'mk_tube', state.modularKnotTubeWidth, false, 3)
}

/**
 * Parse the `mk_*` sub-block into state. Malformed values fall back to
 * undefined (forward-compatibility rule); out-of-range values are clamped to
 * `MODULAR_KNOT_RANGES`, and the store's clamped setters re-enforce the
 * invariants on apply. Unknown preset ids are dropped.
 */
export function deserializeModularKnot(params: URLSearchParams, state: ModularKnotUrlState): void {
  const presetRaw = params.get('mk_preset')
  if (presetRaw && Object.prototype.hasOwnProperty.call(MODULAR_KNOT_PRESETS, presetRaw)) {
    state.modularKnotPreset = presetRaw as ModularKnotPresetName
  }
  const R = MODULAR_KNOT_RANGES
  state.modularKnotGlow = parseFloatParam(params, 'mk_glow', R.glow.min, R.glow.max)
  state.modularKnotFlow = parseFloatParam(params, 'mk_flow', R.flow.min, R.flow.max)
  state.modularKnotMaxLen = parseIntParam(params, 'mk_len', R.maxLen.min, R.maxLen.max)
  state.modularKnotGeodesicCount = parseIntParam(
    params,
    'mk_n',
    R.geodesicCount.min,
    R.geodesicCount.max
  )
  state.modularKnotTubeWidth = parseFloatParam(params, 'mk_tube', R.tubeWidth.min, R.tubeWidth.max)
}
