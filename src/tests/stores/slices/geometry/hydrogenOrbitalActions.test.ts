/**
 * Tests for hydrogen orbital store actions in schroedingerSlice
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { HYDROGEN_ORBITAL_PRESETS } from '@/lib/geometry/extended/schroedinger/hydrogenPresets'

describe('Hydrogen Orbital Store Actions', () => {
  beforeEach(() => {
    // Reset store to default state before each test
    useExtendedObjectStore.setState({
      schroedinger: {
        ...useExtendedObjectStore.getState().schroedinger,
        quantumMode: 'harmonicOscillator',
        hydrogenPreset: '2pz',
        principalQuantumNumber: 2,
        azimuthalQuantumNumber: 1,
        magneticQuantumNumber: 0,
        useRealOrbitals: true,
        bohrRadiusScale: 1.0,
      },
    })
  })

  describe('setSchroedingerQuantumMode', () => {
    it('should switch to hydrogen orbital mode', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerQuantumMode('hydrogenOrbital')

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.quantumMode).toBe('hydrogenOrbital')
    })

    it('should switch back to harmonic oscillator mode', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerQuantumMode('hydrogenOrbital')
      store.setSchroedingerQuantumMode('harmonicOscillator')

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.quantumMode).toBe('harmonicOscillator')
    })
  })

  describe('setSchroedingerHydrogenPreset', () => {
    it('should update quantum numbers from preset', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerHydrogenPreset('3dxy')

      const config = useExtendedObjectStore.getState().schroedinger
      const preset = HYDROGEN_ORBITAL_PRESETS['3dxy']

      expect(config.hydrogenPreset).toBe('3dxy')
      expect(config.principalQuantumNumber).toBe(preset.n)
      expect(config.azimuthalQuantumNumber).toBe(preset.l)
      expect(config.magneticQuantumNumber).toBe(preset.m)
      expect(config.useRealOrbitals).toBe(preset.useReal)
      expect(config.bohrRadiusScale).toBe(preset.bohrRadiusScale)
    })

    it('should not update quantum numbers when selecting custom', () => {
      const store = useExtendedObjectStore.getState()

      // First set specific values
      store.setSchroedingerPrincipalQuantumNumber(4)
      store.setSchroedingerAzimuthalQuantumNumber(2)
      store.setSchroedingerMagneticQuantumNumber(1)

      // Now switch to custom - should preserve values
      store.setSchroedingerHydrogenPreset('custom')

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.hydrogenPreset).toBe('custom')
      expect(config.principalQuantumNumber).toBe(4)
      expect(config.azimuthalQuantumNumber).toBe(2)
      expect(config.magneticQuantumNumber).toBe(1)
    })
  })

  describe('setSchroedingerPrincipalQuantumNumber', () => {
    it('should update principal quantum number', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerPrincipalQuantumNumber(5)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.principalQuantumNumber).toBe(5)
    })

    it('should clamp n to valid range (1-7)', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerPrincipalQuantumNumber(0)
      expect(useExtendedObjectStore.getState().schroedinger.principalQuantumNumber).toBe(1)

      store.setSchroedingerPrincipalQuantumNumber(10)
      expect(useExtendedObjectStore.getState().schroedinger.principalQuantumNumber).toBe(7)
    })

    it('should reduce l if it exceeds new n-1', () => {
      const store = useExtendedObjectStore.getState()

      // Set l=2 (requires n>=3)
      store.setSchroedingerPrincipalQuantumNumber(3)
      store.setSchroedingerAzimuthalQuantumNumber(2)

      // Now reduce n to 2, l should be clamped to 1
      store.setSchroedingerPrincipalQuantumNumber(2)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.principalQuantumNumber).toBe(2)
      expect(config.azimuthalQuantumNumber).toBe(1)
    })

    it('should also reduce m if l is reduced', () => {
      const store = useExtendedObjectStore.getState()

      // Set up n=3, l=2, m=2
      store.setSchroedingerPrincipalQuantumNumber(3)
      store.setSchroedingerAzimuthalQuantumNumber(2)
      store.setSchroedingerMagneticQuantumNumber(2)

      // Now reduce n to 2 (max l=1, max |m|=1)
      store.setSchroedingerPrincipalQuantumNumber(2)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.principalQuantumNumber).toBe(2)
      expect(config.azimuthalQuantumNumber).toBe(1)
      expect(Math.abs(config.magneticQuantumNumber)).toBeLessThanOrEqual(1)
    })

    it('should switch preset to custom when changing n', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerHydrogenPreset('1s')
      store.setSchroedingerPrincipalQuantumNumber(3)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.hydrogenPreset).toBe('custom')
    })
  })

  describe('setSchroedingerAzimuthalQuantumNumber', () => {
    it('should update azimuthal quantum number', () => {
      const store = useExtendedObjectStore.getState()

      // n=2 allows l=0 or 1
      store.setSchroedingerPrincipalQuantumNumber(3)
      store.setSchroedingerAzimuthalQuantumNumber(2)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.azimuthalQuantumNumber).toBe(2)
    })

    it('should clamp l to valid range (0 to n-1)', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerPrincipalQuantumNumber(3)

      store.setSchroedingerAzimuthalQuantumNumber(-1)
      expect(useExtendedObjectStore.getState().schroedinger.azimuthalQuantumNumber).toBe(0)

      store.setSchroedingerAzimuthalQuantumNumber(5)
      expect(useExtendedObjectStore.getState().schroedinger.azimuthalQuantumNumber).toBe(2) // n-1
    })

    it('should reduce m if it exceeds new l', () => {
      const store = useExtendedObjectStore.getState()

      // Set up n=4, l=3, m=3
      store.setSchroedingerPrincipalQuantumNumber(4)
      store.setSchroedingerAzimuthalQuantumNumber(3)
      store.setSchroedingerMagneticQuantumNumber(3)

      // Now reduce l to 1 (max |m|=1)
      store.setSchroedingerAzimuthalQuantumNumber(1)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.azimuthalQuantumNumber).toBe(1)
      expect(Math.abs(config.magneticQuantumNumber)).toBeLessThanOrEqual(1)
    })
  })

  describe('setSchroedingerMagneticQuantumNumber', () => {
    it('should update magnetic quantum number', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerPrincipalQuantumNumber(3)
      store.setSchroedingerAzimuthalQuantumNumber(2)
      store.setSchroedingerMagneticQuantumNumber(-2)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.magneticQuantumNumber).toBe(-2)
    })

    it('should clamp m to valid range (-l to +l)', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerPrincipalQuantumNumber(3)
      store.setSchroedingerAzimuthalQuantumNumber(2)

      store.setSchroedingerMagneticQuantumNumber(5)
      expect(useExtendedObjectStore.getState().schroedinger.magneticQuantumNumber).toBe(2)

      store.setSchroedingerMagneticQuantumNumber(-5)
      expect(useExtendedObjectStore.getState().schroedinger.magneticQuantumNumber).toBe(-2)
    })
  })

  describe('setSchroedingerUseRealOrbitals', () => {
    it('should toggle real orbital mode', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerUseRealOrbitals(false)
      expect(useExtendedObjectStore.getState().schroedinger.useRealOrbitals).toBe(false)

      store.setSchroedingerUseRealOrbitals(true)
      expect(useExtendedObjectStore.getState().schroedinger.useRealOrbitals).toBe(true)
    })
  })

  describe('setSchroedingerBohrRadiusScale', () => {
    it('should update Bohr radius scale', () => {
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerBohrRadiusScale(2.5)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.bohrRadiusScale).toBe(2.5)
    })

    it('should clamp scale to valid range (0.5 to 3.0)', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerBohrRadiusScale(0.1)
      expect(useExtendedObjectStore.getState().schroedinger.bohrRadiusScale).toBe(0.5)

      store.setSchroedingerBohrRadiusScale(5.0)
      expect(useExtendedObjectStore.getState().schroedinger.bohrRadiusScale).toBe(3.0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle maximum quantum numbers (n=7, l=6, m=6)', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerPrincipalQuantumNumber(7)
      store.setSchroedingerAzimuthalQuantumNumber(6)
      store.setSchroedingerMagneticQuantumNumber(6)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.principalQuantumNumber).toBe(7)
      expect(config.azimuthalQuantumNumber).toBe(6)
      expect(config.magneticQuantumNumber).toBe(6)
    })

    it('should handle maximum negative m (n=7, l=6, m=-6)', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerPrincipalQuantumNumber(7)
      store.setSchroedingerAzimuthalQuantumNumber(6)
      store.setSchroedingerMagneticQuantumNumber(-6)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.magneticQuantumNumber).toBe(-6)
    })

    it('should preserve hydrogen state when switching modes', () => {
      const store = useExtendedObjectStore.getState()

      // Set up hydrogen state
      store.setSchroedingerQuantumMode('hydrogenOrbital')
      store.setSchroedingerPrincipalQuantumNumber(4)
      store.setSchroedingerAzimuthalQuantumNumber(2)
      store.setSchroedingerMagneticQuantumNumber(1)

      // Switch to harmonic oscillator
      store.setSchroedingerQuantumMode('harmonicOscillator')

      // Verify mode changed
      expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('harmonicOscillator')

      // Switch back to hydrogen
      store.setSchroedingerQuantumMode('hydrogenOrbital')

      // Verify hydrogen state was preserved
      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.quantumMode).toBe('hydrogenOrbital')
      expect(config.principalQuantumNumber).toBe(4)
      expect(config.azimuthalQuantumNumber).toBe(2)
      expect(config.magneticQuantumNumber).toBe(1)
    })

    it('should handle ground state (n=1, l=0, m=0)', () => {
      const store = useExtendedObjectStore.getState()

      store.setSchroedingerPrincipalQuantumNumber(1)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.principalQuantumNumber).toBe(1)
      expect(config.azimuthalQuantumNumber).toBe(0) // l must be 0 when n=1
      expect(config.magneticQuantumNumber).toBe(0) // m must be 0 when l=0
    })

    it('should cascade constraints when setting n=1 from higher state', () => {
      const store = useExtendedObjectStore.getState()

      // Start with high quantum numbers
      store.setSchroedingerPrincipalQuantumNumber(5)
      store.setSchroedingerAzimuthalQuantumNumber(4)
      store.setSchroedingerMagneticQuantumNumber(4)

      // Drop to n=1, which must force l=0 and m=0
      store.setSchroedingerPrincipalQuantumNumber(1)

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.principalQuantumNumber).toBe(1)
      expect(config.azimuthalQuantumNumber).toBe(0)
      expect(config.magneticQuantumNumber).toBe(0)
    })
  })
})
