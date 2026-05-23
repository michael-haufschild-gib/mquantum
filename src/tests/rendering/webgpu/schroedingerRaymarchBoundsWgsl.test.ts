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
    const body = functionSlice(volumeRaymarchBlock, 'volumeRaymarch')

    expect(body).toContain('let boundR2 = safeBoundingRadius * safeBoundingRadius;')
  })

  it('does not tail-skip analytic rays while radial probability shells are enabled', () => {
    const body = functionSlice(volumeRaymarchBlock, 'volumeRaymarch')

    expect(body).toContain('if (!IS_FREE_SCALAR && !radialProbEnabled) {')
  })

  it('keeps grid-only empty skipping conservative enough to catch thin far-end density', () => {
    const body = functionSlice(generateVolumeRaymarchGridSimpleBlock(), 'volumeRaymarchGrid')

    expect(body).toContain(
      'let skipDistance = min(stepLen * EMPTY_SKIP_FACTOR, max(remaining, 0.0));'
    )
    expect(body).toContain(
      'let probeFar = sampleDensityFromGrid(pos + rayDir * skipDistance, uniforms);'
    )
    expect(body).toContain('let farTotal = gridSkipDensity(probeFar);')
    expect(body).toContain('&& farTotal < EMPTY_SKIP_THRESHOLD')
  })

  it('does not adaptive-step across potential-overlay samples in the grid-only raymarcher', () => {
    const body = functionSlice(generateVolumeRaymarchGridSimpleBlock(), 'volumeRaymarchGrid')

    expect(body).toContain('if (!PROFILING_STRIP_ADAPTIVE_STEP && !hasPotOverlay)')
  })
})
