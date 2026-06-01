import { describe, expect, it } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'

import { expectOrdered, functionSlice } from './wgslTestHelpers'

describe('Schroedinger isosurface spacetime warp WGSL composition', () => {
  it('runs isosurface hit search, refinement, and shading through the spacetime warp sampler', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 3,
      quantumMode: 'hydrogenND',
      isosurface: true,
      useDensityGrid: true,
      quantumBackreactionLensing: true,
      bilocalERBridge: true,
      entropicTimeShear: true,
      spectralDimensionFlow: true,
      vacuumBubbleLens: true,
    })

    expect(wgsl).toContain('struct IsosurfaceHitState')

    const warp = functionSlice(wgsl, 'sampleIsosurfaceWithSpacetimeWarp')
    expectOrdered(warp, [
      'applyBilocalERBridgeTopology(',
      'applyQuantumBackreactionMetric(',
      'applyEntropicTimeShear(',
      'applySpectralDimensionFlow(',
      'applyVacuumBubbleLens(',
    ])

    const fragment = functionSlice(wgsl, 'fragmentMain')
    expectOrdered(fragment, [
      'let isoSeedState = sampleIsosurfaceWithSpacetimeWarp',
      'let isoDensityState = sampleIsosurfaceWithSpacetimeWarp(pos',
      'let isoMidState = sampleIsosurfaceWithSpacetimeWarp(midPos',
      'let surfaceSample = sampleIsosurfaceWithSpacetimeWarp(pRay',
      'let p = surfaceSample.samplePos',
      'let surfaceEmissionGain = surfaceSample.emissionGain',
      'col *= surfaceEmissionGain',
    ])
  })

  it('keeps temporal reprojection anchored to ray hit while shading samples the warped surface', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 3,
      quantumMode: 'hydrogenND',
      isosurface: true,
      temporalAccumulation: true,
      useDensityGrid: true,
      quantumBackreactionLensing: true,
      bilocalERBridge: true,
      entropicTimeShear: true,
      spectralDimensionFlow: true,
      vacuumBubbleLens: true,
    })

    const fragment = functionSlice(wgsl, 'fragmentMain')
    expectOrdered(fragment, [
      'let pRay = ro + rd * hitT',
      'let surfaceSample = sampleIsosurfaceWithSpacetimeWarp(pRay',
      'let p = surfaceSample.samplePos',
      'col *= surfaceEmissionGain',
      'let hitPosModel = ro + rd * hitT',
    ])
  })
})
