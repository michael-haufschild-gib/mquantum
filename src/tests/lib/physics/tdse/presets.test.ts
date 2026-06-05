import { describe, expect, it } from 'vitest'

import { getTdsePreset } from '@/lib/physics/tdse/presets'

describe('TDSE scenario presets', () => {
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
