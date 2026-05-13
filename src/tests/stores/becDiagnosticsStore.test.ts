/**
 * Tests for the BEC diagnostics channel.
 *
 * Ring buffer behavior is tested by the shared factory. This file covers
 * BEC-specific concerns: initial defaults and partial update merge semantics.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'

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

    it('ignores non-finite scalar readbacks instead of poisoning current state and history', () => {
      useDiagnosticsStore.getState().updateBec({
        totalNorm: 0.95,
        maxDensity: 10,
        normDrift: 0.02,
        chemicalPotential: 3.5,
        healingLength: 0.7,
        soundSpeed: 1.2,
        thomasFermiRadius: 4.5,
      })

      useDiagnosticsStore.getState().updateBec({
        totalNorm: Number.NaN,
        maxDensity: Number.POSITIVE_INFINITY,
        normDrift: Number.NaN,
        chemicalPotential: Number.NaN,
        healingLength: Number.NaN,
        soundSpeed: Number.NaN,
        thomasFermiRadius: Number.NEGATIVE_INFINITY,
      })

      const state = useDiagnosticsStore.getState().bec
      expect(state.totalNorm).toBe(0.95)
      expect(state.maxDensity).toBe(10)
      expect(state.normDrift).toBe(0.02)
      expect(state.chemicalPotential).toBe(3.5)
      expect(state.healingLength).toBe(0.7)
      expect(state.soundSpeed).toBe(1.2)
      expect(state.thomasFermiRadius).toBe(4.5)
      expect(state.historyNorm[1]).toBeCloseTo(0.95)
      expect(state.historyChemPot[1]).toBeCloseTo(3.5)
      expect(state.historyHealingLen[1]).toBeCloseTo(0.7)
    })

    it('allows infinite healing length as the no-density sentinel', () => {
      useDiagnosticsStore.getState().updateBec({ healingLength: Infinity })

      const state = useDiagnosticsStore.getState().bec
      expect(state.healingLength).toBe(Infinity)
      expect(state.historyHealingLen[0]).toBe(Infinity)
    })
  })
})
