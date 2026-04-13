/**
 * Tests for freeScalarPreheatingSetters.
 *
 * Validates clamping, no-op guards, needsReset side-effects, and
 * non-finite rejection for the three parametric-resonance setters.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('freeScalarPreheatingSetters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  const getPreheating = () => useExtendedObjectStore.getState().schroedinger.freeScalar.preheating
  const getFreeScalar = () => useExtendedObjectStore.getState().schroedinger.freeScalar

  // ── setFreeScalarPreheatingEnabled ─────────────────────────────────────

  describe('setFreeScalarPreheatingEnabled', () => {
    it('toggles enabled from false to true and sets needsReset', () => {
      const s = useExtendedObjectStore.getState()
      expect(getPreheating().enabled).toBe(false)
      s.setFreeScalarPreheatingEnabled(true)
      expect(getPreheating().enabled).toBe(true)
      expect(getFreeScalar().needsReset).toBe(true)
    })

    it('toggles enabled from true to false and sets needsReset', () => {
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarPreheatingEnabled(true)
      // Clear needsReset manually to confirm the second toggle sets it again
      useExtendedObjectStore.setState((state) => ({
        ...state,
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, needsReset: false },
        },
      }))
      s.setFreeScalarPreheatingEnabled(false)
      expect(getPreheating().enabled).toBe(false)
      expect(getFreeScalar().needsReset).toBe(true)
    })

    it('is a no-op when called with the current value', () => {
      const s = useExtendedObjectStore.getState()
      const configBefore = useExtendedObjectStore.getState().schroedinger
      // Default is false, calling with false again should be a no-op
      s.setFreeScalarPreheatingEnabled(false)
      const configAfter = useExtendedObjectStore.getState().schroedinger
      expect(configAfter).toBe(configBefore)
    })
  })

  // ── setFreeScalarPreheatingAmplitude ───────────────────────────────────

  describe('setFreeScalarPreheatingAmplitude', () => {
    it('sets a valid amplitude within [0, 1]', () => {
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarPreheatingAmplitude(0.7)
      expect(getPreheating().amplitude).toBe(0.7)
    })

    it('clamps amplitude below 0 to 0', () => {
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarPreheatingAmplitude(-1)
      expect(getPreheating().amplitude).toBe(0)
    })

    it('clamps amplitude above 1 to 1', () => {
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarPreheatingAmplitude(5)
      expect(getPreheating().amplitude).toBe(1)
    })

    it('does NOT set needsReset (amplitude is continuously tunable)', () => {
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarPreheatingEnabled(true)
      useExtendedObjectStore.setState((state) => ({
        ...state,
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, needsReset: false },
        },
      }))
      s.setFreeScalarPreheatingAmplitude(0.5)
      expect(getFreeScalar().needsReset).toBe(false)
    })

    it('rejects NaN — amplitude unchanged', () => {
      const s = useExtendedObjectStore.getState()
      const before = getPreheating().amplitude
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      s.setFreeScalarPreheatingAmplitude(NaN)
      expect(getPreheating().amplitude).toBe(before)
      warnSpy.mockRestore()
    })

    it('rejects Infinity — amplitude unchanged', () => {
      const s = useExtendedObjectStore.getState()
      const before = getPreheating().amplitude
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      s.setFreeScalarPreheatingAmplitude(Infinity)
      expect(getPreheating().amplitude).toBe(before)
      warnSpy.mockRestore()
    })

    it('is a no-op when clamped value equals stored value', () => {
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarPreheatingAmplitude(0.3) // default
      const configAfterFirst = useExtendedObjectStore.getState().schroedinger
      s.setFreeScalarPreheatingAmplitude(0.3)
      expect(useExtendedObjectStore.getState().schroedinger).toBe(configAfterFirst)
    })
  })

  // ── setFreeScalarPreheatingFrequency ───────────────────────────────────

  describe('setFreeScalarPreheatingFrequency', () => {
    it('sets a valid frequency within [0.1, 10]', () => {
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarPreheatingFrequency(3.5)
      expect(getPreheating().frequency).toBe(3.5)
    })

    it('clamps frequency below 0.1 to 0.1', () => {
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarPreheatingFrequency(0)
      expect(getPreheating().frequency).toBe(0.1)
    })

    it('clamps frequency above 10 to 10', () => {
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarPreheatingFrequency(100)
      expect(getPreheating().frequency).toBe(10)
    })

    it('sets needsReset on frequency change', () => {
      const s = useExtendedObjectStore.getState()
      useExtendedObjectStore.setState((state) => ({
        ...state,
        schroedinger: {
          ...state.schroedinger,
          freeScalar: { ...state.schroedinger.freeScalar, needsReset: false },
        },
      }))
      s.setFreeScalarPreheatingFrequency(5.0)
      expect(getFreeScalar().needsReset).toBe(true)
    })

    it('rejects NaN — frequency unchanged', () => {
      const s = useExtendedObjectStore.getState()
      const before = getPreheating().frequency
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      s.setFreeScalarPreheatingFrequency(NaN)
      expect(getPreheating().frequency).toBe(before)
      warnSpy.mockRestore()
    })

    it('is a no-op when clamped value equals stored value', () => {
      const s = useExtendedObjectStore.getState()
      s.setFreeScalarPreheatingFrequency(2.0) // default
      const configAfterFirst = useExtendedObjectStore.getState().schroedinger
      s.setFreeScalarPreheatingFrequency(2.0)
      expect(useExtendedObjectStore.getState().schroedinger).toBe(configAfterFirst)
    })
  })
})
