/**
 * Riemann Zeta (Arithmetic Horizon) URL sub-block serializer / deserializer.
 *
 * Mirrors `coherenceHorizonSerializer.ts`: the `rz_*` params are emitted only
 * while `qm=riemannZeta` (caller-gated) and parsed unconditionally for
 * forward compatibility.
 *
 * @module lib/url/riemannZetaSerializer
 */

import type { RiemannZetaPresetName, RiemannZetaSource } from '@/lib/geometry/extended/riemannZeta'
import { RIEMANN_ZETA_PRESETS, RIEMANN_ZETA_RANGES } from '@/lib/geometry/extended/riemannZeta'

import {
  parseBoolParam,
  parseFloatParam,
  parseIntParam,
  setBoolParam,
  setFloatParam,
  setIntParam,
} from './paramHelpers'

/** Shareable Riemann Zeta fields folded into the parent state type. */
export interface RiemannZetaUrlState {
  /** Named preset id; emitted when a non-`custom` preset is active. */
  riemannZetaPreset?: RiemannZetaPresetName
  /** Source basis: `zeros` (spectral synthesis) or `primes` (primon gas). */
  riemannZetaSource?: RiemannZetaSource
  /** Number of ζ zeros Nz ∈ [8, 100]. */
  riemannZetaNumZeros?: number
  /** Primon-gas inverse temperature β ∈ [1.01, 3]. */
  riemannZetaBeta?: number
  /** Normalised Berry–Keating horizon radius ∈ [0, 1]. */
  riemannZetaHorizonRadius?: number
  /** Angular momentum ℓ ∈ [0, 4]. */
  riemannZetaAngularL?: number
  /** Magnetic number m ∈ [−4, 4]. */
  riemannZetaAngularM?: number
  /** Self-similar dilation flow rate ∈ [0, 1.5]. */
  riemannZetaFlowRate?: number
  /** Cloud emission gain ∈ [0.2, 4]. */
  riemannZetaGlow?: number
  /** Cutaway wedge toggle (render-only). */
  riemannZetaCutaway?: boolean
}

/**
 * Emit the `rz_*` sub-block. Callers gate on
 * `state.quantumMode === 'riemannZeta'`. Floats use 3-decimal precision
 * (matches the AdS / Coherence Horizon wire convention); `rz_src` encodes the
 * source enum as 0 = zeros, 1 = primes.
 */
export function serializeRiemannZeta(params: URLSearchParams, state: RiemannZetaUrlState): void {
  if (state.riemannZetaPreset !== undefined && state.riemannZetaPreset !== 'custom') {
    params.set('rz_preset', state.riemannZetaPreset)
  }
  if (state.riemannZetaSource !== undefined) {
    params.set('rz_src', state.riemannZetaSource === 'primes' ? '1' : '0')
  }
  setIntParam(params, 'rz_nz', state.riemannZetaNumZeros)
  setFloatParam(params, 'rz_beta', state.riemannZetaBeta, false, 3)
  setFloatParam(params, 'rz_rh', state.riemannZetaHorizonRadius, false, 3)
  setIntParam(params, 'rz_l', state.riemannZetaAngularL)
  setIntParam(params, 'rz_m', state.riemannZetaAngularM)
  setFloatParam(params, 'rz_flow', state.riemannZetaFlowRate, false, 3)
  setFloatParam(params, 'rz_glow', state.riemannZetaGlow, false, 3)
  setBoolParam(params, 'rz_cut', state.riemannZetaCutaway)
}

/**
 * Parse the `rz_*` sub-block into state. Malformed values fall back to
 * undefined (forward-compatibility rule); out-of-range values are clamped to
 * `RIEMANN_ZETA_RANGES`, and the store's clamped setters re-enforce the
 * invariants on apply. Unknown preset ids are dropped.
 */
export function deserializeRiemannZeta(params: URLSearchParams, state: RiemannZetaUrlState): void {
  const presetRaw = params.get('rz_preset')
  if (presetRaw && Object.prototype.hasOwnProperty.call(RIEMANN_ZETA_PRESETS, presetRaw)) {
    state.riemannZetaPreset = presetRaw as RiemannZetaPresetName
  }
  const sourceRaw = params.get('rz_src')
  if (sourceRaw === '0') state.riemannZetaSource = 'zeros'
  else if (sourceRaw === '1') state.riemannZetaSource = 'primes'
  const R = RIEMANN_ZETA_RANGES
  state.riemannZetaNumZeros = parseIntParam(params, 'rz_nz', R.numZeros.min, R.numZeros.max)
  state.riemannZetaBeta = parseFloatParam(params, 'rz_beta', R.beta.min, R.beta.max)
  state.riemannZetaHorizonRadius = parseFloatParam(
    params,
    'rz_rh',
    R.horizonRadius.min,
    R.horizonRadius.max
  )
  state.riemannZetaAngularL = parseIntParam(params, 'rz_l', R.angularL.min, R.angularL.max)
  state.riemannZetaAngularM = parseIntParam(params, 'rz_m', R.angularM.min, R.angularM.max)
  state.riemannZetaFlowRate = parseFloatParam(params, 'rz_flow', R.flowRate.min, R.flowRate.max)
  state.riemannZetaGlow = parseFloatParam(params, 'rz_glow', R.glow.min, R.glow.max)
  state.riemannZetaCutaway = parseBoolParam(params, 'rz_cut')
}
