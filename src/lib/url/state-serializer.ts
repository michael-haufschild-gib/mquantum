/**
 * URL State Serializer (orchestrator).
 *
 * Top-level serialize/deserialize for the URL-shareable application
 * state. Per-domain serializers (TDSE, cosmology, AdS, WdW, SRMT,
 * sweep) live in adjacent modules; this file only owns the public
 * `ShareableState` type, the cross-mode dispatch, and the few
 * non-domain-specific primitives (rendering, quantum numbers, scene
 * payload).
 *
 * Unknown params are silently ignored (forward compatible). Missing
 * params keep app defaults. The split was performed against the test
 * suite in `src/tests/lib/url/` which validates byte-identical
 * round-trip serialization for every mode.
 *
 * Core params (scene identity):
 *   `?scene=<name>` | `?t=<objectType>&d=<dim>&qm=<mode>`
 *
 * @module lib/url/state-serializer
 */

import { MAX_DIMENSION, MIN_DIMENSION } from '@/constants/dimension'
import type { SchroedingerRepresentation } from '@/lib/geometry/extended/schroedinger'
import type { TdsePotentialType } from '@/lib/geometry/extended/tdse'
import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/types'
import { isValidObjectType } from '@/lib/geometry/registry'
import type { ObjectType } from '@/lib/geometry/types'
import type { CosmologyPreset } from '@/lib/physics/cosmology/presets'
import type { MetricKind } from '@/lib/physics/tdse/metrics/types'

import { type AdsUrlState, deserializeAds, serializeAds } from './adsSerializer'
import {
  type CosmologySerializableState,
  deserializeCosmology,
  serializeCosmology,
} from './cosmologySerializer'
import {
  parseBoolParam,
  parseEnumParam,
  parseFloatParam,
  parseIntParam,
  setBoolParam,
  setFloatParam,
  setIntParam,
  setStringParam,
} from './paramHelpers'
import type { SrmtUrlState } from './srmtSerializer'
import {
  deserializeSrmtAndSweep,
  serializeSrmtAndSweep,
  type SrmtSweepUrlState,
} from './srmtSweepSerializer'
import {
  deserializeTdseFeatures,
  deserializeTdseMetric,
  deserializeTdsePotential,
  deserializeTdseVisualization,
  serializeTdseFeatures,
  serializeTdseMetric,
  serializeTdsePotential,
  serializeTdseVisualization,
  type TdseSerializableState,
} from './tdseSerializer'
import { deserializeWdw, serializeWdw, type UrlWdwBoundaryCondition } from './wdwSerializer'

// ─── Validation Sets ─────────────────────────────────────────────────────────

export const VALID_QUANTUM_MODES: SchroedingerQuantumMode[] = [
  'harmonicOscillator',
  'hydrogenND',
  'hydrogenNDCoupled',
  'freeScalarField',
  'tdseDynamics',
  'becDynamics',
  'diracEquation',
  'quantumWalk',
  'wheelerDeWitt',
  'antiDeSitter',
]

const VALID_REPRESENTATIONS: SchroedingerRepresentation[] = ['position', 'momentum', 'wigner']

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * URL-shareable application state.
 *
 * All fields except `dimension` and `objectType` are optional —
 * missing fields keep their app defaults. Sub-domain fields
 * (`AdsUrlState`, `SrmtUrlState`, `SrmtSweepUrlState`,
 * `TdseSerializableState`, `CosmologySerializableState`) are folded in
 * via interface intersection so a single state object satisfies every
 * per-domain serializer's input type.
 */
export interface ShareableObjectState
  extends
    AdsUrlState,
    SrmtUrlState,
    SrmtSweepUrlState,
    TdseSerializableState,
    CosmologySerializableState {
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

  // TDSE config + features inherited from `TdseSerializableState`.
  // Cosmological background inherited from `CosmologySerializableState`.

  // ── Wheeler–DeWitt Minisuperspace ───────────────────────────────────────
  /** Wheeler–DeWitt boundary condition proposal */
  wdwBoundaryCondition?: UrlWdwBoundaryCondition
  /** Wheeler–DeWitt inflaton mass m */
  wdwInflatonMass?: number
  /**
   * Wheeler–DeWitt per-axis effective-mass ratio `α` on the φ₂ axis.
   * Clamped to `[0.1, 10]`. `1` is the isotropic default — only emitted
   * in the URL when `!== 1` so baseline links stay clean.
   */
  wdwInflatonMassAsymmetry?: number
  /** Wheeler–DeWitt cosmological constant Λ */
  wdwCosmologicalConstant?: number
  /** Wheeler–DeWitt solver grid size — `Na` scale-factor steps (16..1024). */
  wdwGridNa?: number
  /** Wheeler–DeWitt solver grid size — `Nphi` φ-axis points (8..128). */
  wdwGridNphi?: number
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
  /**
   * Wheeler–DeWitt R-channel render headroom (dynamic range slider; 1..10 000).
   * Default 100 is elided from the URL by the Wheeler–DeWitt serializer.
   */
  wdwRenderDynamicRange?: number

  // AdS / BTZ fields inherited from `AdsUrlState` — see adsSerializer.ts.
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
 */
export type ParsedShareableState = Partial<ShareableObjectState> & Partial<ShareableSceneState>

// Re-export the per-domain types so consumers that previously imported
// them from this module keep working.
export type { CosmologyPreset, MetricKind, TdsePotentialType }

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

  // TDSE — potential, metric, visualization, feature toggles. Each helper
  // is a no-op when its driving field is undefined, so no per-mode guard
  // is needed at this layer.
  serializeTdsePotential(params, state)
  serializeTdseMetric(params, state)
  serializeTdseVisualization(params, state)
  serializeTdseFeatures(params, state)

  // Cosmological background — only emit the sub-params when enabled
  serializeCosmology(params, state)

  // Wheeler–DeWitt minisuperspace (physics + render-only + SRMT diagnostic)
  if (state.quantumMode === 'wheelerDeWitt') {
    serializeWdw(params, state)
    serializeSrmtAndSweep(params, state.quantumMode, state)
  }

  // Anti-de Sitter (Stage 1). Only emitted while the mode is active — the
  // AdS fields are otherwise dormant on SchroedingerConfig and would
  // pollute links for unrelated modes.
  if (state.quantumMode === 'antiDeSitter') {
    serializeAds(params, state)
  }

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

  // TDSE — potential, metric, visualization, features.
  deserializeTdsePotential(params, state)
  deserializeTdseMetric(params, state)
  deserializeTdseVisualization(params, state)
  deserializeTdseFeatures(params, state)

  // Cosmological background (must come AFTER dimension parsing so `d` is
  // available for the s_c(n) check).
  deserializeCosmology(params, state)

  deserializeWdw(params, state)
  deserializeSrmtAndSweep(params, state)

  // Anti-de Sitter (Stage 1).
  deserializeAds(params, state)

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
