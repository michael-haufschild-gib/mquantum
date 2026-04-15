/**
 * Tests for Wheeler–DeWitt setters on the schroedinger slice.
 *
 * Focuses on the render-only animation-effect setters added for the phase
 * rotation + semiclassical worldline features. The critical invariant is
 * that these setters write their value but DO NOT flip `needsReset` — the
 * solver output is unaffected by visual-only effects and must not re-run
 * when the user toggles or scrubs them.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

const getWdw = () => useExtendedObjectStore.getState().schroedinger.wheelerDeWitt

describe('wheelerDeWittSetters — render-only animation effects', () => {
  beforeEach(() => {
    // Restore defaults, then clear `needsReset` so a setter-induced flip is
    // observable as a transition from false → true (any render-only setter
    // must NOT flip it, so we expect false after calling each one).
    useExtendedObjectStore.getState().reset()
    useExtendedObjectStore.getState().clearWdwNeedsReset()
    expect(getWdw().needsReset).toBe(false)
  })

  describe('setWdwPhaseRotationEnabled', () => {
    it('writes the boolean and does not flip needsReset', () => {
      useExtendedObjectStore.getState().setWdwPhaseRotationEnabled(true)
      expect(getWdw().phaseRotationEnabled).toBe(true)
      expect(getWdw().needsReset).toBe(false)

      useExtendedObjectStore.getState().setWdwPhaseRotationEnabled(false)
      expect(getWdw().phaseRotationEnabled).toBe(false)
      expect(getWdw().needsReset).toBe(false)
    })
  })

  describe('setWdwPhaseRotationSpeed', () => {
    it('writes the value, clamps to [0, 5], and does not flip needsReset', () => {
      useExtendedObjectStore.getState().setWdwPhaseRotationSpeed(2.5)
      expect(getWdw().phaseRotationSpeed).toBe(2.5)
      expect(getWdw().needsReset).toBe(false)

      useExtendedObjectStore.getState().setWdwPhaseRotationSpeed(99)
      expect(getWdw().phaseRotationSpeed).toBe(5)
      expect(getWdw().needsReset).toBe(false)

      useExtendedObjectStore.getState().setWdwPhaseRotationSpeed(-10)
      expect(getWdw().phaseRotationSpeed).toBe(0)
      expect(getWdw().needsReset).toBe(false)
    })
  })

  describe('setWdwWorldlineEnabled', () => {
    it('writes the boolean and does not flip needsReset', () => {
      useExtendedObjectStore.getState().setWdwWorldlineEnabled(true)
      expect(getWdw().worldlineEnabled).toBe(true)
      expect(getWdw().needsReset).toBe(false)
    })
  })

  describe('setWdwWorldlineSpeed', () => {
    it('writes the value, clamps to [0.1, 3], and does not flip needsReset', () => {
      useExtendedObjectStore.getState().setWdwWorldlineSpeed(1.2)
      expect(getWdw().worldlineSpeed).toBe(1.2)
      expect(getWdw().needsReset).toBe(false)

      useExtendedObjectStore.getState().setWdwWorldlineSpeed(99)
      expect(getWdw().worldlineSpeed).toBe(3)
      expect(getWdw().needsReset).toBe(false)

      useExtendedObjectStore.getState().setWdwWorldlineSpeed(0)
      expect(getWdw().worldlineSpeed).toBe(0.1)
      expect(getWdw().needsReset).toBe(false)
    })
  })

  describe('setWdwWorldlinePulseWidth', () => {
    it('writes the value, clamps to [0.02, 0.3], and does not flip needsReset', () => {
      useExtendedObjectStore.getState().setWdwWorldlinePulseWidth(0.15)
      expect(getWdw().worldlinePulseWidth).toBe(0.15)
      expect(getWdw().needsReset).toBe(false)

      useExtendedObjectStore.getState().setWdwWorldlinePulseWidth(99)
      expect(getWdw().worldlinePulseWidth).toBe(0.3)
      expect(getWdw().needsReset).toBe(false)

      useExtendedObjectStore.getState().setWdwWorldlinePulseWidth(0)
      expect(getWdw().worldlinePulseWidth).toBe(0.02)
      expect(getWdw().needsReset).toBe(false)
    })
  })

  describe('setWdwStreamlinesEnabled — display-only, no solver re-run', () => {
    it('writes the toggle without flipping needsReset', () => {
      const initial = getWdw().streamlinesEnabled
      useExtendedObjectStore.getState().setWdwStreamlinesEnabled(!initial)
      expect(getWdw().streamlinesEnabled).toBe(!initial)
      expect(getWdw().needsReset).toBe(false)
    })
  })

  describe('setWdwStreamlineDensity — display-only, no solver re-run', () => {
    it('clamps to [2, 16], rounds to int, and does not flip needsReset', () => {
      useExtendedObjectStore.getState().setWdwStreamlineDensity(7.4)
      expect(getWdw().streamlineDensity).toBe(7)
      expect(getWdw().needsReset).toBe(false)

      useExtendedObjectStore.getState().setWdwStreamlineDensity(99)
      expect(getWdw().streamlineDensity).toBe(16)
      expect(getWdw().needsReset).toBe(false)

      useExtendedObjectStore.getState().setWdwStreamlineDensity(0)
      expect(getWdw().streamlineDensity).toBe(2)
      expect(getWdw().needsReset).toBe(false)
    })
  })

  describe('setWdwGridSize — preset-driven physics setter', () => {
    it('applies the Low preset and flips needsReset', () => {
      useExtendedObjectStore.getState().setWdwGridSize('low')
      const wdw = getWdw()
      expect(wdw.gridNa).toBe(64)
      expect(wdw.gridNphi).toBe(16)
      expect(wdw.needsReset).toBe(true)
    })

    it('applies the High preset', () => {
      useExtendedObjectStore.getState().setWdwGridSize('high')
      const wdw = getWdw()
      expect(wdw.gridNa).toBe(192)
      expect(wdw.gridNphi).toBe(32)
    })
  })

  describe('contrast: existing physics setters still flip needsReset', () => {
    it('setWdwInflatonMass (physics) flips needsReset — regression guard for the withReset split', () => {
      useExtendedObjectStore.getState().setWdwInflatonMass(0.5)
      expect(getWdw().inflatonMass).toBe(0.5)
      expect(getWdw().needsReset).toBe(true)
    })
  })
})
