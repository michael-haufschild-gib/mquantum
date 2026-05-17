/**
 * Cosmological-background URL params (FSF Mukhanov-Sasaki bridge).
 *
 * Extracted from `./state-serializer.ts`. Handles the `cos*` family:
 * preset selector + per-preset sub-params (steepness, Hubble, LQC) and
 * the conformal-time `cos_eta0`. The validation gate is sequential and
 * preset-specific — see `resolveCosmologyPresetParams` for the
 * per-preset rejection rules.
 *
 * @module lib/url/cosmologySerializer
 */

import { type CosmologyPreset, isValidPreset, sCritical } from '@/lib/physics/cosmology/presets'

import {
  parseBoolParam,
  parseEnumParam,
  parseFloatParam,
  setFloatParam,
  setStringParam,
} from './paramHelpers'

const VALID_COSMOLOGY_PRESETS: CosmologyPreset[] = [
  'minkowski',
  'deSitter',
  'ekpyrotic',
  'kasner',
  'bianchiKasner',
  'lqcBounce',
]

/**
 * Subset of `ShareableObjectState` consumed by the cosmology serializer.
 * Declared structurally so the per-domain module does not need to import
 * the full `ShareableObjectState` interface.
 */
export interface CosmologySerializableState {
  cosmologyEnabled?: boolean
  cosmologyPreset?: CosmologyPreset
  cosmologySteepness?: number
  cosmologyHubble?: number
  cosmologyEta0?: number
  cosmologyLqcRhoCritical?: number
  cosmologyLqcEquationOfState?: number
  cosmologyLqcInitialRhoRatio?: number
  cosmologyKasnerP1?: number
  cosmologyKasnerP2?: number
  cosmologyKasnerP3?: number
}

/** Mutable target for `deserializeCosmology` — same fields but written. */
export type CosmologyDeserializableTarget = {
  -readonly [K in keyof CosmologySerializableState]: CosmologySerializableState[K]
} & {
  /**
   * Used only by the spacetime-dim derivation in the ekpyrotic check.
   * The driver sets `dimension` before calling this serializer.
   */
  dimension?: number
}

/**
 * Emit the cosmology sub-block. Skips entirely when not enabled.
 */
export function serializeCosmology(
  params: URLSearchParams,
  state: CosmologySerializableState
): void {
  if (!state.cosmologyEnabled) return
  params.set('cos', '1')
  setStringParam(params, 'cos_bg', state.cosmologyPreset)
  if (state.cosmologyPreset === 'ekpyrotic') {
    // Ekpyrotic steepness lives in a narrow valid window just above `s_c(n)`.
    // 2-decimal precision (the default) rounds valid values like `s_c+0.001`
    // to something ≤ s_c on re-parse. Emit 4 decimals so the round-trip
    // survives the lower clamp check in `resolveCosmologyPresetParams`.
    setFloatParam(params, 'cos_s', state.cosmologySteepness, true, 4)
  } else if (state.cosmologyPreset === 'deSitter') {
    setFloatParam(params, 'cos_h', state.cosmologyHubble, true)
  } else if (state.cosmologyPreset === 'lqcBounce') {
    setFloatParam(params, 'cos_rhoc', state.cosmologyLqcRhoCritical, true, 4)
    setFloatParam(params, 'cos_w', state.cosmologyLqcEquationOfState, false, 4)
    setFloatParam(params, 'cos_rhostart', state.cosmologyLqcInitialRhoRatio, true, 4)
  } else if (state.cosmologyPreset === 'bianchiKasner') {
    setFloatParam(params, 'cos_p1', state.cosmologyKasnerP1, false, 4)
    setFloatParam(params, 'cos_p2', state.cosmologyKasnerP2, false, 4)
    setFloatParam(params, 'cos_p3', state.cosmologyKasnerP3, false, 4)
  }
  setFloatParam(params, 'cos_eta0', state.cosmologyEta0, true)
}

/**
 * Resolve preset-specific optional params (steepness for ekpyrotic, hubble
 * for de Sitter). Returns `undefined` if the required param is missing or
 * invalid. Extracted to keep `deserializeCosmologyParams` under the
 * cognitive-complexity budget.
 */
interface ResolvedCosmologyPresetParams {
  steepness?: number
  hubble?: number
  lqcRhoCritical?: number
  lqcEquationOfState?: number
  lqcInitialRhoRatio?: number
  kasnerP1?: number
  kasnerP2?: number
  kasnerP3?: number
}

function resolveCosmologyPresetParams(
  params: URLSearchParams,
  preset: CosmologyPreset,
  spacetimeDim: number
): ResolvedCosmologyPresetParams | undefined {
  if (preset === 'ekpyrotic') {
    const raw = parseFloatParam(params, 'cos_s', 0, 100)
    if (raw === undefined) return undefined
    if (raw <= sCritical(spacetimeDim)) return undefined
    return { steepness: raw }
  }
  if (preset === 'deSitter') {
    // De Sitter REQUIRES cos_h: without it the downstream shader path falls
    // back to `mass²` while the reset path throws inside `scaleFactorAmplitude`.
    // Reject the whole cosmology block if cos_h is missing or out of range.
    const hubble = parseFloatParam(params, 'cos_h', 0.01, 100)
    if (hubble === undefined) return undefined
    return { hubble }
  }
  if (preset === 'lqcBounce') {
    // LQC bounce: cos_rhoc is required (sets the scale of the bounce).
    // cos_w and cos_rhostart are optional and fall back to defaults
    // (1.0, 0.01). Reject the whole block only if the required cos_rhoc
    // is missing or out of range.
    const rhoC = parseFloatParam(params, 'cos_rhoc', 0.1, 10)
    if (rhoC === undefined) return undefined
    const wRaw = parseFloatParam(params, 'cos_w', 0, 1)
    const rhoStartRaw = parseFloatParam(params, 'cos_rhostart', 0.001, 0.999)
    return {
      lqcRhoCritical: rhoC,
      lqcEquationOfState: wRaw ?? 1.0,
      lqcInitialRhoRatio: rhoStartRaw ?? 0.01,
    }
  }
  if (preset === 'bianchiKasner') {
    const p1 = parseFloatParam(params, 'cos_p1', -2, 2)
    const p2 = parseFloatParam(params, 'cos_p2', -2, 2)
    const p3 = parseFloatParam(params, 'cos_p3', -2, 2)
    if (p1 === undefined || p2 === undefined || p3 === undefined) return undefined
    return { kasnerP1: p1, kasnerP2: p2, kasnerP3: p3 }
  }
  return {}
}

function isValidResolvedCosmologyParams(
  preset: CosmologyPreset,
  spacetimeDim: number,
  presetParams: ResolvedCosmologyPresetParams
): boolean {
  if (preset !== 'bianchiKasner') {
    return isValidPreset({ preset, spacetimeDim, ...presetParams })
  }
  const { kasnerP1, kasnerP2, kasnerP3 } = presetParams
  if (kasnerP1 === undefined || kasnerP2 === undefined || kasnerP3 === undefined) return false
  return isValidPreset({
    preset,
    spacetimeDim,
    kasnerExponents: { p1: kasnerP1, p2: kasnerP2, p3: kasnerP3 },
  })
}

/**
 * Parse cosmological-background URL params into state, validating the
 * preset/steepness combination so invalid states never reach the store.
 *
 * Rejection rules (any failure ⟹ drop the whole cosmology block and
 * leave app defaults):
 *
 * - `cos=1` is required to activate cosmology — otherwise ignore `cos_*`.
 * - `cos_bg` must be one of the known presets.
 * - For ekpyrotic: `cos_s` must satisfy `s > s_c(n)` where `n` is derived
 *   from the app's current dimension. If no dimension is present in the
 *   URL, assume `n = 4`.
 * - `cos_eta0` must be finite and strictly non-zero.
 *
 * @param params - URL params
 * @param state - Mutable parsed state (cosmology fields added in-place)
 */
export function deserializeCosmology(
  params: URLSearchParams,
  state: CosmologyDeserializableTarget
): void {
  if (!parseBoolParam(params, 'cos')) return

  const preset = parseEnumParam(params, 'cos_bg', VALID_COSMOLOGY_PRESETS)
  if (!preset) return

  const spacetimeDim = (typeof state.dimension === 'number' ? state.dimension : 3) + 1
  const presetParams = resolveCosmologyPresetParams(params, preset, spacetimeDim)
  if (presetParams === undefined) return

  const eta0 = parseFloatParam(params, 'cos_eta0', -10000, 10000)
  if (eta0 === undefined || eta0 === 0) return

  if (!isValidResolvedCosmologyParams(preset, spacetimeDim, presetParams)) return

  state.cosmologyEnabled = true
  state.cosmologyPreset = preset
  if (presetParams.steepness !== undefined) state.cosmologySteepness = presetParams.steepness
  if (presetParams.hubble !== undefined) state.cosmologyHubble = presetParams.hubble
  if (presetParams.lqcRhoCritical !== undefined) {
    state.cosmologyLqcRhoCritical = presetParams.lqcRhoCritical
  }
  if (presetParams.lqcEquationOfState !== undefined) {
    state.cosmologyLqcEquationOfState = presetParams.lqcEquationOfState
  }
  if (presetParams.lqcInitialRhoRatio !== undefined) {
    state.cosmologyLqcInitialRhoRatio = presetParams.lqcInitialRhoRatio
  }
  if (presetParams.kasnerP1 !== undefined) state.cosmologyKasnerP1 = presetParams.kasnerP1
  if (presetParams.kasnerP2 !== undefined) state.cosmologyKasnerP2 = presetParams.kasnerP2
  if (presetParams.kasnerP3 !== undefined) state.cosmologyKasnerP3 = presetParams.kasnerP3
  state.cosmologyEta0 = eta0
}
