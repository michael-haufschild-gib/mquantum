/**
 * URL state serializer for the Bell-pair / CHSH quantum object.
 *
 * Encodes the 21 user-visible Bell-pair settings (four 2-component Bloch
 * axes, Werner visibility, detection efficiency, analysis mode, two
 * 3-component precession fields, sampler mode, LHV strategy, target
 * trial count, trials-per-frame, optional PRNG seed) into short URL
 * keys. Naming follows the project's `bell_*` namespace, matching the
 * `wdw_*`, `ads_*`, and `sw_*` per-mode namespaces.
 *
 * Mirrors the file layout of `adsSerializer.ts` and `wdwSerializer.ts`:
 * the orchestrator (`state-serializer.ts`) calls {@link serializeBell}
 * to write fields onto a `URLSearchParams` and {@link deserializeBell}
 * to populate a `ParsedShareableState`. Bell fields are only emitted
 * when `quantumMode === 'bellTest'`.
 *
 * Validation: angles fold into [0, π] × [0, 2π); v and η clamp to [0, 1];
 * fields clamp to ±50 (Larmor angular frequency cap); target trial count
 * clamps to [4, 10⁷]; trials-per-frame to [1, 5000]; seed is treated as
 * unsigned 32-bit.
 *
 * @module lib/url/bellSerializer
 */

import { BELL_URL_KEYS } from '@/lib/geometry/extended/bellPair'

import {
  parseEnumParam,
  parseFloatParam,
  parseIntParam,
  setFloatParam,
  setIntParam,
  setStringParam,
} from './paramHelpers'

/** Bloch axis (θ, φ) used in Bell URL state. */
export type BellAxisUrl = readonly [number, number]

/** Effective magnetic-field vector used in Bell URL state. */
export type BellFieldUrl = readonly [number, number, number]

/** Analysis-mode enumeration mirrored from `BellAnalysisMode`. */
export type BellAnalysisModeUrl = 'fairSampling' | 'assignNonDetection'

/** Sampler-mode enumeration mirrored from `BellSamplerMode`. */
export type BellSamplerModeUrl = 'qm' | 'lhv'

const VALID_ANALYSIS_MODES: BellAnalysisModeUrl[] = ['fairSampling', 'assignNonDetection']
const VALID_SAMPLER_MODES: BellSamplerModeUrl[] = ['qm', 'lhv']

/**
 * Bell-pair URL state fields. All optional — missing fields keep store
 * defaults on the application side. The orchestrator folds this into
 * `ShareableObjectState` via interface intersection.
 */
export interface BellUrlState {
  /** Alice's unprimed axis (θ, φ) in radians. */
  bellAliceAxis?: BellAxisUrl
  /** Alice's primed axis (θ, φ). */
  bellAliceAxisPrime?: BellAxisUrl
  /** Bob's unprimed axis (θ, φ). */
  bellBobAxis?: BellAxisUrl
  /** Bob's primed axis (θ, φ). */
  bellBobAxisPrime?: BellAxisUrl

  /** Werner visibility v ∈ [0, 1]. */
  bellVisibility?: number
  /** Symmetric detection efficiency η ∈ [0, 1]. */
  bellDetectionEfficiency?: number
  /** Analysis policy for non-coincidences. */
  bellAnalysisMode?: BellAnalysisModeUrl

  /** Alice's effective precession field vector. */
  bellFieldA?: BellFieldUrl
  /** Bob's effective precession field vector. */
  bellFieldB?: BellFieldUrl

  /** QM (Born rule) vs LHV sampler. */
  bellSamplerMode?: BellSamplerModeUrl
  /** LHV strategy id when samplerMode = 'lhv'. */
  bellLhvStrategyId?: string

  /** Target trial count for the current Run. */
  bellTargetTrials?: number
  /** Trials drawn per UI frame when running. */
  bellTrialsPerFrame?: number

  /** Optional PRNG seed for reproducibility (opt-in share). */
  bellSeed?: number
}

/** Bounds used in {@link serializeBell} and {@link deserializeBell}. */
const AXIS_THETA_RANGE: readonly [number, number] = [0, Math.PI]
const AXIS_PHI_RANGE: readonly [number, number] = [0, 2 * Math.PI]
const FIELD_RANGE: readonly [number, number] = [-50, 50]
const TARGET_RANGE: readonly [number, number] = [4, 10_000_000]
const TRIALS_PER_FRAME_RANGE: readonly [number, number] = [1, 5000]
const SEED_RANGE: readonly [number, number] = [0, 0xffffffff]

/**
 * Precision used for axis angles and field components. Four decimals ≈ 1e-4 rad
 * (~0.006°), which preserves CHSH-sweep resolution without bloating the URL.
 */
const BELL_FLOAT_PRECISION = 4

function emitAxis(
  params: URLSearchParams,
  keyTheta: string,
  keyPhi: string,
  axis: BellAxisUrl | undefined
): void {
  if (!axis) return
  setFloatParam(params, keyTheta, axis[0], false, BELL_FLOAT_PRECISION)
  setFloatParam(params, keyPhi, axis[1], false, BELL_FLOAT_PRECISION)
}

function readAxis(
  params: URLSearchParams,
  keyTheta: string,
  keyPhi: string
): BellAxisUrl | undefined {
  const t = parseFloatParam(params, keyTheta, AXIS_THETA_RANGE[0], AXIS_THETA_RANGE[1])
  const p = parseFloatParam(params, keyPhi, AXIS_PHI_RANGE[0], AXIS_PHI_RANGE[1])
  if (t === undefined && p === undefined) return undefined
  // If only one component is present, fall back to 0 for the other —
  // matches the "all fields optional" forward-compat policy.
  return [t ?? 0, p ?? 0]
}

function emitField(
  params: URLSearchParams,
  kx: string,
  ky: string,
  kz: string,
  field: BellFieldUrl | undefined
): void {
  if (!field) return
  setFloatParam(params, kx, field[0], false, BELL_FLOAT_PRECISION)
  setFloatParam(params, ky, field[1], false, BELL_FLOAT_PRECISION)
  setFloatParam(params, kz, field[2], false, BELL_FLOAT_PRECISION)
}

function readField(
  params: URLSearchParams,
  kx: string,
  ky: string,
  kz: string
): BellFieldUrl | undefined {
  const x = parseFloatParam(params, kx, FIELD_RANGE[0], FIELD_RANGE[1])
  const y = parseFloatParam(params, ky, FIELD_RANGE[0], FIELD_RANGE[1])
  const z = parseFloatParam(params, kz, FIELD_RANGE[0], FIELD_RANGE[1])
  if (x === undefined && y === undefined && z === undefined) return undefined
  return [x ?? 0, y ?? 0, z ?? 0]
}

/**
 * Write Bell-pair fields to URL params. No-op on undefined fields.
 *
 * @param params - URL params to mutate.
 * @param state - Source state (typically `ShareableObjectState`).
 */
export function serializeBell(params: URLSearchParams, state: BellUrlState): void {
  emitAxis(params, BELL_URL_KEYS.aliceTheta, BELL_URL_KEYS.alicePhi, state.bellAliceAxis)
  emitAxis(
    params,
    BELL_URL_KEYS.aliceThetaPrime,
    BELL_URL_KEYS.alicePhiPrime,
    state.bellAliceAxisPrime
  )
  emitAxis(params, BELL_URL_KEYS.bobTheta, BELL_URL_KEYS.bobPhi, state.bellBobAxis)
  emitAxis(params, BELL_URL_KEYS.bobThetaPrime, BELL_URL_KEYS.bobPhiPrime, state.bellBobAxisPrime)

  setFloatParam(params, BELL_URL_KEYS.visibility, state.bellVisibility, false, BELL_FLOAT_PRECISION)
  setFloatParam(
    params,
    BELL_URL_KEYS.detectionEfficiency,
    state.bellDetectionEfficiency,
    false,
    BELL_FLOAT_PRECISION
  )
  setStringParam(params, BELL_URL_KEYS.analysisMode, state.bellAnalysisMode)

  emitField(
    params,
    BELL_URL_KEYS.fieldAx,
    BELL_URL_KEYS.fieldAy,
    BELL_URL_KEYS.fieldAz,
    state.bellFieldA
  )
  emitField(
    params,
    BELL_URL_KEYS.fieldBx,
    BELL_URL_KEYS.fieldBy,
    BELL_URL_KEYS.fieldBz,
    state.bellFieldB
  )

  setStringParam(params, BELL_URL_KEYS.samplerMode, state.bellSamplerMode)
  setStringParam(params, BELL_URL_KEYS.lhvStrategyId, state.bellLhvStrategyId)

  setIntParam(params, BELL_URL_KEYS.targetTrials, state.bellTargetTrials)
  setIntParam(params, BELL_URL_KEYS.trialsPerFrame, state.bellTrialsPerFrame)
  setIntParam(params, BELL_URL_KEYS.seed, state.bellSeed)
}

/**
 * Read Bell-pair fields from URL params into a partial state object.
 *
 * Missing params stay undefined (caller keeps defaults). Out-of-range
 * values are clamped to the documented bounds via the helper parsers.
 *
 * @param params - URL params to read.
 * @param state - Mutable target state object.
 */
export function deserializeBell(
  params: URLSearchParams,
  state: { [K in keyof BellUrlState]?: BellUrlState[K] }
): void {
  state.bellAliceAxis = readAxis(params, BELL_URL_KEYS.aliceTheta, BELL_URL_KEYS.alicePhi)
  state.bellAliceAxisPrime = readAxis(
    params,
    BELL_URL_KEYS.aliceThetaPrime,
    BELL_URL_KEYS.alicePhiPrime
  )
  state.bellBobAxis = readAxis(params, BELL_URL_KEYS.bobTheta, BELL_URL_KEYS.bobPhi)
  state.bellBobAxisPrime = readAxis(params, BELL_URL_KEYS.bobThetaPrime, BELL_URL_KEYS.bobPhiPrime)

  state.bellVisibility = parseFloatParam(params, BELL_URL_KEYS.visibility, 0, 1)
  state.bellDetectionEfficiency = parseFloatParam(params, BELL_URL_KEYS.detectionEfficiency, 0, 1)
  state.bellAnalysisMode = parseEnumParam(params, BELL_URL_KEYS.analysisMode, VALID_ANALYSIS_MODES)

  state.bellFieldA = readField(
    params,
    BELL_URL_KEYS.fieldAx,
    BELL_URL_KEYS.fieldAy,
    BELL_URL_KEYS.fieldAz
  )
  state.bellFieldB = readField(
    params,
    BELL_URL_KEYS.fieldBx,
    BELL_URL_KEYS.fieldBy,
    BELL_URL_KEYS.fieldBz
  )

  state.bellSamplerMode = parseEnumParam(params, BELL_URL_KEYS.samplerMode, VALID_SAMPLER_MODES)
  const lhvId = params.get(BELL_URL_KEYS.lhvStrategyId)
  if (lhvId && lhvId.length > 0 && lhvId.length < 64) state.bellLhvStrategyId = lhvId

  state.bellTargetTrials = parseIntParam(
    params,
    BELL_URL_KEYS.targetTrials,
    TARGET_RANGE[0],
    TARGET_RANGE[1]
  )
  state.bellTrialsPerFrame = parseIntParam(
    params,
    BELL_URL_KEYS.trialsPerFrame,
    TRIALS_PER_FRAME_RANGE[0],
    TRIALS_PER_FRAME_RANGE[1]
  )
  state.bellSeed = parseIntParam(params, BELL_URL_KEYS.seed, SEED_RANGE[0], SEED_RANGE[1])
}
