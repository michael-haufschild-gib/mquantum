/**
 * Unit tests for the Pauli diagnostics store.
 *
 * Tests cover snapshot propagation, ring buffer history for time-series
 * export, wrap-around behavior, and reset.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { usePauliDiagnosticsStore } from '@/stores/pauliDiagnosticsStore'

describe('pauliDiagnosticsStore', () => {
  beforeEach(() => {
    usePauliDiagnosticsStore.getState().reset()
  })

  it('initializes with hasData false and all zeroes', () => {
    const state = usePauliDiagnosticsStore.getState()
    expect(state.hasData).toBe(false)
    expect(state.totalNorm).toBe(0)
    expect(state.normDrift).toBe(0)
    expect(state.maxDensity).toBe(0)
    expect(state.spinUpFraction).toBe(0)
    expect(state.spinDownFraction).toBe(0)
    expect(state.spinExpectationZ).toBe(0)
    expect(state.coherenceMagnitude).toBe(0)
    expect(state.larmorFrequency).toBe(0)
    expect(state.meanPosition).toEqual([0, 0, 0])
    expect(state.historyHead).toBe(0)
    expect(state.historyCount).toBe(0)
  })

  it('update sets hasData true and merges partial snapshot', () => {
    usePauliDiagnosticsStore.getState().update({
      totalNorm: 0.998,
      spinUpFraction: 0.7,
      spinDownFraction: 0.3,
    })

    const state = usePauliDiagnosticsStore.getState()
    expect(state.hasData).toBe(true)
    expect(state.totalNorm).toBe(0.998)
    expect(state.spinUpFraction).toBe(0.7)
    expect(state.spinDownFraction).toBe(0.3)
    // Unset fields remain at initial values
    expect(state.maxDensity).toBe(0)
  })

  it('update overwrites previous values', () => {
    const { update } = usePauliDiagnosticsStore.getState()
    update({ spinExpectationZ: 0.5 })
    expect(usePauliDiagnosticsStore.getState().spinExpectationZ).toBe(0.5)

    update({ spinExpectationZ: -0.3 })
    expect(usePauliDiagnosticsStore.getState().spinExpectationZ).toBe(-0.3)
  })

  it('update preserves hasData across multiple calls', () => {
    const { update } = usePauliDiagnosticsStore.getState()
    update({ totalNorm: 1.0 })
    update({ coherenceMagnitude: 0.45 })

    const state = usePauliDiagnosticsStore.getState()
    expect(state.hasData).toBe(true)
    expect(state.totalNorm).toBe(1.0)
    expect(state.coherenceMagnitude).toBe(0.45)
  })

  it('ring buffer advances head and count on update', () => {
    usePauliDiagnosticsStore.getState().update({ totalNorm: 0.99, spinUpFraction: 0.6 })
    expect(usePauliDiagnosticsStore.getState().historyHead).toBe(1)
    expect(usePauliDiagnosticsStore.getState().historyCount).toBe(1)

    usePauliDiagnosticsStore.getState().update({ totalNorm: 0.98, spinUpFraction: 0.55 })
    expect(usePauliDiagnosticsStore.getState().historyHead).toBe(2)
    expect(usePauliDiagnosticsStore.getState().historyCount).toBe(2)
  })

  it('ring buffer writes values into TypedArrays', () => {
    usePauliDiagnosticsStore.getState().update({
      totalNorm: 0.97,
      spinUpFraction: 0.65,
      spinExpectationZ: 0.3,
    })
    const s = usePauliDiagnosticsStore.getState()
    expect(s.historyNorm[0]).toBeCloseTo(0.97)
    expect(s.historySpinUpFrac[0]).toBeCloseTo(0.65)
    expect(s.historySpinExpZ[0]).toBeCloseTo(0.3)
  })

  it('ring buffer wraps at capacity (120 entries)', () => {
    for (let i = 0; i < 120; i++) {
      usePauliDiagnosticsStore.getState().update({ totalNorm: 1 - i * 0.001 })
    }
    expect(usePauliDiagnosticsStore.getState().historyHead).toBe(0) // wrapped
    expect(usePauliDiagnosticsStore.getState().historyCount).toBe(120)

    // One more — wraps to head=1
    usePauliDiagnosticsStore.getState().update({ totalNorm: 0.5 })
    expect(usePauliDiagnosticsStore.getState().historyHead).toBe(1)
    expect(usePauliDiagnosticsStore.getState().historyCount).toBe(120)
    expect(usePauliDiagnosticsStore.getState().historyNorm[0]).toBeCloseTo(0.5)
  })

  it('reset clears all fields and allocates fresh TypedArrays', () => {
    for (let i = 0; i < 10; i++) {
      usePauliDiagnosticsStore.getState().update({ totalNorm: 0.9, spinUpFraction: 0.6 })
    }
    const normBefore = usePauliDiagnosticsStore.getState().historyNorm
    usePauliDiagnosticsStore.getState().reset()

    const state = usePauliDiagnosticsStore.getState()
    expect(state.hasData).toBe(false)
    expect(state.historyHead).toBe(0)
    expect(state.historyCount).toBe(0)
    expect(state.totalNorm).toBe(0)
    expect(state.spinUpFraction).toBe(0)
    expect(state.spinExpectationZ).toBe(0)
    expect(state.coherenceMagnitude).toBe(0)
    expect(state.meanPosition).toEqual([0, 0, 0])
    expect(state.larmorFrequency).toBe(0)
    // Fresh TypedArrays
    expect(state.historyNorm).not.toBe(normBefore)
    expect(state.historyNorm.every((v) => v === 0)).toBe(true)
  })

  it('meanPosition update replaces array reference', () => {
    usePauliDiagnosticsStore.getState().update({
      meanPosition: [1.5, -0.3, 2.1],
    })
    expect(usePauliDiagnosticsStore.getState().meanPosition).toEqual([1.5, -0.3, 2.1])
  })
})
