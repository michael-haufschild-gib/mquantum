/**
 * Tests for the monitoring sweep store state machine.
 *
 * Validates sweep lifecycle (idle → running → complete), tick-based
 * step advancement, gamma computation, and abort/reset behavior.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { MonitoringSweepConfig } from '@/stores/diagnostics/monitoringSweepStore'
import { gammaForStep, useMonitoringSweepStore } from '@/stores/diagnostics/monitoringSweepStore'

describe('gammaForStep', () => {
  const config: MonitoringSweepConfig = {
    gammaMin: 0.01,
    gammaMax: 5.0,
    steps: 20,
    timePerStep: 1.0,
  }

  it('returns gammaMin for step 0', () => {
    expect(gammaForStep(config, 0)).toBeCloseTo(0.01)
  })

  it('returns gammaMax for last step', () => {
    expect(gammaForStep(config, 19)).toBeCloseTo(5.0)
  })

  it('interpolates linearly between min and max', () => {
    const mid = gammaForStep(config, 10)
    expect(mid).toBeGreaterThan(0.01)
    expect(mid).toBeLessThan(5.0)
    // Halfway-ish: 0.01 + 10 * (5.0 - 0.01) / 19 ≈ 2.63
    expect(mid).toBeCloseTo(0.01 + (10 * (5.0 - 0.01)) / 19)
  })

  it('returns gammaMin when steps <= 1', () => {
    expect(gammaForStep({ ...config, steps: 1 }, 0)).toBe(config.gammaMin)
  })
})

describe('useMonitoringSweepStore', () => {
  beforeEach(() => {
    useMonitoringSweepStore.getState().reset()
  })

  it('starts in idle state', () => {
    const state = useMonitoringSweepStore.getState()
    expect(state.status).toBe('idle')
    expect(state.currentStep).toBe(0)
    expect(state.results).toEqual([])
  })

  describe('startSweep', () => {
    it('transitions to running with config', () => {
      const config: MonitoringSweepConfig = {
        gammaMin: 0.1,
        gammaMax: 2.0,
        steps: 5,
        timePerStep: 0.5,
      }
      useMonitoringSweepStore.getState().startSweep(config)
      const state = useMonitoringSweepStore.getState()
      expect(state.status).toBe('running')
      expect(state.config).toEqual(config)
      expect(state.currentStep).toBe(0)
      expect(state.results).toEqual([])
    })
  })

  describe('tick', () => {
    const config: MonitoringSweepConfig = {
      gammaMin: 1.0,
      gammaMax: 3.0,
      steps: 3,
      timePerStep: 1.0,
    }

    it('returns null when not running', () => {
      const result = useMonitoringSweepStore.getState().tick(1.0, 0.5, 0.01)
      expect(result).toBeNull()
    })

    it('records start time on first tick', () => {
      useMonitoringSweepStore.getState().startSweep(config)
      const result = useMonitoringSweepStore.getState().tick(0.5, 0.5, 0.01)
      expect(result).toBeNull()
      expect(useMonitoringSweepStore.getState().stepStartTime).toBe(0.5)
    })

    it('returns null when elapsed time < timePerStep', () => {
      useMonitoringSweepStore.getState().startSweep(config)
      // First tick sets start time
      useMonitoringSweepStore.getState().tick(1.0, 0.5, 0.01)
      // Second tick — not enough time
      const result = useMonitoringSweepStore.getState().tick(1.5, 0.5, 0.01)
      expect(result).toBeNull()
    })

    it('advances to next step and returns next gamma with time-averaged IPR', () => {
      useMonitoringSweepStore.getState().startSweep(config)
      // First tick sets start time at 1.0, records first IPR sample
      useMonitoringSweepStore.getState().tick(1.0, 0.5, 0.01)
      // Enough time elapsed (>= 1.0s) — records second sample, averages
      const nextGamma = useMonitoringSweepStore.getState().tick(2.0, 0.4, 0.02)
      expect(nextGamma).toBeCloseTo(gammaForStep(config, 1))
      const state = useMonitoringSweepStore.getState()
      expect(state.currentStep).toBe(1)
      expect(state.results).toHaveLength(1)
      expect(state.results[0]!.gamma).toBeCloseTo(1.0)
      // Time-averaged: (0.5 + 0.4) / 2 = 0.45
      expect(state.results[0]!.ipr).toBeCloseTo(0.45)
      // Time-averaged: (0.01 + 0.02) / 2 = 0.015
      expect(state.results[0]!.normDrift).toBeCloseTo(0.015)
    })

    it('discards stale samples and re-anchors when simTime regresses mid-step', () => {
      // Simulate the user manually resetting the TDSE field while a sweep
      // step is in progress (e.g., toggling a setting that calls
      // resetTdseField). Without the regression guard the accumulator
      // would silently fold pre-reset and post-reset IPR samples into the
      // same time-average and produce a corrupted result.
      const cfg: MonitoringSweepConfig = {
        gammaMin: 0.1,
        gammaMax: 2.0,
        steps: 3,
        timePerStep: 1.0,
      }
      useMonitoringSweepStore.getState().startSweep(cfg)

      // Anchor the step at simTime=1.0 with a "wrong-state" IPR sample.
      useMonitoringSweepStore.getState().tick(1.0, 0.99, 0.5) // first-tick anchor
      useMonitoringSweepStore.getState().tick(1.4, 0.95, 0.4)
      // External reset: simTime regresses to 0.
      useMonitoringSweepStore.getState().tick(0.0, 0.0, 0.0)

      // Verify the accumulator was wiped and the step is awaiting a fresh
      // first tick rather than treating the pre-reset samples as valid.
      let state = useMonitoringSweepStore.getState()
      expect(state.iprAccumulator).toEqual([])
      expect(state.normDriftAccumulator).toEqual([])
      expect(state.stepStartTime).toBe(0)
      expect(state.currentStep).toBe(0)

      // Replay the same step with clean post-reset samples.
      useMonitoringSweepStore.getState().tick(0.5, 0.1, 0.001) // first-tick after reset
      const advance = useMonitoringSweepStore.getState().tick(1.6, 0.2, 0.002)
      expect(advance).toBeCloseTo(gammaForStep(cfg, 1))
      state = useMonitoringSweepStore.getState()
      // The recorded result must reflect ONLY post-reset samples, not the
      // 0.99 / 0.95 garbage from the pre-reset window.
      expect(state.results[0]!.ipr).toBeCloseTo(0.15) // (0.10 + 0.20) / 2
      expect(state.results[0]!.normDrift).toBeCloseTo(0.0015)
    })

    it('does not fold non-finite or negative IPR diagnostics into averages', () => {
      useMonitoringSweepStore.getState().startSweep(config)
      useMonitoringSweepStore.getState().tick(1.0, 0.5, 0.01)

      expect(useMonitoringSweepStore.getState().tick(1.2, Number.NaN, 0.01)).toBeNull()
      expect(
        useMonitoringSweepStore.getState().tick(1.2, Number.POSITIVE_INFINITY, 0.01)
      ).toBeNull()
      expect(useMonitoringSweepStore.getState().tick(1.2, -0.1, 0.01)).toBeNull()
      expect(useMonitoringSweepStore.getState().tick(1.2, 0.4, Number.NaN)).toBeNull()

      const advance = useMonitoringSweepStore.getState().tick(2.0, 0.3, 0.03)
      expect(advance).toBeCloseTo(gammaForStep(config, 1))
      const state = useMonitoringSweepStore.getState()
      expect(state.results).toHaveLength(1)
      expect(state.results[0]!.ipr).toBeCloseTo(0.4)
      expect(state.results[0]!.normDrift).toBeCloseTo(0.02)
    })

    it('completes sweep at last step', () => {
      useMonitoringSweepStore.getState().startSweep(config)

      // Step 0 → 1
      useMonitoringSweepStore.getState().tick(1.0, 0.5, 0.01) // set start
      useMonitoringSweepStore.getState().tick(2.0, 0.4, 0.02) // advance

      // Step 1 → 2
      useMonitoringSweepStore.getState().tick(3.0, 0.5, 0.01) // set start
      useMonitoringSweepStore.getState().tick(4.0, 0.3, 0.03) // advance

      // Step 2 (last) → complete
      useMonitoringSweepStore.getState().tick(5.0, 0.5, 0.01) // set start
      const result = useMonitoringSweepStore.getState().tick(6.0, 0.2, 0.04)
      expect(result).toBeNull() // complete returns null
      const state = useMonitoringSweepStore.getState()
      expect(state.status).toBe('complete')
      expect(state.results).toHaveLength(3)
    })
  })

  describe('abort', () => {
    it('transitions from running to idle', () => {
      useMonitoringSweepStore.getState().startSweep({
        gammaMin: 0.1,
        gammaMax: 2.0,
        steps: 5,
        timePerStep: 0.5,
      })
      useMonitoringSweepStore.getState().abort()
      expect(useMonitoringSweepStore.getState().status).toBe('idle')
      expect(useMonitoringSweepStore.getState().currentStep).toBe(0)
    })
  })

  describe('reset', () => {
    it('clears results and returns to idle', () => {
      const config: MonitoringSweepConfig = {
        gammaMin: 1.0,
        gammaMax: 3.0,
        steps: 3,
        timePerStep: 1.0,
      }
      useMonitoringSweepStore.getState().startSweep(config)
      useMonitoringSweepStore.getState().tick(1.0, 0.5, 0.01)
      useMonitoringSweepStore.getState().tick(2.0, 0.4, 0.02)
      useMonitoringSweepStore.getState().reset()
      const state = useMonitoringSweepStore.getState()
      expect(state.status).toBe('idle')
      expect(state.results).toEqual([])
      expect(state.currentStep).toBe(0)
    })
  })
})
