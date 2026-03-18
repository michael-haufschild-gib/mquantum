import { describe, expect, it } from 'vitest'

import { densityGridSamplingBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/densityGridSampling.wgsl'

describe('densityGridSamplingBlock', () => {
  it('uses identity mapping for all modes (basis remap baked into compute write)', () => {
    expect(densityGridSamplingBlock).toContain('var gridPos = pos;')
    // No IS_FREE_SCALAR branch — all modes use identity gridPos = pos
    expect(densityGridSamplingBlock).not.toContain('IS_FREE_SCALAR')
    expect(densityGridSamplingBlock).toContain('return (gridPos + vec3f(bound)) / (2.0 * bound);')
  })

  it('maps position to [0,1] UV space for texture sampling', () => {
    // The formula (pos + bound) / (2*bound) maps [-bound, +bound] → [0, 1]
    expect(densityGridSamplingBlock).toContain('2.0 * bound')
    expect(densityGridSamplingBlock).toContain('vec3f(bound)')
  })

  it('declares a function with the expected signature', () => {
    expect(densityGridSamplingBlock).toMatch(/fn\s+\w+.*pos\s*:\s*vec3f/)
  })
})
