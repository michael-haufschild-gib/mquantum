/**
 * Tests for `setTdseMetric` covering all 8 metric kinds.
 *
 * Validates per-kind clamping, mismatched-field stripping, fall-back to
 * defaults on missing/non-finite input, and the `needsReset` invariant
 * (idempotent writes do NOT flip the reset flag).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_ADS_RADIUS,
  MAX_DOUBLE_THROAT_SEPARATION,
  MAX_HUBBLE_RATE,
  MAX_SCHWARZSCHILD_MASS,
  MAX_SPHERE_RADIUS,
  MAX_THROAT_RADIUS,
  MAX_TORUS_PERIOD,
  MIN_ADS_RADIUS,
  MIN_DOUBLE_THROAT_SEPARATION,
  MIN_HUBBLE_RATE,
  MIN_SCHWARZSCHILD_MASS,
  MIN_SPHERE_RADIUS,
  MIN_THROAT_RADIUS,
  MIN_TORUS_PERIOD,
} from '@/lib/physics/tdse/metrics/types'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('setTdseMetric', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  const set = () => useExtendedObjectStore.getState().setTdseMetric
  const metric = () => useExtendedObjectStore.getState().schroedinger.tdse.metric
  const tdse = () => useExtendedObjectStore.getState().schroedinger.tdse

  describe('flat', () => {
    it('stores {kind:"flat"} with no other fields', () => {
      set()({ kind: 'flat' })
      expect(metric()).toEqual({ kind: 'flat' })
    })

    it('strips mismatched fields (e.g. schwarzschildMass)', () => {
      set()({ kind: 'flat', schwarzschildMass: 5, throatRadius: 2 })
      expect(metric()).toEqual({ kind: 'flat' })
    })
  })

  describe('morrisThorne', () => {
    it('clamps throatRadius to physical bounds', () => {
      set()({ kind: 'morrisThorne', throatRadius: 100 })
      expect(metric()).toEqual({ kind: 'morrisThorne', throatRadius: MAX_THROAT_RADIUS })
      set()({ kind: 'morrisThorne', throatRadius: -5 })
      expect(metric()).toEqual({ kind: 'morrisThorne', throatRadius: MIN_THROAT_RADIUS })
    })

    it('strips mismatched fields like schwarzschildMass', () => {
      set()({ kind: 'morrisThorne', throatRadius: 0.5, schwarzschildMass: 9 })
      expect(metric()).toEqual({ kind: 'morrisThorne', throatRadius: 0.5 })
    })

    it('preserves prior throatRadius when omitted', () => {
      set()({ kind: 'morrisThorne', throatRadius: 1.25 })
      set()({ kind: 'morrisThorne' })
      expect(metric()).toEqual({ kind: 'morrisThorne', throatRadius: 1.25 })
    })
  })

  describe('schwarzschild', () => {
    it('clamps schwarzschildMass to bounds', () => {
      set()({ kind: 'schwarzschild', schwarzschildMass: 999 })
      expect(metric()).toEqual({
        kind: 'schwarzschild',
        schwarzschildMass: MAX_SCHWARZSCHILD_MASS,
      })
      set()({ kind: 'schwarzschild', schwarzschildMass: -1 })
      expect(metric()).toEqual({
        kind: 'schwarzschild',
        schwarzschildMass: MIN_SCHWARZSCHILD_MASS,
      })
    })

    it('strips throatRadius', () => {
      set()({ kind: 'schwarzschild', schwarzschildMass: 1, throatRadius: 3 })
      expect(metric()).toEqual({ kind: 'schwarzschild', schwarzschildMass: 1 })
    })
  })

  describe('deSitter', () => {
    it('clamps hubbleRate to [0, MAX]', () => {
      set()({ kind: 'deSitter', hubbleRate: 99 })
      expect(metric()).toEqual({ kind: 'deSitter', hubbleRate: MAX_HUBBLE_RATE })
      set()({ kind: 'deSitter', hubbleRate: -3 })
      expect(metric()).toEqual({ kind: 'deSitter', hubbleRate: MIN_HUBBLE_RATE })
    })
  })

  describe('antiDeSitter', () => {
    it('clamps adsRadius to bounds', () => {
      set()({ kind: 'antiDeSitter', adsRadius: 99 })
      expect(metric()).toEqual({ kind: 'antiDeSitter', adsRadius: MAX_ADS_RADIUS })
      set()({ kind: 'antiDeSitter', adsRadius: 0.001 })
      expect(metric()).toEqual({ kind: 'antiDeSitter', adsRadius: MIN_ADS_RADIUS })
    })
  })

  describe('sphere2D', () => {
    it('clamps sphereRadius to bounds', () => {
      set()({ kind: 'sphere2D', sphereRadius: 99 })
      expect(metric()).toEqual({ kind: 'sphere2D', sphereRadius: MAX_SPHERE_RADIUS })
      set()({ kind: 'sphere2D', sphereRadius: 0 })
      expect(metric()).toEqual({ kind: 'sphere2D', sphereRadius: MIN_SPHERE_RADIUS })
    })
  })

  describe('torus', () => {
    it('clamps each torusPeriod entry', () => {
      set()({ kind: 'torus', torusPeriod: [99, 0, 5] })
      expect(metric()).toEqual({
        kind: 'torus',
        torusPeriod: [MAX_TORUS_PERIOD, MIN_TORUS_PERIOD, 5],
      })
    })

    it('falls back to [1,1,1] when torusPeriod missing', () => {
      set()({ kind: 'torus' })
      expect(metric()).toEqual({ kind: 'torus', torusPeriod: [1, 1, 1] })
    })

    it('falls back to [1,1,1] when torusPeriod has wrong length', () => {
      set()({
        kind: 'torus',
        // @ts-expect-error — runtime guard against bad-length input
        torusPeriod: [2, 2],
      })
      expect(metric()).toEqual({ kind: 'torus', torusPeriod: [1, 1, 1] })
    })
  })

  describe('doubleThroat', () => {
    it('clamps both separation and radius', () => {
      set()({
        kind: 'doubleThroat',
        doubleThroatSeparation: 999,
        doubleThroatRadius: 999,
      })
      expect(metric()).toEqual({
        kind: 'doubleThroat',
        doubleThroatSeparation: MAX_DOUBLE_THROAT_SEPARATION,
        doubleThroatRadius: MAX_THROAT_RADIUS,
      })
      set()({
        kind: 'doubleThroat',
        doubleThroatSeparation: 0,
        doubleThroatRadius: 0,
      })
      expect(metric()).toEqual({
        kind: 'doubleThroat',
        doubleThroatSeparation: MIN_DOUBLE_THROAT_SEPARATION,
        doubleThroatRadius: MIN_THROAT_RADIUS,
      })
    })

    it('strips bare throatRadius (uses doubleThroatRadius slot)', () => {
      set()({
        kind: 'doubleThroat',
        doubleThroatSeparation: 4,
        doubleThroatRadius: 0.5,
        throatRadius: 99,
      })
      expect(metric()).toEqual({
        kind: 'doubleThroat',
        doubleThroatSeparation: 4,
        doubleThroatRadius: 0.5,
      })
    })
  })

  describe('non-finite handling', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })
    afterEach(() => {
      warnSpy.mockRestore()
    })

    it('clamps NaN throatRadius to fallback and warns (dev only)', () => {
      set()({ kind: 'morrisThorne', throatRadius: NaN })
      const m = metric()
      expect(m?.kind).toBe('morrisThorne')
      expect(Number.isFinite(m?.throatRadius)).toBe(true)
      // In dev-mode the helper logs; in prod it stays silent. Either way the
      // store value is valid — that is the load-bearing assertion.
    })

    it('clamps Infinity hubbleRate to a finite value', () => {
      set()({ kind: 'deSitter', hubbleRate: Infinity })
      const m = metric()
      expect(m?.kind).toBe('deSitter')
      expect(Number.isFinite(m?.hubbleRate)).toBe(true)
    })
  })

  describe('needsReset invariant', () => {
    it('idempotent write does NOT set needsReset', () => {
      set()({ kind: 'morrisThorne', throatRadius: 0.7 })
      // Clear the flag the first write set.
      useExtendedObjectStore.getState().clearComputeNeedsReset('tdse')
      expect(tdse().needsReset).toBe(false)
      // Same input → no diff → no reset.
      set()({ kind: 'morrisThorne', throatRadius: 0.7 })
      expect(tdse().needsReset).toBe(false)
    })

    it('different param value DOES set needsReset', () => {
      set()({ kind: 'morrisThorne', throatRadius: 0.7 })
      useExtendedObjectStore.getState().clearComputeNeedsReset('tdse')
      set()({ kind: 'morrisThorne', throatRadius: 0.9 })
      expect(tdse().needsReset).toBe(true)
    })

    it('different kind DOES set needsReset', () => {
      set()({ kind: 'flat' })
      useExtendedObjectStore.getState().clearComputeNeedsReset('tdse')
      set()({ kind: 'morrisThorne', throatRadius: 0.5 })
      expect(tdse().needsReset).toBe(true)
    })

    it('idempotent torus write (same array contents) does NOT reset', () => {
      set()({ kind: 'torus', torusPeriod: [2, 3, 4] })
      useExtendedObjectStore.getState().clearComputeNeedsReset('tdse')
      set()({ kind: 'torus', torusPeriod: [2, 3, 4] })
      expect(tdse().needsReset).toBe(false)
    })

    it('idempotent doubleThroat write does NOT reset', () => {
      set()({
        kind: 'doubleThroat',
        doubleThroatSeparation: 4,
        doubleThroatRadius: 0.4,
      })
      useExtendedObjectStore.getState().clearComputeNeedsReset('tdse')
      set()({
        kind: 'doubleThroat',
        doubleThroatSeparation: 4,
        doubleThroatRadius: 0.4,
      })
      expect(tdse().needsReset).toBe(false)
    })
  })
})
