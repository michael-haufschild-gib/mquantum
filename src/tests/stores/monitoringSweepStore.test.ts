/**
 * Tests for the monitoring sweep store state machine.
 *
 * Validates sweep lifecycle (idle → running → complete), tick-based
 * step advancement, gamma computation, and abort/reset behavior.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { MonitoringSweepConfig } from '@/stores/monitoringSweepStore'
import { gammaForStep, useMonitoringSweepStore } from '@/stores/monitoringSweepStore'

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

    it('advances to next step and returns next gamma', () => {
      useMonitoringSweepStore.getState().startSweep(config)
      // First tick sets start time at 1.0
      useMonitoringSweepStore.getState().tick(1.0, 0.5, 0.01)
      // Enough time elapsed (>= 1.0s)
      const nextGamma = useMonitoringSweepStore.getState().tick(2.0, 0.4, 0.02)
      expect(nextGamma).toBeCloseTo(gammaForStep(config, 1))
      const state = useMonitoringSweepStore.getState()
      expect(state.currentStep).toBe(1)
      expect(state.results).toHaveLength(1)
      expect(state.results[0]!.gamma).toBeCloseTo(1.0)
      expect(state.results[0]!.ipr).toBe(0.4)
      expect(state.results[0]!.normDrift).toBe(0.02)
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
