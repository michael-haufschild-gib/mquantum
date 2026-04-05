import { describe, expect, it } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'

describe('Schroedinger time evolution WGSL composition', () => {
  it('excludes timeScale from interference and probability-flow local speeds', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 5,
      quantumMode: 'harmonicOscillator',
      isosurface: false,
      interference: true,
    })

    expect(wgsl).toContain('uniforms.time * uniforms.interferenceSpeed')
    expect(wgsl).toContain('uniforms.time * uniforms.phaseShimmerSpeed')
    expect(wgsl).not.toContain('uniforms.time * uniforms.timeScale * uniforms.interferenceSpeed')
    expect(wgsl).not.toContain('uniforms.time * uniforms.timeScale * uniforms.phaseShimmerSpeed')
  })

  it('includes timeScale in the main wavefunction evolution time', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      quantumMode: 'harmonicOscillator',
    })

    // timeScale should multiply the global time for wavefunction phase evolution
    expect(wgsl).toContain('uniforms.timeScale')
    expect(wgsl).toBeValidWGSL('fragment')
  })

  it('produces valid WGSL for all supported dimensions with temporal enabled', () => {
    for (const dimension of [3, 4, 5, 8, 11]) {
      const { wgsl } = composeSchroedingerShader({
        dimension,
        quantumMode: dimension === 3 ? 'hydrogenND' : 'harmonicOscillator',
        temporal: true,
      })

      expect(wgsl).toBeValidWGSL('fragment')
    }
  })
})
