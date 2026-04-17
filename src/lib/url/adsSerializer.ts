/**
 * Anti-de Sitter URL sub-block serializer / deserializer.
 *
 * Extracted from `state-serializer.ts` to keep the main serializer under
 * its per-file `max-lines` budget. Uses its own local parse/set helpers to
 * avoid re-exporting state-serializer internals.
 *
 * @module lib/url/adsSerializer
 */

import type {
  AdsHkllSource,
  AdsPresetName,
  AdsQuantizationBranch,
} from '@/lib/geometry/extended/antiDeSitter'
import { ADS_PRESET_MAP } from '@/lib/physics/antiDeSitter/presets'

/** URL-side branch type (mirrors the store enum). */
export type UrlAdsBranch = AdsQuantizationBranch

/** URL-side HKLL source type (mirrors the store enum). */
export type UrlAdsHkllSource = AdsHkllSource

/** Shareable fields this module reads from the parent state type. */
export interface AdsUrlState {
  /** Named preset id. Emitted when a named preset is active so shared links
   * preserve the user-visible label (without it, the raw-field round-trip
   * would reload as `custom`). Applied before the raw fields on deserialize. */
  adsPreset?: AdsPresetName
  adsDimension?: number
  adsRadial?: number
  adsAngular?: number
  adsMagnetic?: number
  adsMassParameter?: number
  adsBranch?: UrlAdsBranch
  adsBoundaryOverlay?: boolean
  // Stage 2A — BTZ sub-block. Toggle is emitted only when true; sub-fields
  // are emitted only when the toggle is on. Keeps canonical bound-state
  // links free of dormant `ads_btz=0` noise.
  adsBtzEnabled?: boolean
  adsBtzHorizonRadius?: number
  adsBtzOmega?: number
  adsBtzAngularM?: number
  // Stage 2B — HKLL bulk-reconstruction sub-block. Same gating as BTZ:
  // emit when enabled, drop when dormant.
  adsHkllEnabled?: boolean
  adsHkllBoundarySource?: UrlAdsHkllSource
  adsHkllSourceSigma?: number
  adsHkllPlaneWaveM?: number
}

/** Wire-format integer → HKLL source string. */
const HKLL_SOURCE_BY_INT: Readonly<Record<number, UrlAdsHkllSource>> = {
  0: 'eigenstate',
  1: 'localized',
  2: 'planeWave',
}

/** HKLL source string → wire-format integer. */
const HKLL_SOURCE_TO_INT: Readonly<Record<UrlAdsHkllSource, number>> = {
  eigenstate: 0,
  localized: 1,
  planeWave: 2,
}

const INTEGER_RE = /^-?\d+$/
const FLOAT_RE = /^-?(?:\d+\.?\d*|\.\d+)$/

function parseIntParam(
  params: URLSearchParams,
  key: string,
  min: number,
  max: number
): number | undefined {
  const raw = params.get(key)
  if (!raw || !INTEGER_RE.test(raw)) return undefined
  const v = Number(raw)
  if (!Number.isSafeInteger(v)) return undefined
  return Math.max(min, Math.min(max, v))
}

function parseFloatParam(
  params: URLSearchParams,
  key: string,
  min: number,
  max: number
): number | undefined {
  const raw = params.get(key)
  if (!raw || !FLOAT_RE.test(raw)) return undefined
  const v = Number(raw)
  if (!Number.isFinite(v)) return undefined
  return Math.max(min, Math.min(max, v))
}

function parseBoolParam(params: URLSearchParams, key: string): boolean | undefined {
  const raw = params.get(key)
  if (raw === '1') return true
  if (raw === '0') return false
  return undefined
}

function setIntParam(params: URLSearchParams, key: string, value: number | undefined): void {
  if (value !== undefined) params.set(key, value.toString())
}

function setFloatParam(
  params: URLSearchParams,
  key: string,
  value: number | undefined,
  precision = 3
): void {
  if (value !== undefined) params.set(key, value.toFixed(precision))
}

function setBoolParam(params: URLSearchParams, key: string, value: boolean | undefined): void {
  if (value !== undefined) params.set(key, value ? '1' : '0')
}

/**
 * Emit the `ads_*` sub-block. Callers gate on
 * `state.quantumMode === 'antiDeSitter'`.
 *
 * Emission rules:
 *   - `ads_preset` is emitted when a named (non-`custom`) preset is active.
 *   - BTZ sub-fields are emitted only when `adsBtzEnabled === true`; the
 *     toggle itself is also emitted only when true (dormant `ads_btz=0`
 *     would otherwise pollute canonical bound-state links).
 *   - HKLL sub-fields follow the same rule keyed off `adsHkllEnabled`.
 */
export function serializeAds(params: URLSearchParams, state: AdsUrlState): void {
  if (state.adsPreset !== undefined && state.adsPreset !== 'custom') {
    params.set('ads_preset', state.adsPreset)
  }
  setIntParam(params, 'ads_d', state.adsDimension)
  setIntParam(params, 'ads_n', state.adsRadial)
  setIntParam(params, 'ads_l', state.adsAngular)
  setIntParam(params, 'ads_m', state.adsMagnetic)
  setFloatParam(params, 'ads_mL', state.adsMassParameter)
  if (state.adsBranch !== undefined) {
    params.set('ads_qb', state.adsBranch === 'alternate' ? '1' : '0')
  }
  setBoolParam(params, 'ads_bo', state.adsBoundaryOverlay)
  if (state.adsBtzEnabled === true) {
    params.set('ads_btz', '1')
    setFloatParam(params, 'ads_btz_r', state.adsBtzHorizonRadius)
    setFloatParam(params, 'ads_btz_omega', state.adsBtzOmega)
    setIntParam(params, 'ads_btz_mA', state.adsBtzAngularM)
  }
  if (state.adsHkllEnabled === true) {
    params.set('ads_hkll', '1')
    if (state.adsHkllBoundarySource !== undefined) {
      params.set('ads_hkll_src', HKLL_SOURCE_TO_INT[state.adsHkllBoundarySource].toString())
    }
    setFloatParam(params, 'ads_hkll_sigma', state.adsHkllSourceSigma)
    setIntParam(params, 'ads_hkll_mb', state.adsHkllPlaneWaveM)
  }
}

/**
 * Parse the `ads_*` sub-block into state. Unknown / out-of-range values
 * fall back to undefined per the project-wide forward-compatibility rule;
 * the store's clamped setters enforce invariants on the happy path.
 *
 * `adsMagnetic` is parsed over the full [−6, +6] range — the downstream
 * setter re-clamps against the final ℓ value, which may be applied later
 * in the same transaction.
 */
export function deserializeAds(params: URLSearchParams, state: AdsUrlState): void {
  const presetRaw = params.get('ads_preset')
  if (presetRaw && Object.prototype.hasOwnProperty.call(ADS_PRESET_MAP, presetRaw)) {
    state.adsPreset = presetRaw as AdsPresetName
  }
  state.adsDimension = parseIntParam(params, 'ads_d', 3, 7)
  state.adsRadial = parseIntParam(params, 'ads_n', 0, 4)
  state.adsAngular = parseIntParam(params, 'ads_l', 0, 3)
  state.adsMagnetic = parseIntParam(params, 'ads_m', -6, 6)
  state.adsMassParameter = parseFloatParam(params, 'ads_mL', -3, 3)
  const adsQb = parseIntParam(params, 'ads_qb', 0, 1)
  if (adsQb !== undefined) state.adsBranch = adsQb === 1 ? 'alternate' : 'standard'
  state.adsBoundaryOverlay = parseBoolParam(params, 'ads_bo')
  state.adsBtzEnabled = parseBoolParam(params, 'ads_btz')
  state.adsBtzHorizonRadius = parseFloatParam(params, 'ads_btz_r', 0.05, 2.0)
  state.adsBtzOmega = parseFloatParam(params, 'ads_btz_omega', 0.1, 10.0)
  state.adsBtzAngularM = parseIntParam(params, 'ads_btz_mA', -5, 5)
  state.adsHkllEnabled = parseBoolParam(params, 'ads_hkll')
  const srcInt = parseIntParam(params, 'ads_hkll_src', 0, 2)
  if (srcInt !== undefined) state.adsHkllBoundarySource = HKLL_SOURCE_BY_INT[srcInt]
  state.adsHkllSourceSigma = parseFloatParam(params, 'ads_hkll_sigma', 0.05, 1.5)
  state.adsHkllPlaneWaveM = parseIntParam(params, 'ads_hkll_mb', 0, 8)
}
