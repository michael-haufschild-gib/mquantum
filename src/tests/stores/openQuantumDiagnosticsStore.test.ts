import { beforeEach, describe, expect, it } from 'vitest'
import { useOpenQuantumDiagnosticsStore } from '@/stores/openQuantumDiagnosticsStore'
import type { OpenQuantumMetrics } from '@/lib/physics/openQuantum/types'

const store = useOpenQuantumDiagnosticsStore

/** Helper to build a metrics snapshot with distinct values */
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

describe('useOpenQuantumDiagnosticsStore', () => {
  beforeEach(() => {
    store.getState().reset()
  })

  describe('initial state', () => {
    it('has purity=1, groundPopulation=1, trace=1 and all other metrics at 0', () => {
      const s = store.getState()
      expect(s.purity).toBe(1)
      expect(s.linearEntropy).toBe(0)
      expect(s.vonNeumannEntropy).toBe(0)
      expect(s.coherenceMagnitude).toBe(0)
      expect(s.groundPopulation).toBe(1)
      expect(s.trace).toBe(1)
    })

    it('has empty ring buffer with head=0 and count=0', () => {
      const s = store.getState()
      expect(s.historyHead).toBe(0)
      expect(s.historyCount).toBe(0)
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
      const metrics = makeMetrics(5)
      store.getState().pushMetrics(metrics)

      const s = store.getState()
      expect(s.purity).toBe(0.5)
      expect(s.linearEntropy).toBe(1.0)
      expect(s.vonNeumannEntropy).toBe(1.5)
      expect(s.coherenceMagnitude).toBe(2.0)
      expect(s.groundPopulation).toBe(2.5)
      expect(s.trace).toBe(3.0)
    })

    it('writes purity, entropy, coherence into ring buffer at current head', () => {
      const metrics = makeMetrics(3)
      store.getState().pushMetrics(metrics)

      const s = store.getState()
      // Values were written at index 0 (initial head)
      expect(s.historyPurity[0]).toBeCloseTo(0.3)
      expect(s.historyEntropy[0]).toBeCloseTo(0.9)
      expect(s.historyCoherence[0]).toBeCloseTo(1.2)
    })

    it('advances historyHead by 1 after each push', () => {
      store.getState().pushMetrics(makeMetrics(1))
      expect(store.getState().historyHead).toBe(1)

      store.getState().pushMetrics(makeMetrics(2))
      expect(store.getState().historyHead).toBe(2)

      store.getState().pushMetrics(makeMetrics(3))
      expect(store.getState().historyHead).toBe(3)
    })

    it('increments historyCount up to the capacity of 120', () => {
      for (let i = 0; i < 5; i++) {
        store.getState().pushMetrics(makeMetrics(i + 1))
      }
      expect(store.getState().historyCount).toBe(5)
    })
  })

  describe('ring buffer wrapping', () => {
    it('wraps historyHead back to 0 after 120 pushes', () => {
      for (let i = 0; i < 120; i++) {
        store.getState().pushMetrics(makeMetrics(i + 1))
      }
      expect(store.getState().historyHead).toBe(0)
      expect(store.getState().historyCount).toBe(120)
    })

    it('caps historyCount at 120 and does not exceed it', () => {
      for (let i = 0; i < 130; i++) {
        store.getState().pushMetrics(makeMetrics(i + 1))
      }
      expect(store.getState().historyCount).toBe(120)
      expect(store.getState().historyHead).toBe(10)
    })

    it('overwrites oldest entry when buffer wraps', () => {
      // Fill all 120 slots
      for (let i = 0; i < 120; i++) {
        store.getState().pushMetrics(makeMetrics(i + 1))
      }

      // Slot 0 was written by makeMetrics(1): purity = 0.1
      expect(store.getState().historyPurity[0]).toBeCloseTo(0.1)

      // Push one more — overwrites slot 0
      store.getState().pushMetrics(makeMetrics(99))
      expect(store.getState().historyPurity[0]).toBeCloseTo(9.9)
      expect(store.getState().historyHead).toBe(1)
    })
  })

  describe('reset', () => {
    it('restores all scalar metrics to initial values after pushes', () => {
      store.getState().pushMetrics(makeMetrics(7))
      store.getState().reset()

      const s = store.getState()
      expect(s.purity).toBe(1)
      expect(s.linearEntropy).toBe(0)
      expect(s.vonNeumannEntropy).toBe(0)
      expect(s.coherenceMagnitude).toBe(0)
      expect(s.groundPopulation).toBe(1)
      expect(s.trace).toBe(1)
    })

    it('clears ring buffer head, count, and all history arrays', () => {
      for (let i = 0; i < 50; i++) {
        store.getState().pushMetrics(makeMetrics(i + 1))
      }

      store.getState().reset()
      const s = store.getState()

      expect(s.historyHead).toBe(0)
      expect(s.historyCount).toBe(0)
      expect(s.historyPurity.every((v) => v === 0)).toBe(true)
      expect(s.historyEntropy.every((v) => v === 0)).toBe(true)
      expect(s.historyCoherence.every((v) => v === 0)).toBe(true)
    })
  })
})
