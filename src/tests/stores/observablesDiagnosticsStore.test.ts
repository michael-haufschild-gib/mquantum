/**
 * Tests for the observable expectation values diagnostics store.
 *
 * @module tests/stores/observablesDiagnosticsStore
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useObservablesDiagnosticsStore } from '@/stores/observablesDiagnosticsStore'

describe('observablesDiagnosticsStore', () => {
  beforeEach(() => {
    useObservablesDiagnosticsStore.getState().reset()
  })

  it('starts with no data', () => {
    const state = useObservablesDiagnosticsStore.getState()
    expect(state.hasData).toBe(false)
    expect(state.activeDims).toBe(0)
    expect(state.historyHead).toBe(0)
    expect(state.historyCount).toBe(0)
  })

  it('pushSnapshot sets hasData and stores values', () => {
    const snapshot = {
      activeDims: 3,
      positionMean: new Float64Array([1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0]),
      positionVariance: new Float64Array([0.5, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0]),
      momentumMean: new Float64Array([0.1, 0.2, 0.3, 0, 0, 0, 0, 0, 0, 0, 0]),
      momentumVariance: new Float64Array([0.25, 0.25, 0.25, 0, 0, 0, 0, 0, 0, 0, 0]),
      uncertaintyProduct: new Float64Array([0.56, 0.56, 0.56, 0, 0, 0, 0, 0, 0, 0, 0]),
      totalEnergy: 1.5,
      positionNorm: 1.0,
      momentumNorm: 1.0,
    }

    useObservablesDiagnosticsStore.getState().pushSnapshot(snapshot)
    const state = useObservablesDiagnosticsStore.getState()

    expect(state.hasData).toBe(true)
    expect(state.activeDims).toBe(3)
    expect(state.positionMean[0]).toBe(1)
    expect(state.totalEnergy).toBe(1.5)
    expect(state.historyHead).toBe(1)
    expect(state.historyCount).toBe(1)
  })

  it('ring buffer wraps at capacity', () => {
    const store = useObservablesDiagnosticsStore.getState()
    const snapshot = {
      activeDims: 1,
      positionMean: new Float64Array(11),
      positionVariance: new Float64Array(11),
      momentumMean: new Float64Array(11),
      momentumVariance: new Float64Array(11),
      uncertaintyProduct: new Float64Array(11),
      totalEnergy: 0,
      positionNorm: 1,
      momentumNorm: 1,
    }

    // Push 130 snapshots (exceeds 120 buffer length)
    for (let i = 0; i < 130; i++) {
      snapshot.totalEnergy = i
      store.pushSnapshot(snapshot)
    }

    const state = useObservablesDiagnosticsStore.getState()
    expect(state.historyCount).toBe(120) // capped at buffer length
    expect(state.historyHead).toBe(10) // (130 % 120)
    // Latest energy should be in the ring buffer
    expect(state.historyEnergy[(state.historyHead - 1 + 120) % 120]).toBe(129)
  })

  it('reset clears all data', () => {
    const store = useObservablesDiagnosticsStore.getState()
    store.pushSnapshot({
      activeDims: 2,
      positionMean: new Float64Array(11),
      positionVariance: new Float64Array(11),
      momentumMean: new Float64Array(11),
      momentumVariance: new Float64Array(11),
      uncertaintyProduct: new Float64Array(11),
      totalEnergy: 42,
      positionNorm: 1,
      momentumNorm: 1,
    })

    expect(useObservablesDiagnosticsStore.getState().hasData).toBe(true)
    store.reset()

    const state = useObservablesDiagnosticsStore.getState()
    expect(state.hasData).toBe(false)
    expect(state.totalEnergy).toBe(0)
    expect(state.historyHead).toBe(0)
    expect(state.historyCount).toBe(0)
  })
})
