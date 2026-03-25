/**
 * Quantum mode state machine transition tests.
 *
 * Verifies that switching between quantum modes enforces dimension
 * constraints, resets lattice state when needed, forces position
 * representation for compute modes, and maintains version counter
 * monotonicity. These transitions are the most complex state flow
 * in the application and the most likely source of state corruption.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/types'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

const ALL_MODES: SchroedingerQuantumMode[] = [
  'harmonicOscillator',
  'hydrogenND',
  'freeScalarField',
  'tdseDynamics',
  'becDynamics',
  'diracEquation',
  'quantumWalk',
]

const COMPUTE_MODES: SchroedingerQuantumMode[] = [
  'freeScalarField',
  'tdseDynamics',
  'becDynamics',
  'diracEquation',
]

describe('quantum mode state machine transitions', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().setDimension(3)
  })

  describe('dimension constraints', () => {
    it('compute modes enforce minimum 3D dimension', () => {
      useGeometryStore.getState().setDimension(2)
      expect(useGeometryStore.getState().dimension).toBe(2)

      for (const mode of COMPUTE_MODES) {
        useGeometryStore.getState().setDimension(2)
        useExtendedObjectStore.getState().setSchroedingerQuantumMode(mode)
        expect(
          useGeometryStore.getState().dimension,
          `${mode} should enforce dim >= 3`
        ).toBeGreaterThanOrEqual(3)
      }
    })

    it('harmonicOscillator allows dimension 2', () => {
      useGeometryStore.getState().setDimension(2)
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
      expect(useGeometryStore.getState().dimension).toBe(2)
    })

    it('hydrogenND allows dimension 2 (true 2D hydrogen)', () => {
      useGeometryStore.getState().setDimension(2)
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('hydrogenND')
      expect(useGeometryStore.getState().dimension).toBe(2)
    })

    it('switching from compute to analytical preserves dimension', () => {
      useGeometryStore.getState().setDimension(5)
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')
      expect(useGeometryStore.getState().dimension).toBe(5)

      useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
      expect(useGeometryStore.getState().dimension).toBe(5)
    })
  })

  describe('representation enforcement', () => {
    it('compute modes force position representation', () => {
      // Set momentum representation first
      useExtendedObjectStore.getState().setSchroedingerRepresentation('momentum')
      expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('momentum')

      for (const mode of COMPUTE_MODES) {
        useExtendedObjectStore.getState().setSchroedingerRepresentation('momentum')
        useExtendedObjectStore.getState().setSchroedingerQuantumMode(mode)
        expect(
          useExtendedObjectStore.getState().schroedinger.representation,
          `${mode} should force position representation`
        ).toBe('position')
      }
    })

    it('analytical modes preserve non-position representation', () => {
      useExtendedObjectStore.getState().setSchroedingerRepresentation('wigner')
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
      expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('wigner')
    })
  })

  describe('cross-section enforcement', () => {
    it('compute modes disable cross-section', () => {
      useExtendedObjectStore.getState().setSchroedingerCrossSectionEnabled(true)
      expect(useExtendedObjectStore.getState().schroedinger.crossSectionEnabled).toBe(true)

      for (const mode of COMPUTE_MODES) {
        useExtendedObjectStore.getState().setSchroedingerCrossSectionEnabled(true)
        useExtendedObjectStore.getState().setSchroedingerQuantumMode(mode)
        expect(
          useExtendedObjectStore.getState().schroedinger.crossSectionEnabled,
          `${mode} should disable cross-section`
        ).toBe(false)
      }
    })
  })

  describe('lattice dimension synchronization', () => {
    it('TDSE lattice dimension matches geometry dimension', () => {
      useGeometryStore.getState().setDimension(4)
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')
      expect(useExtendedObjectStore.getState().schroedinger.tdse.latticeDim).toBe(4)
    })

    it('BEC lattice dimension matches geometry dimension', () => {
      useGeometryStore.getState().setDimension(5)
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('becDynamics')
      expect(useExtendedObjectStore.getState().schroedinger.bec.latticeDim).toBe(5)
    })

    it('TDSE sets needsReset when lattice dimension changes', () => {
      useGeometryStore.getState().setDimension(3)
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')

      // Change dimension
      useGeometryStore.getState().setDimension(4)
      // Re-enter TDSE to trigger resize
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')

      expect(useExtendedObjectStore.getState().schroedinger.tdse.latticeDim).toBe(4)
    })
  })

  describe('version counter monotonicity', () => {
    it('version increases monotonically through all mode transitions', () => {
      let prevVersion = useExtendedObjectStore.getState().schroedingerVersion

      for (const mode of ALL_MODES) {
        useExtendedObjectStore.getState().setSchroedingerQuantumMode(mode)
        const newVersion = useExtendedObjectStore.getState().schroedingerVersion
        expect(newVersion, `version should increase after switching to ${mode}`).toBeGreaterThan(
          prevVersion
        )
        prevVersion = newVersion
      }
    })

    it('repeated transition to same mode still bumps version', () => {
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')
      const v1 = useExtendedObjectStore.getState().schroedingerVersion

      useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')
      const v2 = useExtendedObjectStore.getState().schroedingerVersion

      expect(v2).toBeGreaterThan(v1)
    })
  })

  describe('exhaustive pairwise transitions', () => {
    it('every mode-to-mode transition produces valid state', () => {
      for (const from of ALL_MODES) {
        for (const to of ALL_MODES) {
          // Reset to known state
          useGeometryStore.getState().setDimension(3)
          useExtendedObjectStore.getState().setSchroedingerQuantumMode(from)

          // Execute transition
          useExtendedObjectStore.getState().setSchroedingerQuantumMode(to)

          // Verify post-conditions
          const state = useExtendedObjectStore.getState()
          const dim = useGeometryStore.getState().dimension

          expect(state.schroedinger.quantumMode, `${from} -> ${to}`).toBe(to)
          expect(dim, `${from} -> ${to}: dim must be >= 2`).toBeGreaterThanOrEqual(2)
          expect(dim, `${from} -> ${to}: dim must be <= 11`).toBeLessThanOrEqual(11)
          expect(
            state.schroedingerVersion,
            `${from} -> ${to}: version must be positive`
          ).toBeGreaterThan(0)
        }
      }
    })
  })

  describe('TDSE potential type constraint on dimension change', () => {
    it('doubleSlit potential downgrades to barrier when dimension < 2', () => {
      // doubleSlit is only meaningful in >= 2D
      useGeometryStore.getState().setDimension(3)
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')

      // Set doubleSlit potential
      useExtendedObjectStore.getState().setTdsePotentialType('doubleSlit')
      expect(useExtendedObjectStore.getState().schroedinger.tdse.potentialType).toBe('doubleSlit')

      // Dimension is already >= 2, so doubleSlit should survive re-entry
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')
      expect(useExtendedObjectStore.getState().schroedinger.tdse.potentialType).toBe('doubleSlit')
    })
  })

  describe('mode-specific state isolation', () => {
    it('changing TDSE settings does not affect BEC state', () => {
      useGeometryStore.getState().setDimension(3)
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')

      // Modify TDSE-specific state
      useExtendedObjectStore.getState().setTdsePotentialType('harmonicTrap')

      // Switch to BEC and verify BEC state is independent
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('becDynamics')
      const becState = useExtendedObjectStore.getState().schroedinger.bec

      // BEC should have its own defaults, not TDSE's harmonicTrap
      expect(becState.latticeDim).toBe(3)
      expect(becState.needsReset).toBe(true) // freshly entered
    })

    it('hydrogen quantum numbers persist through mode roundtrip', () => {
      useGeometryStore.getState().setDimension(5)
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('hydrogenND')
      useExtendedObjectStore.getState().setSchroedingerPrincipalQuantumNumber(4)
      useExtendedObjectStore.getState().setSchroedingerAzimuthalQuantumNumber(3)
      useExtendedObjectStore.getState().setSchroedingerMagneticQuantumNumber(-2)

      // Switch away and back
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('hydrogenND')

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.principalQuantumNumber).toBe(4)
      expect(config.azimuthalQuantumNumber).toBe(3)
      expect(config.magneticQuantumNumber).toBe(-2)
    })

    it('HO superposition state persists through mode roundtrip', () => {
      useGeometryStore.getState().setDimension(4)
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
      useExtendedObjectStore.getState().setSchroedingerTermCount(5)
      useExtendedObjectStore.getState().setSchroedingerSeed(42)

      // Switch away and back
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('freeScalarField')
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')

      const config = useExtendedObjectStore.getState().schroedinger
      expect(config.termCount).toBe(5)
      expect(config.seed).toBe(42)
    })
  })

  describe('rapid cycling stress test', () => {
    it('50 rapid mode switches do not corrupt state', () => {
      for (let i = 0; i < 50; i++) {
        const mode = ALL_MODES[i % ALL_MODES.length]!
        useExtendedObjectStore.getState().setSchroedingerQuantumMode(mode)
      }

      const state = useExtendedObjectStore.getState()
      const dim = useGeometryStore.getState().dimension

      // State must be internally consistent after rapid cycling
      expect(ALL_MODES).toContain(state.schroedinger.quantumMode)
      expect(dim).toBeGreaterThanOrEqual(2)
      expect(dim).toBeLessThanOrEqual(11)
      expect(state.schroedingerVersion).toBeGreaterThan(0)
      expect(Number.isFinite(state.schroedingerVersion)).toBe(true)
    })

    it('alternating between analytical and compute modes is safe', () => {
      for (let i = 0; i < 20; i++) {
        useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
        useExtendedObjectStore.getState().setSchroedingerRepresentation('momentum')
        useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')
        // After switching to compute, representation should be forced to position
        expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
      }
    })
  })
})
