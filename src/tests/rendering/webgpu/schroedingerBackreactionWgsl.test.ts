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
    expect(grid).toContain('gridSample = sampleDensityFromGrid(pos, uniforms)')
    expect(grid).toContain('emission *= causticMultiplier')
  })

  it('applies backreaction before HQ analytic density and emission sampling', () => {
    const hqBody = functionSlice(volumeRaymarchBlock, 'volumeRaymarchHQ')

    expectOrdered(hqBody, [
      'let metric = applyQuantumBackreactionMetric(',
      'samplePos = metric.position',
      'quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms)',
      'sampleDensityWithAnalyticalGradient(samplePos, animTime, uniforms)',
    ])
    expectOrdered(hqBody, [
      'quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms)',
      'sampleWithTetrahedralGradient(samplePos, animTime, 0.05, uniforms)',
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

    expectOrdered(simpleGridBody, [
      'let backreactionActive = isQuantumBackreactionActive(uniforms)',
      'var gridSample = sampleDensityFromGrid(pos, uniforms)',
      'let metric = applyQuantumBackreactionMetric(',
      'pos = metric.position',
      'gridSample = sampleDensityFromGrid(pos, uniforms)',
      'emission = computeEmissionLit(emissionRho, emissionS, phase, pos',
      'emission *= causticMultiplier',
    ])
  })
})
