/**
 * Tests for the FSF (free scalar field) diagnostics channel.
 *
 * Ring buffer behavior is tested by the shared factory. This file covers
 * FSF-specific concerns: initial energy capture, energy drift computation,
 * zero-energy guard, and dual-array (energy + norm) TypedArray writes.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import { describeRingBufferBehavior } from './diagnostics/ringBufferTests'

const SNAPSHOT = {
  totalEnergy: 10.0,
  totalNorm: 1.0,
  maxPhi: 0.5,
  maxPi: 0.3,
  energyDrift: 0,
  meanPhi: 0.01,
  variancePhi: 0.02,
}

describe('fsfDiagnosticsStore', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().resetFsf()
  })

  describeRingBufferBehavior({
    channelKey: 'fsf',
    pushOnce: () => useDiagnosticsStore.getState().pushFsfSnapshot(SNAPSHOT),
    pushWithValue: (v) =>
      useDiagnosticsStore.getState().pushFsfSnapshot({ ...SNAPSHOT, totalEnergy: v }),
    resetFn: 'resetFsf',
    historyArrayKey: 'historyEnergy',
    testValue: 10.0,
  })

  it('initializes with hasData=false and zeroed fields', () => {
    const state = useDiagnosticsStore.getState().fsf
    expect(state.hasData).toBe(false)
    expect(state.totalEnergy).toBe(0)
    expect(state.initialEnergy).toBe(0)
  })

  it('captures initial energy on first push', () => {
    useDiagnosticsStore.getState().pushFsfSnapshot(SNAPSHOT)

    const state = useDiagnosticsStore.getState().fsf
    expect(state.initialEnergy).toBe(10.0)
    expect(state.totalEnergy).toBe(10.0)
    expect(state.energyDrift).toBe(0)
  })

  it('computes energy drift as fractional change from initial energy', () => {
    useDiagnosticsStore.getState().pushFsfSnapshot(SNAPSHOT)
    useDiagnosticsStore.getState().pushFsfSnapshot({
      ...SNAPSHOT,
      totalEnergy: 11.0,
    })

    const state = useDiagnosticsStore.getState().fsf
    expect(state.energyDrift).toBeCloseTo(0.1)
    expect(state.initialEnergy).toBe(10.0)
  })

  it('handles zero initial energy without NaN drift', () => {
    useDiagnosticsStore.getState().pushFsfSnapshot({ ...SNAPSHOT, totalEnergy: 0 })
    useDiagnosticsStore.getState().pushFsfSnapshot({ ...SNAPSHOT, totalEnergy: 5 })

    const state = useDiagnosticsStore.getState().fsf
    expect(state.energyDrift).toBe(0)
    expect(Number.isFinite(state.energyDrift)).toBe(true)
  })

  it('writes both energy and norm into history arrays', () => {
    useDiagnosticsStore.getState().pushFsfSnapshot(SNAPSHOT)

    const state = useDiagnosticsStore.getState().fsf
    expect(state.historyEnergy[0]).toBe(10.0)
    expect(state.historyNorm[0]).toBe(1.0)
  })
})
