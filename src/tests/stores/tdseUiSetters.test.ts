/**
 * Tests for TDSE UI, diagnostic, absorber, and disorder setters.
 *
 * Validates clamping, non-finite rejection, and state transitions
 * for configuration flags and clamped numeric parameters.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('TDSE UI setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  const getTdse = () => useExtendedObjectStore.getState().schroedinger.tdse

  describe('setTdseAbsorberEnabled', () => {
    it('enables absorber', () => {
      useExtendedObjectStore.getState().setTdseAbsorberEnabled(true)
      expect(getTdse().absorberEnabled).toBe(true)
    })

    it('disables absorber', () => {
      useExtendedObjectStore.getState().setTdseAbsorberEnabled(true)
      useExtendedObjectStore.getState().setTdseAbsorberEnabled(false)
      expect(getTdse().absorberEnabled).toBe(false)
    })
  })

  describe('setTdseAbsorberWidth', () => {
    it('sets absorber width within valid range', () => {
      useExtendedObjectStore.getState().setTdseAbsorberWidth(0.2)
      expect(getTdse().absorberWidth).toBe(0.2)
    })

    it('clamps to [0.05, 0.5]', () => {
      useExtendedObjectStore.getState().setTdseAbsorberWidth(0.01)
      expect(getTdse().absorberWidth).toBe(0.05)
      useExtendedObjectStore.getState().setTdseAbsorberWidth(1.0)
      expect(getTdse().absorberWidth).toBe(0.5)
    })

    it('rejects NaN', () => {
      useExtendedObjectStore.getState().setTdseAbsorberWidth(0.2)
      useExtendedObjectStore.getState().setTdseAbsorberWidth(NaN)
      expect(getTdse().absorberWidth).toBe(0.2)
    })
  })

  describe('setTdsePmlTargetReflection', () => {
    it('sets PML target reflection', () => {
      useExtendedObjectStore.getState().setTdsePmlTargetReflection(1e-6)
      expect(getTdse().pmlTargetReflection).toBe(1e-6)
    })

    it('clamps to [1e-12, 0.999]', () => {
      useExtendedObjectStore.getState().setTdsePmlTargetReflection(0)
      expect(getTdse().pmlTargetReflection).toBe(1e-12)
      useExtendedObjectStore.getState().setTdsePmlTargetReflection(1.5)
      expect(getTdse().pmlTargetReflection).toBe(0.999)
    })

    it('rejects Infinity', () => {
      useExtendedObjectStore.getState().setTdsePmlTargetReflection(1e-6)
      useExtendedObjectStore.getState().setTdsePmlTargetReflection(Infinity)
      expect(getTdse().pmlTargetReflection).toBe(1e-6)
    })
  })

  describe('setTdseFieldView', () => {
    it('sets field view to density', () => {
      useExtendedObjectStore.getState().setTdseFieldView('density')
      expect(getTdse().fieldView).toBe('density')
    })

    it('sets field view to phase', () => {
      useExtendedObjectStore.getState().setTdseFieldView('phase')
      expect(getTdse().fieldView).toBe('phase')
    })

    it('sets field view to quantum pressure', () => {
      useExtendedObjectStore.getState().setTdseFieldView('quantumPressure')
      expect(getTdse().fieldView).toBe('quantumPressure')
    })
  })

  describe('boolean toggle setters', () => {
    it('toggles autoScale', () => {
      useExtendedObjectStore.getState().setTdseAutoScale(true)
      expect(getTdse().autoScale).toBe(true)
      useExtendedObjectStore.getState().setTdseAutoScale(false)
      expect(getTdse().autoScale).toBe(false)
    })

    it('toggles showPotential', () => {
      useExtendedObjectStore.getState().setTdseShowPotential(true)
      expect(getTdse().showPotential).toBe(true)
    })

    it('toggles autoLoop', () => {
      useExtendedObjectStore.getState().setTdseAutoLoop(true)
      expect(getTdse().autoLoop).toBe(true)
    })

    it('toggles diagnosticsEnabled', () => {
      useExtendedObjectStore.getState().setTdseDiagnosticsEnabled(true)
      expect(getTdse().diagnosticsEnabled).toBe(true)
    })

    it('toggles observablesEnabled', () => {
      useExtendedObjectStore.getState().setTdseObservablesEnabled(true)
      expect(getTdse().observablesEnabled).toBe(true)
    })

    it('toggles imaginaryTimeEnabled', () => {
      useExtendedObjectStore.getState().setTdseImaginaryTimeEnabled(true)
      expect(getTdse().imaginaryTimeEnabled).toBe(true)
    })
  })

  describe('setTdseDiagnosticsInterval', () => {
    it('sets interval within range', () => {
      useExtendedObjectStore.getState().setTdseDiagnosticsInterval(10)
      expect(getTdse().diagnosticsInterval).toBe(10)
    })

    it('clamps to [1, 60] and floors', () => {
      useExtendedObjectStore.getState().setTdseDiagnosticsInterval(0)
      expect(getTdse().diagnosticsInterval).toBe(1)
      useExtendedObjectStore.getState().setTdseDiagnosticsInterval(100)
      expect(getTdse().diagnosticsInterval).toBe(60)
      useExtendedObjectStore.getState().setTdseDiagnosticsInterval(5.7)
      expect(getTdse().diagnosticsInterval).toBe(5)
    })

    it('rejects NaN', () => {
      useExtendedObjectStore.getState().setTdseDiagnosticsInterval(10)
      useExtendedObjectStore.getState().setTdseDiagnosticsInterval(NaN)
      expect(getTdse().diagnosticsInterval).toBe(10)
    })
  })

  describe('setTdseDisorderSeed', () => {
    it('sets seed as floored non-negative integer', () => {
      useExtendedObjectStore.getState().setTdseDisorderSeed(42)
      expect(getTdse().disorderSeed).toBe(42)
    })

    it('floors fractional seed and clamps negative to 0', () => {
      useExtendedObjectStore.getState().setTdseDisorderSeed(42.9)
      expect(getTdse().disorderSeed).toBe(42)
      useExtendedObjectStore.getState().setTdseDisorderSeed(-5)
      expect(getTdse().disorderSeed).toBe(0)
    })
  })

  describe('setTdseDisorderDistribution', () => {
    it('sets disorder distribution', () => {
      useExtendedObjectStore.getState().setTdseDisorderDistribution('gaussian')
      expect(getTdse().disorderDistribution).toBe('gaussian')
    })
  })

  describe('setTdseCustomPotentialExpression', () => {
    it('sets custom potential expression', () => {
      useExtendedObjectStore.getState().setTdseCustomPotentialExpression('x^2 + y^2')
      expect(getTdse().customPotentialExpression).toBe('x^2 + y^2')
    })

    it('accepts empty string', () => {
      useExtendedObjectStore.getState().setTdseCustomPotentialExpression('x^2')
      useExtendedObjectStore.getState().setTdseCustomPotentialExpression('')
      expect(getTdse().customPotentialExpression).toBe('')
    })
  })
})
