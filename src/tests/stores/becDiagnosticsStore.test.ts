/**
 * Tests for becDiagnosticsStore ring buffer and update logic.
 *
 * Bugs caught:
 * - Ring buffer head wrapping at HISTORY_LENGTH boundary
 * - historyCount capping vs unbounded growth
 * - Reset leaving stale data in typed arrays
 * - Partial update merging with existing state
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useBecDiagnosticsStore } from '@/stores/becDiagnosticsStore'

describe('becDiagnosticsStore', () => {
  beforeEach(() => {
    useBecDiagnosticsStore.getState().reset()
  })

  describe('initial state', () => {
    it('starts with hasData=false and zero diagnostics', () => {
      const state = useBecDiagnosticsStore.getState()
      expect(state.hasData).toBe(false)
      expect(state.totalNorm).toBe(1.0)
      expect(state.maxDensity).toBe(0)
      expect(state.normDrift).toBe(0)
      expect(state.chemicalPotential).toBe(0)
      expect(state.historyHead).toBe(0)
      expect(state.historyCount).toBe(0)
    })
  })

  describe('update', () => {
    it('sets hasData=true on first update', () => {
      useBecDiagnosticsStore.getState().update({ totalNorm: 0.99 })
      expect(useBecDiagnosticsStore.getState().hasData).toBe(true)
    })

    it('advances ring buffer head on each update', () => {
      useBecDiagnosticsStore.getState().update({ totalNorm: 1.0 })
      expect(useBecDiagnosticsStore.getState().historyHead).toBe(1)

      useBecDiagnosticsStore.getState().update({ totalNorm: 0.99 })
      expect(useBecDiagnosticsStore.getState().historyHead).toBe(2)
    })

    it('writes totalNorm to history ring buffer', () => {
      useBecDiagnosticsStore.getState().update({ totalNorm: 0.95 })
      const state = useBecDiagnosticsStore.getState()
      expect(state.historyNorm[0]).toBeCloseTo(0.95)
    })

    it('increments historyCount up to HISTORY_LENGTH', () => {
      for (let i = 0; i < 130; i++) {
        useBecDiagnosticsStore.getState().update({ totalNorm: 1.0 })
      }
      const state = useBecDiagnosticsStore.getState()
      // HISTORY_LENGTH is 120 - count should be capped
      expect(state.historyCount).toBe(120)
    })

    it('ring buffer head wraps around at HISTORY_LENGTH', () => {
      for (let i = 0; i < 121; i++) {
        useBecDiagnosticsStore.getState().update({ totalNorm: 1.0 })
      }
      // 121 updates: head should wrap to 1 (121 % 120 = 1)
      expect(useBecDiagnosticsStore.getState().historyHead).toBe(1)
    })

    it('partial update preserves existing fields', () => {
      useBecDiagnosticsStore.getState().update({
        totalNorm: 0.95,
        chemicalPotential: 3.5,
        healingLength: 0.7,
      })
      useBecDiagnosticsStore.getState().update({ maxDensity: 10.0 })

      const state = useBecDiagnosticsStore.getState()
      expect(state.maxDensity).toBe(10.0)
      // chemicalPotential from first update should persist
      expect(state.chemicalPotential).toBe(3.5)
    })
  })

  describe('reset', () => {
    it('clears hasData and resets counters', () => {
      useBecDiagnosticsStore.getState().update({ totalNorm: 0.9, chemicalPotential: 5.0 })
      useBecDiagnosticsStore.getState().reset()

      const state = useBecDiagnosticsStore.getState()
      expect(state.hasData).toBe(false)
      expect(state.historyHead).toBe(0)
      expect(state.historyCount).toBe(0)
      expect(state.chemicalPotential).toBe(0)
    })

    it('allocates fresh typed arrays (no stale data from previous session)', () => {
      useBecDiagnosticsStore.getState().update({ totalNorm: 42.0 })
      const beforeReset = useBecDiagnosticsStore.getState().historyNorm
      expect(beforeReset[0]).toBeCloseTo(42.0)

      useBecDiagnosticsStore.getState().reset()
      const afterReset = useBecDiagnosticsStore.getState().historyNorm
      // New array should be different reference and all zeros
      expect(afterReset).not.toBe(beforeReset)
      expect(afterReset[0]).toBe(0)
    })
  })
})
