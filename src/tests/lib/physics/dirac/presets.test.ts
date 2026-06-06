import { describe, expect, it } from 'vitest'

import { DIRAC_SCENARIO_PRESETS, getDiracPreset } from '@/lib/physics/dirac/presets'

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
})
