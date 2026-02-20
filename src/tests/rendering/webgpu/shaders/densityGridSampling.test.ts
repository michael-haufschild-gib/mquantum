import { describe, expect, it } from 'vitest'
import { densityGridSamplingBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/densityGridSampling.wgsl'

describe('densityGridSamplingBlock', () => {
  it('uses identity mapping for all modes (basis remap baked into compute write)', () => {
    expect(densityGridSamplingBlock).toContain('var gridPos = pos;')
    // No IS_FREE_SCALAR branch — all modes use identity gridPos = pos
    expect(densityGridSamplingBlock).not.toContain('IS_FREE_SCALAR')
    expect(densityGridSamplingBlock).toContain('return (gridPos + vec3f(bound)) / (2.0 * bound);')
  })
})
