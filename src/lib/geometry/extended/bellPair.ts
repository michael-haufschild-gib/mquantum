/**
 * Bell-pair quantum object configuration.
 *
 * The Bell-pair object models a two-qubit entangled spin state used to
 * simulate Bell / CHSH experiments. The user-tunable settings live here in
 * the extended object store; the running statistical state (trial counts,
 * S history, outcome stream) lives in the Bell-experiment diagnostic store
 * because it is high-frequency, ring-buffered, and otherwise unfit for a
 * preset.
 *
 * Physics model:
 *   |Ψ⟩ ∈ ℂ² ⊗ ℂ²   (4 amplitudes; basis |00⟩, |01⟩, |10⟩, |11⟩)
 *   ρ(v) = v |Ψ⁻⟩⟨Ψ⁻| + (1 − v) I/4     (Werner state, v ∈ [0, 1])
 *   H = b_A · σ ⊗ I + I ⊗ σ · b_B        (independent precession; ℏ = 1)
 *
 * Per-trial sampling uses the Born rule on the joint projector
 * P_a(s_A) ⊗ P_b(s_B). Detector efficiency η is applied per-side as an
 * i.i.d. Bernoulli filter; analysis policy selects fair-sampling (drop
 * non-coincidences) or Clauser-Horne assignNonDetection (null → +1).
 *
 * The four canonical CHSH azimuthal angles (Alice: 0, π/2; Bob: π/4, 3π/4)
 * sit at the singlet's maximum |S| = 2√2 and form the configuration's
 * recommended default.
 *
 * @module lib/geometry/extended/bellPair
 */

import { CANONICAL_CHSH_PHI } from '@/lib/physics/bell/analytic'

// ============================================================================
// Bell-pair Types
// ============================================================================

/** Bloch-sphere axis stored as (θ, φ) — θ ∈ [0, π], φ ∈ [0, 2π). */
export type BellPairAxis = [theta: number, phi: number]

/** Per-particle effective magnetic field stored as a 3-vector. */
export type BellPairField = [x: number, y: number, z: number]

/**
 * Analysis policy for trials that include a non-detection event.
 * - 'fairSampling': drop non-coincidences (the standard η-limited analysis).
 * - 'assignNonDetection': map null → +1 outcomes (Clauser-Horne convention).
 */
export type BellAnalysisMode = 'fairSampling' | 'assignNonDetection'

/**
 * Whether the simulator's sampler uses quantum mechanics or a local
 * hidden-variable model. Selected next to {@link BellPairConfig.lhvStrategyId}
 * for the three LHV variants ('deterministicBell', 'noisyClassical',
 * 'detectionLoophole_0.500').
 */
export type BellSamplerMode = 'qm' | 'lhv'

// ============================================================================
// Bell-pair Config
// ============================================================================

/**
 * Configuration for the Bell-pair quantum object.
 *
 * Stored in the extended object store under the `bellPair` key. All fields
 * here are user-tunable and preset-serializable. Trial-loop state
 * (accumulators, history, current S) lives separately in the Bell
 * diagnostic store (see M3).
 *
 * `latticeDim` is retained for parity with PauliConfig so the shared
 * sliceAnimation animation system applies uniformly; the Bell-pair compute
 * pass (M4) propagates each particle's spatial wavefunction on a 3D
 * sub-lattice, projecting higher dimensions out before sampling.
 */
export interface BellPairConfig {
  // === Lattice (parity with PauliConfig) ===
  /** Spatial dimensionality (3D recommended; higher dims slice down to 3D). */
  latticeDim: number
  /** Grid points per dimension, one per spatial axis. Powers of 2 for FFT. */
  gridSize: number[]
  /** Grid spacing per dimension. */
  spacing: number[]
  /** Slice positions for the (latticeDim − 3) extra dimensions. */
  slicePositions: number[]

  // === Measurement axes (canonical CHSH defaults) ===
  /** Alice's unprimed measurement axis. */
  aliceAxis: BellPairAxis
  /** Alice's primed measurement axis. */
  aliceAxisPrime: BellPairAxis
  /** Bob's unprimed measurement axis. */
  bobAxis: BellPairAxis
  /** Bob's primed measurement axis. */
  bobAxisPrime: BellPairAxis

  // === State noise / loopholes ===
  /** Werner-state visibility v ∈ [0, 1]. v = 1 is the singlet. */
  visibility: number
  /** Symmetric detection efficiency η ∈ [0, 1] applied per detector. */
  detectionEfficiency: number
  /** How to treat trials with a missed detection. */
  analysisMode: BellAnalysisMode

  // === Time evolution (independent per-particle precession) ===
  /** Effective field vector on Alice's qubit (γ_A · B_A, ℏ = 1 units). */
  fieldA: BellPairField
  /** Effective field vector on Bob's qubit (γ_B · B_B, ℏ = 1 units). */
  fieldB: BellPairField

  // === Trial loop control ===
  /** Whether QM or a local hidden-variable model drives the sampler. */
  samplerMode: BellSamplerMode
  /** LHV strategy id when samplerMode = 'lhv'. */
  lhvStrategyId: string
  /** Trial cap for one Run pass. Auto-Run loops until aborted. */
  targetTrials: number
  /** Number of trials drawn per UI frame when running. */
  trialsPerFrame: number

  // === Reproducibility ===
  /**
   * PRNG seed for the trial sequence. Use a fresh randomized seed on Reset
   * so the same shareable link does not always replay the same statistics.
   * Only emit `bell_seed` to the URL when the user explicitly chose to share
   * with a fixed seed (see state-serializer's `bell_seed` policy).
   */
  seed: number

  // === Runtime ===
  /** Flag to trigger re-initialization (state vector reset + trial buffer clear). */
  needsReset: boolean
}

/**
 * Canonical-CHSH default Bell-pair configuration.
 *
 * - Singlet state (v = 1).
 * - Perfect detectors (η = 1).
 * - No precession (B_A = B_B = 0); static singlet.
 * - QM sampler, deterministic Bell as the LHV side-by-side baseline.
 * - 50 trials/frame → ≈ 3000 trials/sec at 60 Hz, enough to cross the
 *   classical bound in under a minute of wall time.
 */
export const DEFAULT_BELL_PAIR_CONFIG: BellPairConfig = {
  latticeDim: 3,
  gridSize: [64, 64, 64],
  spacing: [0.15, 0.15, 0.15],
  slicePositions: [],

  aliceAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.a],
  aliceAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.aPrime],
  bobAxis: [Math.PI / 2, CANONICAL_CHSH_PHI.b],
  bobAxisPrime: [Math.PI / 2, CANONICAL_CHSH_PHI.bPrime],

  visibility: 1,
  detectionEfficiency: 1,
  analysisMode: 'fairSampling',

  fieldA: [0, 0, 0],
  fieldB: [0, 0, 0],

  samplerMode: 'qm',
  lhvStrategyId: 'deterministicBell',
  targetTrials: 10_000,
  trialsPerFrame: 50,

  seed: 1,

  needsReset: true,
}

/**
 * Allocate a fresh deep-cloned default Bell-pair configuration.
 *
 * Used by store initialization and reset paths. Deep-clones the mutable
 * arrays / tuples so callers can mutate the result without leaking changes
 * back into {@link DEFAULT_BELL_PAIR_CONFIG}.
 *
 * @returns Fresh default config.
 */
export function createDefaultBellPairConfig(): BellPairConfig {
  return structuredClone(DEFAULT_BELL_PAIR_CONFIG)
}

const TWO_PI = 2 * Math.PI

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const finite = finiteNumber(value, fallback)
  return Math.max(min, Math.min(max, finite))
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, Math.round(finiteNumber(value, fallback))))
}

function normalizeBellAxis(value: unknown, fallback: BellPairAxis): BellPairAxis {
  if (!Array.isArray(value) || value.length !== 2) return [...fallback]
  const theta = clampNumber(value[0], 0, Math.PI, fallback[0])
  const phiRaw = finiteNumber(value[1], fallback[1])
  const phi = ((phiRaw % TWO_PI) + TWO_PI) % TWO_PI
  return [theta, phi]
}

function normalizeBellField(value: unknown, fallback: BellPairField): BellPairField {
  if (!Array.isArray(value) || value.length !== 3) return [...fallback]
  if (!value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
    return [...fallback]
  }
  return [
    Math.max(-50, Math.min(50, value[0])),
    Math.max(-50, Math.min(50, value[1])),
    Math.max(-50, Math.min(50, value[2])),
  ]
}

function normalizeNumberArray(
  value: unknown,
  fallback: number[],
  min: number,
  max: number
): number[] {
  if (!Array.isArray(value) || value.length !== fallback.length) return [...fallback]
  if (!value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))) {
    return [...fallback]
  }
  return value.map((entry) => Math.max(min, Math.min(max, entry)))
}

/**
 * Sanitize Bell-pair config after bulk scene/preset loads or direct store writes.
 *
 * UI setters validate individual fields, but scene loading merges raw JSON
 * directly into the extended store. This keeps the trial loop finite and
 * prevents NaN Bloch axes from reaching Bell sampling or apparatus uniforms.
 */
export function sanitizeBellPairConfig(config: Partial<BellPairConfig>): BellPairConfig {
  const fallback = DEFAULT_BELL_PAIR_CONFIG
  const base = { ...fallback, ...config }
  const analysisMode: BellAnalysisMode =
    base.analysisMode === 'fairSampling' || base.analysisMode === 'assignNonDetection'
      ? base.analysisMode
      : fallback.analysisMode
  const samplerMode: BellSamplerMode =
    base.samplerMode === 'qm' || base.samplerMode === 'lhv'
      ? base.samplerMode
      : fallback.samplerMode
  const lhvStrategyId =
    typeof base.lhvStrategyId === 'string' && base.lhvStrategyId.length > 0
      ? base.lhvStrategyId.slice(0, 63)
      : fallback.lhvStrategyId

  return {
    ...base,
    latticeDim: clampInteger(base.latticeDim, 3, 3, fallback.latticeDim),
    gridSize: normalizeNumberArray(base.gridSize, fallback.gridSize, 1, 4096).map((n) =>
      Math.round(n)
    ),
    spacing: normalizeNumberArray(base.spacing, fallback.spacing, 1e-6, 100),
    // Bell-pair simulation is fixed to 3D, so it has no extra slice dimensions.
    slicePositions: [...fallback.slicePositions],
    aliceAxis: normalizeBellAxis(base.aliceAxis, fallback.aliceAxis),
    aliceAxisPrime: normalizeBellAxis(base.aliceAxisPrime, fallback.aliceAxisPrime),
    bobAxis: normalizeBellAxis(base.bobAxis, fallback.bobAxis),
    bobAxisPrime: normalizeBellAxis(base.bobAxisPrime, fallback.bobAxisPrime),
    visibility: clampNumber(base.visibility, 0, 1, fallback.visibility),
    detectionEfficiency: clampNumber(base.detectionEfficiency, 0, 1, fallback.detectionEfficiency),
    analysisMode,
    fieldA: normalizeBellField(base.fieldA, fallback.fieldA),
    fieldB: normalizeBellField(base.fieldB, fallback.fieldB),
    samplerMode,
    lhvStrategyId,
    targetTrials: clampInteger(base.targetTrials, 4, 10_000_000, fallback.targetTrials),
    trialsPerFrame: clampInteger(base.trialsPerFrame, 1, 5000, fallback.trialsPerFrame),
    seed: Math.round(finiteNumber(base.seed, fallback.seed)) >>> 0,
    needsReset: typeof base.needsReset === 'boolean' ? base.needsReset : fallback.needsReset,
  }
}

/**
 * Stable URL-serializer keys for the Bell-pair config. Used by the URL
 * state serializer (`src/lib/url/state-serializer.ts`) and documented in
 * `.claude/rules/url-serializer.md`.
 *
 * Naming convention `bell_<short>` matches the existing `wdw_*`, `ads_*`,
 * and `sw_*` namespaces for per-mode URL params.
 */
export const BELL_URL_KEYS = Object.freeze({
  aliceTheta: 'bell_at',
  alicePhi: 'bell_ap',
  aliceThetaPrime: 'bell_apt',
  alicePhiPrime: 'bell_app',
  bobTheta: 'bell_bt',
  bobPhi: 'bell_bp',
  bobThetaPrime: 'bell_bpt',
  bobPhiPrime: 'bell_bpp',
  visibility: 'bell_v',
  detectionEfficiency: 'bell_eta',
  analysisMode: 'bell_an',
  fieldAx: 'bell_bax',
  fieldAy: 'bell_bay',
  fieldAz: 'bell_baz',
  fieldBx: 'bell_bbx',
  fieldBy: 'bell_bby',
  fieldBz: 'bell_bbz',
  samplerMode: 'bell_m',
  lhvStrategyId: 'bell_lhv',
  targetTrials: 'bell_n',
  trialsPerFrame: 'bell_tpf',
  seed: 'bell_seed',
})
