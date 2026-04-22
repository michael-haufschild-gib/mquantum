/**
 * Wheeler–DeWitt URL sub-block serializer / deserializer.
 *
 * Extracted from `state-serializer.ts` to keep the main serializer under
 * its per-file `max-lines` budget. Uses its own local parse/set helpers
 * to avoid re-exporting state-serializer internals.
 *
 * @module lib/url/wdwSerializer
 */

export const VALID_WDW_BOUNDARY_CONDITIONS = ['noBoundary', 'tunneling', 'deWitt'] as const
/** URL-accepted Wheeler–DeWitt boundary-condition proposals. */
export type UrlWdwBoundaryCondition = (typeof VALID_WDW_BOUNDARY_CONDITIONS)[number]

/** Subset of fields the Wheeler–DeWitt block reads/writes on the URL payload. */
export interface WdwUrlState {
  wdwBoundaryCondition?: UrlWdwBoundaryCondition
  wdwInflatonMass?: number
  wdwInflatonMassAsymmetry?: number
  wdwCosmologicalConstant?: number
  /** Number of `a` steps in the leapfrog march (solver resolution, 16..1024). */
  wdwGridNa?: number
  /** Number of φ grid points per inflaton axis (8..128). */
  wdwGridNphi?: number
  wdwStreamlinesEnabled?: boolean
  wdwStreamlineDensity?: number
  wdwPhaseRotationEnabled?: boolean
  wdwPhaseRotationSpeed?: number
  wdwWorldlineEnabled?: boolean
  wdwWorldlineSpeed?: number
  wdwWorldlinePulseWidth?: number
  /** R-channel headroom slider (1..10 000). See `densityGrid.packWdwDensityGrid`. */
  wdwRenderDynamicRange?: number
}

const INTEGER_RE = /^-?\d+$/
const FLOAT_RE = /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/

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

function parseEnumParam<T extends string>(
  params: URLSearchParams,
  key: string,
  valid: readonly T[]
): T | undefined {
  const raw = params.get(key)
  if (raw && (valid as readonly string[]).includes(raw)) return raw as T
  return undefined
}

function setBoolParam(params: URLSearchParams, key: string, value: boolean | undefined): void {
  if (value !== undefined) params.set(key, value ? '1' : '0')
}

function setIntParam(params: URLSearchParams, key: string, value: number | undefined): void {
  if (value !== undefined) params.set(key, value.toString())
}

function setStringParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined) params.set(key, value)
}

function setFloatParam(
  params: URLSearchParams,
  key: string,
  value: number | undefined,
  omitZero = false,
  precision = 2
): void {
  if (value !== undefined && !(omitZero && value === 0)) params.set(key, value.toFixed(precision))
}

/**
 * Emit Wheeler–DeWitt minisuperspace params. Called only when
 * `quantumMode === 'wheelerDeWitt'` — caller must gate on mode. The
 * isotropic `wdwInflatonMassAsymmetry === 1` default is elided so
 * baseline share links stay clean.
 */
export function serializeWdw(params: URLSearchParams, state: WdwUrlState): void {
  setStringParam(params, 'wdw_bc', state.wdwBoundaryCondition)
  // `wdwInflatonMass` and `wdwPhaseRotationSpeed` emit zero values — m=0
  // is the free-kinetic regime (physically distinct from the default
  // m=0.3), and speed=0 disables phase rotation (physically distinct
  // from the default 1.0). Previous omitZero=true silently restored
  // URLs of these zero states to the defaults on reload.
  setFloatParam(params, 'wdw_m', state.wdwInflatonMass)
  if (state.wdwInflatonMassAsymmetry !== undefined && state.wdwInflatonMassAsymmetry !== 1) {
    params.set('wdw_ma', state.wdwInflatonMassAsymmetry.toFixed(4))
  }
  setFloatParam(params, 'wdw_lambda', state.wdwCosmologicalConstant, true)
  // Solver resolution — share links must reproduce the sender's grid
  // otherwise physics/render detail silently diverge across recipients.
  setIntParam(params, 'wdw_gn_a', state.wdwGridNa)
  setIntParam(params, 'wdw_gn_p', state.wdwGridNphi)
  setBoolParam(params, 'wdw_sl', state.wdwStreamlinesEnabled)
  setIntParam(params, 'wdw_sld', state.wdwStreamlineDensity)
  setBoolParam(params, 'wdw_pr', state.wdwPhaseRotationEnabled)
  setFloatParam(params, 'wdw_prs', state.wdwPhaseRotationSpeed)
  setBoolParam(params, 'wdw_wl', state.wdwWorldlineEnabled)
  setFloatParam(params, 'wdw_wls', state.wdwWorldlineSpeed, true)
  setFloatParam(params, 'wdw_wlw', state.wdwWorldlinePulseWidth, true, 4)
  // Default elision: the stock headroom is 100, so omit `wdw_dr` when the
  // value is unset or exactly at the default. Any user tweak round-trips
  // through the URL like the other wdw_* fields.
  if (state.wdwRenderDynamicRange !== undefined && state.wdwRenderDynamicRange !== 100) {
    setFloatParam(params, 'wdw_dr', state.wdwRenderDynamicRange, true, 3)
  }
}

/** Parse Wheeler–DeWitt URL params into the shared state object. */
export function deserializeWdw(params: URLSearchParams, state: WdwUrlState): void {
  state.wdwBoundaryCondition = parseEnumParam(params, 'wdw_bc', VALID_WDW_BOUNDARY_CONDITIONS)
  state.wdwInflatonMass = parseFloatParam(params, 'wdw_m', 0, 2.0)
  // [0.1, 10]: α < 0.1 makes the φ₂ axis nearly massless (numerical
  // instability); α > 10 makes it so stiff the grid can't resolve it.
  state.wdwInflatonMassAsymmetry = parseFloatParam(params, 'wdw_ma', 0.1, 10)
  state.wdwCosmologicalConstant = parseFloatParam(params, 'wdw_lambda', -1, 1)
  // Grid bounds match the solver's hard minima (≥ 3 per axis) and the
  // publication preset's max of (256, 48); we leave headroom above that
  // for power-user experiments while keeping the serializer cheap to
  // validate.
  state.wdwGridNa = parseIntParam(params, 'wdw_gn_a', 16, 1024)
  state.wdwGridNphi = parseIntParam(params, 'wdw_gn_p', 8, 128)
  state.wdwStreamlinesEnabled = parseBoolParam(params, 'wdw_sl')
  state.wdwStreamlineDensity = parseIntParam(params, 'wdw_sld', 2, 16)
  state.wdwPhaseRotationEnabled = parseBoolParam(params, 'wdw_pr')
  state.wdwPhaseRotationSpeed = parseFloatParam(params, 'wdw_prs', 0, 5)
  state.wdwWorldlineEnabled = parseBoolParam(params, 'wdw_wl')
  state.wdwWorldlineSpeed = parseFloatParam(params, 'wdw_wls', 0.1, 3)
  state.wdwWorldlinePulseWidth = parseFloatParam(params, 'wdw_wlw', 0.02, 0.3)
  state.wdwRenderDynamicRange = parseFloatParam(params, 'wdw_dr', 1, 10_000)
}
