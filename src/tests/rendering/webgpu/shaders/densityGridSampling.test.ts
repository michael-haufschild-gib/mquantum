import { describe, expect, it } from 'vitest'
import { densityGridSamplingBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/densityGridSampling.wgsl'

describe('densityGridSamplingBlock', () => {
  it('uses direct world-space mapping by default and gates basis remap to free-scalar mode', () => {
    expect(densityGridSamplingBlock).toContain('var gridPos = pos;')
    expect(densityGridSamplingBlock).toContain('if (IS_FREE_SCALAR)')
    expect(densityGridSamplingBlock).toContain('gridPos = vec3f(')
    expect(densityGridSamplingBlock).toContain('return (gridPos + vec3f(bound)) / (2.0 * bound);')
  })
})
