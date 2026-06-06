import { describe, expect, it } from 'vitest'

import { BEC_SCENARIO_PRESETS, getBecPreset } from '@/lib/physics/bec/presets'

describe('BEC Pfaffian brane presets', () => {
  it('registers two visual Pfaffian regimes and a null control', () => {
    const collision = BEC_SCENARIO_PRESETS.find((p) => p.id === 'pfaffianBraneCollision')
    const skew = BEC_SCENARIO_PRESETS.find((p) => p.id === 'pfaffianBraneSkew')
    const nullControl = BEC_SCENARIO_PRESETS.find((p) => p.id === 'pfaffianBraneNullControl')

    expect(collision?.minDim).toBe(4)
    expect(skew?.minDim).toBe(4)
    expect(nullControl?.minDim).toBe(4)
    expect(collision?.overrides.fieldView).toBe('branePfaffian')
    expect(skew?.overrides.fieldView).toBe('branePfaffian')
    expect(nullControl?.overrides.fieldView).toBe('branePfaffian')
  })

  it('uses complementary planes for visible regimes and repeated planes for falsification', () => {
    const collision = getBecPreset('pfaffianBraneCollision')
    const skew = getBecPreset('pfaffianBraneSkew')
    const nullControl = getBecPreset('pfaffianBraneNullControl')

    expect(collision?.overrides.vortexPlane1).toEqual([0, 1])
    expect(collision?.overrides.vortexPlane2).toEqual([2, 3])
    expect(skew?.overrides.vortexPlane1).toEqual([0, 2])
    expect(skew?.overrides.vortexPlane2).toEqual([1, 3])
    expect(nullControl?.overrides.vortexPlane1).toEqual([0, 1])
    expect(nullControl?.overrides.vortexPlane2).toEqual([0, 1])
    expect(collision?.overrides.vortexPairCount).toBe(2)
    expect(skew?.overrides.vortexPairCount).toBe(2)
    expect(nullControl?.overrides.vortexPairCount).toBe(2)
  })

  it('merges high-contrast rendering overrides through getBecPreset', () => {
    const collision = getBecPreset('pfaffianBraneCollision')

    expect(collision?.renderingOverrides?.densityGain).toBeCloseTo(1.6)
    expect(collision?.renderingOverrides?.densityContrast).toBeCloseTo(2.4)
    expect(collision?.renderingOverrides?.autoScaleMaxGain).toBe(12)
  })
})
