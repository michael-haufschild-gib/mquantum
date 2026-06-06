import { describe, expect, it } from 'vitest'

import { getTdsePreset } from '@/lib/physics/tdse/presets'

describe('TDSE scenario presets', () => {
  it('configures Born Eclipse collider with counter-propagating free packets', () => {
    const preset = getTdsePreset('bornEclipseCollider')
    if (!preset) throw new Error('bornEclipseCollider preset missing')

    expect(preset.overrides.initialCondition).toBe('superposition')
    expect(preset.overrides.potentialType).toBe('free')
    expect(preset.overrides.fieldView).toBe('bornEclipse')
    expect(preset.overrides.autoScale).toBe(true)
    expect(preset.renderingOverrides).toMatchObject({
      densityGain: 4.2,
      densityContrast: 2.9,
      autoScaleMaxGain: 75,
      colorAlgorithm: 'inferno',
    })
  })

  it('configures circulation vortex imprint with PML disabled and high vorticity exposure', () => {
    const preset = getTdsePreset('circulationVortexImprint')
    if (!preset) throw new Error('circulationVortexImprint preset missing')

    expect(preset.overrides.absorberEnabled).toBe(false)
    expect(preset.renderingOverrides).toMatchObject({
      densityGain: 4.0,
      densityContrast: 4.0,
      autoScaleMaxGain: 100,
    })
  })
})
