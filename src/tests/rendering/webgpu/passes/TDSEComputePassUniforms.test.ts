/**
 * TDSE Compute Pass Uniform packing tests.
 *
 * Tests the CPU-side logic that packs physics parameters into GPU uniform buffers.
 * A bug here means the WGSL shader receives wrong potential type, wrong mass,
 * wrong lattice dimensions, or wrong FFT parameters — producing silently
 * incorrect quantum dynamics.
 *
 * Also tests buildTdseFFTStagingData — the pre-computation of Stockham FFT
 * stage parameters. Wrong staging data = wrong FFT = wrong kinetic energy operator.
 */
import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import type { TdseConfig } from '@/lib/geometry/extended/types'
import { FFT_UNIFORM_SIZE } from '@/rendering/webgpu/passes/computePassUtils'
import {
  buildTdseFFTStagingData,
  type TdseUniformParams,
  writeTdseUniforms,
} from '@/rendering/webgpu/passes/TDSEComputePassUniforms'

function createTdseConfig(overrides: Partial<TdseConfig> = {}): TdseConfig {
  return { ...DEFAULT_TDSE_CONFIG, ...overrides }
}

/** Build TdseUniformParams with sensible defaults for testing. */
function uniformParams(overrides: Partial<TdseUniformParams> = {}): TdseUniformParams {
  return {
    config: createTdseConfig(),
    totalSites: 262144,
    simTime: 0,
    maxDensity: 1,
    initialMaxDensity: 1,
    autoScaleMaxGain: 20,
    strides: [4096, 64, 1],
    needsInit: false,
    ...overrides,
  }
}

describe('writeTdseUniforms', () => {
  const UNIFORM_SIZE = 720 // enough for all fields

  it('packs latticeDim, totalSites, dt, hbar into correct offsets', () => {
    const config = createTdseConfig({ latticeDim: 3, dt: 0.005, hbar: 1.0 })
    const totalSites = 64 * 64 * 64
    const uniformData = new ArrayBuffer(UNIFORM_SIZE)
    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeTdseUniforms(
      mockDevice,
      {} as GPUBuffer,
      uniformData,
      u32,
      f32,
      uniformParams({ config, totalSites })
    )

    expect(u32[0]).toBe(3) // latticeDim
    expect(u32[1]).toBe(262144) // totalSites = 64^3
    expect(f32[2]).toBeCloseTo(0.005) // dt
    expect(f32[3]).toBeCloseTo(1.0) // hbar
  })

  it('maps potentialType to correct shader enum', () => {
    const uniformData = new ArrayBuffer(UNIFORM_SIZE)
    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeTdseUniforms(
      mockDevice,
      {} as GPUBuffer,
      uniformData,
      u32,
      f32,
      uniformParams({ config: createTdseConfig({ potentialType: 'barrier' }) })
    )
    expect(u32[7]).toBe(1) // barrier → 1

    u32.fill(0)
    writeTdseUniforms(
      mockDevice,
      {} as GPUBuffer,
      uniformData,
      u32,
      f32,
      uniformParams({ config: createTdseConfig({ potentialType: 'doubleSlit' }) })
    )
    expect(u32[7]).toBe(6) // doubleSlit → 6

    u32.fill(0)
    writeTdseUniforms(
      mockDevice,
      {} as GPUBuffer,
      uniformData,
      u32,
      f32,
      uniformParams({ config: createTdseConfig({ potentialType: 'custom' }) })
    )
    expect(u32[7]).toBe(11) // custom → 11
  })

  it('writes customPotentialScale at index 176', () => {
    const uniformData = new ArrayBuffer(UNIFORM_SIZE)
    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeTdseUniforms(
      mockDevice,
      {} as GPUBuffer,
      uniformData,
      u32,
      f32,
      uniformParams({
        config: createTdseConfig({ potentialType: 'custom' }),
        customPotentialScale: 42.5,
      })
    )
    expect(f32[176]).toBeCloseTo(42.5)
  })

  it('packs gridSize starting at index 8', () => {
    const uniformData = new ArrayBuffer(UNIFORM_SIZE)
    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeTdseUniforms(
      mockDevice,
      {} as GPUBuffer,
      uniformData,
      u32,
      f32,
      uniformParams({
        config: createTdseConfig({ gridSize: [32, 64, 128], latticeDim: 3 }),
        totalSites: 32 * 64 * 128,
        strides: [8192, 128, 1],
      })
    )

    expect(u32[8]).toBe(32)
    expect(u32[9]).toBe(64)
    expect(u32[10]).toBe(128)
  })

  it('computes kGridScale = 2π/(N·a) for each dimension', () => {
    const uniformData = new ArrayBuffer(UNIFORM_SIZE)
    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeTdseUniforms(
      mockDevice,
      {} as GPUBuffer,
      uniformData,
      u32,
      f32,
      uniformParams({
        config: createTdseConfig({ gridSize: [64, 64, 64], spacing: [0.1, 0.1, 0.1] }),
      })
    )

    // kGridScale = 2π / (64 * 0.1) = 2π / 6.4 ≈ 0.9817
    const expected = (2 * Math.PI) / (64 * 0.1)
    expect(f32[136]).toBeCloseTo(expected, 4)
    expect(f32[137]).toBeCloseTo(expected, 4)
    expect(f32[138]).toBeCloseTo(expected, 4)
  })

  it('sets absorberEnabled flag and computes sigma_max', () => {
    const uniformData = new ArrayBuffer(UNIFORM_SIZE)
    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeTdseUniforms(
      mockDevice,
      {} as GPUBuffer,
      uniformData,
      u32,
      f32,
      uniformParams({ config: createTdseConfig({ absorberEnabled: true, absorberWidth: 0.2 }) })
    )

    expect(u32[79]).toBe(1) // absorberEnabled
    expect(f32[81]).toBeGreaterThan(0) // sigma_max > 0
  })

  it('uploads buffer to GPU', () => {
    const uniformData = new ArrayBuffer(UNIFORM_SIZE)
    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)
    const writeBuffer = vi.fn()
    const mockDevice = { queue: { writeBuffer } } as unknown as GPUDevice
    const mockBuffer = {} as GPUBuffer

    writeTdseUniforms(mockDevice, mockBuffer, uniformData, u32, f32, uniformParams())

    expect(writeBuffer).toHaveBeenCalledWith(mockBuffer, 0, uniformData)
  })

  it('sets imaginaryTime flag at u32[175] when enabled', () => {
    const uniformData = new ArrayBuffer(UNIFORM_SIZE)
    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeTdseUniforms(
      mockDevice,
      {} as GPUBuffer,
      uniformData,
      u32,
      f32,
      uniformParams({ config: createTdseConfig({ imaginaryTimeEnabled: true }) })
    )

    // Offset 700 / 4 = index 175
    expect(u32[175]).toBe(1)
  })

  it('clears imaginaryTime flag at u32[175] when disabled', () => {
    const uniformData = new ArrayBuffer(UNIFORM_SIZE)
    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeTdseUniforms(
      mockDevice,
      {} as GPUBuffer,
      uniformData,
      u32,
      f32,
      uniformParams({ config: createTdseConfig({ imaginaryTimeEnabled: false }) })
    )

    expect(u32[175]).toBe(0)
  })
})

describe('buildTdseFFTStagingData', () => {
  it('produces correct number of FFT stage slots for 64^3 grid', () => {
    const config = createTdseConfig({ gridSize: [64, 64, 64], latticeDim: 3 })
    const totalSites = 64 * 64 * 64
    const data = buildTdseFFTStagingData(config, totalSites)

    // Each axis has log2(64) = 6 stages. 3 axes × 6 stages × 2 directions = 36 slots
    const expectedSlots = 3 * 6 * 2
    expect(data.byteLength).toBe(expectedSlots * FFT_UNIFORM_SIZE)
  })

  it('produces correct number of slots for mixed grid sizes', () => {
    const config = createTdseConfig({ gridSize: [32, 64, 16], latticeDim: 3 })
    const totalSites = 32 * 64 * 16
    const data = buildTdseFFTStagingData(config, totalSites)

    // log2(32)=5, log2(64)=6, log2(16)=4 → (5+6+4)×2 = 30 slots
    const expectedSlots = (5 + 6 + 4) * 2
    expect(data.byteLength).toBe(expectedSlots * FFT_UNIFORM_SIZE)
  })

  it('first forward stage has direction=+1, first inverse has direction=-1', () => {
    const config = createTdseConfig({ gridSize: [8, 8], latticeDim: 2 })
    const totalSites = 64
    const data = buildTdseFFTStagingData(config, totalSites)

    // Forward stages come first
    const firstForward = new DataView(data, 0, FFT_UNIFORM_SIZE)
    expect(firstForward.getFloat32(8, true)).toBe(1.0) // direction = +1

    // Inverse stages come after all forward stages
    // Forward: 2 axes × log2(8)=3 stages = 6 slots
    const inverseOffset = 6 * FFT_UNIFORM_SIZE
    const firstInverse = new DataView(data, inverseOffset, FFT_UNIFORM_SIZE)
    expect(firstInverse.getFloat32(8, true)).toBe(-1.0) // direction = -1
  })

  it('each stage has correct axisDim and totalSites', () => {
    const config = createTdseConfig({ gridSize: [16, 16], latticeDim: 2 })
    const totalSites = 256
    const data = buildTdseFFTStagingData(config, totalSites)

    // First forward axis is the last dimension (d=1), axisDim=16
    const firstStage = new DataView(data, 0, FFT_UNIFORM_SIZE)
    expect(firstStage.getUint32(0, true)).toBe(16) // axisDim
    expect(firstStage.getUint32(12, true)).toBe(256) // totalSites
  })

  it('axisStride starts at 1 for the last dimension', () => {
    const config = createTdseConfig({ gridSize: [8, 8, 8], latticeDim: 3 })
    const totalSites = 512
    const data = buildTdseFFTStagingData(config, totalSites)

    // First forward stage: last axis (d=2), axisStride=1
    const first = new DataView(data, 0, FFT_UNIFORM_SIZE)
    expect(first.getUint32(16, true)).toBe(1) // axisStride

    // After 3 stages (log2(8)=3), second axis: axisStride = 8
    const secondAxis = new DataView(data, 3 * FFT_UNIFORM_SIZE, FFT_UNIFORM_SIZE)
    expect(secondAxis.getUint32(16, true)).toBe(8) // axisStride = 8
  })

  it('normalization factor = 1/axisDim at offset 24', () => {
    const config = createTdseConfig({ gridSize: [32, 32], latticeDim: 2 })
    const data = buildTdseFFTStagingData(config, 1024)

    const first = new DataView(data, 0, FFT_UNIFORM_SIZE)
    expect(first.getFloat32(24, true)).toBeCloseTo(1 / 32, 6) // 1/axisDim
  })
})
