/**
 * Unit tests for the Pauli diagnostics store.
 */

import { describe, it, expect, beforeEach } from 'vitest'
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

  it('reset restores initial state', () => {
    const { update, reset } = usePauliDiagnosticsStore.getState()
    update({
      totalNorm: 0.99,
      spinUpFraction: 0.6,
      spinDownFraction: 0.4,
      spinExpectationZ: 0.2,
      coherenceMagnitude: 0.35,
      maxDensity: 1.5,
      larmorFrequency: 4.2,
      meanPosition: [1.0, 2.0, 3.0],
    })

    reset()

    const state = usePauliDiagnosticsStore.getState()
    expect(state.hasData).toBe(false)
    expect(state.totalNorm).toBe(0)
    expect(state.spinUpFraction).toBe(0)
    expect(state.spinExpectationZ).toBe(0)
    expect(state.coherenceMagnitude).toBe(0)
    expect(state.meanPosition).toEqual([0, 0, 0])
    expect(state.larmorFrequency).toBe(0)
  })

  it('meanPosition update replaces array reference', () => {
    usePauliDiagnosticsStore.getState().update({
      meanPosition: [1.5, -0.3, 2.1],
    })
    expect(usePauliDiagnosticsStore.getState().meanPosition).toEqual([1.5, -0.3, 2.1])
  })
})
