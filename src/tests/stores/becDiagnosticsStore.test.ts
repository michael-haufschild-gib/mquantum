/**
 * Tests for the BEC diagnostics channel.
 *
 * Ring buffer behavior is tested by the shared factory. This file covers
 * BEC-specific concerns: initial defaults and partial update merge semantics.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import { describeRingBufferBehavior } from './diagnostics/ringBufferTests'

describe('becDiagnosticsStore', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().resetBec()
  })

  describeRingBufferBehavior({
    channelKey: 'bec',
    pushOnce: () => useDiagnosticsStore.getState().updateBec({ totalNorm: 0.95 }),
    pushWithValue: (v) => useDiagnosticsStore.getState().updateBec({ totalNorm: v }),
    resetFn: 'resetBec',
    historyArrayKey: 'historyNorm',
    testValue: 0.95,
  })

  describe('initial state', () => {
    it('starts with hasData=false and zero diagnostics', () => {
      const state = useDiagnosticsStore.getState().bec
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
    it('partial update preserves existing fields', () => {
      useDiagnosticsStore.getState().updateBec({
        totalNorm: 0.95,
        chemicalPotential: 3.5,
        healingLength: 0.7,
      })
      useDiagnosticsStore.getState().updateBec({ maxDensity: 10.0 })

      const state = useDiagnosticsStore.getState().bec
      expect(state.maxDensity).toBe(10.0)
      expect(state.chemicalPotential).toBe(3.5)
    })
  })
})
