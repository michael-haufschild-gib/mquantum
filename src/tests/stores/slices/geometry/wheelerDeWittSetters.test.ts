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

import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

const getWdw = () => useExtendedObjectStore.getState().schroedinger.wheelerDeWitt

describe('wheelerDeWittSetters — render-only animation effects', () => {
  beforeEach(() => {
    // Restore defaults, then clear `needsReset` so a setter-induced flip is
    // observable as a transition from false → true (any render-only setter
    // must NOT flip it, so we expect false after calling each one).
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().setDimension(3)
    useExtendedObjectStore.getState().clearComputeNeedsReset('wheelerDeWitt')
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

  describe('setWdwRenderDynamicRange — render-only, no solver re-run', () => {
    it('writes the value, clamps to [1, 10000], and does not flip needsReset', () => {
      useExtendedObjectStore.getState().setWdwRenderDynamicRange(42.5)
      expect(getWdw().renderDynamicRange).toBe(42.5)
      expect(getWdw().needsReset).toBe(false)

      useExtendedObjectStore.getState().setWdwRenderDynamicRange(1_000_000)
      expect(getWdw().renderDynamicRange).toBe(10_000)
      expect(getWdw().needsReset).toBe(false)

      useExtendedObjectStore.getState().setWdwRenderDynamicRange(-5)
      expect(getWdw().renderDynamicRange).toBe(1)
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

    it('applies the Medium preset', () => {
      useExtendedObjectStore.getState().setWdwGridSize('low')
      useExtendedObjectStore.getState().setWdwGridSize('medium')
      const wdw = getWdw()
      expect(wdw.gridNa).toBe(128)
      expect(wdw.gridNphi).toBe(40)
      expect(wdw.needsReset).toBe(true)
    })

    it('applies the High preset', () => {
      useExtendedObjectStore.getState().setWdwGridSize('high')
      const wdw = getWdw()
      expect(wdw.gridNa).toBe(192)
      expect(wdw.gridNphi).toBe(40)
      expect(wdw.needsReset).toBe(true)
    })

    it('applies the Publication preset', () => {
      useExtendedObjectStore.getState().setWdwGridSize('publication')
      const wdw = getWdw()
      expect(wdw.gridNa).toBe(256)
      expect(wdw.gridNphi).toBe(48)
      expect(wdw.needsReset).toBe(true)
    })
  })

  describe('4D minisuperspace setters', () => {
    it('global dimension selector switches WDW to 4D defaults and disables unsupported overlays', () => {
      useExtendedObjectStore.getState().setSchroedingerQuantumMode('wheelerDeWitt')
      useExtendedObjectStore.getState().setWdwStreamlinesEnabled(true)
      useExtendedObjectStore.getState().setWdwWorldlineEnabled(true)
      useExtendedObjectStore.getState().setWdwSrmtEnabled(true)
      useExtendedObjectStore.getState().clearComputeNeedsReset('wheelerDeWitt')

      useGeometryStore.getState().setDimension(4)

      expect(getWdw().minisuperspaceDimension).toBe(4)
      expect(getWdw().gridNa).toBe(48)
      expect(getWdw().gridNphi).toBe(12)
      expect(getWdw().phi3SliceNormalized).toBe(0.5)
      expect(getWdw().streamlinesEnabled).toBe(false)
      expect(getWdw().worldlineEnabled).toBe(false)
      expect(getWdw().srmtEnabled).toBe(false)
      expect(getWdw().needsReset).toBe(true)
    })

    it('switches to 4D with conservative grid defaults and disables unsupported overlays', () => {
      useExtendedObjectStore.getState().setWdwStreamlinesEnabled(true)
      useExtendedObjectStore.getState().setWdwWorldlineEnabled(true)
      useExtendedObjectStore.getState().setWdwSrmtEnabled(true)
      useExtendedObjectStore.getState().clearComputeNeedsReset('wheelerDeWitt')

      useExtendedObjectStore.getState().setWdwMinisuperspaceDimension(4)

      expect(getWdw().minisuperspaceDimension).toBe(4)
      expect(getWdw().gridNa).toBe(48)
      expect(getWdw().gridNphi).toBe(12)
      expect(getWdw().phi3SliceNormalized).toBe(0.5)
      expect(getWdw().streamlinesEnabled).toBe(false)
      expect(getWdw().worldlineEnabled).toBe(false)
      expect(getWdw().srmtEnabled).toBe(false)
      expect(getWdw().needsReset).toBe(true)
    })

    it('uses 4D grid presets and clamps custom 4D dimensions conservatively', () => {
      useExtendedObjectStore.getState().setWdwMinisuperspaceDimension(4)
      useExtendedObjectStore.getState().setWdwGridSize('medium')
      expect(getWdw().gridNa).toBe(64)
      expect(getWdw().gridNphi).toBe(16)

      useExtendedObjectStore.getState().setWdwGridDimensions(999, 999)
      expect(getWdw().gridNa).toBe(128)
      expect(getWdw().gridNphi).toBe(24)
    })

    it('clamps φ3 slice without forcing a solver reset', () => {
      useExtendedObjectStore.getState().setWdwMinisuperspaceDimension(4)
      useExtendedObjectStore.getState().clearComputeNeedsReset('wheelerDeWitt')
      useExtendedObjectStore.getState().setWdwPhi3SliceNormalized(2)
      expect(getWdw().phi3SliceNormalized).toBe(1)
      expect(getWdw().needsReset).toBe(false)
    })

    it('guards unsupported display toggles while in 4D', () => {
      useExtendedObjectStore.getState().setWdwMinisuperspaceDimension(4)
      useExtendedObjectStore.getState().setWdwStreamlinesEnabled(true)
      useExtendedObjectStore.getState().setWdwWorldlineEnabled(true)
      useExtendedObjectStore.getState().setWdwSrmtEnabled(true)
      expect(getWdw().streamlinesEnabled).toBe(false)
      expect(getWdw().worldlineEnabled).toBe(false)
      expect(getWdw().srmtEnabled).toBe(false)
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

describe('wheelerDeWittSetters — applyWheelerDeWittPreset', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().setDimension(3)
    useExtendedObjectStore.getState().clearComputeNeedsReset('wheelerDeWitt')
    expect(getWdw().needsReset).toBe(false)
  })

  it('writes physics fields from the preset and flips needsReset', async () => {
    await useExtendedObjectStore.getState().applyWheelerDeWittPreset('deSitterLargeLambda')

    expect(getWdw().boundaryCondition).toBe('noBoundary')
    expect(getWdw().cosmologicalConstant).toBeCloseTo(0.8)
    expect(getWdw().inflatonMass).toBeCloseTo(0.3)
    expect(getWdw().needsReset).toBe(true)
  })

  it('preserves render-only overlay toggles across preset application', async () => {
    useExtendedObjectStore.getState().setWdwPhaseRotationEnabled(true)
    useExtendedObjectStore.getState().setWdwPhaseRotationSpeed(2.0)
    useExtendedObjectStore.getState().setWdwWorldlineEnabled(true)
    useExtendedObjectStore.getState().setWdwStreamlinesEnabled(false)
    useExtendedObjectStore.getState().setWdwStreamlineDensity(12)

    await useExtendedObjectStore.getState().applyWheelerDeWittPreset('vilenkinTunneling')

    expect(getWdw().boundaryCondition).toBe('tunneling')
    expect(getWdw().cosmologicalConstant).toBeCloseTo(0.3)
    expect(getWdw().phaseRotationEnabled).toBe(true)
    expect(getWdw().phaseRotationSpeed).toBe(2.0)
    expect(getWdw().worldlineEnabled).toBe(true)
    expect(getWdw().streamlinesEnabled).toBe(false)
    expect(getWdw().streamlineDensity).toBe(12)
  })

  it('ignores unknown preset ids', async () => {
    const before = getWdw()
    await useExtendedObjectStore.getState().applyWheelerDeWittPreset('doesNotExist')
    const after = getWdw()

    expect(after.boundaryCondition).toBe(before.boundaryCondition)
    expect(after.inflatonMass).toBe(before.inflatonMass)
    expect(after.cosmologicalConstant).toBe(before.cosmologicalConstant)
    expect(after.needsReset).toBe(false)
  })

  it('leaves grid and range parameters at their pre-apply values', async () => {
    useExtendedObjectStore.getState().setWdwGridSize('high')
    useExtendedObjectStore.getState().clearComputeNeedsReset('wheelerDeWitt')
    const before = getWdw()

    await useExtendedObjectStore.getState().applyWheelerDeWittPreset('inflationHighMass')

    expect(getWdw().gridNa).toBe(before.gridNa)
    expect(getWdw().gridNphi).toBe(before.gridNphi)
    expect(getWdw().aMin).toBe(before.aMin)
    expect(getWdw().aMax).toBe(before.aMax)
    expect(getWdw().phiExtent).toBe(before.phiExtent)
    expect(getWdw().inflatonMass).toBeCloseTo(0.8)
  })

  // Per-preset end-to-end write verification. A new preset added without
  // a matching entry below would slip through untested, since the earlier
  // per-preset cases only hit a hand-picked subset.
  const CURATED_PRESET_EXPECTATIONS: Array<{
    id: string
    boundaryCondition: 'noBoundary' | 'tunneling' | 'deWitt'
    inflatonMass: number
    cosmologicalConstant: number
    dimension: 3 | 4
  }> = [
    {
      id: 'noBoundaryBaseline',
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.0,
      dimension: 3,
    },
    {
      id: 'vilenkinTunneling',
      boundaryCondition: 'tunneling',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.3,
      dimension: 3,
    },
    {
      id: 'deWittOrigin',
      boundaryCondition: 'deWitt',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.0,
      dimension: 3,
    },
    {
      id: 'inflationHighMass',
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.8,
      cosmologicalConstant: 0.0,
      dimension: 3,
    },
    {
      id: 'deSitterLargeLambda',
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.8,
      dimension: 3,
    },
    {
      id: 'antiDeSitterContracting',
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.5,
      cosmologicalConstant: -0.5,
      dimension: 3,
    },
    {
      id: 'fourDimensionalNoBoundarySlice',
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.25,
      cosmologicalConstant: 0.15,
      dimension: 4,
    },
    {
      id: 'fourDimensionalTunnelingRidge',
      boundaryCondition: 'tunneling',
      inflatonMass: 0.35,
      cosmologicalConstant: 0.25,
      dimension: 4,
    },
  ]

  for (const preset of CURATED_PRESET_EXPECTATIONS) {
    it(`applies preset '${preset.id}' to the three physics fields`, async () => {
      useGeometryStore.getState().setDimension(preset.dimension)
      await useExtendedObjectStore.getState().applyWheelerDeWittPreset(preset.id)
      const after = getWdw()
      expect(after.boundaryCondition).toBe(preset.boundaryCondition)
      expect(after.inflatonMass).toBeCloseTo(preset.inflatonMass, 6)
      expect(after.cosmologicalConstant).toBeCloseTo(preset.cosmologicalConstant, 6)
      expect(after.needsReset).toBe(true)
    })
  }

  it('applies 4D presets with grid, slice, and unsupported overlays fixed', async () => {
    useGeometryStore.getState().setDimension(4)
    await useExtendedObjectStore.getState().applyWheelerDeWittPreset('fourDimensionalTunnelingRidge')
    const after = getWdw()
    expect(after.minisuperspaceDimension).toBe(4)
    expect(after.gridNa).toBe(48)
    expect(after.gridNphi).toBe(12)
    expect(after.phi3SliceNormalized).toBe(0.65)
    expect(after.streamlinesEnabled).toBe(false)
    expect(after.worldlineEnabled).toBe(false)
    expect(after.srmtEnabled).toBe(false)
  })

  it('does not apply a preset from the wrong global dimension', async () => {
    await useExtendedObjectStore.getState().applyWheelerDeWittPreset('fourDimensionalTunnelingRidge')
    expect(getWdw().boundaryCondition).toBe('noBoundary')
    expect(getWdw().inflatonMass).toBeCloseTo(0.3)
    expect(getWdw().cosmologicalConstant).toBeCloseTo(0)
    expect(getWdw().needsReset).toBe(false)
  })
})
