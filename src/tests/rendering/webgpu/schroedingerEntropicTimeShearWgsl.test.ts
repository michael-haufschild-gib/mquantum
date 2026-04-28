import { describe, expect, it } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'
import { volumeRaymarchBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarch.wgsl'
import {
  generateVolumeRaymarchGridBlock,
  generateVolumeRaymarchGridSimpleBlock,
} from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl'

function functionSlice(source: string, name: string): string {
  const start = source.indexOf(`fn ${name}(`)
  expect(start).toBeGreaterThanOrEqual(0)
  const next = source.indexOf('\nfn ', start + 1)
  return next === -1 ? source.slice(start) : source.slice(start, next)
}

function expectOrdered(source: string, needles: string[]): void {
  let cursor = -1
  for (const needle of needles) {
    const found = source.indexOf(needle, cursor + 1)
    expect(found).toBeGreaterThan(cursor)
    cursor = found
  }
}

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

  it('applies stable analytic order and resamples after entropy shear', () => {
    const body = functionSlice(volumeRaymarchBlock, 'volumeRaymarch')

    expectOrdered(body, [
      'let bridge = applyBilocalERBridgeTopology(',
      'sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms)',
      'let beforeBackreaction = samplePos',
      'let metric = applyQuantumBackreactionMetric(',
      'length(samplePos - beforeBackreaction) > 1e-6',
      'sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms)',
      'let entropyShear = applyEntropicTimeShear(',
      'samplePos = entropyShear.position',
      'sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms)',
      'computeEmissionLit(rho, sCenter, phase, samplePos',
      'entropyEmissionGain',
    ])
  })

  it('applies stable HQ analytic order and resamples before gradient/emission', () => {
    const body = functionSlice(volumeRaymarchBlock, 'volumeRaymarchHQ')

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
      'sampleDensityWithAnalyticalGradient(samplePos, animTime, uniforms)',
      'computeEmissionLit(rho, sCenter, phase, samplePos',
      'entropyEmissionGain',
    ])
  })

  it('applies stable full density-grid order', () => {
    const body = functionSlice(generateVolumeRaymarchGridBlock(false), 'volumeRaymarchGrid')

    expectOrdered(body, [
      'let bridge = applyBilocalERBridgeTopology(',
      'gridSample = sampleDensityFromGrid(pos, uniforms)',
      'let beforeBackreaction = pos',
      'let metric = applyQuantumBackreactionMetric(',
      'length(pos - beforeBackreaction) > 1e-6',
      'gridSample = sampleDensityFromGrid(pos, uniforms)',
      'let entropyShear = applyEntropicTimeShear(',
      'pos = entropyShear.position',
      'gridSample = sampleDensityFromGrid(pos, uniforms)',
      'computeEmissionLit(colorRho, colorS, phase, pos',
      'max(entropyGain, 0.0)',
    ])
  })

  it('applies stable simple compute-grid order', () => {
    const body = functionSlice(generateVolumeRaymarchGridSimpleBlock(), 'volumeRaymarchGrid')

    expectOrdered(body, [
      'let bridge = applyBilocalERBridgeTopology(',
      'gridSample = sampleDensityFromGrid(pos, uniforms)',
      'let beforeBackreaction = pos',
      'let metric = applyQuantumBackreactionMetric(',
      'length(pos - beforeBackreaction) > 1e-6',
      'gridSample = sampleDensityFromGrid(pos, uniforms)',
      'let entropyShear = applyEntropicTimeShear(',
      'pos = entropyShear.position',
      'gridSample = sampleDensityFromGrid(pos, uniforms)',
      'computeEmissionLit(emissionRho, emissionS, phase, pos',
      'max(entropyGain, 0.0)',
    ])
  })
})
