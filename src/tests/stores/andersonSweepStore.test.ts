import { beforeEach, describe, expect, it } from 'vitest'

import type { SweepConfig } from '@/stores/andersonSweepStore'
import { seedForStep, useAndersonSweepStore, wForStep } from '@/stores/andersonSweepStore'

const testConfig: SweepConfig = {
  wMin: 1,
  wMax: 10,
  steps: 4,
  timePerStep: 1.0,
  distribution: 'uniform',
}

describe('andersonSweepStore', () => {
  beforeEach(() => {
    useAndersonSweepStore.getState().reset()
  })

  describe('startSweep', () => {
    it('transitions to running and stores config', () => {
      useAndersonSweepStore.getState().startSweep(testConfig)
      const state = useAndersonSweepStore.getState()
      expect(state.status).toBe('running')
      expect(state.config).toEqual(testConfig)
      expect(state.currentStep).toBe(0)
      expect(state.results).toEqual([])
    })
  })

  describe('tick progression', () => {
    it('returns null on first tick (captures start time)', () => {
      useAndersonSweepStore.getState().startSweep(testConfig)
      const result = useAndersonSweepStore.getState().tick(0.5, 0.01, 0.0001)
      expect(result).toBeNull()
    })

    it('returns null while elapsed time < timePerStep', () => {
      useAndersonSweepStore.getState().startSweep(testConfig)
      // First tick captures start time
      useAndersonSweepStore.getState().tick(1.0, 0.01, 0.0001)
      // Second tick: only 0.5s elapsed (< 1.0s timePerStep)
      const result = useAndersonSweepStore.getState().tick(1.5, 0.02, 0.0002)
      expect(result).toBeNull()
    })

    it('returns next W when elapsed time >= timePerStep', () => {
      useAndersonSweepStore.getState().startSweep(testConfig)
      // First tick captures start time at t=1.0
      useAndersonSweepStore.getState().tick(1.0, 0.01, 0.0001)
      // Second tick: elapsed = 2.1 - 1.0 = 1.1 >= 1.0 → advance
      const nextW = useAndersonSweepStore.getState().tick(2.1, 0.02, 0.0002)
      // Step 0 → step 1, so nextW should be wForStep(config, 1)
      expect(nextW).toBeCloseTo(wForStep(testConfig, 1))

      // Should have recorded one result
      const state = useAndersonSweepStore.getState()
      expect(state.results).toHaveLength(1)
      expect(state.results[0]!.w).toBeCloseTo(wForStep(testConfig, 0))
      expect(state.currentStep).toBe(1)
    })

    it('completes the sweep after all steps', () => {
      useAndersonSweepStore.getState().startSweep(testConfig)

      let simTime = 0.1
      for (let step = 0; step < testConfig.steps; step++) {
        // Capture start time
        useAndersonSweepStore.getState().tick(simTime, 0.01, 0.001)
        simTime += testConfig.timePerStep + 0.01
        // Complete the step
        useAndersonSweepStore.getState().tick(simTime, 0.01 + step * 0.001, 0.001)
        simTime += 0.01
      }

      const state = useAndersonSweepStore.getState()
      expect(state.status).toBe('complete')
      expect(state.results).toHaveLength(testConfig.steps)
    })

    it('returns null when simTime is 0 on first tick (simulation not yet started)', () => {
      useAndersonSweepStore.getState().startSweep(testConfig)
      const result = useAndersonSweepStore.getState().tick(0, 0.01, 0.0001)
      expect(result).toBeNull()
      // stepStartTime should NOT be captured (still 0)
      expect(useAndersonSweepStore.getState().stepStartTime).toBe(0)
    })

    it('returns null when not running', () => {
      const result = useAndersonSweepStore.getState().tick(1.0, 0.01, 0.0001)
      expect(result).toBeNull()
    })
  })

  describe('abort', () => {
    it('transitions to idle and resets step counters', () => {
      useAndersonSweepStore.getState().startSweep(testConfig)
      useAndersonSweepStore.getState().abort()
      const state = useAndersonSweepStore.getState()
      expect(state.status).toBe('idle')
      expect(state.currentStep).toBe(0)
    })
  })

  describe('reset', () => {
    it('clears all state including results', () => {
      useAndersonSweepStore.getState().startSweep(testConfig)
      useAndersonSweepStore.getState().tick(0.1, 0.01, 0.001)
      useAndersonSweepStore.getState().tick(1.2, 0.02, 0.002)
      useAndersonSweepStore.getState().reset()

      const state = useAndersonSweepStore.getState()
      expect(state.status).toBe('idle')
      expect(state.results).toEqual([])
      expect(state.currentStep).toBe(0)
    })
  })
})

describe('wForStep', () => {
  it('returns wMin for first step', () => {
    expect(wForStep(testConfig, 0)).toBe(1)
  })

  it('returns wMax for last step', () => {
    expect(wForStep(testConfig, 3)).toBe(10)
  })

  it('interpolates linearly between min and max', () => {
    // steps=4: W at step 1 = 1 + 1*(10-1)/3 = 4.0
    expect(wForStep(testConfig, 1)).toBeCloseTo(4.0)
    // W at step 2 = 1 + 2*(10-1)/3 = 7.0
    expect(wForStep(testConfig, 2)).toBeCloseTo(7.0)
  })

  it('returns wMin for single-step config', () => {
    const singleStep: SweepConfig = { ...testConfig, steps: 1 }
    expect(wForStep(singleStep, 0)).toBe(1)
  })
})

describe('seedForStep', () => {
  it('produces deterministic seeds', () => {
    expect(seedForStep(0)).toBe(seedForStep(0))
    expect(seedForStep(5)).toBe(seedForStep(5))
  })

  it('produces different seeds for different steps', () => {
    const seeds = new Set<number>()
    for (let i = 0; i < 100; i++) {
      seeds.add(seedForStep(i))
    }
    expect(seeds.size).toBe(100)
  })

  it('produces unsigned 32-bit integers', () => {
    for (let i = 0; i < 50; i++) {
      const seed = seedForStep(i)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThanOrEqual(0xffffffff)
    }
  })
})
