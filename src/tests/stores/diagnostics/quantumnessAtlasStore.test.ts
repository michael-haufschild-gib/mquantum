/**
 * Tests for the Quantumness Atlas store.
 *
 * Verifies sweep lifecycle, accumulator math, point advancement
 * (γ-inner → λ-middle → N-outer), and config mutation.
 *
 * @module
 */

import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_ATLAS_CONFIG,
  lambdaForStep,
  useQuantumnessAtlasStore,
} from '@/stores/diagnostics/quantumnessAtlasStore'

describe('quantumnessAtlasStore', () => {
  beforeEach(() => {
    useQuantumnessAtlasStore.setState(useQuantumnessAtlasStore.getInitialState())
  })

  // ── Config ──────────────────────────────────────────────────────────────

  describe('setConfig', () => {
    it('merges partial config into existing', () => {
      useQuantumnessAtlasStore.getState().setConfig({ lambdaSteps: 4 })
      const config = useQuantumnessAtlasStore.getState().config
      expect(config.lambdaSteps).toBe(4)
      expect(config.dimensions).toEqual(DEFAULT_ATLAS_CONFIG.dimensions)
    })
  })

  // ── lambdaForStep ─────────────────────────────────────────────────────

  describe('lambdaForStep', () => {
    it('returns lambdaMin at step 0', () => {
      const config = { ...DEFAULT_ATLAS_CONFIG, lambdaMin: 0.1, lambdaMax: 50, lambdaSteps: 8 }
      expect(lambdaForStep(config, 0)).toBeCloseTo(0.1, 10)
    })

    it('returns lambdaMax at last step', () => {
      const config = { ...DEFAULT_ATLAS_CONFIG, lambdaMin: 0.1, lambdaMax: 50, lambdaSteps: 8 }
      expect(lambdaForStep(config, 7)).toBeCloseTo(50, 10)
    })

    it('produces log-spaced values', () => {
      const config = { ...DEFAULT_ATLAS_CONFIG, lambdaMin: 1, lambdaMax: 100, lambdaSteps: 3 }
      // mid = 1 * (100/1)^0.5 = 10
      expect(lambdaForStep(config, 1)).toBeCloseTo(10, 8)
    })

    it('returns lambdaMin when lambdaSteps = 1', () => {
      const config = { ...DEFAULT_ATLAS_CONFIG, lambdaMin: 0.5, lambdaMax: 50, lambdaSteps: 1 }
      expect(lambdaForStep(config, 0)).toBeCloseTo(0.5, 10)
    })
  })

  // ── Sweep lifecycle ───────────────────────────────────────────────────

  describe('startSweep', () => {
    it('transitions to running and computes totalPoints', () => {
      const store = useQuantumnessAtlasStore.getState()
      store.setConfig({ dimensions: [3, 5], lambdaSteps: 4, gammas: [0, 1, 3] })
      store.startSweep()

      const state = useQuantumnessAtlasStore.getState()
      expect(state.status).toBe('running')
      expect(state.progress.totalPoints).toBe(2 * 4 * 3) // 24
      expect(state.progress.completedPoints).toBe(0)
      expect(state.results).toHaveLength(0)
    })

    it('resets accumulators', () => {
      const store = useQuantumnessAtlasStore.getState()
      store.recordSample(1, 2, 3) // dirty the accumulators
      store.startSweep()
      // After start, accumulators are fresh — recording one sample gives that value
      store.recordSample(0.5, 0.3, 0.8)
      const point = store.completePointAndAdvance(64)
      // point is non-null because the default config has multiple points
      expect(point).toMatchObject({ dimChanged: false })
      const result = useQuantumnessAtlasStore.getState().results[0]!
      expect(result.avgNormalizedEntropy).toBeCloseTo(0.5, 10)
    })
  })

  describe('abortSweep', () => {
    it('transitions to idle', () => {
      const store = useQuantumnessAtlasStore.getState()
      store.startSweep()
      store.abortSweep()
      expect(useQuantumnessAtlasStore.getState().status).toBe('idle')
    })
  })

  // ── Accumulators ──────────────────────────────────────────────────────

  describe('recordSample + completePointAndAdvance', () => {
    it('computes correct mean from multiple samples', () => {
      const store = useQuantumnessAtlasStore.getState()
      store.startSweep()
      store.recordSample(0.2, 0.4, 0.6)
      store.recordSample(0.4, 0.6, 0.8)
      store.recordSample(0.6, 0.8, 1.0)
      store.completePointAndAdvance(64)

      const result = useQuantumnessAtlasStore.getState().results[0]!
      expect(result.avgNormalizedEntropy).toBeCloseTo(0.4, 10)
      expect(result.avgWignerNegativity).toBeCloseTo(0.6, 10)
      expect(result.avgIPR).toBeCloseTo(0.8, 10)
      expect(result.measurementSamples).toBe(3)
    })

    it('computes correct sample variance (Bessel-corrected)', () => {
      const store = useQuantumnessAtlasStore.getState()
      store.startSweep()
      // Values: 1, 3 → mean=2, sample variance = Σ(x-x̄)²/(n-1) = (1+1)/1 = 2
      store.recordSample(1, 0, 0)
      store.recordSample(3, 0, 0)
      store.completePointAndAdvance(64)

      const result = useQuantumnessAtlasStore.getState().results[0]!
      expect(result.varNormalizedEntropy).toBeCloseTo(2, 10)
    })

    it('returns zero variance for single sample', () => {
      const store = useQuantumnessAtlasStore.getState()
      store.startSweep()
      store.recordSample(5, 3, 1)
      store.completePointAndAdvance(64)

      const result = useQuantumnessAtlasStore.getState().results[0]!
      expect(result.varNormalizedEntropy).toBe(0)
      expect(result.varWignerNegativity).toBe(0)
      expect(result.varIPR).toBe(0)
    })
  })

  // ── Point advancement (γ → λ → N) ────────────────────────────────────

  describe('completePointAndAdvance', () => {
    it('advances γ (inner loop) first', () => {
      const store = useQuantumnessAtlasStore.getState()
      store.setConfig({ dimensions: [3], lambdaSteps: 1, gammas: [0, 1, 5] })
      store.startSweep()

      // Complete first point (γ=0)
      store.recordSample(1, 1, 1)
      const next1 = store.completePointAndAdvance(64)
      expect(next1).toMatchObject({ gamma: 1, dimChanged: false })

      // Complete second point (γ=1)
      store.recordSample(1, 1, 1)
      const next2 = store.completePointAndAdvance(64)
      expect(next2).toMatchObject({ gamma: 5 })
    })

    it('wraps γ and advances λ (middle loop)', () => {
      const store = useQuantumnessAtlasStore.getState()
      store.setConfig({
        dimensions: [3],
        lambdaMin: 1,
        lambdaMax: 10,
        lambdaSteps: 2,
        gammas: [0, 1],
      })
      store.startSweep()

      // Point 1: λ=1, γ=0
      store.recordSample(1, 1, 1)
      const p1 = store.completePointAndAdvance(64)
      expect(p1!.gamma).toBe(1) // γ advances

      // Point 2: λ=1, γ=1
      store.recordSample(1, 1, 1)
      const p2 = store.completePointAndAdvance(64)
      expect(p2!.gamma).toBe(0) // γ wraps
      expect(p2!.lambda).toBeCloseTo(10, 8) // λ advances to step 1
    })

    it('wraps λ and advances N (outer loop) with dimChanged=true', () => {
      const store = useQuantumnessAtlasStore.getState()
      store.setConfig({
        dimensions: [3, 5],
        lambdaMin: 1,
        lambdaMax: 1,
        lambdaSteps: 1,
        gammas: [0],
      })
      store.startSweep()

      // Point 1: N=3, λ=1, γ=0
      store.recordSample(1, 1, 1)
      const next = store.completePointAndAdvance(64)
      expect(next).toMatchObject({ dim: 5, dimChanged: true })
    })

    it('returns null when sweep is complete', () => {
      const store = useQuantumnessAtlasStore.getState()
      store.setConfig({ dimensions: [3], lambdaSteps: 1, gammas: [0] })
      store.startSweep()

      store.recordSample(1, 1, 1)
      const result = store.completePointAndAdvance(64)
      expect(result).toBeNull()
      expect(useQuantumnessAtlasStore.getState().progress.completedPoints).toBe(1)
    })

    it('stores correct lambda/dim/gamma on each result point', () => {
      const store = useQuantumnessAtlasStore.getState()
      store.setConfig({
        dimensions: [3, 5],
        lambdaMin: 0.1,
        lambdaMax: 10,
        lambdaSteps: 2,
        gammas: [0, 3],
      })
      store.startSweep()

      // Run all 2×2×2 = 8 points
      for (let i = 0; i < 8; i++) {
        store.recordSample(i * 0.1, i * 0.01, i * 0.05)
        store.completePointAndAdvance(64)
      }

      const results = useQuantumnessAtlasStore.getState().results
      expect(results).toHaveLength(8)

      // Verify sweep order: N=3 first (4 points), then N=5 (4 points)
      expect(results[0]!.dim).toBe(3)
      expect(results[1]!.dim).toBe(3)
      expect(results[2]!.dim).toBe(3)
      expect(results[3]!.dim).toBe(3)
      expect(results[4]!.dim).toBe(5)

      // Within N=3: γ inner, λ outer
      expect(results[0]!.gamma).toBe(0)
      expect(results[1]!.gamma).toBe(3)
      expect(results[2]!.gamma).toBe(0) // λ advanced
      expect(results[3]!.gamma).toBe(3)

      // Lambda values
      expect(results[0]!.lambda).toBeCloseTo(0.1, 8)
      expect(results[2]!.lambda).toBeCloseTo(10, 8)
    })
  })

  // ── tickFrame ─────────────────────────────────────────────────────────

  describe('tickFrame', () => {
    it('increments framesEvolved', () => {
      const store = useQuantumnessAtlasStore.getState()
      store.startSweep()
      store.tickFrame()
      store.tickFrame()
      expect(useQuantumnessAtlasStore.getState().framesEvolved).toBe(2)
    })

    it('resets after completePointAndAdvance', () => {
      const store = useQuantumnessAtlasStore.getState()
      store.startSweep()
      store.tickFrame()
      store.tickFrame()
      store.recordSample(1, 1, 1)
      store.completePointAndAdvance(64)
      expect(useQuantumnessAtlasStore.getState().framesEvolved).toBe(0)
    })
  })

  // ── completeSweep / clearResults ──────────────────────────────────────

  describe('completeSweep', () => {
    it('transitions to complete', () => {
      const store = useQuantumnessAtlasStore.getState()
      store.startSweep()
      store.completeSweep()
      expect(useQuantumnessAtlasStore.getState().status).toBe('complete')
    })
  })

  describe('clearResults', () => {
    it('resets to idle with empty results and zeroed progress', () => {
      const store = useQuantumnessAtlasStore.getState()
      store.startSweep()
      store.recordSample(1, 1, 1)
      store.completePointAndAdvance(64)
      store.clearResults()

      const state = useQuantumnessAtlasStore.getState()
      expect(state.status).toBe('idle')
      expect(state.results).toHaveLength(0)
      expect(state.progress.completedPoints).toBe(0)
      expect(state.progress.totalPoints).toBe(0)
    })
  })
})
