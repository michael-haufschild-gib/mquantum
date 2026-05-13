/**
 * Tests for the open quantum diagnostics channel.
 *
 * Ring buffer behavior is tested by the shared factory. This file covers
 * OpenQuantum-specific concerns: initial scalar values, metric propagation
 * from OpenQuantumMetrics, and multi-array history writes.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { OpenQuantumMetrics } from '@/lib/physics/openQuantum/types'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'

import { describeRingBufferBehavior } from './diagnostics/ringBufferTests'

function makeMetrics(seed: number): OpenQuantumMetrics {
  return {
    purity: seed * 0.1,
    linearEntropy: seed * 0.2,
    vonNeumannEntropy: seed * 0.3,
    coherenceMagnitude: seed * 0.4,
    groundPopulation: seed * 0.5,
    trace: seed * 0.6,
  }
}

describe('useOpenQuantumDiagnosticsStore (unified)', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().resetOpenQuantum()
  })

  describeRingBufferBehavior({
    channelKey: 'openQuantum',
    pushOnce: () => useDiagnosticsStore.getState().pushOpenQuantumMetrics(makeMetrics(3)),
    pushWithValue: (v) =>
      useDiagnosticsStore.getState().pushOpenQuantumMetrics({ ...makeMetrics(1), purity: v }),
    resetFn: 'resetOpenQuantum',
    historyArrayKey: 'historyPurity',
    testValue: 0.3,
    hasDataField: false,
  })

  describe('initial state', () => {
    it('has purity=1, groundPopulation=1, trace=1 and all other metrics at 0', () => {
      const s = useDiagnosticsStore.getState().openQuantum
      expect(s.purity).toBe(1)
      expect(s.linearEntropy).toBe(0)
      expect(s.vonNeumannEntropy).toBe(0)
      expect(s.coherenceMagnitude).toBe(0)
      expect(s.groundPopulation).toBe(1)
      expect(s.trace).toBe(1)
    })

    it('has zeroed history arrays of length 120', () => {
      const s = useDiagnosticsStore.getState().openQuantum
      expect(s.historyPurity.length).toBe(120)
      expect(s.historyEntropy.length).toBe(120)
      expect(s.historyCoherence.length).toBe(120)
      expect(s.historyPurity.every((v) => v === 0)).toBe(true)
      expect(s.historyEntropy.every((v) => v === 0)).toBe(true)
      expect(s.historyCoherence.every((v) => v === 0)).toBe(true)
    })
  })

  describe('pushMetrics', () => {
    it('updates current metric values to the pushed snapshot', () => {
      useDiagnosticsStore.getState().pushOpenQuantumMetrics(makeMetrics(5))

      const s = useDiagnosticsStore.getState().openQuantum
      expect(s.purity).toBe(0.5)
      expect(s.linearEntropy).toBe(1.0)
      expect(s.vonNeumannEntropy).toBe(1.5)
      expect(s.coherenceMagnitude).toBe(2.0)
      expect(s.groundPopulation).toBe(2.5)
      expect(s.trace).toBe(3.0)
    })

    it('writes purity, entropy, coherence into separate history arrays', () => {
      useDiagnosticsStore.getState().pushOpenQuantumMetrics(makeMetrics(3))

      const s = useDiagnosticsStore.getState().openQuantum
      expect(s.historyPurity[0]).toBeCloseTo(0.3)
      expect(s.historyEntropy[0]).toBeCloseTo(0.9)
      expect(s.historyCoherence[0]).toBeCloseTo(1.2)
    })
  })

  describe('reset', () => {
    it('restores all scalar metrics to initial values', () => {
      useDiagnosticsStore.getState().pushOpenQuantumMetrics(makeMetrics(7))
      useDiagnosticsStore.getState().resetOpenQuantum()

      const s = useDiagnosticsStore.getState().openQuantum
      expect(s.purity).toBe(1)
      expect(s.linearEntropy).toBe(0)
      expect(s.vonNeumannEntropy).toBe(0)
      expect(s.coherenceMagnitude).toBe(0)
      expect(s.groundPopulation).toBe(1)
      expect(s.trace).toBe(1)
    })

    it('clears all history arrays to zero', () => {
      for (let i = 0; i < 50; i++) {
        useDiagnosticsStore.getState().pushOpenQuantumMetrics(makeMetrics(i + 1))
      }

      useDiagnosticsStore.getState().resetOpenQuantum()
      const s = useDiagnosticsStore.getState().openQuantum
      expect(s.historyPurity.every((v) => v === 0)).toBe(true)
      expect(s.historyEntropy.every((v) => v === 0)).toBe(true)
      expect(s.historyCoherence.every((v) => v === 0)).toBe(true)
    })
  })
})
