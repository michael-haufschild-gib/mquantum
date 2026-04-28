import { describe, expect, it } from 'vitest'

import { DEFAULT_PAULI_CONFIG } from '@/lib/geometry/extended/pauli'
import {
  packPauliUniforms,
  PAULI_UNIFORM_SIZE,
} from '@/rendering/webgpu/passes/PauliComputePassBuffers'
import { pauliWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/pauliWriteGrid.wgsl'
import {
  generateVolumeRaymarchGridBlock,
  generateVolumeRaymarchGridSimpleBlock,
} from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl'

describe('Pauli spin helicity render view', () => {
  it('packs spinHelicity to fieldView enum 4', () => {
    const uniformData = new ArrayBuffer(PAULI_UNIFORM_SIZE)
    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)

    packPauliUniforms(u32, f32, {
      config: { ...DEFAULT_PAULI_CONFIG, fieldView: 'spinHelicity' },
      totalSites: 64 * 64 * 64,
      simTime: 0,
      maxDensity: 1,
      strides: [4096, 64, 1],
      boundingRadius: 5,
    })

    expect(u32[76]).toBe(4)
  })

  it('adds shader math for normalized spin curl helicity', () => {
    const branchStart = pauliWriteGridBlock.indexOf('params.fieldView == 4u')
    const branchEnd = pauliWriteGridBlock.indexOf('// Potential overlay', branchStart)
    const branch = pauliWriteGridBlock.slice(branchStart, branchEnd)

    expect(branchStart).toBeGreaterThan(0)
    expect(branchEnd).toBeGreaterThan(branchStart)
    expect(pauliWriteGridBlock).toContain('fn spinUnitAt')
    expect(pauliWriteGridBlock).toContain('fn spinTextureNeighbor')
    expect(branch).toContain('let dSdx =')
    expect(branch).toContain('let dSdy =')
    expect(branch).toContain('let dSdz =')
    expect(branch).toContain('let curlS = vec3f(')
    expect(branch).toContain('let spinHelicity = dot(spin, curlS);')
    expect(branch).toContain('abs(tanh(0.15 * spinHelicity))')
    expect(branch).toContain('outA = totalNorm')
  })

  it('uses alpha-channel total density for Pauli non-dual raymarch opacity', () => {
    for (const block of [
      generateVolumeRaymarchGridSimpleBlock(),
      generateVolumeRaymarchGridBlock(false),
    ]) {
      expect(block).toContain('fn gridOpacityDensity')
      expect(block).toContain('fn gridAdaptiveLogDensity')
      expect(block).toContain('IS_PAULI && !IS_DUAL_CHANNEL && DENSITY_GRID_HAS_PHASE')
      expect(block).toContain('var rho = gridOpacityDensity(gridSample) * adsAmplitudeSq;')
      expect(block).toContain('var colorRho: f32 = gridSample.r * adsAmplitudeSq;')
      expect(block).toContain('let midTotal = gridSkipDensity(probeMid);')
      expect(block).toContain('let logRhoForStep = gridAdaptiveLogDensity(rho, sCenter);')
    }
  })
})
