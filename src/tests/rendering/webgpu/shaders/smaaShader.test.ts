import { describe, expect, it } from 'vitest'

import { smaaBlendingWeightShader } from '@/rendering/webgpu/shaders/postprocessing/smaa.wgsl'

describe('SMAA blending weight shader', () => {
  it('uses runtime maxSearchSteps uniform instead of hardcoded loop bounds', () => {
    expect(smaaBlendingWeightShader).toContain('maxSearchSteps')
    expect(smaaBlendingWeightShader).toContain('i32(uniforms.maxSearchSteps)')
    expect(smaaBlendingWeightShader).not.toContain('for (var i = 0; i < 16; i++)')
  })
})
