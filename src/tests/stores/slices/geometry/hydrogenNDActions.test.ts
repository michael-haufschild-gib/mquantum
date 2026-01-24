/**
 * Tests for Hydrogen ND store actions in schroedingerSlice
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { HYDROGEN_ND_PRESETS } from '@/lib/geometry/extended/schroedinger/hydrogenNDPresets'

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

    it('should switch between all three modes', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerQuantumMode('hydrogenND')
      expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('hydrogenND')

      store.setSchroedingerQuantumMode('hydrogenOrbital')
      expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('hydrogenOrbital')

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

    it('should maintain independence between hydrogen orbital and hydrogen ND presets', () => {
      const store = useExtendedObjectStore.getState()

      // Set hydrogen orbital preset
      store.setSchroedingerHydrogenPreset('3dxy')

      // Set hydrogen ND preset
      store.setSchroedingerHydrogenNDPreset('2pz_4d')

      const config = useExtendedObjectStore.getState().schroedinger

      // Both presets should be set independently
      expect(config.hydrogenPreset).toBe('3dxy')
      expect(config.hydrogenNDPreset).toBe('2pz_4d')
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
