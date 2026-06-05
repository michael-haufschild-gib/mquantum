import { describe, expect, it } from 'vitest'

import { DEFAULT_DIRAC_CONFIG, type DiracConfig } from '@/lib/geometry/extended/dirac'
import {
  effectiveDiracPotentialType,
  writeDiracUniforms,
} from '@/rendering/webgpu/passes/DiracComputePassUniforms'
import {
  DIRAC_UNIFORM_SIZE,
  DIRAC_UNIFORMS_LAYOUT,
} from '@/rendering/webgpu/passes/diracUniformsLayout'

function fakeDevice(): GPUDevice {
  return { queue: { writeBuffer: () => undefined } } as unknown as GPUDevice
}

function writeConfigViews(
  config: DiracConfig,
  overrides: Partial<{
    totalSites: number
    currentSpinorSize: number
    simTime: number
    maxDensity: number
    strides: number[]
    basisX: Float32Array
    basisY: Float32Array
    basisZ: Float32Array
    boundingRadius: number
  }> = {}
): { u32: Uint32Array; f32: Float32Array } {
  const uniformData = new ArrayBuffer(DIRAC_UNIFORM_SIZE)
  const u32 = new Uint32Array(uniformData)
  const f32 = new Float32Array(uniformData)

  writeDiracUniforms(fakeDevice(), {} as GPUBuffer, uniformData, u32, f32, {
    config,
    totalSites: overrides.totalSites ?? 64 * 64 * 64,
    currentSpinorSize: overrides.currentSpinorSize ?? 4,
    simTime: overrides.simTime ?? 0,
    maxDensity: overrides.maxDensity ?? 1,
    strides: overrides.strides ?? [64 * 64, 64, 1],
    basisX: overrides.basisX,
    basisY: overrides.basisY,
    basisZ: overrides.basisZ,
    boundingRadius: overrides.boundingRadius ?? 4.8,
  })

  return { u32, f32 }
}

function writeConfig(config: DiracConfig): Uint32Array {
  const { u32 } = writeConfigViews(config)
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

  it('does not enable potential physics for non-boolean showPotential values', () => {
    expect(
      effectiveDiracPotentialType({
        ...DEFAULT_DIRAC_CONFIG,
        potentialType: 'barrier',
        showPotential: 'false' as never,
      })
    ).toBe('none')
  })

  it('falls back to finite values for corrupted scalar and array inputs', () => {
    const { u32, f32 } = writeConfigViews(
      {
        ...DEFAULT_DIRAC_CONFIG,
        spacing: [0, Number.NaN, Number.POSITIVE_INFINITY],
        mass: Number.NaN,
        dt: Number.NEGATIVE_INFINITY,
        packetCenter: [Number.NaN, 0, 0],
        packetMomentum: [Number.POSITIVE_INFINITY, 0, 0],
        slicePositions: [Number.NaN],
      },
      {
        maxDensity: Number.POSITIVE_INFINITY,
        boundingRadius: Number.NaN,
        basisX: new Float32Array([Number.NaN, 0, 0]),
      }
    )
    const I = DIRAC_UNIFORMS_LAYOUT.index

    expect(f32[I.spacing]).toBeCloseTo(DEFAULT_DIRAC_CONFIG.spacing[0]!, 6)
    expect(f32[I.spacing + 1]).toBeCloseTo(DEFAULT_DIRAC_CONFIG.spacing[1]!, 6)
    expect(f32[I.spacing + 2]).toBeCloseTo(DEFAULT_DIRAC_CONFIG.spacing[2]!, 6)
    expect(f32[I.mass]).toBe(DEFAULT_DIRAC_CONFIG.mass)
    expect(f32[I.dt]).toBeCloseTo(DEFAULT_DIRAC_CONFIG.dt, 7)
    expect(f32[I.packetCenter]).toBe(0)
    expect(f32[I.packetMomentum]).toBe(0)
    expect(f32[I.slicePositions + 3]).toBe(0)
    expect(f32[I.boundingRadius]).toBe(2)
    expect(f32[I.densityScale]).toBe(1)
    expect(f32[I.basisX]).toBe(1)
    expect(Number.isFinite(f32[I.kGridScale])).toBe(true)
    expect(u32[I.showPotential]).toBe(0)
  })
})
