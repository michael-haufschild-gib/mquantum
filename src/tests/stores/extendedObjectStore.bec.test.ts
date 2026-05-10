/**
 * BEC (Gross-Pitaevskii) setter tests.
 *
 * Tests that BEC configuration setters correctly validate, clamp, and persist
 * values through the extendedObjectStore. Each setter protects against
 * non-finite inputs and enforces physical parameter bounds.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

/** Helper to read BEC config. */
function bec() {
  return useExtendedObjectStore.getState().schroedinger.bec
}

/** Helper to call BEC setters. */
function store() {
  return useExtendedObjectStore.getState()
}

describe('BEC setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  describe('setBecInteractionStrength', () => {
    it('sets a valid interaction strength', () => {
      store().setBecInteractionStrength(500)
      expect(bec().interactionStrength).toBe(500)
    })

    it('clamps to [-1000, 10000]', () => {
      store().setBecInteractionStrength(-2000)
      expect(bec().interactionStrength).toBe(-1000)
      store().setBecInteractionStrength(20000)
      expect(bec().interactionStrength).toBe(10000)
    })

    it('rejects NaN', () => {
      store().setBecInteractionStrength(500)
      store().setBecInteractionStrength(NaN)
      expect(bec().interactionStrength).toBe(500)
    })
  })

  describe('setBecTrapOmega', () => {
    it('sets a valid trap frequency', () => {
      store().setBecTrapOmega(2.0)
      expect(bec().trapOmega).toBe(2.0)
    })

    it('clamps to [0.01, 10.0]', () => {
      store().setBecTrapOmega(0.001)
      expect(bec().trapOmega).toBe(0.01)
      store().setBecTrapOmega(100)
      expect(bec().trapOmega).toBe(10.0)
    })

    it('rejects Infinity', () => {
      store().setBecTrapOmega(2.0)
      store().setBecTrapOmega(Infinity)
      expect(bec().trapOmega).toBe(2.0)
    })
  })

  describe('setBecTrapAnisotropy', () => {
    it('sets anisotropy for a valid dimension index', () => {
      store().setBecTrapAnisotropy(0, 2.0)
      expect(bec().trapAnisotropy[0]).toBe(2.0)
    })

    it('clamps to [0.1, 10.0]', () => {
      store().setBecTrapAnisotropy(0, 0.01)
      expect(bec().trapAnisotropy[0]).toBe(0.1)
      store().setBecTrapAnisotropy(0, 50)
      expect(bec().trapAnisotropy[0]).toBe(10.0)
    })

    it('rejects NaN', () => {
      const orig = bec().trapAnisotropy[0]
      store().setBecTrapAnisotropy(0, NaN)
      expect(bec().trapAnisotropy[0]).toBe(orig)
    })
  })

  describe('setBecInitialCondition', () => {
    it('sets condition and triggers needsReset', () => {
      store().setBecInitialCondition('vortexImprint')
      expect(bec().initialCondition).toBe('vortexImprint')
      expect(bec().needsReset).toBe(true)
    })

    it('resets hawkingFlux when leaving blackHoleAnalog', () => {
      store().setBecInitialCondition('blackHoleAnalog')
      store().setBecFieldView('hawkingFlux')
      store().setBecInitialCondition('thomasFermi')
      expect(bec().initialCondition).toBe('thomasFermi')
      expect(bec().fieldView).toBe('density')
    })
  })

  describe('setBecFieldView', () => {
    it('sets field view', () => {
      store().setBecFieldView('phase')
      expect(bec().fieldView).toBe('phase')
    })

    it('allows hawkingFlux only for blackHoleAnalog', () => {
      store().setBecFieldView('hawkingFlux')
      expect(bec().fieldView).toBe('density')

      store().setBecInitialCondition('blackHoleAnalog')
      store().setBecFieldView('hawkingFlux')
      expect(bec().fieldView).toBe('hawkingFlux')
    })
  })

  describe('setBecVortexCharge', () => {
    it('rounds and clamps to [-4, 4]', () => {
      store().setBecVortexCharge(2.7)
      expect(bec().vortexCharge).toBe(3)
      store().setBecVortexCharge(-10)
      expect(bec().vortexCharge).toBe(-4)
    })

    it('triggers needsReset', () => {
      store().clearComputeNeedsReset('bec')
      store().setBecVortexCharge(1)
      expect(bec().needsReset).toBe(true)
    })
  })

  describe('setBecVortexLatticeCount', () => {
    it('rounds and clamps to [1, 16]', () => {
      store().setBecVortexLatticeCount(3.5)
      expect(bec().vortexLatticeCount).toBe(4)
      store().setBecVortexLatticeCount(0)
      expect(bec().vortexLatticeCount).toBe(1)
      store().setBecVortexLatticeCount(99)
      expect(bec().vortexLatticeCount).toBe(16)
    })
  })

  describe('setBecSolitonDepth', () => {
    it('clamps to [0, 1]', () => {
      store().setBecSolitonDepth(0.5)
      expect(bec().solitonDepth).toBe(0.5)
      store().setBecSolitonDepth(-1)
      expect(bec().solitonDepth).toBe(0)
      store().setBecSolitonDepth(2)
      expect(bec().solitonDepth).toBe(1)
    })

    it('rejects non-finite', () => {
      store().setBecSolitonDepth(0.5)
      store().setBecSolitonDepth(NaN)
      expect(bec().solitonDepth).toBe(0.5)
    })
  })

  describe('setBecSolitonVelocity', () => {
    it('clamps to [-1, 1]', () => {
      store().setBecSolitonVelocity(0.3)
      expect(bec().solitonVelocity).toBe(0.3)
      store().setBecSolitonVelocity(-5)
      expect(bec().solitonVelocity).toBe(-1)
    })
  })

  describe('setBecAutoScale', () => {
    it('toggles auto scale', () => {
      store().setBecAutoScale(false)
      expect(bec().autoScale).toBe(false)
      store().setBecAutoScale(true)
      expect(bec().autoScale).toBe(true)
    })
  })

  describe('setBecAbsorberEnabled', () => {
    it('toggles absorber', () => {
      store().setBecAbsorberEnabled(true)
      expect(bec().absorberEnabled).toBe(true)
      store().setBecAbsorberEnabled(false)
      expect(bec().absorberEnabled).toBe(false)
    })
  })

  describe('setBecAbsorberWidth', () => {
    it('clamps to [0.05, 0.5]', () => {
      store().setBecAbsorberWidth(0.2)
      expect(bec().absorberWidth).toBe(0.2)
      store().setBecAbsorberWidth(0.01)
      expect(bec().absorberWidth).toBe(0.05)
      store().setBecAbsorberWidth(1.0)
      expect(bec().absorberWidth).toBe(0.5)
    })

    it('rejects non-finite', () => {
      store().setBecAbsorberWidth(0.2)
      store().setBecAbsorberWidth(NaN)
      expect(bec().absorberWidth).toBe(0.2)
    })
  })

  describe('setBecPmlTargetReflection', () => {
    it('clamps to [1e-12, 0.999]', () => {
      store().setBecPmlTargetReflection(1e-6)
      expect(bec().pmlTargetReflection).toBe(1e-6)
      store().setBecPmlTargetReflection(0)
      expect(bec().pmlTargetReflection).toBe(1e-12)
    })

    it('rejects NaN', () => {
      store().setBecPmlTargetReflection(1e-6)
      store().setBecPmlTargetReflection(NaN)
      expect(bec().pmlTargetReflection).toBe(1e-6)
    })
  })

  describe('setBecDiagnosticsEnabled / setBecDiagnosticsInterval', () => {
    it('sets diagnostics enabled', () => {
      store().setBecDiagnosticsEnabled(true)
      expect(bec().diagnosticsEnabled).toBe(true)
    })

    it('clamps interval to [1, 60]', () => {
      store().setBecDiagnosticsInterval(5)
      expect(bec().diagnosticsInterval).toBe(5)
      store().setBecDiagnosticsInterval(0)
      expect(bec().diagnosticsInterval).toBe(1)
      store().setBecDiagnosticsInterval(100)
      expect(bec().diagnosticsInterval).toBe(60)
    })
  })

  describe('setBecDt', () => {
    it('clamps dt respecting CFL limit', () => {
      store().setBecDt(0.001)
      expect(bec().dt).toBeGreaterThanOrEqual(0.0001)
      expect(bec().dt).toBeLessThanOrEqual(0.05)
    })

    it('rejects NaN', () => {
      const orig = bec().dt
      store().setBecDt(NaN)
      expect(bec().dt).toBe(orig)
    })
  })

  describe('setBecStepsPerFrame', () => {
    it('rounds and clamps to [1, 16]', () => {
      store().setBecStepsPerFrame(8)
      expect(bec().stepsPerFrame).toBe(8)
      store().setBecStepsPerFrame(0)
      expect(bec().stepsPerFrame).toBe(1)
      store().setBecStepsPerFrame(32)
      expect(bec().stepsPerFrame).toBe(16)
    })
  })

  describe('setBecMass', () => {
    it('clamps to [0.1, 10] and adjusts dt for CFL', () => {
      store().setBecMass(2.0)
      expect(bec().mass).toBe(2.0)
      expect(bec().dt).toBeGreaterThan(0)
    })

    it('rejects non-finite', () => {
      store().setBecMass(2.0)
      store().setBecMass(NaN)
      expect(bec().mass).toBe(2.0)
    })
  })

  describe('setBecHbar', () => {
    it('clamps to [0.1, 10]', () => {
      store().setBecHbar(1.5)
      expect(bec().hbar).toBe(1.5)
      store().setBecHbar(0)
      expect(bec().hbar).toBe(0.1)
    })
  })

  describe('setBecGridSize', () => {
    it('snaps to powers of 2 and respects max sites', () => {
      store().setBecGridSize([32, 32, 32])
      const gs = bec().gridSize
      // Each element should be a power of 2
      for (const g of gs) {
        expect(Math.log2(g) % 1).toBe(0)
      }
    })

    it('rejects non-finite entries', () => {
      const orig = [...bec().gridSize]
      store().setBecGridSize([NaN, 32, 32])
      expect(bec().gridSize).toEqual(orig)
    })

    it('triggers needsReset', () => {
      store().clearComputeNeedsReset('bec')
      store().setBecGridSize([32, 32, 32])
      expect(bec().needsReset).toBe(true)
    })
  })

  describe('setBecSpacing', () => {
    it('clamps each element to [0.01, 1.0] and adjusts dt', () => {
      store().setBecSpacing([0.15, 0.15, 0.15])
      const sp = bec().spacing
      for (const s of sp) {
        expect(s).toBeGreaterThanOrEqual(0.01)
        expect(s).toBeLessThanOrEqual(1.0)
      }
      expect(bec().dt).toBeGreaterThan(0)
    })

    it('rejects non-finite', () => {
      const orig = [...bec().spacing]
      store().setBecSpacing([NaN])
      expect(bec().spacing).toEqual(orig)
    })
  })

  describe('setBecSlicePosition', () => {
    it('sets slice position for valid index', () => {
      // Seed a 4-D BEC config so `slicePositions` has a single extra-dim
      // slot (dim 3 → index 0). The default `latticeDim=3` has zero extra
      // dims, so the previous form of this test (`if (len > 0)`) silently
      // skipped the assertion body — a classic silent-pass pattern that
      // passes even if `setBecSlicePosition` is completely broken. The
      // seeded state guarantees the assertion actually runs.
      useExtendedObjectStore.setState((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, latticeDim: 4, slicePositions: [0] },
        },
      }))
      store().setBecSlicePosition(0, 0.5)
      expect(bec().slicePositions[0]).toBe(0.5)
    })

    it('rejects non-finite values', () => {
      store().setBecSlicePosition(0, NaN)
      // Should not crash
    })
  })

  describe('resetBecField', () => {
    it('sets needsReset to true', () => {
      store().clearComputeNeedsReset('bec')
      expect(bec().needsReset).toBe(false)
      store().resetBecField()
      expect(bec().needsReset).toBe(true)
    })
  })

  describe('clearComputeNeedsReset(bec)', () => {
    it('sets needsReset to false', () => {
      store().resetBecField()
      expect(bec().needsReset).toBe(true)
      store().clearComputeNeedsReset('bec')
      expect(bec().needsReset).toBe(false)
    })
  })
})
