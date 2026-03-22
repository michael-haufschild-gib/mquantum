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

import type { SchroedingerRepresentation } from '@/lib/geometry/extended/schroedinger'
import type { TdsePotentialType } from '@/lib/geometry/extended/tdse'
import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/types'
import { isValidObjectType } from '@/lib/geometry/registry'
import type { ObjectType } from '@/lib/geometry/types'
import { MAX_DIMENSION, MIN_DIMENSION } from '@/stores/geometryStore'

// ─── Validation Sets ─────────────────────────────────────────────────────────

const VALID_QUANTUM_MODES: SchroedingerQuantumMode[] = [
  'harmonicOscillator',
  'hydrogenND',
  'freeScalarField',
  'tdseDynamics',
  'becDynamics',
  'diracEquation',
  'quantumWalk',
]

const VALID_REPRESENTATIONS: SchroedingerRepresentation[] = ['position', 'momentum', 'wigner']

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
  'radialDoubleWell',
  'custom',
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

  // ── Features ─────────────────────────────────────────────────────────────
  /** Open quantum system enabled */
  openQuantumEnabled?: boolean
  /** Open quantum dephasing rate */
  openQuantumDephasingRate?: number
  /** Open quantum relaxation rate */
  openQuantumRelaxationRate?: number
  /** Open quantum thermal excitation rate */
  openQuantumThermalUpRate?: number
  /** Classical-quantum correspondence overlay enabled */
  classicalOverlayEnabled?: boolean
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
const FLOAT_RE = /^-?\d+(\.\d+)?$/

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
  omitZero = false
): void {
  if (value !== undefined && !(omitZero && value === 0)) params.set(key, value.toFixed(2))
}

function setIntParam(params: URLSearchParams, key: string, value: number | undefined): void {
  if (value !== undefined) params.set(key, value.toString())
}

function setStringParam(params: URLSearchParams, key: string, value: string | undefined): void {
  if (value !== undefined) params.set(key, value)
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

  // Features
  if (state.openQuantumEnabled) {
    params.set('oq', '1')
    setFloatParam(params, 'oq_dp', state.openQuantumDephasingRate, true)
    setFloatParam(params, 'oq_rx', state.openQuantumRelaxationRate, true)
    setFloatParam(params, 'oq_th', state.openQuantumThermalUpRate, true)
  }
  setBoolParam(params, 'co', state.classicalOverlayEnabled)

  return params.toString()
}

// ─── Deserialize ─────────────────────────────────────────────────────────────

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
  if (state.potentialType === 'custom') {
    const cpx = params.get('cpx')
    if (cpx && cpx.length <= 200) state.customPotentialExpression = cpx
  }

  // Features — open quantum
  const oq = parseBoolParam(params, 'oq')
  if (oq !== undefined) {
    state.openQuantumEnabled = oq
    state.openQuantumDephasingRate = parseFloatParam(params, 'oq_dp', 0, 5)
    state.openQuantumRelaxationRate = parseFloatParam(params, 'oq_rx', 0, 5)
    state.openQuantumThermalUpRate = parseFloatParam(params, 'oq_th', 0, 5)
  }
  state.classicalOverlayEnabled = parseBoolParam(params, 'co')

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
