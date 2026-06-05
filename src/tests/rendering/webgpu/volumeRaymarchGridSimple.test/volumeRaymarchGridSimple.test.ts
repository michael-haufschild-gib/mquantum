import { describe, expect, it } from 'vitest'

import { generateVolumeRaymarchGridSimpleBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl'

describe('volumeRaymarchGridSimple', () => {
  it('reconstructs log density when the density grid has no phase/log channels', () => {
    const block = generateVolumeRaymarchGridSimpleBlock(false)

    expect(block).toContain('|| !DENSITY_GRID_HAS_PHASE')
    expect(block).toContain('} else if (DENSITY_GRID_HAS_PHASE) {')
    expect(block).toContain('sCenter = log(rho);')
    expect(block).toContain('phase = gridSample.b - phaseOffset;')
  })
})
