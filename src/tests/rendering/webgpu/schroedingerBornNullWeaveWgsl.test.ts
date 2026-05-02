import { describe, expect, it } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'
import { bornNullWeaveBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/bornNullWeave.wgsl'
import { volumeRaymarchBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarch.wgsl'
import {
  generateVolumeRaymarchGridBlock,
  generateVolumeRaymarchGridSimpleBlock,
} from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl'

import { expectOrdered, functionSlice } from './wgslTestHelpers'

describe('Schroedinger Born-null weave WGSL composition', () => {
  it('includes uniforms and null-aperture helper contract', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 6,
      quantumMode: 'hydrogenNDCoupled',
      isosurface: false,
      useDensityGrid: false,
    })

    expect(wgsl).toContain('bornNullWeaveEnabled: u32')
    expect(wgsl).toContain('bornNullWeaveStrength: f32')
    expect(wgsl).toContain('bornNullWeaveNodeWidth: f32')
    expect(wgsl).toContain('bornNullWeaveCirculation: f32')
    expect(wgsl).toContain('struct BornNullWeaveResult')
    expect(wgsl).toContain('fn isBornNullWeaveActive(')
    expect(wgsl).toContain('fn sampleBornNullCurrentWithPsi(')
    expect(wgsl).toContain('fn applyBornNullWeave(')
    expect(wgsl).toContain('fn applyBornNullWeaveRaymarch(')
    expect(wgsl).toContain('fn applyBornNullWeaveRaymarchHQ(')
    expect(wgsl).toContain('return BornNullWeaveResult(worldPosition, 1.0, 1.0, 0.0)')
    expect(wgsl).toContain(
      'let nodeGate = 1.0 - smoothstep(nodeWidth, 4.0 * nodeWidth, normalizedRho)'
    )
    expect(wgsl).toContain(
      'let currentGate = 1.0 - exp(-currentMag * circulation / max(densityProxy, 1e-8))'
    )
    expect(wgsl).toContain('let vacuumGate = smoothstep(-18.0, -2.0, logDensityProxy)')
    expect(wgsl).toContain('let apertureNormal = cross(j / jMag, localGradient / max(gradMag')
    expect(wgsl).toContain('worldPosition + displacement')
    expect(wgsl).toContain('let opacityScale = clamp(1.0 - apertureWeight')
  })

  it('resamples analytic volume after Born-null coordinate deformation', () => {
    const body = functionSlice(volumeRaymarchBlock, 'volumeRaymarch')

    // PERF: applyBornNullWeaveRaymarch was inlined here so the wrapper call
    // disappears when the effect is inactive. The wrapper still exists for
    // callers that have not yet been migrated. The behaviour contract that
    // matters: vacuum-bubble deformation runs first, then born-null weave is
    // gated on `bornNullWeaveActive`, computes a gradient (via the per-step
    // cache), warps samplePos, resamples density via sampleDensityWithPhaseAndFlow,
    // and the post-warp density+phase is what feeds compositeOverlay /
    // computeEmissionLit.
    expectOrdered(body, [
      'let vacuumBubble = applyVacuumBubbleLens(',
      'if (bornNullWeaveActive && rho >= EMPTY_SKIP_THRESHOLD)',
      'let bornGradient = ensureGradient(samplePos, animTime, uniforms, &gradCache)',
      // OPT-BORN-ANALYTICAL: Born is now dispatched through a hasAnalytical
      // branch — analytical path reuses the closed-form psi gradients on the
      // AnalyticalSample, fallback path keeps the original 3-evalPsi helper.
      'var bornNullWeave: BornNullWeaveResult',
      'bornNullWeave = applyBornNullWeaveAnalytical(',
      'bornNullWeave = applyBornNullWeave(',
      'samplePos = bornNullWeave.position',
      'sampleDensityWithPhaseAndFlow(samplePos, animTime, uniforms)',
      'rho = densityInfo.x',
      'computeEffectiveDensity(',
      'rho * spectralOpacityScale * vacuumBubbleOpacityScale * bornNullOpacityScale',
      'computeEmissionLit(rho, sCenter, phase, samplePos',
      'bornNullEmissionGain',
    ])
  })

  it('resamples HQ analytic volume before gradient and emission', () => {
    const body = functionSlice(volumeRaymarchBlock, 'volumeRaymarchHQ')

    // Same external-gate refactor for HQ. The post-warp density resample uses
    // sampleDensityWithPhase (rho/log/phase only — gradient is produced lazily
    // by ensureGradient at emission time and shared with upstream consumers).
    expectOrdered(body, [
      'let vacuumBubble = applyVacuumBubbleLens(',
      'if (bornNullWeaveActive && quickRho >= EMPTY_SKIP_THRESHOLD)',
      'let bornGradient = ensureGradient(samplePos, animTime, uniforms, &gradCache)',
      'let bornNullWeave = applyBornNullWeave(',
      'samplePos = bornNullWeave.position',
      'sampleDensityWithPhase(samplePos, animTime, uniforms)',
      'computeEffectiveDensity(',
      'rho * spectralOpacityScale * vacuumBubbleOpacityScale * bornNullOpacityScale',
      'computeEmissionLit(rho, sCenter, phase, samplePos',
      'bornNullEmissionGain',
    ])
  })

  it('resamples deformed positions inside Born-null adapter helpers', () => {
    const raymarch = functionSlice(bornNullWeaveBlock, 'applyBornNullWeaveRaymarch')
    const hq = functionSlice(bornNullWeaveBlock, 'applyBornNullWeaveRaymarchHQ')

    expectOrdered(raymarch, [
      'let gradient = computeBornNullWeaveGradient(samplePos, animTime, uniforms)',
      'let bornNullWeave = applyBornNullWeave(',
      'let warpedDensityResult = sampleDensityWithPhaseAndFlow(bornNullWeave.position',
      'warpedDensityResult[0]',
      'warpedDensityResult[1]',
    ])
    expectOrdered(hq, [
      'let psi = evalPsi(mapPosToND(samplePos, uniforms), animTime, uniforms)',
      'let bornNullWeave = applyBornNullWeave(',
      'sampleDensityWithPhase(bornNullWeave.position',
    ])
  })

  it('does not wire Born-null deformation into density-grid raymarchers', () => {
    const fullGrid = functionSlice(generateVolumeRaymarchGridBlock(false), 'volumeRaymarchGrid')
    const simpleGrid = functionSlice(generateVolumeRaymarchGridSimpleBlock(), 'volumeRaymarchGrid')

    expect(fullGrid).not.toContain('applyBornNullWeave(')
    expect(fullGrid).not.toContain('bornNullOpacityScale')
    expect(simpleGrid).not.toContain('applyBornNullWeave(')
    expect(simpleGrid).not.toContain('bornNullOpacityScale')
  })
})
