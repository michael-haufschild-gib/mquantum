import { beforeEach, describe, expect, it } from 'vitest'

import { createDefaultBellPairConfig } from '@/lib/geometry/extended/bellPair'
import { CLASSICAL_BOUND, TSIRELSON_BOUND } from '@/lib/physics/bell/chsh'
import { LHV_STRATEGIES, lhvDeterministicBell } from '@/lib/physics/bell/lhv'
import { useBellExperimentStore } from '@/stores/diagnostics/bellExperimentStore'

beforeEach(() => {
  useBellExperimentStore.getState().reset()
})

describe('bellExperimentStore — initial state', () => {
  it('starts with empty accumulators', () => {
    const s = useBellExperimentStore.getState()
    expect(s.totalTrials).toBe(0)
    expect(s.qm.S).toBeNaN()
    expect(s.lhv.S).toBeNaN()
    expect(s.historyCount).toBe(0)
    expect(s.isRunning).toBe(false)
    expect(s.qmHasViolated).toBe(false)
  })

  it('default LHV strategy is deterministic Bell', () => {
    expect(useBellExperimentStore.getState().lhvStrategyId).toBe(lhvDeterministicBell.id)
  })
})

describe('processTrialBatch — QM converges to 2√2 at canonical CHSH angles', () => {
  it('|S| crosses 2 and approaches 2√2 with 100k trials', () => {
    const cfg = createDefaultBellPairConfig() // canonical CHSH defaults, v=1, η=1, qm sampler
    // Process in batches of 10k so the running ring buffer is exercised.
    for (let i = 0; i < 10; i++) {
      useBellExperimentStore.getState().processTrialBatch(cfg, 10_000)
    }
    const s = useBellExperimentStore.getState()
    expect(s.totalTrials).toBe(100_000)
    // The empirical |S| should be inside [2.7, 2.83]; tight bound thanks to N=100k.
    expect(Math.abs(s.qm.S)).toBeGreaterThan(CLASSICAL_BOUND)
    expect(Math.abs(s.qm.S)).toBeGreaterThan(TSIRELSON_BOUND - 0.05)
    expect(Math.abs(s.qm.S)).toBeLessThan(TSIRELSON_BOUND + 0.05)
    expect(s.qmHasViolated).toBe(true)
    // Confidence interval covers the expected value.
    expect(s.qm.sCI.lo).toBeLessThan(s.qm.S)
    expect(s.qm.sCI.hi).toBeGreaterThan(s.qm.S)

    // Verify the ring buffer captured the trace.
    expect(s.historyCount).toBe(10)
    expect(s.historyHead).toBe(10) // wrote 10 entries; head sits at index 10
  })
})

describe('processTrialBatch — LHV deterministic Bell stays at the classical bound', () => {
  it('mean LHV |S| across 50k trials is near 2 and never persistently above', () => {
    const cfg = createDefaultBellPairConfig() // qm sampler, but LHV side-by-side is always tracked
    useBellExperimentStore.getState().processTrialBatch(cfg, 50_000)
    const s = useBellExperimentStore.getState()
    // LHV sits exactly at the classical bound; allow 0.05 slack at N=50k.
    expect(Math.abs(s.lhv.S)).toBeLessThan(CLASSICAL_BOUND + 0.05)
    expect(Math.abs(s.lhv.S)).toBeGreaterThan(CLASSICAL_BOUND - 0.15)
  })
})

describe('processTrialBatch — Werner threshold', () => {
  it('|S| stays at or below the classical bound when v < 1/√2', () => {
    const cfg = { ...createDefaultBellPairConfig(), visibility: 0.6 } // below 1/√2 ≈ 0.707
    useBellExperimentStore.getState().processTrialBatch(cfg, 50_000)
    const s = useBellExperimentStore.getState()
    // Population |S| = 2√2 · 0.6 ≈ 1.697; finite-sample noise σ ≈ 0.018 at N=50k.
    expect(Math.abs(s.qm.S)).toBeLessThan(CLASSICAL_BOUND)
    expect(s.qmHasViolated).toBe(false)
  })
})

describe('processTrialBatch — detection efficiency loophole', () => {
  it('η < 1 + assignNonDetection drops |S| below the classical bound for QM', () => {
    const cfg = {
      ...createDefaultBellPairConfig(),
      detectionEfficiency: 0.5,
      analysisMode: 'assignNonDetection' as const,
    }
    useBellExperimentStore.getState().processTrialBatch(cfg, 40_000)
    const s = useBellExperimentStore.getState()
    // With η=0.5 and Clauser-Horne analysis, |S| falls below 2 (matches the
    // closed-form check in loopholes.test.ts).
    expect(Math.abs(s.qm.S)).toBeLessThan(CLASSICAL_BOUND)
  })

  it('η < 1 + fairSampling still allows QM violation (post-selection preserves correlations)', () => {
    const cfg = {
      ...createDefaultBellPairConfig(),
      detectionEfficiency: 0.5,
      analysisMode: 'fairSampling' as const,
    }
    useBellExperimentStore.getState().processTrialBatch(cfg, 40_000)
    const s = useBellExperimentStore.getState()
    expect(Math.abs(s.qm.S)).toBeGreaterThan(CLASSICAL_BOUND)
    expect(s.qm.nonDetections).toBeGreaterThan(0)
  })
})

describe('reset', () => {
  it('clears accumulators, history, and isRunning flag', () => {
    const cfg = createDefaultBellPairConfig()
    useBellExperimentStore.getState().processTrialBatch(cfg, 1000)
    useBellExperimentStore.getState().setIsRunning(true)
    useBellExperimentStore.getState().reset()
    const s = useBellExperimentStore.getState()
    expect(s.totalTrials).toBe(0)
    expect(s.qm.S).toBeNaN()
    expect(s.lhv.S).toBeNaN()
    expect(s.historyCount).toBe(0)
    expect(s.isRunning).toBe(false)
    expect(s.qmHasViolated).toBe(false)
  })

  it('seed override produces deterministic sequences', () => {
    const cfg = createDefaultBellPairConfig()
    const collect = (seed: number, n: number): number => {
      useBellExperimentStore.getState().reset(seed)
      useBellExperimentStore.getState().processTrialBatch(cfg, n)
      return useBellExperimentStore.getState().qm.S
    }
    const a = collect(42, 5000)
    const b = collect(42, 5000)
    expect(a).toBe(b)
    const c = collect(43, 5000)
    expect(c).not.toBe(a) // different seed → different trace
  })
})

describe('setLhvStrategyId', () => {
  it('resets the LHV accumulator on strategy change', () => {
    const cfg = createDefaultBellPairConfig()
    useBellExperimentStore.getState().processTrialBatch(cfg, 1000)
    expect(useBellExperimentStore.getState().lhv.bins[0]!.count).toBeGreaterThan(0)

    // Switch to noisy classical
    useBellExperimentStore.getState().setLhvStrategyId('noisyClassical')
    const s = useBellExperimentStore.getState()
    expect(s.lhvStrategyId).toBe('noisyClassical')
    expect(s.lhv.bins[0]!.count).toBe(0)
    expect(s.totalTrials).toBe(0) // full reset
  })

  it('accepts every strategy id in the LHV registry', () => {
    for (const strat of LHV_STRATEGIES) {
      useBellExperimentStore.getState().setLhvStrategyId(strat.id)
      expect(useBellExperimentStore.getState().lhvStrategyId).toBe(strat.id)
    }
  })

  it('re-primes the PRNG so post-switch trials match a freshly-reset run with the same seed', () => {
    // Determinism contract: setLhvStrategyId presents a fresh-start view
    // (totalTrials=0, S=NaN). Trials drawn after the switch MUST be
    // bit-identical to trials drawn after `reset(seed)` followed by a
    // direct `setLhvStrategyId(target)`. If the module-scoped PRNG isn't
    // re-primed on switch, the surviving PRNG keeps advancing from its
    // mid-run state and the two paths diverge.
    const cfg = createDefaultBellPairConfig()

    // Path A: reset → run with LHV=A → switch to LHV=B → run with LHV=B.
    useBellExperimentStore.getState().reset(42)
    useBellExperimentStore.getState().processTrialBatch(cfg, 1000)
    useBellExperimentStore.getState().setLhvStrategyId('noisyClassical')
    useBellExperimentStore
      .getState()
      .processTrialBatch({ ...cfg, lhvStrategyId: 'noisyClassical' }, 2000)
    const sA = useBellExperimentStore.getState().lhv.S

    // Path B: reset → switch to LHV=B → run with LHV=B (same seed).
    useBellExperimentStore.getState().reset(42)
    useBellExperimentStore.getState().setLhvStrategyId('noisyClassical')
    useBellExperimentStore
      .getState()
      .processTrialBatch({ ...cfg, lhvStrategyId: 'noisyClassical' }, 2000)
    const sB = useBellExperimentStore.getState().lhv.S

    expect(sA).toBe(sB)
  })
})

describe('history ring buffer', () => {
  it('wraps correctly past HISTORY_LENGTH batches', () => {
    const cfg = createDefaultBellPairConfig()
    // 300 batches × 100 trials = 30 000 trials total, exceeds the 256-slot ring.
    for (let i = 0; i < 300; i++) {
      useBellExperimentStore.getState().processTrialBatch(cfg, 100)
    }
    const s = useBellExperimentStore.getState()
    expect(s.historyCount).toBe(256)
    // historyHead has wrapped: 300 mod 256 = 44.
    expect(s.historyHead).toBe(44)
  })

  it('cumulative trial count is monotonically increasing in the ring', () => {
    const cfg = createDefaultBellPairConfig()
    for (let i = 0; i < 10; i++) {
      useBellExperimentStore.getState().processTrialBatch(cfg, 1000)
    }
    const s = useBellExperimentStore.getState()
    for (let k = 1; k < s.historyCount; k++) {
      const idx = k
      const prev = s.historyTrialCount[idx - 1] ?? 0
      const curr = s.historyTrialCount[idx] ?? 0
      expect(curr).toBeGreaterThanOrEqual(prev)
    }
  })
})

describe('sweep state', () => {
  it('starts idle with empty results', () => {
    const s = useBellExperimentStore.getState()
    expect(s.sweepStatus).toBe('idle')
    expect(s.sweepResults).toEqual([])
    expect(s.sweepProgress).toBe(0)
  })

  it('setSweepConfig merges partial updates', () => {
    useBellExperimentStore.getState().setSweepConfig({ etaSteps: 16 })
    const s = useBellExperimentStore.getState()
    expect(s.sweepConfig.etaSteps).toBe(16)
    expect(s.sweepConfig.visibilitySteps).toBe(8) // unchanged
  })

  it('pushSweepResult appends + clearSweepResults clears', () => {
    useBellExperimentStore.getState().pushSweepResult({
      rowIndex: 3,
      colIndex: 5,
      eta: 0.9,
      visibility: 0.85,
      absS: 2.4,
      violated: true,
      coincidenceFraction: 0.81,
      postSelectedTrials: 3240,
      nonDetections: 760,
    })
    expect(useBellExperimentStore.getState().sweepResults.length).toBe(1)
    useBellExperimentStore.getState().clearSweepResults()
    expect(useBellExperimentStore.getState().sweepResults).toEqual([])
  })

  it('setActiveSweepGrid captures the grid dimensions, clears on null', () => {
    const store = useBellExperimentStore.getState()
    expect(store.activeSweepGrid).toBeNull()
    store.setActiveSweepGrid({ etaSteps: 12, visibilitySteps: 4 })
    expect(useBellExperimentStore.getState().activeSweepGrid).toEqual({
      etaSteps: 12,
      visibilitySteps: 4,
    })
    useBellExperimentStore.getState().setActiveSweepGrid(null)
    expect(useBellExperimentStore.getState().activeSweepGrid).toBeNull()
  })
})

describe('recent outcomes ring', () => {
  it('records up to 32 recent outcomes', () => {
    const cfg = createDefaultBellPairConfig()
    useBellExperimentStore.getState().processTrialBatch(cfg, 50)
    const s = useBellExperimentStore.getState()
    expect(s.recentCount).toBeGreaterThan(0)
    expect(s.recentCount).toBeLessThanOrEqual(32)
    // Each entry has 4 packed values (settingA, settingB, outcomeA, outcomeB).
    expect(s.recentOutcomes.length).toBe(32 * 4)
  })
})
