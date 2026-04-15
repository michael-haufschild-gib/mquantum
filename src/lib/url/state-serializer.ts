/**
 * URL State Serializer
 *
 * Serializes and deserializes scene configuration to/from URL query params.
 * Unknown params are ignored (forward compatible). Missing params use app defaults.
 *
 * Core params (scene identity):
 *   `?scene=<name>` | `?t=<objectType>&d=<dim>&qm=<mode>`
 *
 * Extended params (merged into defaults):
 *   Rendering: `repr`, `iso`, `iso_t`, `cs`, `dg`, `scale`
 *   Quantum numbers: `hyd_n`, `hyd_l`, `hyd_m`, `tc`, `seed`
 *   TDSE config: `pot`, `abs`, `diag`, `obs`, `it`
 *   Features: `oq`, `co`
 */

import { MAX_DIMENSION, MIN_DIMENSION } from '@/constants/dimension'
import type { SchroedingerRepresentation } from '@/lib/geometry/extended/schroedinger'
import type { TdsePotentialType } from '@/lib/geometry/extended/tdse'
import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/types'
import { isValidObjectType } from '@/lib/geometry/registry'
import type { ObjectType } from '@/lib/geometry/types'
import { type CosmologyPreset, isValidPreset, sCritical } from '@/lib/physics/cosmology/presets'

// ─── Validation Sets ─────────────────────────────────────────────────────────

const VALID_QUANTUM_MODES: SchroedingerQuantumMode[] = [
  'harmonicOscillator',
  'hydrogenND',
  'hydrogenNDCoupled',
  'freeScalarField',
  'tdseDynamics',
  'becDynamics',
  'diracEquation',
  'quantumWalk',
  'wheelerDeWitt',
]

const VALID_WDW_BOUNDARY_CONDITIONS = ['noBoundary', 'tunneling', 'deWitt'] as const
type UrlWdwBoundaryCondition = (typeof VALID_WDW_BOUNDARY_CONDITIONS)[number]

const VALID_REPRESENTATIONS: SchroedingerRepresentation[] = ['position', 'momentum', 'wigner']

const VALID_COSMOLOGY_PRESETS: CosmologyPreset[] = [
  'minkowski',
  'deSitter',
  'ekpyrotic',
  'kasner',
  'bianchiKasner',
  'lqcBounce',
]

const VALID_POTENTIAL_TYPES: TdsePotentialType[] = [
  'free',
  'barrier',
  'step',
  'finiteWell',
  'harmonicTrap',
  'driven',
  'doubleSlit',
  'periodicLattice',
  'doubleWell',
  'becTrap',
  'radialDoubleWell',
  'custom',
  'andersonDisorder',
  'coupledAnharmonic',
]

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * URL-shareable application state.
 * All fields except dimension and objectType are optional — missing fields
 * keep their app defaults.
 */
export interface ShareableObjectState {
  dimension: number
  objectType: ObjectType
  quantumMode?: SchroedingerQuantumMode

  // ── Rendering ────────────────────────────────────────────────────────────
  /** Wavefunction representation: position, momentum, or wigner */
  representation?: SchroedingerRepresentation
  /** Isosurface mode enabled */
  isoEnabled?: boolean
  /** Isosurface threshold (log scale, typically -6 to 0) */
  isoThreshold?: number
  /** Cross-section slice enabled */
  crossSectionEnabled?: boolean
  /** Density gain multiplier */
  densityGain?: number
  /** Object scale (0.1 to 2.0) */
  scale?: number

  // ── Quantum numbers (HO / hydrogen) ──────────────────────────────────────
  /** HO superposition term count (1-8) */
  termCount?: number
  /** HO random seed for superposition coefficients */
  seed?: number
  /** Hydrogen principal quantum number n (1-7) */
  hydrogenN?: number
  /** Hydrogen azimuthal quantum number l (0 to n-1) */
  hydrogenL?: number
  /** Hydrogen magnetic quantum number m (-l to l) */
  hydrogenM?: number

  // ── TDSE config ──────────────────────────────────────────────────────────
  /** TDSE potential type */
  potentialType?: TdsePotentialType
  /** TDSE PML absorber enabled */
  absorberEnabled?: boolean
  /** TDSE diagnostics readback enabled */
  diagnosticsEnabled?: boolean
  /** TDSE observable expectation values enabled */
  observablesEnabled?: boolean
  /** TDSE imaginary-time propagation enabled */
  imaginaryTimeEnabled?: boolean
  /** Custom potential expression V(x,y,z,...) when potentialType === 'custom' */
  customPotentialExpression?: string
  /** Coupled anharmonic coupling λ (when potentialType === 'coupledAnharmonic') */
  anharmonicLambda?: number
  /** Anderson disorder strength W (when potentialType === 'andersonDisorder') */
  disorderStrength?: number
  /** Anderson disorder PRNG seed */
  disorderSeed?: number
  /** Anderson disorder distribution ('uniform' | 'gaussian') */
  disorderDistribution?: string

  // ── Features ─────────────────────────────────────────────────────────────
  /** Open quantum system enabled */
  openQuantumEnabled?: boolean
  /** Open quantum dephasing rate */
  openQuantumDephasingRate?: number
  /** Open quantum relaxation rate */
  openQuantumRelaxationRate?: number
  /** Open quantum thermal excitation rate */
  openQuantumThermalUpRate?: number

  // ── Stochastic Decoherence ──────────────────────────────────────────────
  /** Stochastic localization enabled */
  stochasticEnabled?: boolean
  /** Monitoring rate γ */
  stochasticGamma?: number
  /** Localization width σ */
  stochasticSigma?: number
  /** Collapse sites per step */
  stochasticNumSites?: number
  /**
   * Branch visualization enabled. Controls whether the TDSE diagnostic
   * partition (normLeft / normRight) uses `branchPlanePosition` instead of
   * `barrierCenter`, and whether the raymarcher color-codes left/right
   * branches. Physics-visible — not a pure visual preference — because it
   * changes the diagnostic output that downstream tests and analyses read.
   */
  branchingEnabled?: boolean
  /** Normalized branch plane position along axis 0 (-1 to 1, 0 = origin). */
  branchPlanePosition?: number

  // ── ER=EPR Wormhole Coupling ──────────────────────────────────────────
  /** Enable the double-trace mirror coupling Ĥ_int = g·P_M. */
  wormholeCouplingEnabled?: boolean
  /** Coupling strength g ≥ 0 (clamped to `[0, 5]`). */
  wormholeCouplingG?: number
  /** Mirror-plane axis index (0, 1, or 2). */
  wormholeMirrorAxis?: 0 | 1 | 2

  // ── Coordinate Entanglement ────────────────────────────────────────────
  /** Coordinate entanglement tracking enabled */
  entanglementEnabled?: boolean
  /** Pairwise mutual information computation enabled */
  entanglementPairwiseMI?: boolean
  /** Bipartition entropy computation enabled */
  entanglementBipartitions?: boolean

  // ── Cosmological Background (Mukhanov-Sasaki bridge) ───────────────────
  /** Cosmological background enabled (FSF Mukhanov-Sasaki mode) */
  cosmologyEnabled?: boolean
  /** Cosmological background preset */
  cosmologyPreset?: CosmologyPreset
  /** Steepness `s` for the ekpyrotic preset (must satisfy `s > s_c(n)`) */
  cosmologySteepness?: number
  /** Hubble rate `H` for the de Sitter preset */
  cosmologyHubble?: number
  /** Initial conformal time `η₀` (strictly non-zero) */
  cosmologyEta0?: number
  /** LQC critical density `ρ_c > 0` (only consulted under `lqcBounce`). */
  cosmologyLqcRhoCritical?: number
  /** LQC matter equation of state `w ∈ [0, 1]`. */
  cosmologyLqcEquationOfState?: number
  /** LQC starting `ρ/ρ_c` ratio in `(0, 1)`. */
  cosmologyLqcInitialRhoRatio?: number

  // ── Wheeler–DeWitt Minisuperspace ───────────────────────────────────────
  /** Wheeler–DeWitt boundary condition proposal */
  wdwBoundaryCondition?: UrlWdwBoundaryCondition
  /** Wheeler–DeWitt inflaton mass m */
  wdwInflatonMass?: number
  /** Wheeler–DeWitt cosmological constant Λ */
  wdwCosmologicalConstant?: number
  /** Wheeler–DeWitt WKB streamline overlay toggle */
  wdwStreamlinesEnabled?: boolean
  /** Wheeler–DeWitt streamline seed density (2-16) */
  wdwStreamlineDensity?: number
  /** Wheeler–DeWitt phase rotation enabled (render-only; visual only) */
  wdwPhaseRotationEnabled?: boolean
  /** Wheeler–DeWitt phase rotation angular-velocity multiplier (0-5) */
  wdwPhaseRotationSpeed?: number
  /** Wheeler–DeWitt semiclassical worldline pulse enabled (render-only) */
  wdwWorldlineEnabled?: boolean
  /** Wheeler–DeWitt worldline pulse cycles per unit time (0.1-3) */
  wdwWorldlineSpeed?: number
  /** Wheeler–DeWitt worldline Gaussian pulse width in normalized progress (0.02-0.3) */
  wdwWorldlinePulseWidth?: number
}

/**
 * Scene-based share payload.
 * Scene links are mutually exclusive with object parameter links.
 */
export interface ShareableSceneState {
  /** Scene preset name (case-insensitive lookup, mutually exclusive with other params) */
  scene: string
}

/** Union of all URL-shareable payload variants. */
export type ShareableState = ShareableObjectState | ShareableSceneState

/**
 * Parsed URL state where each shareable field is optional.
 * Supports partial payloads — missing fields keep app defaults.
 */
export type ParsedShareableState = Partial<ShareableObjectState> & Partial<ShareableSceneState>

// ─── Helpers ─────────────────────────────────────────────────────────────────

const INTEGER_RE = /^-?\d+$/
const FLOAT_RE = /^-?(?:\d+\.?\d*|\.\d+)$/

/** Parse a URL param as a clamped integer. Returns undefined on invalid input. */
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

/** Parse a URL param as a clamped float. Returns undefined on invalid input. */
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

/** Parse a URL param as a boolean (0/1). Returns undefined on invalid input. */
function parseBoolParam(params: URLSearchParams, key: string): boolean | undefined {
  const raw = params.get(key)
  if (raw === '1') return true
  if (raw === '0') return false
  return undefined
}

/** Parse a URL param as an enum value. Returns undefined if not in the set. */
function parseEnumParam<T extends string>(
  params: URLSearchParams,
  key: string,
  valid: readonly T[]
): T | undefined {
  const raw = params.get(key)
  if (raw && (valid as readonly string[]).includes(raw)) return raw as T
  return undefined
}

/** Set a URL param only when the value is defined and differs from default. */
function setBoolParam(params: URLSearchParams, key: string, value: boolean | undefined): void {
  if (value !== undefined) params.set(key, value ? '1' : '0')
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

function setIntParam(params: URLSearchParams, key: string, value: number | undefined): void {
  if (value !== undefined) params.set(key, value.toString())
}

function setStringParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined) params.set(key, value)
}

/**
 * Emit the cosmology sub-block. Extracted to keep `serializeState` below
 * the cognitive-complexity budget.
 */
function serializeCosmology(params: URLSearchParams, state: ShareableObjectState): void {
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
    setFloatParam(params, 'cos_w', state.cosmologyLqcEquationOfState, true, 4)
    setFloatParam(params, 'cos_rhostart', state.cosmologyLqcInitialRhoRatio, true, 4)
  }
  setFloatParam(params, 'cos_eta0', state.cosmologyEta0, true)
}

// ─── Serialize ───────────────────────────────────────────────────────────────

/**
 * Serializes state to URL search params.
 * Only emits params that are explicitly set (not undefined).
 * @param state - The state to serialize
 * @returns URL search params string
 */
export function serializeState(state: ShareableState): string {
  const params = new URLSearchParams()

  if ('scene' in state) {
    const scene = state.scene.trim()
    if (scene) params.set('scene', scene)
    return params.toString()
  }

  // Core identity
  params.set('d', state.dimension.toString())
  params.set('t', state.objectType)
  if (state.quantumMode && state.quantumMode !== 'harmonicOscillator') {
    params.set('qm', state.quantumMode)
  }

  // Rendering
  setStringParam(params, 'repr', state.representation)
  setBoolParam(params, 'iso', state.isoEnabled)
  setFloatParam(params, 'iso_t', state.isoThreshold)
  setBoolParam(params, 'cs', state.crossSectionEnabled)
  setFloatParam(params, 'dg', state.densityGain)
  setFloatParam(params, 'scale', state.scale)

  // Quantum numbers
  setIntParam(params, 'tc', state.termCount)
  setIntParam(params, 'seed', state.seed)
  setIntParam(params, 'hyd_n', state.hydrogenN)
  setIntParam(params, 'hyd_l', state.hydrogenL)
  setIntParam(params, 'hyd_m', state.hydrogenM)

  // TDSE
  setStringParam(params, 'pot', state.potentialType)
  setBoolParam(params, 'abs', state.absorberEnabled)
  setBoolParam(params, 'diag', state.diagnosticsEnabled)
  setBoolParam(params, 'obs', state.observablesEnabled)
  setBoolParam(params, 'it', state.imaginaryTimeEnabled)
  if (state.potentialType === 'custom' && state.customPotentialExpression) {
    setStringParam(params, 'cpx', state.customPotentialExpression)
  }
  if (state.potentialType === 'coupledAnharmonic') {
    setFloatParam(params, 'anh_l', state.anharmonicLambda, true)
  }
  if (state.potentialType === 'andersonDisorder') {
    setFloatParam(params, 'dis_w', state.disorderStrength, true)
    setIntParam(params, 'dis_s', state.disorderSeed)
    setStringParam(params, 'dis_d', state.disorderDistribution)
  }

  // Features
  if (state.openQuantumEnabled) {
    params.set('oq', '1')
    setFloatParam(params, 'oq_dp', state.openQuantumDephasingRate, true)
    setFloatParam(params, 'oq_rx', state.openQuantumRelaxationRate, true)
    setFloatParam(params, 'oq_th', state.openQuantumThermalUpRate, true)
  }

  // Stochastic decoherence
  if (state.stochasticEnabled) {
    params.set('sloc', '1')
    setFloatParam(params, 'sloc_g', state.stochasticGamma, true)
    setFloatParam(params, 'sloc_s', state.stochasticSigma, true)
    setIntParam(params, 'sloc_n', state.stochasticNumSites)
  }

  // Branching visualization (TDSE diagnostic partition + branch coloring).
  // Independent from `sloc` because the partition diagnostic is meaningful
  // even without stochastic localization (e.g., to measure left/right
  // populations under a static double-well potential).
  if (state.branchingEnabled) {
    params.set('brc', '1')
    setFloatParam(params, 'brc_p', state.branchPlanePosition, true)
  }

  // ER=EPR wormhole coupling. Only emits the sub-params when enabled so a
  // `?tdse_wh=0` link isn't polluted with redundant coupling/axis values.
  if (state.wormholeCouplingEnabled) {
    params.set('tdse_wh', '1')
    setFloatParam(params, 'tdse_whg', state.wormholeCouplingG, true)
    setIntParam(params, 'tdse_whax', state.wormholeMirrorAxis)
  }

  // Coordinate entanglement
  setBoolParam(params, 'ent', state.entanglementEnabled)
  setBoolParam(params, 'ent_mi', state.entanglementPairwiseMI)
  setBoolParam(params, 'ent_bi', state.entanglementBipartitions)

  // Cosmological background — only emit the sub-params when enabled
  serializeCosmology(params, state)

  // Wheeler–DeWitt minisuperspace
  if (state.quantumMode === 'wheelerDeWitt') {
    setStringParam(params, 'wdw_bc', state.wdwBoundaryCondition)
    setFloatParam(params, 'wdw_m', state.wdwInflatonMass, true)
    setFloatParam(params, 'wdw_lambda', state.wdwCosmologicalConstant, true)
    setBoolParam(params, 'wdw_sl', state.wdwStreamlinesEnabled)
    setIntParam(params, 'wdw_sld', state.wdwStreamlineDensity)
    // Render-only animation effects
    setBoolParam(params, 'wdw_pr', state.wdwPhaseRotationEnabled)
    setFloatParam(params, 'wdw_prs', state.wdwPhaseRotationSpeed, true)
    setBoolParam(params, 'wdw_wl', state.wdwWorldlineEnabled)
    setFloatParam(params, 'wdw_wls', state.wdwWorldlineSpeed, true)
    setFloatParam(params, 'wdw_wlw', state.wdwWorldlinePulseWidth, true, 4)
  }

  return params.toString()
}

// ─── Deserialize ─────────────────────────────────────────────────────────────

/** Parse potential-type-specific TDSE params into state. */
function deserializePotentialParams(params: URLSearchParams, state: ParsedShareableState): void {
  if (state.potentialType === 'custom') {
    const cpx = params.get('cpx')
    if (cpx && cpx.length <= 200) state.customPotentialExpression = cpx
  }
  if (state.potentialType === 'coupledAnharmonic') {
    state.anharmonicLambda = parseFloatParam(params, 'anh_l', 0, 100)
  }
  if (state.potentialType === 'andersonDisorder') {
    state.disorderStrength = parseFloatParam(params, 'dis_w', 0, 100)
    state.disorderSeed = parseIntParam(params, 'dis_s', 0, 999999)
    const dd = params.get('dis_d')
    if (dd === 'uniform' || dd === 'gaussian') state.disorderDistribution = dd
  }
}

/**
 * Resolve preset-specific optional params (steepness for ekpyrotic, hubble
 * for de Sitter). Returns `undefined` if the required param is missing or
 * invalid. Extracted to keep `deserializeCosmologyParams` under the cognitive
 * complexity budget.
 */
function resolveCosmologyPresetParams(
  params: URLSearchParams,
  preset: CosmologyPreset,
  spacetimeDim: number
):
  | {
      steepness?: number
      hubble?: number
      lqcRhoCritical?: number
      lqcEquationOfState?: number
      lqcInitialRhoRatio?: number
    }
  | undefined {
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
  return {}
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
function deserializeCosmologyParams(params: URLSearchParams, state: ParsedShareableState): void {
  if (!parseBoolParam(params, 'cos')) return

  const preset = parseEnumParam(params, 'cos_bg', VALID_COSMOLOGY_PRESETS)
  if (!preset) return

  const spacetimeDim = (typeof state.dimension === 'number' ? state.dimension : 3) + 1
  const presetParams = resolveCosmologyPresetParams(params, preset, spacetimeDim)
  if (presetParams === undefined) return

  const eta0 = parseFloatParam(params, 'cos_eta0', -10000, 10000)
  if (eta0 === undefined || eta0 === 0) return

  if (!isValidPreset({ preset, spacetimeDim, ...presetParams })) return

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
  state.cosmologyEta0 = eta0
}

/** Parse open quantum and stochastic feature params into state. */
function deserializeFeatureParams(params: URLSearchParams, state: ParsedShareableState): void {
  const oq = parseBoolParam(params, 'oq')
  if (oq !== undefined) {
    state.openQuantumEnabled = oq
    state.openQuantumDephasingRate = parseFloatParam(params, 'oq_dp', 0, 5)
    state.openQuantumRelaxationRate = parseFloatParam(params, 'oq_rx', 0, 5)
    state.openQuantumThermalUpRate = parseFloatParam(params, 'oq_th', 0, 5)
  }

  const sloc = parseBoolParam(params, 'sloc')
  if (sloc !== undefined) {
    state.stochasticEnabled = sloc
    state.stochasticGamma = parseFloatParam(params, 'sloc_g', 0, 10)
    state.stochasticSigma = parseFloatParam(params, 'sloc_s', 0.5, 5)
    state.stochasticNumSites = parseIntParam(params, 'sloc_n', 1, 32)
  }

  const brc = parseBoolParam(params, 'brc')
  if (brc !== undefined) {
    state.branchingEnabled = brc
    // Matches the store's setTdseBranchPlanePosition clamp [-1, 1].
    state.branchPlanePosition = parseFloatParam(params, 'brc_p', -1, 1)
  }

  const wh = parseBoolParam(params, 'tdse_wh')
  if (wh !== undefined) {
    state.wormholeCouplingEnabled = wh
    state.wormholeCouplingG = parseFloatParam(params, 'tdse_whg', 0, 5)
    const axis = parseIntParam(params, 'tdse_whax', 0, 2)
    if (axis !== undefined) {
      state.wormholeMirrorAxis = axis as 0 | 1 | 2
    }
  }

  state.entanglementEnabled = parseBoolParam(params, 'ent')
  state.entanglementPairwiseMI = parseBoolParam(params, 'ent_mi')
  state.entanglementBipartitions = parseBoolParam(params, 'ent_bi')
}

/**
 * Deserializes state from URL search params.
 * Unknown params are silently ignored. Missing params stay undefined (use app defaults).
 * @param searchParams - URL search params string
 * @returns Partial state object
 */
export function deserializeState(searchParams: string): ParsedShareableState {
  const params = new URLSearchParams(searchParams)
  const state: ParsedShareableState = {}

  // Scene (mutually exclusive with other params)
  const sceneParam = params.get('scene')
  if (sceneParam) {
    const trimmed = sceneParam.trim()
    if (trimmed) {
      state.scene = trimmed
      return state
    }
  }

  // Core identity
  state.dimension = parseIntParam(params, 'd', MIN_DIMENSION, MAX_DIMENSION)
  const objectType = params.get('t')
  if (objectType && isValidObjectType(objectType)) state.objectType = objectType
  state.quantumMode = parseEnumParam(params, 'qm', VALID_QUANTUM_MODES)

  // Rendering
  state.representation = parseEnumParam(params, 'repr', VALID_REPRESENTATIONS)
  state.isoEnabled = parseBoolParam(params, 'iso')
  state.isoThreshold = parseFloatParam(params, 'iso_t', -6, 0)
  state.crossSectionEnabled = parseBoolParam(params, 'cs')
  state.densityGain = parseFloatParam(params, 'dg', 0.01, 50)
  state.scale = parseFloatParam(params, 'scale', 0.1, 2.0)

  // Quantum numbers
  state.termCount = parseIntParam(params, 'tc', 1, 8)
  state.seed = parseIntParam(params, 'seed', 0, 999999)
  state.hydrogenN = parseIntParam(params, 'hyd_n', 1, 7)
  state.hydrogenL = parseIntParam(params, 'hyd_l', 0, 6)
  state.hydrogenM = parseIntParam(params, 'hyd_m', -6, 6)

  // TDSE
  state.potentialType = parseEnumParam(params, 'pot', VALID_POTENTIAL_TYPES)
  state.absorberEnabled = parseBoolParam(params, 'abs')
  state.diagnosticsEnabled = parseBoolParam(params, 'diag')
  state.observablesEnabled = parseBoolParam(params, 'obs')
  state.imaginaryTimeEnabled = parseBoolParam(params, 'it')
  deserializePotentialParams(params, state)

  // Features
  deserializeFeatureParams(params, state)

  // Cosmological background (must come AFTER dimension parsing so `d` is
  // available for the s_c(n) check).
  deserializeCosmologyParams(params, state)

  // Wheeler–DeWitt minisuperspace
  state.wdwBoundaryCondition = parseEnumParam(params, 'wdw_bc', VALID_WDW_BOUNDARY_CONDITIONS)
  state.wdwInflatonMass = parseFloatParam(params, 'wdw_m', 0, 2.0)
  state.wdwCosmologicalConstant = parseFloatParam(params, 'wdw_lambda', -1, 1)
  state.wdwStreamlinesEnabled = parseBoolParam(params, 'wdw_sl')
  state.wdwStreamlineDensity = parseIntParam(params, 'wdw_sld', 2, 16)
  state.wdwPhaseRotationEnabled = parseBoolParam(params, 'wdw_pr')
  state.wdwPhaseRotationSpeed = parseFloatParam(params, 'wdw_prs', 0, 5)
  state.wdwWorldlineEnabled = parseBoolParam(params, 'wdw_wl')
  state.wdwWorldlineSpeed = parseFloatParam(params, 'wdw_wls', 0.1, 3)
  state.wdwWorldlinePulseWidth = parseFloatParam(params, 'wdw_wlw', 0.02, 0.3)

  // Strip undefined values so Object.keys(state).length reflects actual params
  for (const key of Object.keys(state) as Array<keyof typeof state>) {
    if (state[key] === undefined) delete state[key]
  }

  return state
}

// ─── URL Helpers ─────────────────────────────────────────────────────────────

/**
 * Generates a shareable URL with current state.
 * @param state - The state to serialize
 * @returns Full shareable URL
 */
export function generateShareUrl(state: ShareableState): string {
  const serialized = serializeState(state)
  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''
  return serialized ? `${baseUrl}?${serialized}` : baseUrl
}

/**
 * Parses the current URL to extract state.
 * @returns Partial state object from current URL
 */
export function parseCurrentUrl(): ParsedShareableState {
  if (typeof window === 'undefined') return {}
  return deserializeState(window.location.search)
}
