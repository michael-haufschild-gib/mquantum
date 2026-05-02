import { describe, expect, it } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'
import { volumeRaymarchBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarch.wgsl'
import { generateVolumeRaymarchGridSimpleBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl'

import { expectOrdered, functionSlice } from './wgslTestHelpers'

describe('Schroedinger quantum backreaction lensing WGSL composition', () => {
  it('includes optical metric uniforms and helper contract', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      quantumMode: 'hydrogenND',
      isosurface: false,
      useDensityGrid: false,
    })

    expect(wgsl).toContain('quantumBackreactionLensingEnabled: u32')
    expect(wgsl).toContain('quantumBackreactionLensingStrength: f32')
    expect(wgsl).toContain('quantumBackreactionCausticGain: f32')
    expect(wgsl).toContain('quantumBackreactionSoftening: f32')
    expect(wgsl).toContain('struct QuantumBackreactionMetric')
    expect(wgsl).toContain('fn applyQuantumBackreactionMetric(')
    expect(wgsl).toContain('densityProxy: f32')
    expect(wgsl).toContain('logDensityProxy: f32')
    expect(wgsl).toContain('localGradient: vec3f')
    expect(wgsl).toContain('worldPosition + bendDir * bendMagnitude')
  })

  it('warps analytic and grid raymarch sample positions before emission', () => {
    const analytic = composeSchroedingerShader({
      dimension: 4,
      quantumMode: 'hydrogenND',
      isosurface: false,
      useDensityGrid: false,
    }).wgsl
    const grid = composeSchroedingerShader({
      dimension: 4,
      quantumMode: 'hydrogenND',
      isosurface: false,
      useDensityGrid: true,
    }).wgsl

    expect(analytic).toContain('sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms)')
    expect(analytic).toContain('computeEmissionLit(rho, sCenter, phase, samplePos')
    // PERF (OPT-PERF-2): grid path now loads its sample state through the
    // consolidated `loadGridSampleState` helper. The literal textureSample call
    // lives in that helper.
    expect(grid).toContain('loadGridSampleState(')
    expect(grid).toContain('emission *= causticMultiplier')
  })

  it('applies backreaction before HQ analytic density and emission sampling', () => {
    const hqBody = functionSlice(volumeRaymarchBlock, 'volumeRaymarchHQ')

    // PERF refactor: gradient is now produced by ensureGradient (per-step
    // cache shared with entropy/spectral/born-null/emission). The post-warp
    // density resample remains sampleDensityWithPhase at warped samplePos.
    expectOrdered(hqBody, [
      'let metricGradient = ensureGradient(samplePos, animTime, uniforms, &gradCache)',
      'let metric = applyQuantumBackreactionMetric(',
      'samplePos = metric.position',
      'quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms)',
    ])
    expectOrdered(hqBody, [
      'samplePos = metric.position',
      'let emission = computeEmissionLit(rho, sCenter, phase, samplePos',
      '* causticMultiplier',
    ])
  })

  it('applies backreaction inside the simple compute-grid raymarcher', () => {
    const simpleGridBody = functionSlice(
      generateVolumeRaymarchGridSimpleBlock(),
      'volumeRaymarchGrid'
    )

    // PERF (OPT-PERF-2): the per-step grid load + post-warp re-samples are
    // consolidated into loadGridSampleStateSimple, so the body asserts on the
    // helper invocation rather than the literal sampleDensityFromGrid call
    // (which now lives inside the helper).
    expectOrdered(simpleGridBody, [
      'let backreactionActive = isQuantumBackreactionActive(uniforms)',
      'loadGridSampleStateSimple(pos,',
      'let metric = applyQuantumBackreactionMetric(',
      'pos = metric.position',
      'loadGridSampleStateSimple(pos,',
      'emission = computeEmissionLit(emissionRho, emissionS, phase, pos',
      'emission *= causticMultiplier',
    ])
  })
})
