/**
 * Tests for the Dirac diagnostics channel.
 *
 * Ring buffer behavior is tested by the shared factory. This file covers
 * Dirac-specific concerns: initial defaults with non-zero physical constants,
 * partial merge semantics, and multi-array TypedArray writes.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import { describeRingBufferBehavior } from './diagnostics/ringBufferTests'

describe('diracDiagnosticsStore', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().resetDirac()
  })

  describeRingBufferBehavior({
    channelKey: 'dirac',
    pushOnce: () =>
      useDiagnosticsStore.getState().updateDirac({
        totalNorm: 0.95,
        particleFraction: 0.6,
        antiparticleFraction: 0.4,
      }),
    pushWithValue: (v) => useDiagnosticsStore.getState().updateDirac({ totalNorm: v }),
    resetFn: 'resetDirac',
    historyArrayKey: 'historyNorm',
    testValue: 0.95,
  })

  it('initializes with Dirac-specific physical constants', () => {
    const state = useDiagnosticsStore.getState().dirac
    expect(state.hasData).toBe(false)
    expect(state.totalNorm).toBe(0)
    expect(state.particleFraction).toBe(0)
    expect(state.antiparticleFraction).toBe(0)
    expect(state.meanPosition).toEqual([0, 0, 0])
    expect(state.comptonWavelength).toBe(1)
    expect(state.zitterbewegungFreq).toBe(2)
    expect(state.kleinThreshold).toBe(2)
  })

  it('partial update merges fields and preserves unset defaults', () => {
    useDiagnosticsStore.getState().updateDirac({
      totalNorm: 0.99,
      particleFraction: 0.7,
      antiparticleFraction: 0.3,
    })

    const state = useDiagnosticsStore.getState().dirac
    expect(state.totalNorm).toBe(0.99)
    expect(state.particleFraction).toBe(0.7)
    expect(state.antiparticleFraction).toBe(0.3)
    expect(state.maxDensity).toBe(0) // unset field stays default
  })

  it('writes particle/antiparticle fractions into separate history arrays and advances with head', () => {
    useDiagnosticsStore.getState().updateDirac({
      totalNorm: 0.95,
      particleFraction: 0.6,
      antiparticleFraction: 0.4,
    })
    const s1 = useDiagnosticsStore.getState().dirac
    expect(s1.historyParticleFrac[0]).toBeCloseTo(0.6)
    expect(s1.historyAntiparticleFrac[0]).toBeCloseTo(0.4)

    // Second push writes to slot 1 — verifies arrays advance with head
    useDiagnosticsStore.getState().updateDirac({
      totalNorm: 0.9,
      particleFraction: 0.8,
      antiparticleFraction: 0.2,
    })
    const s2 = useDiagnosticsStore.getState().dirac
    expect(s2.historyParticleFrac[1]).toBeCloseTo(0.8)
    expect(s2.historyAntiparticleFrac[1]).toBeCloseTo(0.2)
  })

  it('reset restores meanPosition and physical constants', () => {
    useDiagnosticsStore.getState().updateDirac({
      totalNorm: 0.9,
      meanPosition: [1, 2, 3],
    })
    useDiagnosticsStore.getState().resetDirac()

    const state = useDiagnosticsStore.getState().dirac
    expect(state.totalNorm).toBe(0)
    expect(state.meanPosition).toEqual([0, 0, 0])
    expect(state.comptonWavelength).toBe(1)
  })
})
