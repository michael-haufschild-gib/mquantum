/**
 * Tests for observable expectation value computation.
 *
 * Verifies the CPU-side readback processing in ObservablesComputeSetup
 * and the dispatch gating logic in TDSEObservablesDispatch.
 *
 * @module tests/rendering/webgpu/passes/observablesCompute
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  createObservablesBuffers,
  MAX_OBS_CHANNELS,
  processObservablesReadback,
} from '@/rendering/webgpu/passes/ObservablesComputeSetup'
import { dispatchDiagnostics } from '@/rendering/webgpu/passes/TDSEComputePassDispatchers'
import {
  type ObservablesState,
  shouldDispatchObs,
  supportsFlatFourierObservables,
  writeObservablesUniforms,
} from '@/rendering/webgpu/passes/TDSEObservablesDispatch'

const hadGPUBufferUsage = 'GPUBufferUsage' in globalThis

beforeAll(() => {
  if (!hadGPUBufferUsage) {
    Object.defineProperty(globalThis, 'GPUBufferUsage', {
      configurable: true,
      value: {
        MAP_READ: 0x0001,
        COPY_SRC: 0x0004,
        COPY_DST: 0x0008,
        STORAGE: 0x0080,
      },
    })
  }
})

afterAll(() => {
  if (!hadGPUBufferUsage) {
    delete (globalThis as Record<string, unknown>).GPUBufferUsage
  }
})

function createMockDevice(): {
  device: GPUDevice
  createBuffer: ReturnType<typeof vi.fn>
  writeBuffer: ReturnType<typeof vi.fn>
} {
  const createBuffer = vi.fn((descriptor: GPUBufferDescriptor) => ({
    label: descriptor.label,
    size: Number(descriptor.size),
    usage: descriptor.usage,
    destroy: vi.fn(),
  }))
  const writeBuffer = vi.fn()
  return {
    device: {
      createBuffer,
      queue: { writeBuffer },
    } as unknown as GPUDevice,
    createBuffer,
    writeBuffer,
  }
}

function makeObservablesState(
  obsResources: ReturnType<typeof createObservablesBuffers>,
  totalSites: number
): ObservablesState {
  return {
    obsResources,
    obsPosReduceBG: null,
    obsPosFinalBG: null,
    obsMomReduceBG: null,
    obsMomFinalBG: null,
    esSpectrumBG: null,
    esMappingInFlight: false,
    obsMappingInFlight: false,
    obsEnabled: true,
    psiBuffer: null,
    potentialBuffer: null,
    fftScratchA: null,
    totalSites,
    pl: null,
    diagGeneration: 0,
  }
}

describe('processObservablesReadback', () => {
  it('returns null for zero position norm', () => {
    const posData = new Float32Array([0, 0, 0, 0, 0, 0])
    const momData = new Float32Array([1, 0, 0.25, 0, 0.25, 0])
    expect(processObservablesReadback(posData, momData, 2, 1)).toBeNull()
  })

  it('returns null for zero momentum norm', () => {
    const posData = new Float32Array([1, 0, 1, 0, 1, 0])
    const momData = new Float32Array([0, 0, 0, 0, 0, 0])
    expect(processObservablesReadback(posData, momData, 2, 1)).toBeNull()
  })

  it.each([
    {
      label: 'NaN position norm',
      posData: new Float32Array([Number.NaN, 0, 1, 0]),
      momData: new Float32Array([1, 0, 0.5]),
    },
    {
      label: 'infinite momentum norm',
      posData: new Float32Array([1, 0, 1, 0]),
      momData: new Float32Array([Number.POSITIVE_INFINITY, 0, 0.5]),
    },
    {
      label: 'non-finite moment',
      posData: new Float32Array([1, Number.POSITIVE_INFINITY, 1, 0]),
      momData: new Float32Array([1, 0, 0.5]),
    },
  ])('returns null for invalid readback data: $label', ({ posData, momData }) => {
    expect(processObservablesReadback(posData, momData, 1, 1)).toBeNull()
  })

  it('returns null when physics constants are invalid', () => {
    const posData = new Float32Array([1, 0, 1, 0])
    const momData = new Float32Array([1, 0, 0.5])

    expect(processObservablesReadback(posData, momData, 1, Number.NaN)).toBeNull()
    expect(processObservablesReadback(posData, momData, 1, 1, 0)).toBeNull()
  })

  it('computes position mean correctly for 2D', () => {
    // 2D: [norm, x_mean, x_sq, y_mean, y_sq, V_energy]
    const posData = new Float32Array([1.0, 2.0, 5.0, 0.0, 1.0, 0.0])
    const momData = new Float32Array([1.0, 0.0, 0.5, 0.0, 0.5])
    const result = processObservablesReadback(posData, momData, 2, 1.0)

    expect(result?.positionMean[0]).toBeCloseTo(2.0)
    expect(result?.positionMean[1]).toBeCloseTo(0.0)
  })

  it('computes variance as <x²> - <x>²', () => {
    // 1D: [norm, x_mean, x_sq, V_energy]
    // <x>=2, <x²>=5 → var = 5 - 4 = 1
    const posData = new Float32Array([1.0, 2.0, 5.0, 0.0])
    const momData = new Float32Array([1.0, 0.0, 0.5])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    expect(result!.positionVariance[0]).toBeCloseTo(1.0)
  })

  it('computes momentum with ℏ scaling', () => {
    // 1D: <k>=3, ℏ=2 → <p> = ℏ<k> = 6
    const posData = new Float32Array([1.0, 0.0, 1.0, 0.0])
    const momData = new Float32Array([1.0, 3.0, 10.0])
    const result = processObservablesReadback(posData, momData, 1, 2.0)

    expect(result!.momentumMean[0]).toBeCloseTo(6.0)
  })

  it('uncertainty product for minimum-uncertainty state', () => {
    // Gaussian: Δx=1, Δk=0.5 → Δp=ℏΔk=0.5 (ℏ=1) → ΔxΔp = 0.5 = ℏ/2
    const posData = new Float32Array([1.0, 0.0, 1.0, 0.0])
    const momData = new Float32Array([1.0, 0.0, 0.25])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    expect(result!.uncertaintyProduct[0]).toBeCloseTo(0.5)
    expect(result!.activeDims).toBe(1)
  })

  it('reports activeDims correctly for 3D', () => {
    // 3D: [norm, x0_mean, x0_sq, x1_mean, x1_sq, x2_mean, x2_sq, V_energy]
    const posData = new Float32Array([1, 0, 1, 0, 1, 0, 1, 0])
    const momData = new Float32Array([1, 0, 0.25, 0, 0.25, 0, 0.25])
    const result = processObservablesReadback(posData, momData, 3, 1.0)

    expect(result!.activeDims).toBe(3)
  })

  it('clamps negative variance to zero', () => {
    // Numerical noise: <x²>=0.9999, <x>=1.0001 → raw var < 0
    const posData = new Float32Array([1.0, 1.0001, 0.9999, 0.0])
    const momData = new Float32Array([1.0, 0.0, 0.25])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    expect(result!.positionVariance[0]).toBeGreaterThanOrEqual(0)
  })

  it('includes potential energy in totalEnergy', () => {
    // 1D: norm=2, V_channel=6 → ⟨V⟩ = 6/2 = 3
    // Kinetic: ℏ²⟨k²⟩/(2m) = 1² * 0.5 / 2 = 0.25 (ℏ=1, <k²>=0.5)
    const posData = new Float32Array([2.0, 0.0, 1.0, 6.0])
    const momData = new Float32Array([1.0, 0.0, 0.5])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    const expectedKinetic = 0.5 / 2 // ℏ²⟨k²⟩/(2m) = 1*0.5/2 = 0.25
    const expectedPotential = 6.0 / 2.0 // V_raw / posNorm = 3
    expect(result!.totalEnergy).toBeCloseTo(expectedKinetic + expectedPotential)
  })

  it('totalEnergy is kinetic-only when potential channel is absent', () => {
    // Old-format data without V channel (shorter array)
    const posData = new Float32Array([1.0, 0.0, 1.0])
    const momData = new Float32Array([1.0, 0.0, 0.5])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    // Only kinetic: ℏ²⟨k²⟩/(2m) = 0.25
    expect(result!.totalEnergy).toBeCloseTo(0.25)
  })

  it('handles harmonic oscillator ground state ⟨V⟩ = ⟨T⟩ = E/2', () => {
    // For a 1D harmonic oscillator ground state (ℏω=1):
    // ⟨T⟩ = 0.25, ⟨V⟩ = 0.25, E = 0.5
    // Position: norm=1, <x>=0, <x²>=0.5 (σ²=0.5), V=0.5*ω²<x²>=0.25
    // Momentum: norm=1, <k>=0, <k²>=0.5 → T = ℏ²·0.5/2 = 0.25
    const posData = new Float32Array([1.0, 0.0, 0.5, 0.25])
    const momData = new Float32Array([1.0, 0.0, 0.5])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    expect(result!.totalEnergy).toBeCloseTo(0.5)
    // ΔxΔp should be exactly ℏ/2 for ground state
    expect(result!.uncertaintyProduct[0]).toBeCloseTo(0.5)
  })

  it('computes 11D observables without overflow', () => {
    // 11D: channels = 2 + 2*11 = 24 = MAX_OBS_CHANNELS
    const posData = new Float32Array(MAX_OBS_CHANNELS)
    const momData = new Float32Array(MAX_OBS_CHANNELS)
    posData[0] = 1 // norm
    momData[0] = 1 // knorm
    for (let d = 0; d < 11; d++) {
      posData[1 + d * 2] = 0 // <x_d> = 0
      posData[2 + d * 2] = 0.5 // <x_d²> = 0.5
      momData[1 + d * 2] = 0 // <k_d> = 0
      momData[2 + d * 2] = 0.5 // <k_d²> = 0.5
    }
    posData[23] = 2.75 // V channel

    const result = processObservablesReadback(posData, momData, 11, 1.0)

    expect(result!.activeDims).toBe(11)
    // All dimensions have same stats
    for (let d = 0; d < 11; d++) {
      expect(result!.positionMean[d]).toBeCloseTo(0)
      expect(result!.positionVariance[d]).toBeCloseTo(0.5)
      expect(result!.momentumMean[d]).toBeCloseTo(0)
    }
    // Total kinetic = 11 * ℏ²*0.5/2 = 2.75
    // Potential = 2.75/1 = 2.75
    expect(result!.totalEnergy).toBeCloseTo(5.5)
  })

  it('clamps out-of-range lattice dimensions to the fixed observable channel layout', () => {
    const posData = new Float32Array(MAX_OBS_CHANNELS)
    const momData = new Float32Array(MAX_OBS_CHANNELS)
    posData[0] = 1
    momData[0] = 1
    for (let d = 0; d < 11; d++) {
      posData[1 + d * 2] = 0
      posData[2 + d * 2] = 0.5
      momData[1 + d * 2] = 0
      momData[2 + d * 2] = 0.5
    }
    posData[23] = 2.75

    const result = processObservablesReadback(posData, momData, 12.8, 1.0)

    expect(result?.activeDims).toBe(11)
    expect(result?.totalEnergy).toBeCloseTo(5.5)
  })

  it('normalizes by position norm for potential energy', () => {
    // norm=4, V_raw=8 → ⟨V⟩ = 8/4 = 2
    const posData = new Float32Array([4.0, 0.0, 1.0, 8.0])
    const momData = new Float32Array([4.0, 0.0, 1.0])
    const result = processObservablesReadback(posData, momData, 1, 1.0)

    // Kinetic: ℏ²*(<k²>/momNorm)/(2m) = 1*(1/4)/2 = 0.125
    // Potential: 8/4 = 2
    expect(result!.totalEnergy).toBeCloseTo(2.125)
  })
})

describe('createObservablesBuffers', () => {
  it('sanitizes invalid dimensions and site counts before sizing GPU buffers', () => {
    const { device, createBuffer } = createMockDevice()

    const resources = createObservablesBuffers(device, Number.NaN, 12.8)

    expect(resources.totalSites).toBe(1)
    expect(resources.numWorkgroups).toBe(1)
    expect(resources.posNumChannels).toBe(MAX_OBS_CHANNELS)
    expect(resources.momNumChannels).toBe(MAX_OBS_CHANNELS - 1)
    for (const [descriptor] of createBuffer.mock.calls as [GPUBufferDescriptor][]) {
      expect(Number.isFinite(Number(descriptor.size))).toBe(true)
      expect(Number(descriptor.size)).toBeGreaterThanOrEqual(4)
    }
  })
})

describe('writeObservablesUniforms', () => {
  it('writes sanitized finite observable uniforms for malformed runtime config', () => {
    const { device, writeBuffer } = createMockDevice()
    const resources = createObservablesBuffers(device, Number.NaN, 12.8)
    const state = makeObservablesState(resources, Number.NaN)
    const config = {
      latticeDim: 12.8,
      gridSize: [64, Number.NaN, -3, 16, 16, 16, 16, 16, 16, 16, 16, 16],
      spacing: [0.2, Number.NaN, 0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
      compactDims: [],
      compactRadii: [],
      metric: { kind: 'flat' },
      hbar: Number.NaN,
      mass: 0,
    } as unknown as Parameters<typeof writeObservablesUniforms>[1]

    writeObservablesUniforms(device, config, state, [Number.NaN, 0, 16])

    const posWrite = writeBuffer.mock.calls.find(
      ([buffer]) => (buffer as { label?: string }).label === 'obs-pos-uniform'
    )!
    const energyWrite = writeBuffer.mock.calls.find(
      ([buffer]) => (buffer as { label?: string }).label === 'energy-spectrum-uniform'
    )!
    const posU32 = new Uint32Array(posWrite[2] as ArrayBuffer)
    const posF32 = new Float32Array(posWrite[2] as ArrayBuffer)
    const esU32 = new Uint32Array(energyWrite[2] as ArrayBuffer)
    const esF32 = new Float32Array(energyWrite[2] as ArrayBuffer)

    expect(posU32[0]).toBe(1)
    expect(posU32[2]).toBe(11)
    expect(posU32[3]).toBe(MAX_OBS_CHANNELS)
    expect(posU32[5]).toBe(64)
    expect(posU32[16]).toBe(1)
    expect(posU32[17]).toBe(1)
    for (let d = 0; d < 11; d++) expect(Number.isFinite(posF32[28 + d])).toBe(true)

    expect(esU32[0]).toBe(1)
    expect(esU32[6]).toBe(11)
    expect(esF32[4]).toBe(1)
    expect(esF32[5]).toBe(1)
    expect(Number.isFinite(esF32[3])).toBe(true)
  })
})

describe('dispatchDiagnostics observables path', () => {
  it('uses sanitized observable resource site count for energy-spectrum dispatch', () => {
    const { device } = createMockDevice()
    const resources = createObservablesBuffers(device, Number.NaN, 1)
    const obsState = {
      ...makeObservablesState(resources, Number.NaN),
      obsPosReduceBG: {} as GPUBindGroup,
      obsPosFinalBG: {} as GPUBindGroup,
      obsMomReduceBG: {} as GPUBindGroup,
      obsMomFinalBG: {} as GPUBindGroup,
      esSpectrumBG: {} as GPUBindGroup,
      obsMappingInFlight: true,
    }
    const dispatches: Array<{ label: string; x: number }> = []
    const ctx = {
      device,
      encoder: { clearBuffer: vi.fn() },
      beginComputePass: ({ label }: { label: string }) => ({
        label,
        end: vi.fn(),
      }),
    }
    const config = {
      latticeDim: 1,
      gridSize: [64],
      spacing: [0.1],
      compactDims: [],
      compactRadii: [],
      metric: { kind: 'flat' },
      hbar: 1,
      mass: 1,
      branchingEnabled: false,
      barrierCenter: 0,
    } as unknown as Parameters<typeof dispatchDiagnostics>[1]
    const params = {
      pl: {
        diagReducePipeline: {} as GPUComputePipeline,
        diagFinalizePipeline: {} as GPUComputePipeline,
        obsMomReducePipeline: {} as GPUComputePipeline,
        obsMomFinalPipeline: {} as GPUComputePipeline,
        energySpectrumPipeline: {} as GPUComputePipeline,
        obsPosReducePipeline: {} as GPUComputePipeline,
        obsPosFinalPipeline: {} as GPUComputePipeline,
      },
      bg: {
        diagReduceBG: {} as GPUBindGroup,
        diagFinalizeBG: {} as GPUBindGroup,
        renormalizeUniformBuffer: null,
      },
      diagState: {
        diagResultBuffer: null,
        diagStagingBuffer: null,
        diagMappingInFlight: false,
        diagGeneration: 0,
        simTime: 0,
      },
      obsState,
      diagUniformBuffer: {} as GPUBuffer,
      totalSites: Number.NaN,
      diagNumWorkgroups: 1,
      simTime: 0,
      computeStrides: () => [1],
      observablesMomentumFFT: vi.fn(),
      dispatchCompute: (
        pass: GPUComputePassEncoder,
        _pipeline: GPUComputePipeline,
        _bindGroups: GPUBindGroup[],
        x: number
      ) => {
        dispatches.push({ label: (pass as unknown as { label: string }).label, x })
      },
    } as unknown as Parameters<typeof dispatchDiagnostics>[3]

    dispatchDiagnostics(
      ctx as unknown as Parameters<typeof dispatchDiagnostics>[0],
      config,
      false,
      params
    )

    expect(dispatches.find((entry) => entry.label === 'energy-spectrum')?.x).toBe(1)
  })
})

describe('shouldDispatchObs', () => {
  const baseConfig = {
    latticeDim: 3,
    metric: { kind: 'flat' },
    diagnosticsEnabled: false,
    diagnosticsInterval: 10,
  } as Parameters<typeof shouldDispatchObs>[2]

  it('returns false when observables disabled', () => {
    expect(shouldDispatchObs(false, 100, baseConfig)).toBe(false)
  })

  it('returns true when frame counter reaches default decimation', () => {
    // DIAG_DECIMATION = 5, so frameCounter + 1 >= 5 → frameCounter >= 4
    expect(shouldDispatchObs(true, 4, baseConfig)).toBe(true)
  })

  it('returns false before default decimation threshold', () => {
    expect(shouldDispatchObs(true, 3, baseConfig)).toBe(false)
  })

  it('uses diagnosticsInterval when diagnostics enabled', () => {
    const config = { ...baseConfig, diagnosticsEnabled: true, diagnosticsInterval: 10 }
    expect(shouldDispatchObs(true, 8, config)).toBe(false)
    expect(shouldDispatchObs(true, 9, config)).toBe(true)
  })

  it('falls back to DIAG_DECIMATION when interval is 0', () => {
    const config = { ...baseConfig, diagnosticsEnabled: true, diagnosticsInterval: 0 }
    // DIAG_DECIMATION = 5
    expect(shouldDispatchObs(true, 4, config)).toBe(true)
    expect(shouldDispatchObs(true, 3, config)).toBe(false)
  })

  it('dispatches every frame when interval is 1', () => {
    const config = { ...baseConfig, diagnosticsEnabled: true, diagnosticsInterval: 1 }
    expect(shouldDispatchObs(true, 0, config)).toBe(true)
  })

  it('does not dispatch flat-FFT observables for curved metrics', () => {
    const config = {
      ...baseConfig,
      metric: { kind: 'morrisThorne' as const, throatRadius: 0.5 },
    }
    expect(shouldDispatchObs(true, 100, config)).toBe(false)
  })

  it('allows flat torus observables', () => {
    const config = { ...baseConfig, metric: { kind: 'torus' as const } }
    expect(shouldDispatchObs(true, 4, config)).toBe(true)
  })
})

describe('supportsFlatFourierObservables', () => {
  it('matches solver metric normalization for dimension-degenerate metrics', () => {
    expect(
      supportsFlatFourierObservables({
        latticeDim: 2,
        metric: { kind: 'sphere2D', sphereRadius: 1.5 },
      })
    ).toBe(true)
    expect(
      supportsFlatFourierObservables({
        latticeDim: 1,
        metric: { kind: 'morrisThorne', throatRadius: 0.5 },
      })
    ).toBe(true)
  })

  it('keeps supported curved metrics off the flat Fourier observables path', () => {
    expect(
      supportsFlatFourierObservables({
        latticeDim: 3,
        metric: { kind: 'sphere2D', sphereRadius: 1.5 },
      })
    ).toBe(false)
    expect(
      supportsFlatFourierObservables({
        latticeDim: 2,
        metric: { kind: 'morrisThorne', throatRadius: 0.5 },
      })
    ).toBe(false)
  })
})
