/**
 * Tests for Hydrogen ND store actions in schroedingerSlice
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { HYDROGEN_ND_PRESETS } from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('Hydrogen ND Store Actions', () => {
  beforeEach(() => {
    // Reset store to default state before each test
    useExtendedObjectStore.setState({
      schroedinger: {
        ...useExtendedObjectStore.getState().schroedinger,
        quantumMode: 'harmonicOscillator',
        hydrogenNDPreset: '2pz_4d',
        principalQuantumNumber: 2,
        azimuthalQuantumNumber: 1,
        magneticQuantumNumber: 0,
        useRealOrbitals: true,
        bohrRadiusScale: 1.0,
        extraDimQuantumNumbers: [0, 0, 0, 0, 0, 0, 0, 0],
        extraDimOmega: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
        extraDimFrequencySpread: 0,
      },
    })
  })

  describe('setSchroedingerQuantumMode', () => {
    it('should switch to hydrogen ND mode', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerQuantumMode('hydrogenND')

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.quantumMode).toBe('hydrogenND')
    })

    it('should switch between both supported modes', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerQuantumMode('hydrogenND')
      expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('hydrogenND')

      store.setSchroedingerQuantumMode('harmonicOscillator')
      expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('harmonicOscillator')
    })
  })

  describe('setSchroedingerHydrogenNDPreset', () => {
    it('should update all parameters from preset', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerHydrogenNDPreset('3dz2_6d')

      const config = useExtendedObjectStore.getState().schroedinger
      const preset = HYDROGEN_ND_PRESETS['3dz2_6d']

      expect(config.hydrogenNDPreset).toBe('3dz2_6d')
      expect(config.principalQuantumNumber).toBe(preset.n)
      expect(config.azimuthalQuantumNumber).toBe(preset.l)
      expect(config.magneticQuantumNumber).toBe(preset.m)
      expect(config.useRealOrbitals).toBe(preset.useReal)
      expect(config.bohrRadiusScale).toBe(preset.bohrRadiusScale)
      expect(config.extraDimQuantumNumbers).toEqual(preset.extraDimN)
      expect(config.extraDimOmega).toEqual(preset.extraDimOmega)
    })

    it('should not update parameters when selecting custom', () => {
      const store = useExtendedObjectStore.getState()

      // First set specific values
      store.setSchroedingerHydrogenNDPreset('2pz_4d')
      store.setSchroedingerPrincipalQuantumNumber(4)
      store.setSchroedingerExtraDimQuantumNumber(0, 3)

      // Now switch to custom - should preserve values
      store.setSchroedingerHydrogenNDPreset('custom')

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.hydrogenNDPreset).toBe('custom')
      expect(config.principalQuantumNumber).toBe(4)
      expect(config.extraDimQuantumNumbers[0]).toBe(3)
    })

    it('should apply all 4D presets correctly', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerHydrogenNDPreset('2pz_4d')
      expect(useExtendedObjectStore.getState().schroedinger.principalQuantumNumber).toBe(2)
      expect(useExtendedObjectStore.getState().schroedinger.azimuthalQuantumNumber).toBe(1)

      store.setSchroedingerHydrogenNDPreset('3dz2_4d')
      expect(useExtendedObjectStore.getState().schroedinger.principalQuantumNumber).toBe(3)
      expect(useExtendedObjectStore.getState().schroedinger.azimuthalQuantumNumber).toBe(2)
    })
  })

  describe('setSchroedingerExtraDimQuantumNumber', () => {
    it('should update a single extra dimension quantum number', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerExtraDimQuantumNumber(0, 3)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.extraDimQuantumNumbers[0]).toBe(3)
    })

    it('should clamp quantum number to valid range (0-6)', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerExtraDimQuantumNumber(0, -1)
      expect(useExtendedObjectStore.getState().schroedinger.extraDimQuantumNumbers[0]).toBe(0)

      store.setSchroedingerExtraDimQuantumNumber(0, 10)
      expect(useExtendedObjectStore.getState().schroedinger.extraDimQuantumNumbers[0]).toBe(6)
    })

    it('should update multiple dimensions independently', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerExtraDimQuantumNumber(0, 1)
      store.setSchroedingerExtraDimQuantumNumber(1, 2)
      store.setSchroedingerExtraDimQuantumNumber(2, 3)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.extraDimQuantumNumbers[0]).toBe(1)
      expect(config.extraDimQuantumNumbers[1]).toBe(2)
      expect(config.extraDimQuantumNumbers[2]).toBe(3)
    })

    it('should switch preset to custom when changing quantum number', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerHydrogenNDPreset('2pz_4d')
      store.setSchroedingerExtraDimQuantumNumber(0, 2)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.hydrogenNDPreset).toBe('custom')
    })

    it('should handle all 8 extra dimensions', () => {
      const store = useExtendedObjectStore.getState()

      for (let i = 0; i < 8; i++) {
        store.setSchroedingerExtraDimQuantumNumber(i, i)
      }

      const config = useExtendedObjectStore.getState().schroedinger
      for (let i = 0; i < 8; i++) {
        // Values are clamped to [0, 6], so check accordingly
        expect(config.extraDimQuantumNumbers[i]).toBe(Math.min(i, 6))
      }
    })
  })

  describe('setSchroedingerExtraDimQuantumNumbers', () => {
    it('should update all extra dimension quantum numbers at once', () => {
      const store = useExtendedObjectStore.getState()
      const newNumbers = [1, 2, 3, 4, 5, 6, 6, 6]

      store.setSchroedingerExtraDimQuantumNumbers(newNumbers)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.extraDimQuantumNumbers).toEqual(newNumbers)
    })

    it('should switch preset to custom when setting all quantum numbers', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerHydrogenNDPreset('2pz_4d')
      store.setSchroedingerExtraDimQuantumNumbers([1, 1, 1, 1, 1, 1, 1, 1])

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.hydrogenNDPreset).toBe('custom')
    })
  })

  describe('setSchroedingerExtraDimFrequencySpread', () => {
    it('should update extra dimension frequency spread', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerExtraDimFrequencySpread(0.25)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.extraDimFrequencySpread).toBe(0.25)
    })

    it('should clamp frequency spread to valid range (0-0.5)', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerExtraDimFrequencySpread(-0.1)
      expect(useExtendedObjectStore.getState().schroedinger.extraDimFrequencySpread).toBe(0)

      store.setSchroedingerExtraDimFrequencySpread(1.0)
      expect(useExtendedObjectStore.getState().schroedinger.extraDimFrequencySpread).toBe(0.5)
    })
  })

  describe('Edge Cases', () => {
    it('should preserve hydrogen ND state when switching modes', () => {
      const store = useExtendedObjectStore.getState()

      // Set up hydrogen ND state
      store.setSchroedingerQuantumMode('hydrogenND')
      store.setSchroedingerHydrogenNDPreset('3dz2_6d')
      store.setSchroedingerExtraDimQuantumNumber(0, 3)

      // Switch to harmonic oscillator
      store.setSchroedingerQuantumMode('harmonicOscillator')

      // Verify mode changed
      expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('harmonicOscillator')

      // Switch back to hydrogen ND
      store.setSchroedingerQuantumMode('hydrogenND')

      // Verify hydrogen ND state was preserved
      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.quantumMode).toBe('hydrogenND')
      expect(config.extraDimQuantumNumbers[0]).toBe(3)
    })

    it('should handle hydrogen ND presets with non-zero extra dim quantum numbers', () => {
      const store = useExtendedObjectStore.getState()

      // Some presets have non-zero extra dimension quantum numbers
      store.setSchroedingerHydrogenNDPreset('2pz_5d')

      const config = useExtendedObjectStore.getState().schroedinger
      const preset = HYDROGEN_ND_PRESETS['2pz_5d']

      // Verify extra dim quantum numbers match preset
      expect(config.extraDimQuantumNumbers).toEqual(preset.extraDimN)
    })

    it('should handle maximum extra dimension quantum numbers', () => {
      const store = useExtendedObjectStore.getState()

      // Set all extra dims to maximum (6)
      for (let i = 0; i < 8; i++) {
        store.setSchroedingerExtraDimQuantumNumber(i, 6)
      }

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.extraDimQuantumNumbers).toEqual([6, 6, 6, 6, 6, 6, 6, 6])
    })

    it('should handle ground state extra dimensions (all zeros)', () => {
      const store = useExtendedObjectStore.getState()

      // Set all extra dims to ground state (0)
      store.setSchroedingerExtraDimQuantumNumbers([0, 0, 0, 0, 0, 0, 0, 0])

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.extraDimQuantumNumbers).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    })
  })

  describe('3D Quantum Numbers with Hydrogen ND', () => {
    it('should update 3D quantum numbers independently in hydrogen ND mode', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerQuantumMode('hydrogenND')
      store.setSchroedingerPrincipalQuantumNumber(4)
      store.setSchroedingerAzimuthalQuantumNumber(2)
      store.setSchroedingerMagneticQuantumNumber(1)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.principalQuantumNumber).toBe(4)
      expect(config.azimuthalQuantumNumber).toBe(2)
      expect(config.magneticQuantumNumber).toBe(1)
    })

    it('should apply 3D quantum number constraints in hydrogen ND mode', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerQuantumMode('hydrogenND')

      // Set high values first
      store.setSchroedingerPrincipalQuantumNumber(5)
      store.setSchroedingerAzimuthalQuantumNumber(4)
      store.setSchroedingerMagneticQuantumNumber(4)

      // Reduce n, should cascade constraints
      store.setSchroedingerPrincipalQuantumNumber(2)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.principalQuantumNumber).toBe(2)
      expect(config.azimuthalQuantumNumber).toBeLessThanOrEqual(1) // l < n
      expect(Math.abs(config.magneticQuantumNumber)).toBeLessThanOrEqual(
        config.azimuthalQuantumNumber
      ) // |m| <= l
    })
  })

  describe('quantum number constraint cascading', () => {
    it('n=1 forces l=0 and m=0 regardless of prior state', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerPrincipalQuantumNumber(5)
      store.setSchroedingerAzimuthalQuantumNumber(4)
      store.setSchroedingerMagneticQuantumNumber(-3)

      store.setSchroedingerPrincipalQuantumNumber(1)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.principalQuantumNumber).toBe(1)
      expect(config.azimuthalQuantumNumber).toBe(0) // l < n=1, so l=0
      // When l=0, m is clamped to 0 (setter normalizes -0 to 0 via `|| 0`)
      expect(config.magneticQuantumNumber).toBe(0) // |m| <= l=0, so m=0
    })

    it('setting l directly respects l < n constraint', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerPrincipalQuantumNumber(3)

      // Try to set l = n (should clamp to n-1)
      store.setSchroedingerAzimuthalQuantumNumber(3)
      expect(useExtendedObjectStore.getState().schroedinger.azimuthalQuantumNumber).toBe(2)

      // Try to set l > n (should clamp to n-1)
      store.setSchroedingerAzimuthalQuantumNumber(10)
      expect(useExtendedObjectStore.getState().schroedinger.azimuthalQuantumNumber).toBe(2)
    })

    it('reducing l cascades to clamp m', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerPrincipalQuantumNumber(5)
      store.setSchroedingerAzimuthalQuantumNumber(4)
      store.setSchroedingerMagneticQuantumNumber(3) // valid: |3| <= 4

      // Reduce l to 2 — m=3 violates |m| <= l=2
      store.setSchroedingerAzimuthalQuantumNumber(2)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.azimuthalQuantumNumber).toBe(2)
      expect(config.magneticQuantumNumber).toBe(2) // clamped from 3 to l=2
    })

    it('negative m is preserved when within bounds', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerPrincipalQuantumNumber(4)
      store.setSchroedingerAzimuthalQuantumNumber(3)
      store.setSchroedingerMagneticQuantumNumber(-2)

      expect(useExtendedObjectStore.getState().schroedinger.magneticQuantumNumber).toBe(-2)
    })

    it('negative m is clamped to -l when l decreases', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerPrincipalQuantumNumber(5)
      store.setSchroedingerAzimuthalQuantumNumber(4)
      store.setSchroedingerMagneticQuantumNumber(-4) // valid: |-4| <= 4

      // Reduce l to 1 — m=-4 violates |m| <= l=1
      store.setSchroedingerAzimuthalQuantumNumber(1)

      expect(useExtendedObjectStore.getState().schroedinger.magneticQuantumNumber).toBe(-1) // clamped to -l
    })

    it('m boundary values +l and -l are accepted', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerPrincipalQuantumNumber(4)
      store.setSchroedingerAzimuthalQuantumNumber(3)

      store.setSchroedingerMagneticQuantumNumber(3)
      expect(useExtendedObjectStore.getState().schroedinger.magneticQuantumNumber).toBe(3)

      store.setSchroedingerMagneticQuantumNumber(-3)
      expect(useExtendedObjectStore.getState().schroedinger.magneticQuantumNumber).toBe(-3)
    })

    it('m beyond +l is clamped to l', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerPrincipalQuantumNumber(4)
      store.setSchroedingerAzimuthalQuantumNumber(2)

      store.setSchroedingerMagneticQuantumNumber(5)
      expect(useExtendedObjectStore.getState().schroedinger.magneticQuantumNumber).toBe(2)
    })

    it('fractional quantum numbers are floored', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerPrincipalQuantumNumber(3.7)
      expect(useExtendedObjectStore.getState().schroedinger.principalQuantumNumber).toBe(3)

      store.setSchroedingerAzimuthalQuantumNumber(1.9)
      expect(useExtendedObjectStore.getState().schroedinger.azimuthalQuantumNumber).toBe(1)

      // floor(-0.5) = -1, clamped to max(-l, min(l, -1)) with l=1 -> -1
      store.setSchroedingerMagneticQuantumNumber(-0.5)
      expect(useExtendedObjectStore.getState().schroedinger.magneticQuantumNumber).toBe(-1)
    })

    it('n=1, l=0: setting m to fractional near zero yields 0 (or -0)', () => {
      // When l=0, any m is clamped to 0. Setter normalizes -0 to 0 via `|| 0`.
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerPrincipalQuantumNumber(1)
      store.setSchroedingerMagneticQuantumNumber(-0.5)
      const m = useExtendedObjectStore.getState().schroedinger.magneticQuantumNumber
      expect(m).toBe(0)
    })

    it('n is clamped to [1, 7] range', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerPrincipalQuantumNumber(0)
      expect(useExtendedObjectStore.getState().schroedinger.principalQuantumNumber).toBe(1)

      store.setSchroedingerPrincipalQuantumNumber(-5)
      expect(useExtendedObjectStore.getState().schroedinger.principalQuantumNumber).toBe(1)

      store.setSchroedingerPrincipalQuantumNumber(100)
      expect(useExtendedObjectStore.getState().schroedinger.principalQuantumNumber).toBe(7)
    })

    it('full cascade: n=7 -> l=6 -> m=-6, then n=2 cascades everything', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerPrincipalQuantumNumber(7)
      store.setSchroedingerAzimuthalQuantumNumber(6)
      store.setSchroedingerMagneticQuantumNumber(-6)

      // Reduce to n=2
      store.setSchroedingerPrincipalQuantumNumber(2)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.principalQuantumNumber).toBe(2)
      expect(config.azimuthalQuantumNumber).toBe(1) // clamped from 6 to n-1=1
      expect(config.magneticQuantumNumber).toBe(-1) // clamped from -6 to -l=-1
    })

    it('all quantum number setters switch preset to custom', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerHydrogenNDPreset('2pz_4d')
      expect(useExtendedObjectStore.getState().schroedinger.hydrogenNDPreset).toBe('2pz_4d')

      store.setSchroedingerPrincipalQuantumNumber(3)
      expect(useExtendedObjectStore.getState().schroedinger.hydrogenNDPreset).toBe('custom')

      // Re-apply preset, then change l
      store.setSchroedingerHydrogenNDPreset('2pz_4d')
      store.setSchroedingerAzimuthalQuantumNumber(0)
      expect(useExtendedObjectStore.getState().schroedinger.hydrogenNDPreset).toBe('custom')

      // Re-apply preset, then change m
      store.setSchroedingerHydrogenNDPreset('2pz_4d')
      store.setSchroedingerMagneticQuantumNumber(1)
      expect(useExtendedObjectStore.getState().schroedinger.hydrogenNDPreset).toBe('custom')
    })
  })

  describe('setSchroedingerPhaseAnimationEnabled', () => {
    it('should toggle phase animation', () => {
      const store = useExtendedObjectStore.getState()
      expect(store.schroedinger.phaseAnimationEnabled).toBe(false)

      store.setSchroedingerPhaseAnimationEnabled(true)
      expect(useExtendedObjectStore.getState().schroedinger.phaseAnimationEnabled).toBe(true)

      store.setSchroedingerPhaseAnimationEnabled(false)
      expect(useExtendedObjectStore.getState().schroedinger.phaseAnimationEnabled).toBe(false)
    })

    it('should preserve phase animation state when switching modes', () => {
      const store = useExtendedObjectStore.getState()

      // Enable phase animation in Hydrogen ND mode
      store.setSchroedingerQuantumMode('hydrogenND')
      store.setSchroedingerPhaseAnimationEnabled(true)

      // Switch to harmonic oscillator
      store.setSchroedingerQuantumMode('harmonicOscillator')

      // Switch back to hydrogen ND
      store.setSchroedingerQuantumMode('hydrogenND')

      // Phase animation should still be enabled
      expect(useExtendedObjectStore.getState().schroedinger.phaseAnimationEnabled).toBe(true)
    })
  })
})
