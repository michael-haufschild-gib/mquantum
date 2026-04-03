/**
 * Tests for the observables diagnostics channel.
 *
 * Ring buffer behavior is tested by the shared factory. This file covers
 * Observables-specific concerns: per-dimension Float64Array propagation,
 * energy history writes, and activeDims tracking.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import { describeRingBufferBehavior } from './diagnostics/ringBufferTests'

function makeSnapshot(overrides: Partial<{ activeDims: number; totalEnergy: number }> = {}) {
  return {
    activeDims: overrides.activeDims ?? 3,
    positionMean: new Float64Array([1, 2, 3, 0, 0, 0, 0, 0, 0, 0, 0]),
    positionVariance: new Float64Array([0.5, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0]),
    momentumMean: new Float64Array([0.1, 0.2, 0.3, 0, 0, 0, 0, 0, 0, 0, 0]),
    momentumVariance: new Float64Array([0.25, 0.25, 0.25, 0, 0, 0, 0, 0, 0, 0, 0]),
    uncertaintyProduct: new Float64Array([0.56, 0.56, 0.56, 0, 0, 0, 0, 0, 0, 0, 0]),
    totalEnergy: overrides.totalEnergy ?? 1.5,
    positionNorm: 1.0,
    momentumNorm: 1.0,
  }
}

describe('observablesDiagnosticsStore', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().resetObservables()
  })

  describeRingBufferBehavior({
    channelKey: 'observables',
    pushOnce: () => useDiagnosticsStore.getState().pushObservablesSnapshot(makeSnapshot()),
    pushWithValue: (v) =>
      useDiagnosticsStore.getState().pushObservablesSnapshot(makeSnapshot({ totalEnergy: v })),
    resetFn: 'resetObservables',
    historyArrayKey: 'historyEnergy',
    testValue: 1.5,
  })

  it('starts with no data', () => {
    const state = useDiagnosticsStore.getState().observables
    expect(state.hasData).toBe(false)
    expect(state.activeDims).toBe(0)
  })

  it('stores activeDims and Float64Array fields from snapshot', () => {
    useDiagnosticsStore.getState().pushObservablesSnapshot(makeSnapshot())
    const state = useDiagnosticsStore.getState().observables

    expect(state.activeDims).toBe(3)
    expect(state.positionMean[0]).toBe(1)
    expect(state.totalEnergy).toBe(1.5)
  })

  it('writes per-dimension uncertainty into history arrays', () => {
    useDiagnosticsStore.getState().pushObservablesSnapshot(makeSnapshot())
    const state = useDiagnosticsStore.getState().observables

    expect(state.historyUncertainty[0]![0]).toBeCloseTo(0.56)
    expect(state.historyPositionMean[0]![0]).toBeCloseTo(1)
  })
})
