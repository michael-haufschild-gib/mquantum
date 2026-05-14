import { describe, expect, it } from 'vitest'

import { DEFAULT_DIRAC_CONFIG, type DiracConfig } from '@/lib/geometry/extended/dirac'
import { writeDiracUniforms } from '@/rendering/webgpu/passes/DiracComputePassUniforms'
import {
  DIRAC_UNIFORM_SIZE,
  DIRAC_UNIFORMS_LAYOUT,
} from '@/rendering/webgpu/passes/diracUniformsLayout'

function fakeDevice(): GPUDevice {
  return { queue: { writeBuffer: () => undefined } } as unknown as GPUDevice
}

function writeConfig(config: DiracConfig): Uint32Array {
  const uniformData = new ArrayBuffer(DIRAC_UNIFORM_SIZE)
  const u32 = new Uint32Array(uniformData)
  const f32 = new Float32Array(uniformData)

  writeDiracUniforms(fakeDevice(), {} as GPUBuffer, uniformData, u32, f32, {
    config,
    totalSites: 64 * 64 * 64,
    currentSpinorSize: 4,
    simTime: 0,
    maxDensity: 1,
    strides: [64 * 64, 64, 1],
    boundingRadius: 4.8,
  })

  return u32
}

describe('DiracComputePassUniforms', () => {
  it('rejects stale uniform buffers before writing live offsets', () => {
    const uniformData = new ArrayBuffer(DIRAC_UNIFORM_SIZE - 4)
    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)

    expect(() =>
      writeDiracUniforms(fakeDevice(), {} as GPUBuffer, uniformData, u32, f32, {
        config: DEFAULT_DIRAC_CONFIG,
        totalSites: 64 * 64 * 64,
        currentSpinorSize: 4,
        simTime: 0,
        maxDensity: 1,
        strides: [64 * 64, 64, 1],
        boundingRadius: 4.8,
      })
    ).toThrow(
      `writeDiracUniforms expected ${DIRAC_UNIFORM_SIZE} bytes, got ${DIRAC_UNIFORM_SIZE - 4}`
    )
  })

  it('packs selected potential type when potential physics is enabled', () => {
    const u32 = writeConfig({
      ...DEFAULT_DIRAC_CONFIG,
      potentialType: 'barrier',
      showPotential: true,
    })

    expect(u32[DIRAC_UNIFORMS_LAYOUT.index.potentialType]).toBe(2)
    expect(u32[DIRAC_UNIFORMS_LAYOUT.index.showPotential]).toBe(1)
  })

  it('packs potential type as none when potential physics is disabled', () => {
    const u32 = writeConfig({
      ...DEFAULT_DIRAC_CONFIG,
      potentialType: 'barrier',
      showPotential: false,
    })

    expect(u32[DIRAC_UNIFORMS_LAYOUT.index.potentialType]).toBe(0)
    expect(u32[DIRAC_UNIFORMS_LAYOUT.index.showPotential]).toBe(0)
  })
})
