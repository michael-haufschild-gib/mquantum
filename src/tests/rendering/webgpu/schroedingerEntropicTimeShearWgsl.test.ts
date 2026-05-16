import { describe, expect, it } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'
import { volumeRaymarchBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarch.wgsl'
import {
  generateVolumeRaymarchGridBlock,
  generateVolumeRaymarchGridSimpleBlock,
} from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl'

import { expectOrdered, functionSlice } from './wgslTestHelpers'

describe('Schroedinger entropic time-shear WGSL composition', () => {
  it('includes uniforms and helper contract', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      quantumMode: 'hydrogenND',
      isosurface: false,
      useDensityGrid: false,
    })

    expect(wgsl).toContain('entropicTimeShearEnabled: u32')
    expect(wgsl).toContain('entropicTimeShearStrength: f32')
    expect(wgsl).toContain('entropicTimeShearFilamentScale: f32')
    expect(wgsl).toContain('entropicTimeShearIrreversibility: f32')
    expect(wgsl).toContain('struct EntropicTimeShearResult')
    expect(wgsl).toContain('fn applyEntropicTimeShear(')
    expect(wgsl).toContain('worldPosition: vec3f')
    expect(wgsl).toContain('rayDirection: vec3f')
    expect(wgsl).toContain('densityProxy: f32')
    expect(wgsl).toContain('logDensityProxy: f32')
    expect(wgsl).toContain('phaseProxy: f32')
    expect(wgsl).toContain('localGradient: vec3f')
    expect(wgsl).toContain('let spatialFrequency = 6.2831853 / scale')
    expect(wgsl).toContain('filamentTransverse = filament - rayN * dot(filament, rayN)')
    expect(wgsl).toContain('fallbackSeedTransverse = fallbackSeed - rayN * dot(fallbackSeed, rayN)')
    expect(wgsl).toContain('fallbackSeedTransverse / max(fallbackSeedLen, 1e-6)')
    expect(wgsl).toContain('densityWindow * gradientWindow')
    expect(wgsl).toContain('mix(reversibleGain, max(irreversibleGain, 0.0), irreversibility)')
    expect(wgsl).not.toContain('normalize(fallbackTransverse + vec3f(1e-5, 0.0, 0.0))')
  })

  it('applies stable HQ analytic order and resamples before gradient/emission', () => {
    const body = functionSlice(volumeRaymarchBlock, 'volumeRaymarch')

    // PERF: HQ now uses ensureGradient at the emission point (per-step cache
    // shared with all spacetime effects) instead of sampleDensityWithAnalyticalGradient.
    expectOrdered(body, [
      'let bridge = applyBilocalERBridgeTopology(',
      'quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms)',
      'let beforeBackreaction = samplePos',
      'let metric = applyQuantumBackreactionMetric(',
      'length(samplePos - beforeBackreaction) > 1e-6',
      'quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms)',
      'let entropyShear = applyEntropicTimeShear(',
      'samplePos = entropyShear.position',
      'quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms)',
      'gradient = ensureGradient(samplePos, animTime, uniforms, &gradCache)',
      'computeEmissionLit(rho, sCenter, phase, samplePos',
      'entropyEmissionGain',
    ])
  })

  it('applies stable full density-grid order', () => {
    const body = functionSlice(generateVolumeRaymarchGridBlock(false), 'volumeRaymarchGrid')

    // PERF (OPT-PERF-2): post-warp re-samples consolidated into
    // loadGridSampleState. Order assertions verify the warp/resample cadence
    // through the helper invocations.
    expectOrdered(body, [
      'let bridge = applyBilocalERBridgeTopology(',
      'loadGridSampleState(pos,',
      'let beforeBackreaction = pos',
      'let metric = applyQuantumBackreactionMetric(',
      'length(pos - beforeBackreaction) > 1e-6',
      'loadGridSampleState(pos,',
      'let entropyShear = applyEntropicTimeShear(',
      'pos = entropyShear.position',
      'loadGridSampleState(pos,',
      'computeEmissionLit(colorRho, colorS, phase, pos',
      'max(entropyGain, 0.0)',
    ])
  })

  it('applies stable simple compute-grid order', () => {
    const body = functionSlice(generateVolumeRaymarchGridSimpleBlock(), 'volumeRaymarchGrid')

    expectOrdered(body, [
      'let bridge = applyBilocalERBridgeTopology(',
      'loadGridSampleStateSimple(pos,',
      'let beforeBackreaction = pos',
      'let metric = applyQuantumBackreactionMetric(',
      'length(pos - beforeBackreaction) > 1e-6',
      'loadGridSampleStateSimple(pos,',
      'let entropyShear = applyEntropicTimeShear(',
      'pos = entropyShear.position',
      'loadGridSampleStateSimple(pos,',
      'computeEmissionLit(emissionRho, emissionS, phase, pos',
      'max(entropyGain, 0.0)',
    ])
  })
})
