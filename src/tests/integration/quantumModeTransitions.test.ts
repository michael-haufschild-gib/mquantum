/**
 * Quantum mode state machine transition tests.
 *
 * Verifies that switching between quantum modes enforces dimension
 * constraints, resets lattice state when needed, forces position
 * representation for compute modes, and maintains version counter
 * monotonicity. These transitions are the most complex state flow
 * in the application and the most likely source of state corruption.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/types'
import { isComputeQuantumType, QUANTUM_TYPE_REGISTRY } from '@/lib/geometry/registry'
import { usePerformanceStore } from '@/stores/runtime/performanceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

function getRegistrySchroedingerModes(): SchroedingerQuantumMode[] {
  const modes: SchroedingerQuantumMode[] = []
  for (const [, entry] of QUANTUM_TYPE_REGISTRY) {
    if (entry.internal.objectType === 'schroedinger' && entry.internal.quantumMode) {
      modes.push(entry.internal.quantumMode)
    }
  }
  return modes
}

const ALL_MODES = getRegistrySchroedingerModes()
const COMPUTE_MODES = ALL_MODES.filter((mode) => isComputeQuantumType(mode))

describe('quantum mode state machine transitions', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().setDimension(3)
  })

  describe('registry-derived coverage', () => {
    it('transition sweeps include every registered Schroedinger mode', () => {
      expect(ALL_MODES).toEqual([
        'harmonicOscillator',
        'hydrogenND',
        'hydrogenNDCoupled',
        'freeScalarField',
        'tdseDynamics',
        'becDynamics',
        'diracEquation',
        'quantumWalk',
        'wheelerDeWitt',
        'antiDeSitter',
      ])
      expect(COMPUTE_MODES).toEqual([
        'freeScalarField',
        'tdseDynamics',
        'becDynamics',
        'diracEquation',
        'quantumWalk',
        'wheelerDeWitt',
        'antiDeSitter',
      ])
    })
  })

  describe('dimension constraints', () => {
    it('BEC and Dirac enforce minimum 3D dimension', () => {
      for (const mode of ['becDynamics', 'diracEquation'] as SchroedingerQuantumMode[]) {
        useGeometryStore.getState().setDimension(2)
        useExtendedObjectStore.getState().setSchroedingerQuantumMode(mode)
        expect(
          useGeometryStore.getState().dimension,
          `${mode} should enforce dim >= 3`
        ).toBeGreaterThanOrEqual(3)
      }
    })

    it('TDSE and freeScalarField force dimension 3 minimum', () => {
      for (const mode of ['tdseDynamics', 'freeScalarField'] as SchroedingerQuantumMode[]) {
        useGeometryStore.getState().setDimension(2)
        useExtendedObjectStore.getState().setSchroedingerQuantumMode(mode)
        expect(useGeometryStore.getState().dimension, `${mode} should clamp to 3`).toBe(3)
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

    it('active compute modes clamp dimension changes to their registry maximum', () => {
      for (const mode of COMPUTE_MODES) {
        const entry = QUANTUM_TYPE_REGISTRY.get(mode)
        if (!entry) throw new Error(`${mode} must have registry dimensions`)

        useGeometryStore.getState().setDimension(3)
        useExtendedObjectStore.getState().setSchroedingerQuantumMode(mode)
        useGeometryStore.getState().setDimension(11)

        expect(useGeometryStore.getState().dimension, `${mode} max dimension`).toBe(
          entry!.dimensions.max
        )
      }
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

  describe('FSF cosmology invariants across mode switches', () => {
    it('preserves cosmology eta0 across dimension changes under the δφ integrator', () => {
      // Under the canonical δφ formulation the adiabatic vacuum is well-
      // defined at any non-zero η₀ — there is no dim-dependent safety
      // threshold anymore. The reconcile helper still runs on the post-
      // resize config but only enforces the cosmetic `DEFAULT_SAFE_ETA0`
      // constant (0.1), so a user-chosen `eta0 = -1` passes through both
      // a small-grid and a large-grid branch untouched.
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('freeScalarField')
      useGeometryStore.getState().setDimension(6)
      useExtendedObjectStore.getState().setFreeScalarCosmologyEnabled(true)
      useExtendedObjectStore.getState().setFreeScalarCosmologyEta0(-1)
      const eta0AtDim6 = useExtendedObjectStore.getState().schroedinger.freeScalar.cosmology.eta0
      expect(eta0AtDim6).toBe(-1)

      // Leave FSF, change global dimension, return to FSF. The mode-switch
      // resize path runs through reconcileCosmologyInvariants but finds
      // nothing to clamp — eta0 stays at -1.
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
      useGeometryStore.getState().setDimension(3)
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('freeScalarField')

      const fs = useExtendedObjectStore.getState().schroedinger.freeScalar
      expect(fs.latticeDim).toBe(3)
      expect(fs.cosmology.enabled).toBe(true)
      expect(fs.cosmology.eta0).toBe(-1)
    })
  })

  describe('URL/scene loading guard (isLoadingScene)', () => {
    afterEach(() => {
      usePerformanceStore.getState().setIsLoadingScene(false)
    })

    it('first-visit preset apply is suppressed during scene loading so URL overrides stick', async () => {
      // Round 4 regression: when URL loading flips the mode for the first
      // time, the async dynamic import of FREE_SCALAR_PRESETS would later
      // resolve and rebuild `freeScalar` from DEFAULT_FREE_SCALAR_CONFIG +
      // preset.overrides, silently wiping the cosmology / modeK / dt / etc
      // values that applyUrlStateParams set synchronously moments before.
      // Gating applyFirstPreset on !isLoadingScene prevents the async
      // import from firing in the first place.
      //
      // Pre-load the presets module so that, absent the guard, the async
      // import in applyFreeScalarPreset would resolve on the next
      // microtask — otherwise a buggy variant would coincidentally pass
      // this test by virtue of the module not finishing loading yet.
      await import('@/lib/physics/freeScalar/presets')

      usePerformanceStore.getState().setIsLoadingScene(true)
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('freeScalarField')
      // Drain any outstanding microtasks / timers so a buggy (unguarded)
      // implementation has time to resolve its dynamic import and clobber
      // the store. 25ms is a large multiple of the typical microtask delay
      // for an already-cached module import.
      await new Promise((r) => setTimeout(r, 25))

      const afterSwitch = useExtendedObjectStore.getState().schroedinger.freeScalar
      // Discriminator: the first FSF preset (gaussianPacket) sets
      // modeK[0]=3, while DEFAULT_FREE_SCALAR_CONFIG has modeK[0]=1. If
      // the async preset apply ran, modeK[0] would be 3.
      expect(afterSwitch.modeK[0]).toBe(1)

      // Mode is marked as visited: flipping away and back without clearing
      // isLoadingScene must still not apply a preset.
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
      usePerformanceStore.getState().setIsLoadingScene(false)
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('freeScalarField')
      await new Promise((r) => setTimeout(r, 25))
      const afterRoundTrip = useExtendedObjectStore.getState().schroedinger.freeScalar
      expect(afterRoundTrip.modeK[0]).toBe(1)
    })
  })

  describe('async preset stale-write guards', () => {
    it('skips first-visit compute preset if user leaves the mode before import resolves', async () => {
      await import('@/lib/physics/freeScalar/presets')

      useExtendedObjectStore.getState().setSchroedingerQuantumMode('freeScalarField')
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
      await new Promise((r) => setTimeout(r, 25))

      const state = useExtendedObjectStore.getState().schroedinger
      expect(state.quantumMode).toBe('harmonicOscillator')
      expect(state.freeScalar.modeK[0]).toBe(1)
    })

    it('skips guarded manual preset apply if mode changes before import resolves', async () => {
      await import('@/lib/physics/bec/presets')

      useExtendedObjectStore.setState((state) => ({
        schroedinger: {
          ...state.schroedinger,
          quantumMode: 'becDynamics',
          autoScaleMaxGain: 77,
        },
      }))

      const apply = useExtendedObjectStore
        .getState()
        .applyBecPreset('groundState', { expectedQuantumMode: 'becDynamics' })

      useExtendedObjectStore.setState((state) => ({
        schroedinger: {
          ...state.schroedinger,
          quantumMode: 'harmonicOscillator',
        },
      }))

      await apply

      const state = useExtendedObjectStore.getState().schroedinger
      expect(state.quantumMode).toBe('harmonicOscillator')
      expect(state.autoScaleMaxGain).toBe(77)
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
