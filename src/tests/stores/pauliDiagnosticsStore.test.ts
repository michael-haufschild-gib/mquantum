/**
 * Tests for the Pauli diagnostics channel.
 *
 * Ring buffer behavior is tested by the shared factory. This file covers
 * Pauli-specific concerns: initial defaults, spin field propagation,
 * overwrite semantics, hasData preservation, and meanPosition updates.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'

import { describeRingBufferBehavior } from './diagnostics/ringBufferTests'

describe('pauliDiagnosticsStore', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().resetPauli()
  })

  describeRingBufferBehavior({
    channelKey: 'pauli',
    pushOnce: () =>
      useDiagnosticsStore.getState().updatePauli({
        totalNorm: 0.97,
        spinUpFraction: 0.65,
        spinExpectationZ: 0.3,
      }),
    pushWithValue: (v) => useDiagnosticsStore.getState().updatePauli({ totalNorm: v }),
    resetFn: 'resetPauli',
    historyArrayKey: 'historyNorm',
    testValue: 0.97,
  })

  it('initializes with hasData false and all zeroes', () => {
    const state = useDiagnosticsStore.getState().pauli
    expect(state.hasData).toBe(false)
    expect(state.totalNorm).toBe(0)
    expect(state.spinUpFraction).toBe(0)
    expect(state.spinDownFraction).toBe(0)
    expect(state.spinExpectationZ).toBe(0)
    expect(state.coherenceMagnitude).toBe(0)
    expect(state.larmorFrequency).toBe(0)
    expect(state.meanPosition).toEqual([0, 0, 0])
  })

  it('partial update merges spin fields and preserves unset defaults', () => {
    useDiagnosticsStore.getState().updatePauli({
      totalNorm: 0.998,
      spinUpFraction: 0.7,
      spinDownFraction: 0.3,
    })

    const state = useDiagnosticsStore.getState().pauli
    expect(state.totalNorm).toBe(0.998)
    expect(state.spinUpFraction).toBe(0.7)
    expect(state.spinDownFraction).toBe(0.3)
    expect(state.maxDensity).toBe(0)
  })

  it('overwrites previous values on subsequent updates', () => {
    const { updatePauli } = useDiagnosticsStore.getState()
    updatePauli({ spinExpectationZ: 0.5 })
    expect(useDiagnosticsStore.getState().pauli.spinExpectationZ).toBe(0.5)

    updatePauli({ spinExpectationZ: -0.3 })
    expect(useDiagnosticsStore.getState().pauli.spinExpectationZ).toBe(-0.3)
  })

  it('preserves hasData across multiple update calls', () => {
    const { updatePauli } = useDiagnosticsStore.getState()
    updatePauli({ totalNorm: 1.0 })
    updatePauli({ coherenceMagnitude: 0.45 })

    const state = useDiagnosticsStore.getState().pauli
    expect(state.hasData).toBe(true)
    expect(state.totalNorm).toBe(1.0)
    expect(state.coherenceMagnitude).toBe(0.45)
  })

  it('writes spin-specific values into separate history arrays', () => {
    useDiagnosticsStore.getState().updatePauli({
      totalNorm: 0.97,
      spinUpFraction: 0.65,
      spinExpectationZ: 0.3,
    })
    const s = useDiagnosticsStore.getState().pauli
    expect(s.historySpinUpFrac[0]).toBeCloseTo(0.65)
    expect(s.historySpinExpZ[0]).toBeCloseTo(0.3)
  })

  it('meanPosition update replaces array reference', () => {
    const before = useDiagnosticsStore.getState().pauli.meanPosition
    useDiagnosticsStore.getState().updatePauli({
      meanPosition: [1.5, -0.3, 2.1],
    })
    const after = useDiagnosticsStore.getState().pauli.meanPosition
    expect(after).not.toBe(before)
    expect(after).toEqual([1.5, -0.3, 2.1])
  })

  it('ignores non-finite readbacks instead of poisoning current state and history', () => {
    useDiagnosticsStore.getState().updatePauli({
      totalNorm: 0.9,
      normDrift: 0.1,
      maxDensity: 2,
      spinUpFraction: 0.6,
      spinDownFraction: 0.4,
      spinExpectationZ: 0.2,
      coherenceMagnitude: 0.5,
      meanPosition: [1, 2, 3],
      larmorFrequency: 7,
    })

    useDiagnosticsStore.getState().updatePauli({
      totalNorm: Number.NaN,
      normDrift: Number.NaN,
      maxDensity: Number.POSITIVE_INFINITY,
      spinUpFraction: Number.NaN,
      spinDownFraction: Number.NEGATIVE_INFINITY,
      spinExpectationZ: Number.NaN,
      coherenceMagnitude: Number.NaN,
      meanPosition: [1, Number.NaN, 3],
      larmorFrequency: Number.POSITIVE_INFINITY,
    })

    const state = useDiagnosticsStore.getState().pauli
    expect(state.totalNorm).toBe(0.9)
    expect(state.normDrift).toBe(0.1)
    expect(state.maxDensity).toBe(2)
    expect(state.spinUpFraction).toBe(0.6)
    expect(state.spinDownFraction).toBe(0.4)
    expect(state.spinExpectationZ).toBe(0.2)
    expect(state.coherenceMagnitude).toBe(0.5)
    expect(state.meanPosition).toEqual([1, 2, 3])
    expect(state.larmorFrequency).toBe(7)
    expect(state.historyNorm[1]).toBeCloseTo(0.9)
    expect(state.historySpinUpFrac[1]).toBeCloseTo(0.6)
    expect(state.historySpinExpZ[1]).toBeCloseTo(0.2)
  })

  it('reset restores meanPosition and spin fields', () => {
    useDiagnosticsStore.getState().updatePauli({
      totalNorm: 0.9,
      spinUpFraction: 0.6,
      meanPosition: [1, 2, 3],
    })
    useDiagnosticsStore.getState().resetPauli()

    const state = useDiagnosticsStore.getState().pauli
    expect(state.totalNorm).toBe(0)
    expect(state.spinUpFraction).toBe(0)
    expect(state.meanPosition).toEqual([0, 0, 0])
    expect(state.larmorFrequency).toBe(0)
  })
})
