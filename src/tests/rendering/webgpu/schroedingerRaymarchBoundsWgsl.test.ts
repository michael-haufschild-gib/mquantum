import { describe, expect, it } from 'vitest'

import { volumeRaymarchBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarch.wgsl'
import {
  generateVolumeRaymarchGridBlock,
  generateVolumeRaymarchGridSimpleBlock,
} from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl'

import { functionSlice } from './wgslTestHelpers'

describe('Schroedinger volume raymarch bounding-radius guards', () => {
  it('guards sample-count path length in every volume raymarch variant', () => {
    const bodies = [
      functionSlice(volumeRaymarchBlock, 'volumeRaymarch'),
      functionSlice(volumeRaymarchBlock, 'volumeRaymarchHQ'),
      functionSlice(generateVolumeRaymarchGridBlock(false), 'volumeRaymarchGrid'),
      functionSlice(generateVolumeRaymarchGridSimpleBlock(), 'volumeRaymarchGrid'),
    ]

    for (const body of bodies) {
      expect(body).toContain('let safeBoundingRadius = max(abs(uniforms.boundingRadius), 1e-4);')
      expect(body).toContain('let maxPathLen = 2.0 * safeBoundingRadius;')
      expect(body).not.toContain('let maxPathLen = 2.0 * uniforms.boundingRadius;')
    }
  })

  it('uses the guarded radius for analytic tail-skip bounds', () => {
    const standard = functionSlice(volumeRaymarchBlock, 'volumeRaymarch')
    const hq = functionSlice(volumeRaymarchBlock, 'volumeRaymarchHQ')

    expect(standard).toContain('let boundR2 = safeBoundingRadius * safeBoundingRadius;')
    expect(hq).toContain('let boundR2 = safeBoundingRadius * safeBoundingRadius;')
  })
})
