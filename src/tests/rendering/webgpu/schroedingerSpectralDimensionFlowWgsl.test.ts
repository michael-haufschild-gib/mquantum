import { describe, expect, it } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'
import { volumeRaymarchBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarch.wgsl'
import {
  generateVolumeRaymarchGridBlock,
  generateVolumeRaymarchGridSimpleBlock,
} from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl'

import { expectOrdered, functionSlice } from './wgslTestHelpers'

describe('Schroedinger spectral-dimension flow WGSL composition', () => {
  it('includes uniforms and heat-kernel helper contract', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      quantumMode: 'hydrogenND',
      isosurface: false,
      useDensityGrid: false,
    })

    expect(wgsl).toContain('spectralDimensionFlowEnabled: u32')
    expect(wgsl).toContain('spectralDimensionFlowStrength: f32')
    expect(wgsl).toContain('spectralDimensionFlowUvDimension: f32')
    expect(wgsl).toContain('spectralDimensionFlowDiffusionScale: f32')
    expect(wgsl).toContain('struct SpectralDimensionFlowResult')
    expect(wgsl).toContain('fn isSpectralDimensionFlowActive(')
    expect(wgsl).toContain('fn applySpectralDimensionFlow(')
    expect(wgsl).toContain('return SpectralDimensionFlowResult(worldPosition, 1.0, 1.0, 0.0, 0.0)')
    expect(wgsl).toContain('let gradientCurvature = log(1.0 + gradientMagnitude * diffusionScale)')
    expect(wgsl).toContain('smoothstep(-14.0, -2.0, logDensityProxy)')
    expect(wgsl).toContain('1.0 - smoothstep(1.5, 8.0, densityProxy / peakRho)')
    expect(wgsl).toContain(
      'let uvGate = clamp(densityGate * gradientCurvature * strength, 0.0, 1.0)'
    )
    expect(wgsl).toContain('let dIR = select(4.0, 3.0, isAnalyticMode)')
    expect(wgsl).toContain('let dUV = clamp(uniforms.spectralDimensionFlowUvDimension, 1.2, 3.5)')
    expect(wgsl).toContain('let spectralDimension = mix(dIR, dUV, uvGate)')
    expect(wgsl).toContain('let compressedPosition = worldPosition - gradN * compressionShift')
    expect(wgsl).toContain('let opacityScale = clamp(1.0 - dimensionDrop')
  })

  it('keeps coupled hydrogen in the analytic D_IR branch', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 7,
      quantumMode: 'hydrogenNDCoupled',
      isosurface: false,
      useDensityGrid: false,
    })
    const body = functionSlice(wgsl, 'applySpectralDimensionFlow')

    expect(body).not.toContain('uniforms.quantumMode >= 2')
    expectOrdered(body, [
      'let isAnalyticMode =',
      'uniforms.quantumMode == 0',
      'uniforms.quantumMode == 1',
      'uniforms.quantumMode == 7',
      'uniforms.quantumMode == 8',
      'let dIR = select(4.0, 3.0, isAnalyticMode)',
      'let dUV = clamp(uniforms.spectralDimensionFlowUvDimension, 1.2, 3.5)',
    ])
  })

  it('resamples analytic volume after spectral coordinate compression', () => {
    const body = functionSlice(volumeRaymarchBlock, 'volumeRaymarch')

    expectOrdered(body, [
      'let entropyShear = applyEntropicTimeShear(',
      'let spectralFlow = applySpectralDimensionFlow(',
      'samplePos = spectralFlow.position',
      'spectralEmissionGain = spectralFlow.emissionGain',
      'spectralOpacityScale = spectralFlow.opacityScale',
      'sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms)',
      'computeEffectiveDensity(',
      'rho * spectralOpacityScale',
      'computeEmissionLit(rho, sCenter, phase, samplePos',
      'spectralEmissionGain',
    ])
  })

  it('resamples HQ analytic volume before gradient and emission', () => {
    const body = functionSlice(volumeRaymarchBlock, 'volumeRaymarchHQ')

    // PERF: HQ now uses ensureGradient at the emission point (per-step cache
    // shared with all spacetime effects) instead of sampleDensityWithAnalyticalGradient.
    expectOrdered(body, [
      'let entropyShear = applyEntropicTimeShear(',
      'let spectralFlow = applySpectralDimensionFlow(',
      'samplePos = spectralFlow.position',
      'spectralEmissionGain = spectralFlow.emissionGain',
      'spectralOpacityScale = spectralFlow.opacityScale',
      'quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms)',
      'gradient = ensureGradient(samplePos, animTime, uniforms, &gradCache)',
      'computeEffectiveDensity(',
      'rho * spectralOpacityScale',
      'computeEmissionLit(rho, sCenter, phase, samplePos',
      'spectralEmissionGain',
    ])
  })

  it('resamples full density-grid raymarching path and changes opacity and emission', () => {
    const body = functionSlice(generateVolumeRaymarchGridBlock(false), 'volumeRaymarchGrid')

    expectOrdered(body, [
      'let entropyShear = applyEntropicTimeShear(',
      'let spectralFlow = applySpectralDimensionFlow(',
      'pos = spectralFlow.position',
      'spectralEmissionGain = spectralFlow.emissionGain',
      'spectralOpacityScale = spectralFlow.opacityScale',
      // PERF (OPT-PERF-2): post-warp re-sample is now consolidated into the
      // loadGridSampleState* helper.
      'loadGridSampleState',
      'computeEffectiveDensity(',
      'rho * spectralOpacityScale',
      'computeEmissionLit(colorRho, colorS, phase, pos',
      'emission *= spectralEmissionGain',
    ])
  })

  it('resamples simple compute-grid raymarching path and changes opacity and emission', () => {
    const body = functionSlice(generateVolumeRaymarchGridSimpleBlock(), 'volumeRaymarchGrid')

    expectOrdered(body, [
      'let entropyShear = applyEntropicTimeShear(',
      'let spectralFlow = applySpectralDimensionFlow(',
      'pos = spectralFlow.position',
      'spectralEmissionGain = spectralFlow.emissionGain',
      'spectralOpacityScale = spectralFlow.opacityScale',
      // PERF (OPT-PERF-2): post-warp re-sample is now consolidated into the
      // loadGridSampleState* helper.
      'loadGridSampleState',
      'computeEffectiveDensity(',
      'rho * spectralOpacityScale',
      'computeEmissionLit(emissionRho, emissionS, phase, pos',
      'emission *= spectralEmissionGain',
    ])
  })
})
