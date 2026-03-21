/**
 * Unit tests for the Dirac diagnostics store.
 *
 * Tests cover snapshot propagation, ring buffer history for time-series
 * export, wrap-around behavior, and reset.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useDiracDiagnosticsStore } from '@/stores/diracDiagnosticsStore'

describe('diracDiagnosticsStore', () => {
  beforeEach(() => {
    useDiracDiagnosticsStore.getState().reset()
  })

  it('initializes with hasData false and defaults', () => {
    const state = useDiracDiagnosticsStore.getState()
    expect(state.hasData).toBe(false)
    expect(state.totalNorm).toBe(0)
    expect(state.normDrift).toBe(0)
    expect(state.maxDensity).toBe(0)
    expect(state.particleFraction).toBe(0)
    expect(state.antiparticleFraction).toBe(0)
    expect(state.meanPosition).toEqual([0, 0, 0])
    expect(state.comptonWavelength).toBe(1)
    expect(state.zitterbewegungFreq).toBe(2)
    expect(state.kleinThreshold).toBe(2)
    expect(state.historyHead).toBe(0)
    expect(state.historyCount).toBe(0)
  })

  it('update sets hasData true and merges partial snapshot', () => {
    useDiracDiagnosticsStore.getState().update({
      totalNorm: 0.99,
      particleFraction: 0.7,
      antiparticleFraction: 0.3,
    })

    const state = useDiracDiagnosticsStore.getState()
    expect(state.hasData).toBe(true)
    expect(state.totalNorm).toBe(0.99)
    expect(state.particleFraction).toBe(0.7)
    expect(state.antiparticleFraction).toBe(0.3)
    expect(state.maxDensity).toBe(0) // unset field stays default
  })

  it('ring buffer advances head and count on update', () => {
    useDiracDiagnosticsStore.getState().update({ totalNorm: 0.99 })
    expect(useDiracDiagnosticsStore.getState().historyHead).toBe(1)
    expect(useDiracDiagnosticsStore.getState().historyCount).toBe(1)

    useDiracDiagnosticsStore.getState().update({ totalNorm: 0.98 })
    expect(useDiracDiagnosticsStore.getState().historyHead).toBe(2)
    expect(useDiracDiagnosticsStore.getState().historyCount).toBe(2)
  })

  it('ring buffer writes correct values', () => {
    useDiracDiagnosticsStore.getState().update({
      totalNorm: 0.95,
      particleFraction: 0.6,
      antiparticleFraction: 0.4,
    })
    const s = useDiracDiagnosticsStore.getState()
    expect(s.historyNorm[0]).toBeCloseTo(0.95)
    expect(s.historyParticleFrac[0]).toBeCloseTo(0.6)
    expect(s.historyAntiparticleFrac[0]).toBeCloseTo(0.4)
  })

  it('ring buffer wraps at capacity (120 entries)', () => {
    for (let i = 0; i < 120; i++) {
      useDiracDiagnosticsStore.getState().update({
        totalNorm: 1 - i * 0.001,
        particleFraction: 0.5,
        antiparticleFraction: 0.5,
      })
    }
    expect(useDiracDiagnosticsStore.getState().historyHead).toBe(0)
    expect(useDiracDiagnosticsStore.getState().historyCount).toBe(120)

    // One more wraps
    useDiracDiagnosticsStore.getState().update({
      totalNorm: 0.5,
      particleFraction: 0.8,
      antiparticleFraction: 0.2,
    })
    expect(useDiracDiagnosticsStore.getState().historyHead).toBe(1)
    expect(useDiracDiagnosticsStore.getState().historyCount).toBe(120)
    expect(useDiracDiagnosticsStore.getState().historyNorm[0]).toBeCloseTo(0.5)
    expect(useDiracDiagnosticsStore.getState().historyParticleFrac[0]).toBeCloseTo(0.8)
  })

  it('historyCount saturates and does not exceed 120', () => {
    for (let i = 0; i < 200; i++) {
      useDiracDiagnosticsStore.getState().update({ totalNorm: 0.99 })
    }
    expect(useDiracDiagnosticsStore.getState().historyCount).toBe(120)
  })

  it('reset clears all fields and allocates fresh TypedArrays', () => {
    for (let i = 0; i < 5; i++) {
      useDiracDiagnosticsStore.getState().update({
        totalNorm: 0.9,
        particleFraction: 0.6,
        antiparticleFraction: 0.4,
      })
    }
    const normBefore = useDiracDiagnosticsStore.getState().historyNorm
    useDiracDiagnosticsStore.getState().reset()

    const state = useDiracDiagnosticsStore.getState()
    expect(state.hasData).toBe(false)
    expect(state.historyHead).toBe(0)
    expect(state.historyCount).toBe(0)
    expect(state.totalNorm).toBe(0)
    expect(state.particleFraction).toBe(0)
    expect(state.antiparticleFraction).toBe(0)
    expect(state.meanPosition).toEqual([0, 0, 0])
    // Fresh TypedArrays
    expect(state.historyNorm).not.toBe(normBefore)
    expect(state.historyNorm.every((v) => v === 0)).toBe(true)
  })
})
