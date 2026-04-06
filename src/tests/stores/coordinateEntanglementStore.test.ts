/**
 * Tests for the coordinate entanglement diagnostics store.
 *
 * Validates feature toggles, ring buffer push/clear, long-time statistics,
 * and atlas sweep state machine lifecycle.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { CoordinateEntanglementResult } from '@/lib/physics/coordinateEntanglement'
import type { AtlasSweepConfig } from '@/stores/coordinateEntanglementStore'
import { lambdaForStep, useCoordinateEntanglementStore } from '@/stores/coordinateEntanglementStore'

function makeResult(
  overrides: Partial<CoordinateEntanglementResult> = {}
): CoordinateEntanglementResult {
  return {
    entropies: [0.5, 0.3, 0.4],
    averageEntropy: 0.4,
    normalizedEntropy: 0.58,
    maxEntropies: [0.69, 0.69, 0.69],
    spectrum: [0.7, 0.3],
    bipartitionEntropies: [0.5, 0.4],
    mutualInfo: new Float64Array([0, 0.1, 0.2, 0.1, 0, 0.15, 0.2, 0.15, 0]),
    wignerNegativities: [0, 0, 0],
    averageWignerNegativity: 0,
    ...overrides,
  }
}

describe('lambdaForStep', () => {
  const config: AtlasSweepConfig = {
    lambdaMin: 0.01,
    lambdaMax: 50,
    lambdaSteps: 15,
    dimensions: [3, 4, 5],
  }

  it('returns lambdaMin for step 0', () => {
    expect(lambdaForStep(config, 0)).toBeCloseTo(0.01)
  })

  it('returns lambdaMax for last step', () => {
    expect(lambdaForStep(config, 14)).toBeCloseTo(50, 0)
  })

  it('interpolates log-spaced', () => {
    const mid = lambdaForStep(config, 7)
    expect(mid).toBeGreaterThan(0.01)
    expect(mid).toBeLessThan(50)
    // Log-spaced midpoint: 10^((log10(0.01) + log10(50)) / 2) ≈ 0.707
    const logMid = (Math.log10(0.01) + Math.log10(50)) / 2
    expect(Math.log10(mid)).toBeCloseTo(logMid, 0)
  })

  it('returns lambdaMin when steps <= 1', () => {
    expect(lambdaForStep({ ...config, lambdaSteps: 1 }, 0)).toBe(0.01)
  })
})

describe('useCoordinateEntanglementStore', () => {
  beforeEach(() => {
    useCoordinateEntanglementStore.getState().clearHistory()
    useCoordinateEntanglementStore.getState().resetSweep()
    useCoordinateEntanglementStore.getState().setEnabled(false)
    useCoordinateEntanglementStore.getState().setComputePairwiseMI(false)
    useCoordinateEntanglementStore.getState().setComputeBipartitions(false)
  })

  describe('feature toggles', () => {
    it('toggles enabled', () => {
      useCoordinateEntanglementStore.getState().setEnabled(true)
      expect(useCoordinateEntanglementStore.getState().enabled).toBe(true)
    })

    it('toggles pairwise MI', () => {
      useCoordinateEntanglementStore.getState().setComputePairwiseMI(true)
      expect(useCoordinateEntanglementStore.getState().computePairwiseMI).toBe(true)
    })

    it('toggles bipartitions', () => {
      useCoordinateEntanglementStore.getState().setComputeBipartitions(true)
      expect(useCoordinateEntanglementStore.getState().computeBipartitions).toBe(true)
    })
  })

  describe('pushResult', () => {
    it('stores current snapshot', () => {
      useCoordinateEntanglementStore.getState().pushResult(makeResult({ averageEntropy: 0.42 }))
      const s = useCoordinateEntanglementStore.getState()
      expect(s.currentAverageEntropy).toBe(0.42)
      expect(s.currentEntropies).toEqual([0.5, 0.3, 0.4])
    })

    it('advances ring buffer head', () => {
      const h0 = useCoordinateEntanglementStore.getState().historyHead
      useCoordinateEntanglementStore.getState().pushResult(makeResult())
      expect(useCoordinateEntanglementStore.getState().historyHead).toBe(h0 + 1)
      expect(useCoordinateEntanglementStore.getState().historyCount).toBe(1)
    })

    it('computes long-time average incrementally', () => {
      useCoordinateEntanglementStore.getState().pushResult(makeResult({ averageEntropy: 0.4 }))
      useCoordinateEntanglementStore.getState().pushResult(makeResult({ averageEntropy: 0.6 }))
      const s = useCoordinateEntanglementStore.getState()
      expect(s.longTimeN).toBe(2)
      expect(s.longTimeAverage).toBeCloseTo(0.5)
      expect(s.longTimeVariance).toBeGreaterThanOrEqual(0)
    })

    it('produces zero variance for identical samples (Welford stability)', () => {
      for (let i = 0; i < 5; i++) {
        useCoordinateEntanglementStore.getState().pushResult(makeResult({ averageEntropy: 0.5 }))
      }
      expect(useCoordinateEntanglementStore.getState().longTimeVariance).toBe(0)
    })
  })

  describe('clearHistory', () => {
    it('resets ring buffer and statistics', () => {
      useCoordinateEntanglementStore.getState().pushResult(makeResult())
      useCoordinateEntanglementStore.getState().clearHistory()
      const s = useCoordinateEntanglementStore.getState()
      expect(s.historyHead).toBe(0)
      expect(s.historyCount).toBe(0)
      expect(s.longTimeN).toBe(0)
      expect(s.currentEntropies).toEqual([])
    })
  })

  describe('atlas sweep lifecycle', () => {
    const sweepConfig: AtlasSweepConfig = {
      lambdaMin: 1.0,
      lambdaMax: 10.0,
      lambdaSteps: 3,
      dimensions: [3, 4],
    }

    it('starts sweep in running state', () => {
      useCoordinateEntanglementStore.getState().startSweep(sweepConfig)
      const s = useCoordinateEntanglementStore.getState()
      expect(s.sweepStatus).toBe('running')
      expect(s.sweepResults).toEqual([])
      expect(s.sweepCurrentDim).toBe(3)
      expect(s.sweepCurrentLambda).toBeCloseTo(1.0)
    })

    it('recordSweepSample accumulates entropy', () => {
      useCoordinateEntanglementStore.getState().startSweep(sweepConfig)
      useCoordinateEntanglementStore.getState().recordSweepSample(0.5)
      useCoordinateEntanglementStore.getState().recordSweepSample(0.7)
      const s = useCoordinateEntanglementStore.getState()
      expect(s.sweepEntropySamples).toBe(2)
      expect(s.sweepEntropyAccumulator).toBeCloseTo(1.2)
    })

    it('completeSweepStep stores averaged result', () => {
      useCoordinateEntanglementStore.getState().startSweep(sweepConfig)
      useCoordinateEntanglementStore.getState().recordSweepSample(0.5)
      useCoordinateEntanglementStore.getState().recordSweepSample(0.7)
      useCoordinateEntanglementStore.getState().completeSweepStep()
      const results = useCoordinateEntanglementStore.getState().sweepResults
      expect(results).toHaveLength(1)
      expect(results[0]!.entropy).toBeCloseTo(0.6)
    })

    it('advanceSweepStep moves to next (lambda, dim) pair', () => {
      useCoordinateEntanglementStore.getState().startSweep(sweepConfig)
      const next = useCoordinateEntanglementStore.getState().advanceSweepStep()
      expect(next).toEqual({ lambda: expect.any(Number), dim: expect.any(Number) })
      const s = useCoordinateEntanglementStore.getState()
      expect(s.sweepCurrentStep).toBe(1)
      expect(s.sweepFramesEvolved).toBe(0)
    })

    it('advanceSweepStep returns null at end', () => {
      useCoordinateEntanglementStore.getState().startSweep(sweepConfig)
      // Total steps = 3 lambdas × 2 dimensions = 6
      // Already at step 0, advance to 5 (last)
      for (let i = 0; i < 5; i++) {
        useCoordinateEntanglementStore.getState().advanceSweepStep()
      }
      const result = useCoordinateEntanglementStore.getState().advanceSweepStep()
      expect(result).toBeNull()
    })

    it('completeSweep transitions to complete', () => {
      useCoordinateEntanglementStore.getState().startSweep(sweepConfig)
      useCoordinateEntanglementStore.getState().completeSweep()
      expect(useCoordinateEntanglementStore.getState().sweepStatus).toBe('complete')
      expect(useCoordinateEntanglementStore.getState().sweepProgress).toBe(1)
    })

    it('abortSweep returns to idle', () => {
      useCoordinateEntanglementStore.getState().startSweep(sweepConfig)
      useCoordinateEntanglementStore.getState().abortSweep()
      expect(useCoordinateEntanglementStore.getState().sweepStatus).toBe('idle')
    })

    it('resetSweep clears results', () => {
      useCoordinateEntanglementStore.getState().startSweep(sweepConfig)
      useCoordinateEntanglementStore.getState().recordSweepSample(0.5)
      useCoordinateEntanglementStore.getState().completeSweepStep()
      useCoordinateEntanglementStore.getState().resetSweep()
      expect(useCoordinateEntanglementStore.getState().sweepResults).toEqual([])
      expect(useCoordinateEntanglementStore.getState().sweepStatus).toBe('idle')
    })
  })
})
