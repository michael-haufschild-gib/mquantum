import { beforeEach, describe, expect, it } from 'vitest'

import { useFsfDiagnosticsStore } from '@/stores/fsfDiagnosticsStore'

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
    useFsfDiagnosticsStore.getState().reset()
  })

  it('initializes with hasData=false and zeroed fields', () => {
    const state = useFsfDiagnosticsStore.getState()
    expect(state.hasData).toBe(false)
    expect(state.totalEnergy).toBe(0)
    expect(state.historyCount).toBe(0)
    expect(state.historyHead).toBe(0)
  })

  it('pushSnapshot sets hasData and stores initial energy on first push', () => {
    useFsfDiagnosticsStore.getState().pushSnapshot(SNAPSHOT)

    const state = useFsfDiagnosticsStore.getState()
    expect(state.hasData).toBe(true)
    expect(state.initialEnergy).toBe(10.0)
    expect(state.totalEnergy).toBe(10.0)
    expect(state.energyDrift).toBe(0) // no drift on first frame
  })

  it('computes energy drift as fractional change from initial energy', () => {
    useFsfDiagnosticsStore.getState().pushSnapshot(SNAPSHOT) // initial = 10.0
    useFsfDiagnosticsStore.getState().pushSnapshot({
      ...SNAPSHOT,
      totalEnergy: 11.0, // 10% increase
    })

    const state = useFsfDiagnosticsStore.getState()
    expect(state.energyDrift).toBeCloseTo(0.1)
    expect(state.initialEnergy).toBe(10.0) // preserved
  })

  it('ring buffer wraps after HISTORY_LENGTH pushes', () => {
    const HISTORY_LENGTH = 120
    for (let i = 0; i < HISTORY_LENGTH + 5; i++) {
      useFsfDiagnosticsStore.getState().pushSnapshot({
        ...SNAPSHOT,
        totalEnergy: i,
      })
    }

    const state = useFsfDiagnosticsStore.getState()
    expect(state.historyCount).toBe(HISTORY_LENGTH) // capped at max
    expect(state.historyHead).toBe(5) // wrapped: (120+5) % 120 = 5
  })

  it('ring buffer stores energy and norm values', () => {
    useFsfDiagnosticsStore.getState().pushSnapshot(SNAPSHOT)

    const state = useFsfDiagnosticsStore.getState()
    expect(state.historyEnergy[0]).toBe(10.0)
    expect(state.historyNorm[0]).toBe(1.0)
    expect(state.historyCount).toBe(1)
  })

  it('reset clears all data and creates fresh ring buffers', () => {
    useFsfDiagnosticsStore.getState().pushSnapshot(SNAPSHOT)
    useFsfDiagnosticsStore.getState().pushSnapshot({ ...SNAPSHOT, totalEnergy: 12 })
    useFsfDiagnosticsStore.getState().reset()

    const state = useFsfDiagnosticsStore.getState()
    expect(state.hasData).toBe(false)
    expect(state.historyCount).toBe(0)
    expect(state.historyHead).toBe(0)
    expect(state.initialEnergy).toBe(0)
    expect(state.historyEnergy[0]).toBe(0) // fresh buffer
  })

  it('handles zero initial energy without NaN drift', () => {
    useFsfDiagnosticsStore.getState().pushSnapshot({ ...SNAPSHOT, totalEnergy: 0 })
    useFsfDiagnosticsStore.getState().pushSnapshot({ ...SNAPSHOT, totalEnergy: 5 })

    const state = useFsfDiagnosticsStore.getState()
    expect(state.energyDrift).toBe(0) // division by zero guarded
    expect(Number.isFinite(state.energyDrift)).toBe(true)
  })
})
