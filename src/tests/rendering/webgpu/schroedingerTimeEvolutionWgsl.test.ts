import { describe, expect, it } from 'vitest'
import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'

describe('Schroedinger time evolution WGSL composition', () => {
  it('does not apply timeScale to interference or probability-flow local speeds', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 5,
      quantumMode: 'harmonicOscillator',
      isosurface: false,
      useDensityGrid: false,
      interference: true,
    })

    expect(wgsl).toContain('uniforms.time * uniforms.interferenceSpeed')
    expect(wgsl).toContain('uniforms.time * uniforms.probabilityFlowSpeed')
    expect(wgsl).not.toContain('uniforms.time * uniforms.timeScale * uniforms.interferenceSpeed')
    expect(wgsl).not.toContain('uniforms.time * uniforms.timeScale * uniforms.probabilityFlowSpeed')
  })
})
