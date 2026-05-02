import { describe, expect, it } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'
import { volumeRaymarchBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarch.wgsl'
import {
  generateVolumeRaymarchGridBlock,
  generateVolumeRaymarchGridSimpleBlock,
} from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl'

import { expectOrdered, functionSlice } from './wgslTestHelpers'

describe('Schroedinger vacuum bubble lens WGSL composition', () => {
  it('includes uniforms and Coleman-De Luccia helper contract', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      quantumMode: 'hydrogenND',
      isosurface: false,
      useDensityGrid: false,
    })

    expect(wgsl).toContain('vacuumBubbleLensEnabled: u32')
    expect(wgsl).toContain('vacuumBubbleLensStrength: f32')
    expect(wgsl).toContain('vacuumBubbleWallRadius: f32')
    expect(wgsl).toContain('vacuumBubbleWallThickness: f32')
    expect(wgsl).toContain('vacuumBubbleTension: f32')
    expect(wgsl).toContain('vacuumBubbleBias: f32')
    expect(wgsl).toContain('struct VacuumBubbleLensResult')
    expect(wgsl).toContain('fn isVacuumBubbleLensActive(')
    expect(wgsl).toContain('fn applyVacuumBubbleLens(')
    expect(wgsl).toContain('return VacuumBubbleLensResult(worldPosition, 1.0, 1.0, 0.0, 0.0)')
    expect(wgsl).toContain(
      'let R = wallRadius * boundingRadius * (1.0 + 0.12 * sin(getVolumeTime(uniforms) * (0.35 + bias)))'
    )
    expect(wgsl).toContain('let wall = exp(-(wallCoordinate * wallCoordinate))')
    expect(wgsl).toContain('let inside = 1.0 - smoothstep(R - thickness, R + thickness, r)')
    expect(wgsl).toContain('let S_proxy = tension * R * R - bias * R * R * R')
    expect(wgsl).toContain('let tunnelingGate = clamp(')
    expect(wgsl).toContain('let refractedPosition = worldPosition - radialNormal * refraction')
    expect(wgsl).toContain('let opacityScale = mix(1.0, 0.55')
    expect(wgsl).toContain('let emissionGain = 1.0 + wall * tunnelingGate * strength')
  })

  it('resamples analytic volume after vacuum-bubble coordinate refraction', () => {
    const body = functionSlice(volumeRaymarchBlock, 'volumeRaymarch')

    expectOrdered(body, [
      'let vacuumBubbleActive = isVacuumBubbleLensActive(uniforms)',
      'let spectralFlow = applySpectralDimensionFlow(',
      'let vacuumBubble = applyVacuumBubbleLens(',
      'samplePos = vacuumBubble.position',
      'vacuumBubbleEmissionGain = vacuumBubble.emissionGain',
      'vacuumBubbleOpacityScale = vacuumBubble.opacityScale',
      'sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms)',
      'rho * spectralOpacityScale * vacuumBubbleOpacityScale',
      'vacuumBubbleEmissionGain',
    ])
  })

  it('resamples HQ analytic volume before gradient and emission', () => {
    const body = functionSlice(volumeRaymarchBlock, 'volumeRaymarchHQ')

    // PERF: HQ now uses ensureGradient at the emission point (per-step cache
    // shared with all spacetime effects) instead of sampleDensityWithAnalyticalGradient.
    expectOrdered(body, [
      'let vacuumBubbleActive = isVacuumBubbleLensActive(uniforms)',
      'let spectralFlow = applySpectralDimensionFlow(',
      'let vacuumBubble = applyVacuumBubbleLens(',
      'samplePos = vacuumBubble.position',
      'vacuumBubbleEmissionGain = vacuumBubble.emissionGain',
      'vacuumBubbleOpacityScale = vacuumBubble.opacityScale',
      'quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms)',
      'gradient = ensureGradient(samplePos, animTime, uniforms, &gradCache)',
      'rho * spectralOpacityScale * vacuumBubbleOpacityScale',
      'vacuumBubbleEmissionGain',
    ])
  })

  it('resamples full density-grid raymarching path and changes opacity and emission', () => {
    const body = functionSlice(generateVolumeRaymarchGridBlock(false), 'volumeRaymarchGrid')

    expectOrdered(body, [
      'let vacuumBubbleActive = isVacuumBubbleLensActive(uniforms)',
      'let spectralFlow = applySpectralDimensionFlow(',
      'let vacuumBubble = applyVacuumBubbleLens(',
      'pos = vacuumBubble.position',
      'vacuumBubbleEmissionGain = vacuumBubble.emissionGain',
      'vacuumBubbleOpacityScale = vacuumBubble.opacityScale',
      // PERF (OPT-PERF-2): post-warp re-sample now invokes loadGridSampleState*
      // helper instead of inlining the sampleDensityFromGrid call directly.
      'oadGridSampleState',
      'rho * spectralOpacityScale * vacuumBubbleOpacityScale',
      'emission *= vacuumBubbleEmissionGain',
    ])
  })

  it('resamples simple compute-grid raymarching path and changes opacity and emission', () => {
    const body = functionSlice(generateVolumeRaymarchGridSimpleBlock(), 'volumeRaymarchGrid')

    expectOrdered(body, [
      'let vacuumBubbleActive = isVacuumBubbleLensActive(uniforms)',
      'let spectralFlow = applySpectralDimensionFlow(',
      'let vacuumBubble = applyVacuumBubbleLens(',
      'pos = vacuumBubble.position',
      'vacuumBubbleEmissionGain = vacuumBubble.emissionGain',
      'vacuumBubbleOpacityScale = vacuumBubble.opacityScale',
      // PERF (OPT-PERF-2): post-warp re-sample now invokes loadGridSampleState*
      // helper instead of inlining the sampleDensityFromGrid call directly.
      'oadGridSampleState',
      'rho * spectralOpacityScale * vacuumBubbleOpacityScale',
      'emission *= vacuumBubbleEmissionGain',
    ])
  })
})
