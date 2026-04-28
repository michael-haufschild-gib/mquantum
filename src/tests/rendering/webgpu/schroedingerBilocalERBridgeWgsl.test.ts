import { describe, expect, it } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'
import { volumeRaymarchBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarch.wgsl'
import {
  generateVolumeRaymarchGridBlock,
  generateVolumeRaymarchGridSimpleBlock,
} from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl'

import { expectOrdered, functionSlice } from './wgslTestHelpers'

describe('Schroedinger bilocal ER bridge WGSL composition', () => {
  it('includes topology uniforms and helper contract', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 4,
      quantumMode: 'hydrogenND',
      isosurface: false,
      useDensityGrid: false,
    })

    expect(wgsl).toContain('bilocalERBridgeEnabled: u32')
    expect(wgsl).toContain('bilocalERBridgeStrength: f32')
    expect(wgsl).toContain('bilocalERBridgeThroatRadius: f32')
    expect(wgsl).toContain('bilocalERBridgePhaseLock: f32')
    expect(wgsl).toContain('struct BilocalERBridgeTopology')
    expect(wgsl).toContain('fn applyBilocalERBridgeTopology(')
    expect(wgsl).toContain(
      'remoteEndpoint = vec3f(-worldPosition.x, worldPosition.y, worldPosition.z)'
    )
    expect(wgsl).toContain('sqrt(max(localRho, 0.0) * max(remoteRho, 0.0)) / peakDensity')
    expect(wgsl).toContain('0.5 + 0.5 * cos(localPhase - remotePhase)')
    expect(wgsl).toContain(
      'clamp(amplitudeWeight * phaseGate * throatSoftening * logWindow, 0.0, 1.0)'
    )
    expect(wgsl).toContain('transverseToRay = toThroat - rayN * dot(toThroat, rayN)')
    expect(wgsl).toContain('worldPosition + transverseToRay * warpScale')
  })

  it('applies topology before analytic density and emission integration', () => {
    const body = functionSlice(volumeRaymarchBlock, 'volumeRaymarch')

    expectOrdered(body, [
      'let remoteEndpoint = vec3f(-pos.x, pos.y, pos.z)',
      'let remoteDensityInfo = sampleDensityWithPhase(remoteEndpoint, animTime, uniforms)',
      'let bridge = applyBilocalERBridgeTopology(',
      'samplePos = bridge.position',
      'let warpedDensityResult = sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms)',
      'let emission = computeEmissionLit(rho, sCenter, phase, samplePos',
      '* causticMultiplier * bridgeGain',
    ])
  })

  it('applies topology before HQ analytic density and emission integration', () => {
    const body = functionSlice(volumeRaymarchBlock, 'volumeRaymarchHQ')

    expectOrdered(body, [
      'let remoteEndpoint = vec3f(-pos.x, pos.y, pos.z)',
      'let remoteDensityInfo = sampleDensityWithPhase(remoteEndpoint, animTime, uniforms)',
      'let bridge = applyBilocalERBridgeTopology(',
      'samplePos = bridge.position',
      'quickCheck = sampleDensityWithPhase(samplePos, animTime, uniforms)',
      'let emission = computeEmissionLit(rho, sCenter, phase, samplePos',
      '* causticMultiplier * bridgeGain',
    ])
  })

  it('applies topology in full density-grid raymarcher before backreaction and emission', () => {
    const body = functionSlice(generateVolumeRaymarchGridBlock(false), 'volumeRaymarchGrid')

    expectOrdered(body, [
      'let remoteEndpoint = vec3f(-basePos.x, basePos.y, basePos.z)',
      'let remoteGridSample = sampleDensityFromGrid(remoteEndpoint, uniforms)',
      'let bridge = applyBilocalERBridgeTopology(',
      'pos = bridge.position',
      'gridSample = sampleDensityFromGrid(pos, uniforms)',
      'if (backreactionActive && rho >= EMPTY_SKIP_THRESHOLD)',
      'emission *= causticMultiplier',
      'emission *= bridgeGain',
    ])
  })

  it('applies topology in simple compute-grid raymarcher before backreaction and emission', () => {
    const body = functionSlice(generateVolumeRaymarchGridSimpleBlock(), 'volumeRaymarchGrid')

    expectOrdered(body, [
      'let remoteEndpoint = vec3f(-basePos.x, basePos.y, basePos.z)',
      'let remoteGridSample = sampleDensityFromGrid(remoteEndpoint, uniforms)',
      'let bridge = applyBilocalERBridgeTopology(',
      'pos = bridge.position',
      'gridSample = sampleDensityFromGrid(pos, uniforms)',
      'if (backreactionActive && rho >= EMPTY_SKIP_THRESHOLD)',
      'emission *= causticMultiplier',
      'emission *= bridgeGain',
    ])
  })
})
