import { describe, expect, it } from 'vitest'
import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'

describe('Schroedinger probability current WGSL composition', () => {
  it('includes physical probability current uniforms and helper functions', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      quantumMode: 'hydrogenND',
      isosurface: false,
      useDensityGrid: false,
    })

    expect(wgsl).toContain('probabilityCurrentEnabled: u32')
    expect(wgsl).toContain('probabilityCurrentStyle: i32')
    expect(wgsl).toContain('probabilityCurrentPlacement: i32')
    expect(wgsl).toContain('probabilityCurrentColorMode: i32')
    expect(wgsl).toContain('fn sampleProbabilityCurrent(')
    expect(wgsl).toContain('fn computeProbabilityCurrentOverlay(')
    expect(wgsl).toContain('PROBABILITY_CURRENT_STYLE_STREAMLINES')
    expect(wgsl).toContain('PROBABILITY_CURRENT_PLACEMENT_VOLUME')
    expect(wgsl).toContain('PROBABILITY_CURRENT_COLOR_MODE_DIRECTION')
  })

  it('forces direct sampling in density-grid mode when volume probability current is active', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 5,
      quantumMode: 'harmonicOscillator',
      isosurface: false,
      useDensityGrid: true,
    })

    expect(wgsl).toContain('schroedinger.probabilityCurrentEnabled != 0u')
    expect(wgsl).toContain(
      'schroedinger.probabilityCurrentPlacement == PROBABILITY_CURRENT_PLACEMENT_VOLUME'
    )
  })
})
