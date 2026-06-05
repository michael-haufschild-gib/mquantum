import { describe, expect, it } from 'vitest'

import {
  generateMainBlockIsosurface,
  generateMainBlockIsosurfaceTemporal,
} from '@/rendering/webgpu/shaders/schroedinger/main.wgsl'
import {
  generateVolumeRaymarchGridBlock,
  generateVolumeRaymarchGridSimpleBlock,
} from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl'

describe('TDSE branch-color shader gates', () => {
  it('enables branch coloring for any positive stochastic separation', () => {
    const sources = [
      generateVolumeRaymarchGridBlock(false),
      generateVolumeRaymarchGridSimpleBlock(false),
      generateMainBlockIsosurface({ useDensityGrid: true }),
      generateMainBlockIsosurfaceTemporal({ useDensityGrid: true }),
    ]

    for (const source of sources) {
      expect(source).toContain('branchSeparation > 0.0')
      expect(source).not.toContain('branchSeparation > 0.5')
    }
  })
})
