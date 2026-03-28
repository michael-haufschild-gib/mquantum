/**
 * Tests for the TDSE diagnostics store ring buffer.
 *
 * This store uses TypedArray ring buffers inside Zustand state,
 * which is a pattern prone to mutation bugs: Zustand detects changes
 * by reference equality, but TypedArrays are mutated in-place by pushSnapshot.
 * The store works around this by spreading snapshot values, but the
 * ring buffer itself (historyNorm, historyR, historyT) is mutated.
 *
 * These tests verify:
 * - Ring buffer wrapping at HISTORY_LENGTH
 * - historyCount saturation at HISTORY_LENGTH
 * - Reset clears TypedArrays (not just head/count)
 * - Snapshot field propagation
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useTdseDiagnosticsStore } from '@/stores/tdseDiagnosticsStore'

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
    useTdseDiagnosticsStore.getState().reset()
  })

  it('starts with hasData=false and zero counters', () => {
    const s = useTdseDiagnosticsStore.getState()
    expect(s.hasData).toBe(false)
    expect(s.historyHead).toBe(0)
    expect(s.historyCount).toBe(0)
    expect(s.totalNorm).toBe(1)
  })

  it('pushSnapshot sets hasData=true and propagates fields', () => {
    useTdseDiagnosticsStore
      .getState()
      .pushSnapshot(makeSnapshot({ totalNorm: 0.95, maxDensity: 0.3, R: 0.4, T: 0.55 }))
    const s = useTdseDiagnosticsStore.getState()
    expect(s.hasData).toBe(true)
    expect(s.totalNorm).toBe(0.95)
    expect(s.maxDensity).toBe(0.3)
    expect(s.R).toBe(0.4)
    expect(s.T).toBe(0.55)
  })

  it('ring buffer advances head and count', () => {
    const store = useTdseDiagnosticsStore.getState()
    store.pushSnapshot(makeSnapshot({ totalNorm: 0.99 }))
    expect(useTdseDiagnosticsStore.getState().historyHead).toBe(1)
    expect(useTdseDiagnosticsStore.getState().historyCount).toBe(1)

    store.pushSnapshot(makeSnapshot({ totalNorm: 0.98 }))
    expect(useTdseDiagnosticsStore.getState().historyHead).toBe(2)
    expect(useTdseDiagnosticsStore.getState().historyCount).toBe(2)
  })

  it('ring buffer writes values into TypedArrays', () => {
    const store = useTdseDiagnosticsStore.getState()
    store.pushSnapshot(makeSnapshot({ totalNorm: 0.95, R: 0.3, T: 0.65 }))

    const s = useTdseDiagnosticsStore.getState()
    expect(s.historyNorm[0]).toBeCloseTo(0.95)
    expect(s.historyR[0]).toBeCloseTo(0.3)
    expect(s.historyT[0]).toBeCloseTo(0.65)
  })

  it('ring buffer wraps at capacity (120 entries)', () => {
    const store = useTdseDiagnosticsStore.getState()
    // Push 120 entries to fill the buffer
    for (let i = 0; i < 120; i++) {
      store.pushSnapshot(makeSnapshot({ totalNorm: 1 - i * 0.001 }))
    }
    expect(useTdseDiagnosticsStore.getState().historyHead).toBe(0) // wrapped
    expect(useTdseDiagnosticsStore.getState().historyCount).toBe(120)

    // Push one more — should wrap to head=1
    store.pushSnapshot(makeSnapshot({ totalNorm: 0.5 }))
    expect(useTdseDiagnosticsStore.getState().historyHead).toBe(1)
    expect(useTdseDiagnosticsStore.getState().historyCount).toBe(120) // saturated

    // The value at index 0 should be the 121st push (0.5)
    expect(useTdseDiagnosticsStore.getState().historyNorm[0]).toBeCloseTo(0.5)
  })

  it('historyCount saturates and does not exceed HISTORY_LENGTH', () => {
    const store = useTdseDiagnosticsStore.getState()
    for (let i = 0; i < 200; i++) {
      store.pushSnapshot(makeSnapshot({ totalNorm: 1 - i * 0.0001 }))
    }
    expect(useTdseDiagnosticsStore.getState().historyCount).toBe(120)
  })

  it('reset clears all fields and allocates fresh TypedArrays', () => {
    const store = useTdseDiagnosticsStore.getState()
    for (let i = 0; i < 10; i++) {
      store.pushSnapshot(makeSnapshot({ totalNorm: 0.9, R: 0.3, T: 0.6 }))
    }

    const normBefore = useTdseDiagnosticsStore.getState().historyNorm
    useTdseDiagnosticsStore.getState().reset()

    const s = useTdseDiagnosticsStore.getState()
    expect(s.hasData).toBe(false)
    expect(s.historyHead).toBe(0)
    expect(s.historyCount).toBe(0)
    expect(s.totalNorm).toBe(1)
    // Fresh TypedArrays should be allocated (not same reference)
    expect(s.historyNorm).not.toBe(normBefore)
    // New arrays should be zeroed
    expect(s.historyNorm.every((v) => v === 0)).toBe(true)
  })

  it('normDrift field tracks cumulative drift', () => {
    const store = useTdseDiagnosticsStore.getState()
    store.pushSnapshot(makeSnapshot({ normDrift: 0.02 }))
    expect(useTdseDiagnosticsStore.getState().normDrift).toBe(0.02)

    store.pushSnapshot(makeSnapshot({ normDrift: 0.05 }))
    expect(useTdseDiagnosticsStore.getState().normDrift).toBe(0.05)
  })
})
