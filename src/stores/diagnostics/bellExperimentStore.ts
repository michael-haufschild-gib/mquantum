/**
 * Bell-experiment diagnostic store.
 *
 * Holds the running statistical state of the Bell / CHSH experiment:
 * per-bin trial counts and sums, derived correlations E_ij and S with
 * 95 % Wald CI, ring buffers for the S(N) sparkline, side-by-side LHV
 * tracking, non-detection bookkeeping, and the M6 (η, v) atlas-sweep
 * placeholders.
 *
 * Trial loop: the renderer strategy (M4) calls {@link processTrialBatch}
 * each frame with the current `BellPairConfig` and a batch size. The
 * store owns the PCG-32 PRNG, computes Born-rule outcomes and parallel
 * LHV outcomes for every trial, applies detection-efficiency loss,
 * post-selects per the configured analysis policy, and updates the
 * derived state.
 *
 * Determinism: the PRNG is reseeded whenever `seed` changes (via
 * {@link reset}). The same seed reproduces identical traces across runs.
 *
 * @module stores/diagnostics/bellExperimentStore
 */

import { create } from 'zustand'

import { type BellPairConfig, sanitizeBellPairConfig } from '@/lib/geometry/extended/bellPair'
import { CANONICAL_CHSH_PHI } from '@/lib/physics/bell/analytic'
import { sampleJointOutcome } from '@/lib/physics/bell/bornSample'
import { Z_95 } from '@/lib/physics/bell/chsh'
import { LHV_STRATEGIES, lhvDeterministicBell } from '@/lib/physics/bell/lhv'
import { applyDetectionEfficiency, postSelectOutcome } from '@/lib/physics/bell/loopholes'
import { PCG32 } from '@/lib/physics/bell/pcg32'
import { precessDensityMatrix } from '@/lib/physics/bell/precession'
import { blochAngleToVec3, jointOutcomeProbabilities } from '@/lib/physics/bell/projectors'
import { bellState, pureDensityMatrix, wernerDensityMatrix } from '@/lib/physics/bell/state'
import type { ComplexMat4, JointOutcome, Vec3 } from '@/lib/physics/bell/types'

import { type SweepStatus } from '../utils/sweepUtils'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Ring-buffer length for the S(N) sparkline. */
const HISTORY_LENGTH = 256

/** Maximum recent outcomes kept for the "latest trials" tickers. */
const RECENT_OUTCOMES = 32

// ─── Sweep Types (M6 placeholder) ───────────────────────────────────────────

/** Configuration for an (η, v) atlas sweep. */
export interface EtaVisibilitySweepConfig {
  /** Minimum detection efficiency η. */
  etaMin: number
  /** Maximum detection efficiency η. */
  etaMax: number
  /** Number of η steps. */
  etaSteps: number
  /** Minimum Werner visibility v. */
  visibilityMin: number
  /** Maximum Werner visibility v. */
  visibilityMax: number
  /** Number of v steps. */
  visibilitySteps: number
  /** Trials per (η, v) cell. */
  trialsPerCell: number
}

/** One result row in the atlas sweep. */
export interface EtaVisibilitySweepPoint {
  /** Row index on the η axis at the time the sweep ran. */
  rowIndex: number
  /** Column index on the v axis at the time the sweep ran. */
  colIndex: number
  /** Symmetric detection efficiency η. */
  eta: number
  /** Werner visibility v. */
  visibility: number
  /** Empirical |S| at this cell (QM sampler). */
  absS: number
  /** Whether the cell produced a CHSH violation (|S| > 2). */
  violated: boolean
  /** Coincidence fraction (1 − non-detection rate). */
  coincidenceFraction: number
  /** Trial count after post-selection (fair-sampling drops non-coincidences). */
  postSelectedTrials: number
  /** Non-detections (Alice or Bob fired but not both). */
  nonDetections: number
}

/**
 * Snapshot of the (η, v) grid dimensions captured at sweep start. Used
 * to keep the heatmap render layout stable even if the user touches the
 * sweep-config sliders after a run completes — the displayed cells
 * stay where they were computed, until the next sweep starts.
 */
export interface ActiveSweepGrid {
  /** Number of η rows that were active when the sweep began. */
  etaSteps: number
  /** Number of v columns that were active when the sweep began. */
  visibilitySteps: number
}

/** Default sweep config: log-spaced η in [0.5, 1], v in [0.5, 1]. */
const DEFAULT_SWEEP_CONFIG: EtaVisibilitySweepConfig = {
  etaMin: 0.5,
  etaMax: 1.0,
  etaSteps: 8,
  visibilityMin: 0.5,
  visibilityMax: 1.0,
  visibilitySteps: 8,
  trialsPerCell: 4_000,
}

// ─── Store Type ─────────────────────────────────────────────────────────────

/** Snapshot of one bin (count + sample-mean correlation). */
export interface BinSnapshot {
  /** Trial count in this bin. */
  count: number
  /** Sample-mean correlation, or NaN if count = 0. */
  mean: number
}

/** Full diagnostic snapshot for one sampler (QM or LHV). */
export interface SamplerSnapshot {
  bins: readonly [BinSnapshot, BinSnapshot, BinSnapshot, BinSnapshot]
  S: number
  sCI: { lo: number; hi: number; halfWidth: number }
  nonDetections: number
}

/** Zustand state shape for the Bell experiment diagnostic store. */
interface BellExperimentState {
  // ── Identity ──────────────────────────────────────────────────────────
  /** Total trials drawn (across all bins; counts non-detections separately). */
  totalTrials: number
  /** Active PRNG seed for the current run. */
  seed: number

  // ── QM accumulator ────────────────────────────────────────────────────
  /** Sample-mean correlations per bin. */
  qm: SamplerSnapshot
  /** Whether the QM run achieved CHSH violation at any point. */
  qmHasViolated: boolean

  // ── LHV side-by-side accumulator ──────────────────────────────────────
  /** Always-on parallel LHV sampler for direct comparison. */
  lhv: SamplerSnapshot
  /** Active LHV strategy id (mirrors `config.lhvStrategyId`). */
  lhvStrategyId: string

  // ── History ring buffers ──────────────────────────────────────────────
  /** Ring buffer of QM |S| samples (NaN where bin is empty). */
  historyQmS: Float64Array
  /** Ring buffer of LHV |S| samples (NaN where bin is empty). */
  historyLhvS: Float64Array
  /** Cumulative trial count at each history slot. */
  historyTrialCount: Uint32Array
  /** Ring-buffer write head. */
  historyHead: number
  /** Number of valid entries (up to HISTORY_LENGTH). */
  historyCount: number

  // ── Recent outcomes ───────────────────────────────────────────────────
  /** Recent (settingA, settingB, outcomeA, outcomeB) packed as Int8Array
   *  with stride 4. Used for the latest-trials ticker. */
  recentOutcomes: Int8Array
  /** Ring-buffer write head for recentOutcomes. */
  recentHead: number
  /** Number of valid recent entries. */
  recentCount: number

  // ── Run control ───────────────────────────────────────────────────────
  /** Whether the trial loop is currently auto-running. */
  isRunning: boolean

  // ── Sweep state (M6) ──────────────────────────────────────────────────
  sweepStatus: SweepStatus
  sweepConfig: EtaVisibilitySweepConfig
  /** Grid snapshot captured when the sweep started; null when no sweep has run. */
  activeSweepGrid: ActiveSweepGrid | null
  sweepResults: EtaVisibilitySweepPoint[]
  sweepProgress: number
  sweepCurrentStep: number

  // ── Actions ───────────────────────────────────────────────────────────
  setIsRunning: (v: boolean) => void
  reset: (seedOverride?: number) => void
  processTrialBatch: (config: BellPairConfig, count: number) => void
  setLhvStrategyId: (id: string) => void
  /** Set the sweep config (used by M6's atlas UI). */
  setSweepConfig: (cfg: Partial<EtaVisibilitySweepConfig>) => void
  /** Sweep driver hooks (M6 wires these up). */
  setSweepStatus: (s: SweepStatus) => void
  pushSweepResult: (point: EtaVisibilitySweepPoint) => void
  setSweepProgress: (p: number, step: number) => void
  clearSweepResults: () => void
  /**
   * Captures the active grid dimensions at sweep start. The heatmap and
   * displayed cell indices honour this snapshot, not the live
   * `sweepConfig`, so editing the slider mid-display does not scramble
   * the previous render.
   */
  setActiveSweepGrid: (grid: ActiveSweepGrid | null) => void
}

// ─── PCG-32 instance, module-scoped ─────────────────────────────────────────
//
// Held outside Zustand state because PCG32 is a stateful machine with a
// 64-bit bigint internal counter; storing it in the store would not play
// nicely with shallow equality on selectors. The store carries the *seed*;
// this module rebuilds the PCG32 instance whenever the seed changes.

let _rng: PCG32 | null = null
let _rngSeed = -1

/**
 * Last seen BellPairConfig signature (axes / v / η / mode). When the
 * config changes between batches, `processTrialBatch` resets accumulators
 * so the running mean stays config-keyed instead of mixing populations
 * drawn under different physical settings.
 */
let _lastConfigKey = ''

function getRng(seed: number): PCG32 {
  const seedU32 = seed >>> 0
  if (_rng === null || seedU32 !== _rngSeed) {
    _rng = new PCG32(BigInt(seedU32))
    _rngSeed = seedU32
  }
  return _rng
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function emptyBin(): BinSnapshot {
  return { count: 0, mean: Number.NaN }
}

function emptySampler(): SamplerSnapshot {
  return {
    bins: [emptyBin(), emptyBin(), emptyBin(), emptyBin()],
    S: Number.NaN,
    sCI: { lo: Number.NaN, hi: Number.NaN, halfWidth: Number.NaN },
    nonDetections: 0,
  }
}

/** Compute S and its 95 % Wald CI from four bin snapshots. */
function deriveS(bins: readonly BinSnapshot[]): {
  S: number
  sCI: { lo: number; hi: number; halfWidth: number }
} {
  if (bins.some((b) => b.count === 0)) {
    return {
      S: Number.NaN,
      sCI: { lo: Number.NaN, hi: Number.NaN, halfWidth: Number.NaN },
    }
  }
  const m0 = bins[0]!.mean
  const m1 = bins[1]!.mean
  const m2 = bins[2]!.mean
  const m3 = bins[3]!.mean
  const S = m0 - m1 + m2 + m3
  const varSum =
    (1 - m0 ** 2) / bins[0]!.count +
    (1 - m1 ** 2) / bins[1]!.count +
    (1 - m2 ** 2) / bins[2]!.count +
    (1 - m3 ** 2) / bins[3]!.count
  const halfWidth = Z_95 * Math.sqrt(Math.max(varSum, 0))
  return { S, sCI: { lo: S - halfWidth, hi: S + halfWidth, halfWidth } }
}

/** Convert a config-side axis (θ, φ) to a Bloch unit vector. */
function axisVec(axis: readonly [number, number]): Vec3 {
  return blochAngleToVec3(axis as readonly [number, number])
}

function fieldVec(field: unknown): Vec3 {
  if (!Array.isArray(field)) return [0, 0, 0]
  return [
    typeof field[0] === 'number' && Number.isFinite(field[0]) ? field[0] : 0,
    typeof field[1] === 'number' && Number.isFinite(field[1]) ? field[1] : 0,
    typeof field[2] === 'number' && Number.isFinite(field[2]) ? field[2] : 0,
  ]
}

function hasFieldMagnitude(field: Vec3): boolean {
  return field[0] !== 0 || field[1] !== 0 || field[2] !== 0
}

function precessionTime(config: BellPairConfig, totalTrials: number): number {
  if (!Number.isFinite(totalTrials) || totalTrials <= 0) return 0
  const trialsPerFrame = config.trialsPerFrame
  if (!Number.isFinite(trialsPerFrame) || trialsPerFrame <= 0) return 0
  return totalTrials / trialsPerFrame
}

function normalizeBatchCount(count: number): number {
  if (!Number.isFinite(count) || count <= 0) return 0
  return Math.floor(count)
}

function newHistoryF64(): Float64Array {
  const buf = new Float64Array(HISTORY_LENGTH)
  buf.fill(Number.NaN)
  return buf
}

// ─── Per-bin running totals (mutable Float64/Uint32 arrays). ─────────────────
//
// We keep raw sums/counts in mutable buffers attached to the store, then
// rebuild the immutable SamplerSnapshot whenever we want to publish state.

interface RunningAccumulator {
  counts: Uint32Array // length 4
  sums: Float64Array // length 4
  nonDetections: number
}

function newAccumulator(): RunningAccumulator {
  return {
    counts: new Uint32Array(4),
    sums: new Float64Array(4),
    nonDetections: 0,
  }
}

function snapshotAccumulator(acc: RunningAccumulator): SamplerSnapshot {
  const bins: [BinSnapshot, BinSnapshot, BinSnapshot, BinSnapshot] = [
    emptyBin(),
    emptyBin(),
    emptyBin(),
    emptyBin(),
  ]
  for (let b = 0; b < 4; b++) {
    const c = acc.counts[b] ?? 0
    bins[b] = {
      count: c,
      mean: c > 0 ? (acc.sums[b] ?? 0) / c : Number.NaN,
    }
  }
  const { S, sCI } = deriveS(bins)
  return { bins, S, sCI, nonDetections: acc.nonDetections }
}

// Module-scoped accumulators — same rationale as the PRNG: avoid Zustand
// shallow-equality churn on Uint32Array/Float64Array internals; publish
// immutable SamplerSnapshot via setState whenever we want consumers to see.
const _qmAcc: RunningAccumulator = newAccumulator()
const _lhvAcc: RunningAccumulator = newAccumulator()

function resetAccumulators(): void {
  _qmAcc.counts.fill(0)
  _qmAcc.sums.fill(0)
  _qmAcc.nonDetections = 0
  _lhvAcc.counts.fill(0)
  _lhvAcc.sums.fill(0)
  _lhvAcc.nonDetections = 0
}

// ─── Default seed (canonical CHSH starting point) ───────────────────────────

const DEFAULT_SEED = 1

// ─── Initial state factory ──────────────────────────────────────────────────

function initialState(): Pick<
  BellExperimentState,
  | 'totalTrials'
  | 'seed'
  | 'qm'
  | 'qmHasViolated'
  | 'lhv'
  | 'lhvStrategyId'
  | 'historyQmS'
  | 'historyLhvS'
  | 'historyTrialCount'
  | 'historyHead'
  | 'historyCount'
  | 'recentOutcomes'
  | 'recentHead'
  | 'recentCount'
  | 'isRunning'
  | 'sweepStatus'
  | 'sweepConfig'
  | 'activeSweepGrid'
  | 'sweepResults'
  | 'sweepProgress'
  | 'sweepCurrentStep'
> {
  return {
    totalTrials: 0,
    seed: DEFAULT_SEED,
    qm: emptySampler(),
    qmHasViolated: false,
    lhv: emptySampler(),
    lhvStrategyId: lhvDeterministicBell.id,
    historyQmS: newHistoryF64(),
    historyLhvS: newHistoryF64(),
    historyTrialCount: new Uint32Array(HISTORY_LENGTH),
    historyHead: 0,
    historyCount: 0,
    recentOutcomes: new Int8Array(RECENT_OUTCOMES * 4),
    recentHead: 0,
    recentCount: 0,
    isRunning: false,
    sweepStatus: 'idle',
    sweepConfig: DEFAULT_SWEEP_CONFIG,
    activeSweepGrid: null,
    sweepResults: [],
    sweepProgress: 0,
    sweepCurrentStep: 0,
  }
}

// ─── Store ──────────────────────────────────────────────────────────────────

/**
 * Zustand store for the Bell / CHSH experiment.
 *
 * Selectors should read individual fields or use `useShallow` for compound
 * snapshots — the ring buffers are mutated in place to avoid per-frame
 * allocation, so subscribers should always pair them with `historyHead` /
 * `historyCount` to detect updates.
 *
 * @example
 * ```tsx
 * const { qm, totalTrials } = useBellExperimentStore(
 *   useShallow((s) => ({ qm: s.qm, totalTrials: s.totalTrials }))
 * )
 * ```
 */
export const useBellExperimentStore = create<BellExperimentState>((set, get) => {
  return {
    ...initialState(),

    setIsRunning: (v) => set({ isRunning: v }),

    reset: (seedOverride) => {
      const nextSeed = seedOverride !== undefined ? seedOverride >>> 0 : DEFAULT_SEED
      resetAccumulators()
      _rng = null
      _rngSeed = -1
      _lastConfigKey = '' // force config-keyed reset on next batch
      getRng(nextSeed) // prime the PCG-32
      const fresh = initialState()
      set({ ...fresh, seed: nextSeed })
    },

    setLhvStrategyId: (id) => {
      // Resetting the LHV accumulator on strategy change keeps the
      // comparison plot meaningful: a switched-mid-run LHV line would
      // be an apples-to-oranges average of two strategies. The PRNG is
      // also re-primed to the active seed so the post-switch trials are
      // reproducible from `seed` (without this, the surviving _rng would
      // continue from its mid-run state, breaking determinism).
      const currentSeed = get().seed
      resetAccumulators()
      _rng = null
      _rngSeed = -1
      _lastConfigKey = ''
      getRng(currentSeed)
      const fresh = initialState()
      set({ ...fresh, lhvStrategyId: id, seed: currentSeed })
    },

    processTrialBatch: (config, count) => {
      const trialCount = normalizeBatchCount(count)
      if (trialCount <= 0) return
      const safeConfig = sanitizeBellPairConfig(config)
      if (Number.isFinite(config.trialsPerFrame) && config.trialsPerFrame > 0) {
        safeConfig.trialsPerFrame = config.trialsPerFrame
      }

      // Config-version gating: trials drawn at a previous (axes, v, η)
      // setting are not commensurable with trials drawn at the current
      // one — averaging them would smear physically distinct populations
      // into a meaningless mean and let stale "qmHasViolated" flags leak
      // into post-change runs. Reset accumulator state whenever the
      // config-key changes, but ONLY when there are already trials to
      // discard (so an explicit `reset(seedOverride)` followed by a
      // first batch keeps the override seed in force).
      const fieldA = fieldVec(safeConfig.fieldA)
      const fieldB = fieldVec(safeConfig.fieldB)
      const configKey = `${safeConfig.aliceAxis[0]}:${safeConfig.aliceAxis[1]}:${safeConfig.aliceAxisPrime[0]}:${safeConfig.aliceAxisPrime[1]}:${safeConfig.bobAxis[0]}:${safeConfig.bobAxis[1]}:${safeConfig.bobAxisPrime[0]}:${safeConfig.bobAxisPrime[1]}:${safeConfig.visibility}:${safeConfig.detectionEfficiency}:${safeConfig.analysisMode}:${fieldA[0]}:${fieldA[1]}:${fieldA[2]}:${fieldB[0]}:${fieldB[1]}:${fieldB[2]}:${safeConfig.samplerMode}:${safeConfig.lhvStrategyId}`
      const priorState = get()
      if (priorState.totalTrials > 0 && _lastConfigKey !== '' && _lastConfigKey !== configKey) {
        const fresh = initialState()
        resetAccumulators()
        _rng = null
        _rngSeed = -1
        getRng(safeConfig.seed >>> 0)
        set({ ...fresh, seed: safeConfig.seed >>> 0 })
      }
      _lastConfigKey = configKey

      const rng = getRng(get().seed)
      const state = get()
      const setup = prepareBatchSampling(safeConfig, precessionTime(safeConfig, state.totalTrials))
      const ring = drainTrialBatchInto(rng, setup, trialCount, state.recentOutcomes, {
        recentHead: state.recentHead,
        recentCount: state.recentCount,
      })

      // Snapshot accumulators for state publish.
      const qmSnapshot = snapshotAccumulator(_qmAcc)
      const lhvSnapshot = snapshotAccumulator(_lhvAcc)
      const qmHasViolated =
        state.qmHasViolated || (Number.isFinite(qmSnapshot.S) && Math.abs(qmSnapshot.S) > 2)

      // Push S(N) sample into the history ring.
      const newTotal = state.totalTrials + trialCount
      const head = state.historyHead
      state.historyQmS[head] = Number.isFinite(qmSnapshot.S) ? Math.abs(qmSnapshot.S) : Number.NaN
      state.historyLhvS[head] = Number.isFinite(lhvSnapshot.S)
        ? Math.abs(lhvSnapshot.S)
        : Number.NaN
      state.historyTrialCount[head] = newTotal
      const newHead = (head + 1) % HISTORY_LENGTH
      const newCount = state.historyCount < HISTORY_LENGTH ? state.historyCount + 1 : HISTORY_LENGTH

      set({
        qm: qmSnapshot,
        lhv: lhvSnapshot,
        qmHasViolated,
        totalTrials: newTotal,
        historyHead: newHead,
        historyCount: newCount,
        recentHead: ring.recentHead,
        recentCount: ring.recentCount,
      })
    },

    // ── Sweep actions (M6) ──────────────────────────────────────────────
    setSweepConfig: (cfg) => {
      set((state) => ({ sweepConfig: { ...state.sweepConfig, ...cfg } }))
    },
    setSweepStatus: (s) => set({ sweepStatus: s }),
    pushSweepResult: (point) => set((state) => ({ sweepResults: [...state.sweepResults, point] })),
    setSweepProgress: (p, step) => set({ sweepProgress: p, sweepCurrentStep: step }),
    clearSweepResults: () => set({ sweepResults: [], sweepProgress: 0, sweepCurrentStep: 0 }),
    setActiveSweepGrid: (grid) => set({ activeSweepGrid: grid }),
  }
})

// ─── Batch-sampling helpers (extracted so processTrialBatch stays simple) ──

interface BatchSetup {
  aliceAxes: readonly [Vec3, Vec3]
  bobAxes: readonly [Vec3, Vec3]
  qmProbsByBin: ReturnType<typeof jointOutcomeProbabilities>[]
  lhvStrategy: ReturnType<typeof _lhvById>
  eta: number
  analysisMode: BellPairConfig['analysisMode']
}

/** Cached LHV-strategy lookup that falls back to deterministic Bell. */
function _lhvById(id: string) {
  return LHV_STRATEGIES.find((s) => s.id === id) ?? lhvDeterministicBell
}

/** Build the per-batch sampling fixtures from the current config. */
function prepareBatchSampling(config: BellPairConfig, t: number): BatchSetup {
  const baseRho: ComplexMat4 =
    config.visibility >= 1
      ? pureDensityMatrix(bellState('psiMinus'))
      : wernerDensityMatrix(config.visibility)
  const fieldA = fieldVec(config.fieldA)
  const fieldB = fieldVec(config.fieldB)
  const rho =
    t > 0 && (hasFieldMagnitude(fieldA) || hasFieldMagnitude(fieldB))
      ? precessDensityMatrix(baseRho, fieldA, fieldB, t)
      : baseRho
  const aliceAxes: readonly [Vec3, Vec3] = [
    axisVec(config.aliceAxis),
    axisVec(config.aliceAxisPrime),
  ]
  const bobAxes: readonly [Vec3, Vec3] = [axisVec(config.bobAxis), axisVec(config.bobAxisPrime)]
  const qmProbsByBin = [0, 1, 2, 3].map((bin) => {
    const settingA = (bin >>> 1) & 1
    const settingB = bin & 1
    return jointOutcomeProbabilities(rho, aliceAxes[settingA]!, bobAxes[settingB]!)
  })
  return {
    aliceAxes,
    bobAxes,
    qmProbsByBin,
    lhvStrategy: _lhvById(config.lhvStrategyId),
    eta: config.detectionEfficiency,
    analysisMode: config.analysisMode,
  }
}

/** Record a single outcome into a running accumulator, or count a non-detection. */
function recordOutcome(
  acc: RunningAccumulator,
  bin: number,
  outcome: ReturnType<typeof postSelectOutcome>
): readonly [1 | -1, 1 | -1] | null {
  if (outcome === null) {
    acc.nonDetections++
    return null
  }
  acc.counts[bin] = (acc.counts[bin] ?? 0) + 1
  acc.sums[bin] = (acc.sums[bin] ?? 0) + outcome[0] * outcome[1]
  return outcome
}

/**
 * Inner trial-loop driver. Mutates the module-scoped `_qmAcc` and
 * `_lhvAcc` plus the `recentBuf` ring-buffer; returns the updated
 * recent-ring head and count for the store to publish.
 *
 * @param rng - Active PCG-32 PRNG.
 * @param setup - Pre-computed batch fixtures.
 * @param count - Trial count.
 * @param recentBuf - Recent-outcomes ring buffer (mutated in place).
 * @param ring - Current ring head + count.
 * @returns Updated ring head + count.
 */
function drainTrialBatchInto(
  rng: PCG32,
  setup: BatchSetup,
  count: number,
  recentBuf: Int8Array,
  ring: { recentHead: number; recentCount: number }
): { recentHead: number; recentCount: number } {
  let recentHead = ring.recentHead
  let recentCount = ring.recentCount
  for (let k = 0; k < count; k++) {
    const draw = rng.nextU32()
    const settingA = (draw >>> 31) & 1
    const settingB = (draw >>> 30) & 1
    const bin = settingA * 2 + settingB

    const qmOutcome: JointOutcome = sampleJointOutcome(setup.qmProbsByBin[bin]!, rng)
    const qmDetected = applyDetectionEfficiency(
      qmOutcome,
      { etaA: setup.eta, etaB: setup.eta },
      rng
    )
    const qmFinal = recordOutcome(_qmAcc, bin, postSelectOutcome(qmDetected, setup.analysisMode))

    const lhvOutcome = setup.lhvStrategy.sampleOutcome(
      setup.aliceAxes[settingA]!,
      setup.bobAxes[settingB]!,
      rng
    )
    const lhvDetected = applyDetectionEfficiency(
      lhvOutcome,
      { etaA: setup.eta, etaB: setup.eta },
      rng
    )
    const lhvFinal = recordOutcome(_lhvAcc, bin, postSelectOutcome(lhvDetected, setup.analysisMode))

    if (qmFinal !== null || lhvFinal !== null) {
      const base = recentHead * 4
      recentBuf[base] = settingA
      recentBuf[base + 1] = settingB
      recentBuf[base + 2] = qmFinal === null ? 0 : qmFinal[0]
      recentBuf[base + 3] = qmFinal === null ? 0 : qmFinal[1]
      recentHead = (recentHead + 1) % RECENT_OUTCOMES
      if (recentCount < RECENT_OUTCOMES) recentCount++
    }
  }
  return { recentHead, recentCount }
}

/**
 * Convenience: rebuild the singlet's canonical-CHSH joint probability for
 * the (a, b) setting pair. Exposed for tests and for the UI's analytic
 * overlay (the E(θ) curve drawn against the live MC trace).
 *
 * @returns The four canonical-CHSH joint probabilities for the singlet.
 */
export function canonicalSingletProbabilities(): {
  bin: 0 | 1 | 2 | 3
  probs: ReturnType<typeof jointOutcomeProbabilities>
}[] {
  const rho = pureDensityMatrix(bellState('psiMinus'))
  const aliceAxes: Vec3[] = [
    blochAngleToVec3([Math.PI / 2, CANONICAL_CHSH_PHI.a]),
    blochAngleToVec3([Math.PI / 2, CANONICAL_CHSH_PHI.aPrime]),
  ]
  const bobAxes: Vec3[] = [
    blochAngleToVec3([Math.PI / 2, CANONICAL_CHSH_PHI.b]),
    blochAngleToVec3([Math.PI / 2, CANONICAL_CHSH_PHI.bPrime]),
  ]
  return [0, 1, 2, 3].map((bin) => {
    const sA = (bin >>> 1) & 1
    const sB = bin & 1
    return {
      bin: bin as 0 | 1 | 2 | 3,
      probs: jointOutcomeProbabilities(rho, aliceAxes[sA]!, bobAxes[sB]!),
    }
  })
}
