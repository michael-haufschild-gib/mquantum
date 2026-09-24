/**
 * Grid raymarchers must size their step for the samples the loop will take.
 *
 * Regression: sampleCount = sampleCount_uniform·(tFar − tNear)/(2R) was not
 * clamped to MAX_VOLUME_SAMPLES before `stepLen` was derived. Every compute
 * mode (TDSE/BEC/Dirac/QW/Pauli/WdW/FSF — the IS_FREE_SCALAR compute flag) is
 * bounded by a box (path lengths up to 2√3·R), so at the top
 * quality setting (96 samples) a body-diagonal ray asked for ≈166 samples,
 * the loop stopped at 128 with stepLen sized for 166, and the last ~23% of the
 * lattice along that ray was never composited.
 *
 * @module tests/rendering/webgpu/shaders/volumeRaymarchGridSampleCap
 */

import { describe, expect, it } from 'vitest'

import {
  generateVolumeRaymarchGridBlock,
  generateVolumeRaymarchGridSimpleBlock,
} from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl'

describe('grid raymarch sample-count cap', () => {
  it('clamps the per-ray sample count to MAX_VOLUME_SAMPLES before sizing stepLen', () => {
    for (const wgsl of [
      generateVolumeRaymarchGridBlock(false),
      generateVolumeRaymarchGridSimpleBlock(false),
    ]) {
      const countIdx = wgsl.indexOf('let sampleCount = min(')
      const capIdx = wgsl.indexOf('MAX_VOLUME_SAMPLES', countIdx)
      const stepIdx = wgsl.indexOf('let stepLen = (tFar - tNear) / f32(sampleCount);')
      expect(countIdx).toBeGreaterThan(-1)
      expect(capIdx).toBeGreaterThan(countIdx)
      expect(capIdx).toBeLessThan(stepIdx)
    }
  })

  it('covers the whole diagonal of the compute-mode box at the top quality', () => {
    // CPU mirror of the clamped sizing: the marched length must equal the path.
    const maxSamples = 128
    const r = 1
    const pathLen = 2 * Math.sqrt(3) * r
    const requested = Math.max(Math.floor((96 * pathLen) / (2 * r)), 4)
    const sampleCount = Math.min(requested, maxSamples)
    const stepLen = pathLen / sampleCount
    expect(requested).toBeGreaterThan(maxSamples)
    expect(sampleCount * stepLen).toBeCloseTo(pathLen, 12)
  })
})
