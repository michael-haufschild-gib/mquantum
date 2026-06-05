import { describe, expect, it } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'

describe('Schroedinger WGSL causal-diamond hydrogen warp', () => {
  it('composes the modular warp into hydrogenND density sampling', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      quantumMode: 'hydrogenND',
      colorAlgorithm: 4,
      isosurface: false,
      temporalAccumulation: false,
      useDensityGrid: false,
      useDensityMatrix: false,
      crossSectionEnabled: true,
      probabilityCurrentEnabled: true,
    })

    expect(wgsl).toContain('fn hydrogenNDCausalDiamondWarp')
    expect(wgsl).toContain('fn hydrogenNDCausalDiamondHorizonGain')
    expect(wgsl).toContain('let coreGain = 0.18 * sech2Tau')
    expect(wgsl).toContain('return clamp(coreGain + modularShellGain, 0.0, 8.0)')
    expect(wgsl).toContain('fn evalHydrogenNDPositionPsi')
    expect(wgsl).toContain('let warpedXND = hydrogenNDCausalDiamondWarp(xND, uniforms)')
    expect(wgsl).toContain('hydrogenNDOptimized(warpedXND, t, uniforms) * sqrt')
    expect(wgsl).toContain('return evalHydrogenNDPositionPsi(xND, t, uniforms)')
  })
})
