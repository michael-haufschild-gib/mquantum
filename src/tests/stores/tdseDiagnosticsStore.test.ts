/**
 * Tests for the TDSE diagnostics channel.
 *
 * Ring buffer behavior (advance, wrap, saturation, reset) is tested by the
 * shared factory. This file covers TDSE-specific concerns: initial defaults,
 * snapshot field propagation, and normDrift tracking.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import { describeRingBufferBehavior } from './diagnostics/ringBufferTests'

function makeSnapshot(overrides: Record<string, number> = {}) {
  return {
    simTime: 0,
    totalNorm: 1.0,
    maxDensity: 0.5,
    normDrift: 0,
    normLeft: 0.5,
    normRight: 0.5,
    R: 0,
    T: 0,
    ipr: 0,
    ...overrides,
  }
}

describe('tdseDiagnosticsStore', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().resetTdse()
  })

  describeRingBufferBehavior({
    channelKey: 'tdse',
    pushOnce: () =>
      useDiagnosticsStore.getState().pushTdseSnapshot(makeSnapshot({ totalNorm: 0.95 })),
    pushWithValue: (v) =>
      useDiagnosticsStore.getState().pushTdseSnapshot(makeSnapshot({ totalNorm: v })),
    resetFn: 'resetTdse',
    historyArrayKey: 'historyNorm',
    testValue: 0.95,
  })

  it('starts with hasData=false and zero counters', () => {
    const s = useDiagnosticsStore.getState().tdse
    expect(s.hasData).toBe(false)
    expect(s.historyHead).toBe(0)
    expect(s.historyCount).toBe(0)
    expect(s.totalNorm).toBe(1)
  })

  it('pushSnapshot propagates all snapshot fields', () => {
    useDiagnosticsStore
      .getState()
      .pushTdseSnapshot(makeSnapshot({ totalNorm: 0.95, maxDensity: 0.3, R: 0.4, T: 0.55 }))
    const s = useDiagnosticsStore.getState().tdse
    expect(s.totalNorm).toBe(0.95)
    expect(s.maxDensity).toBe(0.3)
    expect(s.R).toBe(0.4)
    expect(s.T).toBe(0.55)
  })

  it('normDrift field tracks cumulative drift', () => {
    const store = useDiagnosticsStore.getState()
    store.pushTdseSnapshot(makeSnapshot({ normDrift: 0.02 }))
    expect(useDiagnosticsStore.getState().tdse.normDrift).toBe(0.02)

    store.pushTdseSnapshot(makeSnapshot({ normDrift: 0.05 }))
    expect(useDiagnosticsStore.getState().tdse.normDrift).toBe(0.05)
  })
})
