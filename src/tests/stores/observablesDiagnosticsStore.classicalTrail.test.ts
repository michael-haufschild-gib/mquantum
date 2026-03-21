/**
 * Tests for the observables diagnostics store's position mean history ring buffer,
 * which drives the TDSE/BEC Ehrenfest trajectory overlay (A2 feature).
 *
 * @module tests/stores/observablesDiagnosticsStore.classicalTrail
 */

import { beforeEach, describe, expect, it } from 'vitest'

import {
  HISTORY_LENGTH,
  type ObservablesSnapshot,
  useObservablesDiagnosticsStore,
} from '@/stores/observablesDiagnosticsStore'

function makeSnapshot(activeDims: number, positionMeans: number[]): ObservablesSnapshot {
  const positionMean = new Float64Array(11)
  for (let i = 0; i < positionMeans.length; i++) {
    positionMean[i] = positionMeans[i]!
  }
  return {
    activeDims,
    positionMean,
    positionVariance: new Float64Array(11),
    momentumMean: new Float64Array(11),
    momentumVariance: new Float64Array(11),
    uncertaintyProduct: new Float64Array(11),
    totalEnergy: 0,
    positionNorm: 1,
    momentumNorm: 1,
  }
}

describe('observablesDiagnosticsStore - position mean history', () => {
  beforeEach(() => {
    useObservablesDiagnosticsStore.getState().reset()
  })

  it('records position means into historyPositionMean ring buffer', () => {
    const store = useObservablesDiagnosticsStore
    store.getState().pushSnapshot(makeSnapshot(3, [1.0, 2.0, 3.0]))

    const state = store.getState()
    expect(state.historyCount).toBe(1)
    expect(state.historyPositionMean[0]![0]).toBe(1.0)
    expect(state.historyPositionMean[1]![0]).toBe(2.0)
    expect(state.historyPositionMean[2]![0]).toBe(3.0)
  })

  it('advances ring buffer head on consecutive pushes', () => {
    const store = useObservablesDiagnosticsStore
    store.getState().pushSnapshot(makeSnapshot(2, [1.0, 0.5]))
    store.getState().pushSnapshot(makeSnapshot(2, [2.0, 1.0]))
    store.getState().pushSnapshot(makeSnapshot(2, [3.0, 1.5]))

    const state = store.getState()
    expect(state.historyCount).toBe(3)
    expect(state.historyHead).toBe(3)
    // Most recent (head-1 = 2): [3.0, 1.5]
    expect(state.historyPositionMean[0]![2]).toBe(3.0)
    expect(state.historyPositionMean[1]![2]).toBe(1.5)
    // Oldest (head-3 = 0): [1.0, 0.5]
    expect(state.historyPositionMean[0]![0]).toBe(1.0)
    expect(state.historyPositionMean[1]![0]).toBe(0.5)
  })

  it('wraps around ring buffer at HISTORY_LENGTH', () => {
    const store = useObservablesDiagnosticsStore
    // Fill the entire buffer
    for (let i = 0; i < HISTORY_LENGTH; i++) {
      store.getState().pushSnapshot(makeSnapshot(1, [i * 0.1]))
    }

    let state = store.getState()
    expect(state.historyCount).toBe(HISTORY_LENGTH)
    expect(state.historyHead).toBe(0) // wrapped around

    // Push one more to overwrite slot 0
    store.getState().pushSnapshot(makeSnapshot(1, [99.0]))

    state = store.getState()
    expect(state.historyCount).toBe(HISTORY_LENGTH)
    expect(state.historyHead).toBe(1)
    // Slot 0 now contains the new value
    expect(state.historyPositionMean[0]![0]).toBe(99.0)
  })

  it('resets position mean history on reset()', () => {
    const store = useObservablesDiagnosticsStore
    store.getState().pushSnapshot(makeSnapshot(2, [5.0, 6.0]))
    store.getState().reset()

    const state = store.getState()
    expect(state.historyCount).toBe(0)
    expect(state.historyHead).toBe(0)
    // All entries zeroed
    expect(state.historyPositionMean[0]![0]).toBe(0)
    expect(state.historyPositionMean[1]![0]).toBe(0)
  })

  it('preserves existing uncertainty history alongside position history', () => {
    const store = useObservablesDiagnosticsStore
    const snap = makeSnapshot(2, [1.0, 2.0])
    snap.uncertaintyProduct[0] = 0.6
    snap.uncertaintyProduct[1] = 0.7
    snap.totalEnergy = 3.5
    store.getState().pushSnapshot(snap)

    const state = store.getState()
    // Float32Array has single-precision, use toBeCloseTo
    expect(state.historyUncertainty[0]![0]).toBeCloseTo(0.6, 5)
    expect(state.historyUncertainty[1]![0]).toBeCloseTo(0.7, 5)
    expect(state.historyEnergy[0]).toBeCloseTo(3.5, 5)
    expect(state.historyPositionMean[0]![0]).toBe(1.0)
    expect(state.historyPositionMean[1]![0]).toBe(2.0)
  })
})
