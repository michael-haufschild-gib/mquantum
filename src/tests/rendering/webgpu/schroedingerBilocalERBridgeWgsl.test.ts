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
      // PERF (OPT-PERF-2): post-warp re-sample now invokes loadGridSampleState*
      // helper instead of inlining sampleDensityFromGrid directly.
      'loadGridSampleState',
      'if (backreactionActive && rho >= EMPTY_SKIP_THRESHOLD)',
      'emission *= causticMultiplier',
      'emission *= bridgeGain',
    ])
  })

  it('full grid raymarcher selects remote phase from the same channel as local phase under useRelPhaseGlobal', () => {
    // Regression: the local phase comes from `select(B - phaseOffset, A, useRelPhaseGlobal)`
    // (loadGridSampleState), so when the Diverging color algorithm activates relativePhase
    // (channel A) for HO/hydrogen, the remote endpoint must also read from A. Reading the
    // remote from B while the local came from A makes phaseAgreement = cos(rel - spatial),
    // which is physically meaningless and biases the bridge gain. The fix mirrors the local
    // select for the remote sample.
    const body = functionSlice(generateVolumeRaymarchGridBlock(false), 'volumeRaymarchGrid')

    expectOrdered(body, [
      'remotePhase = select(rotatedRemoteB, remoteGridSample.a, useRelPhaseGlobal)',
    ])
  })

  it('full grid raymarcher recomputes remoteLogDensity from log(remoteRho) when DENSITY_GRID_HAS_PHASE is false', () => {
    // Regression: in r16float storage (analytic modes, common case for HO/hydrogen
    // when the device supports r16float), `remoteGridSample.g` returns 0, so the
    // smoothstep log-window in applyBilocalERBridgeTopology saturates to 1.0 and
    // bypasses the low-density gate on the remote side. The recompute branch must
    // include the !DENSITY_GRID_HAS_PHASE case so both local and remote take the
    // log(rho) fallback path that loadGridSampleState already uses for sCenter.
    const body = functionSlice(generateVolumeRaymarchGridBlock(false), 'volumeRaymarchGrid')

    expect(body).toContain('if (IS_DUAL_CHANNEL || !DENSITY_GRID_HAS_PHASE) {')
    expectOrdered(body, [
      'var remoteLogDensity = remoteGridSample.g',
      'if (IS_DUAL_CHANNEL || !DENSITY_GRID_HAS_PHASE) {',
      'remoteLogDensity = log(remoteRho)',
    ])
  })

  it('applies topology in simple compute-grid raymarcher before backreaction and emission', () => {
    const body = functionSlice(generateVolumeRaymarchGridSimpleBlock(), 'volumeRaymarchGrid')

    expectOrdered(body, [
      'let remoteEndpoint = vec3f(-basePos.x, basePos.y, basePos.z)',
      'let remoteGridSample = sampleDensityFromGrid(remoteEndpoint, uniforms)',
      'let bridge = applyBilocalERBridgeTopology(',
      'pos = bridge.position',
      // PERF (OPT-PERF-2): post-warp re-sample now invokes loadGridSampleState*
      // helper instead of inlining sampleDensityFromGrid directly.
      'loadGridSampleState',
      'if (backreactionActive && rho >= EMPTY_SKIP_THRESHOLD)',
      'emission *= causticMultiplier',
      'emission *= bridgeGain',
    ])
  })
})
