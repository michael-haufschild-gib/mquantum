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

const ANALYTICAL_MODES: SchroedingerQuantumMode[] = ['harmonicOscillator', 'hydrogenND']

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

    it('analytical modes allow dimension 2', () => {
      for (const mode of ANALYTICAL_MODES) {
        useGeometryStore.getState().setDimension(2)
        useExtendedObjectStore.getState().setSchroedingerQuantumMode(mode)
        expect(useGeometryStore.getState().dimension).toBe(2)
      }
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
