import { describe, expect, it } from 'vitest'

import {
  DIRAC_SCENARIO_PRESETS,
  getDiracPreset,
  getDiracPresetsForDimension,
} from '@/lib/physics/dirac/presets'

describe('Dirac presets', () => {
  it('registers the Clifford Bloom Resonator as a zitterbewegung-sector visual mode', () => {
    const preset = DIRAC_SCENARIO_PRESETS.find((p) => p.id === 'cliffordBloomResonator')

    expect(preset?.name).toBe('Clifford Bloom Resonator')
    expect(preset?.overrides.initialCondition).toBe('zitterbewegung')
    expect(preset?.overrides.fieldView).toBe('cliffordBloom')
    expect(preset?.overrides.potentialType).toBe('none')
    expect(preset?.overrides.positiveEnergyFraction).toBe(0.5)
    expect(preset?.overrides.autoScale).toBe(true)
    expect(preset?.renderingOverrides?.densityGain).toBeCloseTo(2.8)
    expect(preset?.renderingOverrides?.densityContrast).toBeCloseTo(2.7)
    expect(preset?.renderingOverrides?.autoScaleMaxGain).toBe(30)
  })

  it('keeps the preset dimension-agnostic and momentum-rich for visible petals', () => {
    const preset = getDiracPreset('cliffordBloomResonator')

    expect(preset?.overrides.latticeDim).toBeUndefined()
    expect(preset?.overrides.gridSize).toBeUndefined()
    expect(preset?.overrides.spacing).toEqual([0.1])
    expect(preset?.overrides.packetMomentum?.slice(0, 3)).toEqual([3.2, 1.8, 0.9])
    expect(preset?.overrides.spinDirection).toEqual([Math.PI / 3, Math.PI / 5])
  })

  it('registers Hubble Lace presets with balanced sectors and bright rendering overrides', () => {
    const collider = getDiracPreset('hubbleLaceCollider3D')
    const bulk = getDiracPreset('hubbleLaceBulk4D')

    expect(collider?.name).toBe('Hubble Lace Collider 3D')
    expect(collider?.overrides.initialCondition).toBe('zitterbewegung')
    expect(collider?.overrides.fieldView).toBe('hubbleLace')
    expect(collider?.overrides.potentialType).toBe('none')
    expect(collider?.overrides.positiveEnergyFraction).toBe(0.5)
    expect(collider?.overrides.autoScale).toBe(true)
    expect(collider?.overrides.stepsPerFrame).toBe(2)
    expect(collider?.overrides.packetMomentum?.slice(0, 3)).toEqual([3.6, -2.4, 1.7])
    expect(collider?.requiredDimension).toBe(3)
    expect(collider?.overrides.latticeDim).toBeUndefined()
    expect(collider?.overrides.gridSize).toBeUndefined()
    expect(collider?.renderingOverrides?.densityGain).toBeCloseTo(4.4)
    expect(collider?.renderingOverrides?.densityContrast).toBeCloseTo(3.4)
    expect(collider?.renderingOverrides?.autoScaleMaxGain).toBe(46)

    expect(bulk?.name).toBe('Hubble Lace Bulk 4D')
    expect(bulk?.overrides.fieldView).toBe('hubbleLace')
    expect(bulk?.overrides.potentialType).toBe('none')
    expect(bulk?.overrides.positiveEnergyFraction).toBe(0.5)
    expect(bulk?.overrides.stepsPerFrame).toBe(2)
    expect(bulk?.overrides.packetMomentum?.slice(0, 4)).toEqual([2.9, 1.9, -2.2, 1.6])
    expect(bulk?.overrides.slicePositions).toEqual([0.23])
    expect(bulk?.requiredDimension).toBe(4)
    expect(bulk?.overrides.latticeDim).toBeUndefined()
    expect(bulk?.overrides.gridSize).toBeUndefined()
    expect(bulk?.renderingOverrides?.densityGain).toBeCloseTo(5)
    expect(bulk?.renderingOverrides?.densityContrast).toBeCloseTo(3.8)
    expect(bulk?.renderingOverrides?.autoScaleMaxGain).toBe(54)
  })

  it('filters exact-dimensional Hubble Lace presets by active dimension', () => {
    const ids3D = getDiracPresetsForDimension(3).map((preset) => preset.id)
    const ids4D = getDiracPresetsForDimension(4).map((preset) => preset.id)
    const ids5D = getDiracPresetsForDimension(5).map((preset) => preset.id)

    expect(ids3D).toContain('hubbleLaceCollider3D')
    expect(ids3D).not.toContain('hubbleLaceBulk4D')
    expect(ids4D).toContain('hubbleLaceBulk4D')
    expect(ids4D).not.toContain('hubbleLaceCollider3D')
    expect(ids5D).not.toContain('hubbleLaceCollider3D')
    expect(ids5D).not.toContain('hubbleLaceBulk4D')
    expect(ids5D).toContain('cliffordBloomResonator')
  })
})
