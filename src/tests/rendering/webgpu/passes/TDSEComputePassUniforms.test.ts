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
import { TDSE_UNIFORM_SIZE } from '@/rendering/webgpu/passes/TDSEComputePassResources'
import {
  buildTdseFFTStagingData,
  createTdseUniformStepStagingState,
  prePackTdseFrameSnapshots,
  type TdseUniformParams,
  writeTdseUniforms,
} from '@/rendering/webgpu/passes/TDSEComputePassUniforms'
import { TDSE_UNIFORMS_LAYOUT } from '@/rendering/webgpu/passes/tdseUniformsLayout'

/** Named float32/uint32 slot indices into the TDSEUniforms struct. */
const I = TDSE_UNIFORMS_LAYOUT.index

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
  // Import the canonical size constant instead of hardcoding a literal so
  // any future struct extension (more BH fields, new drive waveforms, etc.)
  // propagates here without drift.
  const UNIFORM_SIZE = TDSE_UNIFORM_SIZE

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

    expect(u32[I.latticeDim]).toBe(3)
    expect(u32[I.totalSites]).toBe(262144) // 64^3
    expect(f32[I.dt]).toBeCloseTo(0.005)
    expect(f32[I.hbar]).toBeCloseTo(1.0)
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
    expect(u32[I.potentialType]).toBe(1) // barrier → 1

    u32.fill(0)
    writeTdseUniforms(
      mockDevice,
      {} as GPUBuffer,
      uniformData,
      u32,
      f32,
      uniformParams({ config: createTdseConfig({ potentialType: 'doubleSlit' }) })
    )
    expect(u32[I.potentialType]).toBe(6) // doubleSlit → 6

    u32.fill(0)
    writeTdseUniforms(
      mockDevice,
      {} as GPUBuffer,
      uniformData,
      u32,
      f32,
      uniformParams({ config: createTdseConfig({ potentialType: 'custom' }) })
    )
    expect(u32[I.potentialType]).toBe(11) // custom → 11
  })

  it('maps vortexLattice to the vortexImprint shader branch', () => {
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
        config: createTdseConfig({
          initialCondition: 'vortexLattice',
          packetMomentum: [1, 0, 0, 6, 1],
        }),
      })
    )

    expect(u32[I.initCondition]).toBe(4)
    expect(f32[I.packetMomentum + 3]).toBe(6)
    expect(f32[I.packetMomentum + 4]).toBe(1)
  })

  it('writes customPotentialScale at customPotentialScale slot (offset 704)', () => {
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
    expect(f32[I.customPotentialScale]).toBeCloseTo(42.5)
  })

  it('packs gridSize at the gridSize array slot', () => {
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

    expect(u32[I.gridSize + 0]).toBe(32)
    expect(u32[I.gridSize + 1]).toBe(64)
    expect(u32[I.gridSize + 2]).toBe(128)
  })

  it('sanitizes non-finite packet vectors before GPU upload', () => {
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
        config: createTdseConfig({
          packetCenter: [Number.NaN, Number.POSITIVE_INFINITY, -1],
          packetMomentum: [4, Number.NaN, Number.NEGATIVE_INFINITY],
        }),
      })
    )

    expect(f32[I.packetCenter + 0]).toBe(0)
    expect(f32[I.packetCenter + 1]).toBe(0)
    expect(f32[I.packetCenter + 2]).toBe(-1)
    expect(f32[I.packetMomentum + 0]).toBe(4)
    expect(f32[I.packetMomentum + 1]).toBe(0)
    expect(f32[I.packetMomentum + 2]).toBe(0)
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
    expect(f32[I.kGridScale + 0]).toBeCloseTo(expected, 4)
    expect(f32[I.kGridScale + 1]).toBeCloseTo(expected, 4)
    expect(f32[I.kGridScale + 2]).toBeCloseTo(expected, 4)
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

    expect(u32[I.absorberEnabled]).toBe(1)
    expect(f32[I.absorberStrength]).toBeGreaterThan(0) // sigma_max > 0
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

  it('sets imaginaryTime flag (offset 700) when enabled', () => {
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

    expect(u32[I.imaginaryTime]).toBe(1)
  })

  it('clears imaginaryTime flag when disabled', () => {
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

    expect(u32[I.imaginaryTime]).toBe(0)
  })

  it('maps hawkingFlux fieldView to shader enum 7', () => {
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
      uniformParams({ config: createTdseConfig({ fieldView: 'hawkingFlux' }) })
    )

    expect(u32[I.fieldView]).toBe(7)
  })

  it('maps quantumPressure fieldView to shader enum 8', () => {
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
      uniformParams({ config: createTdseConfig({ fieldView: 'quantumPressure' }) })
    )

    expect(u32[I.fieldView]).toBe(8)
  })

  it('maps vorticity fieldView to shader enum 9', () => {
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
      uniformParams({ config: createTdseConfig({ fieldView: 'vorticity' }) })
    )

    expect(u32[I.fieldView]).toBe(9)
  })

  it('packs blackHoleRingdown BH params at bhMass/bhMultipoleL/bhSpin (offsets 748/752/756)', () => {
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
        config: createTdseConfig({
          potentialType: 'blackHoleRingdown',
          bhMass: 2.5,
          bhMultipoleL: 3,
          bhSpin: 1,
        }),
      })
    )

    expect(u32[I.potentialType]).toBe(14) // blackHoleRingdown → 14
    expect(f32[I.bhMass]).toBeCloseTo(2.5)
    expect(f32[I.bhMultipoleL]).toBeCloseTo(3)
    expect(f32[I.bhSpin]).toBeCloseTo(1)
    // The hawkingVmax/hawkingLh slots that follow are now seeded from
    // DEFAULT_TDSE_CONFIG (the previous two-slot _padBh has been consumed
    // by the analog-Hawking block). Verify the defaults land here rather
    // than asserting zero, so future default changes don't make this stale.
    expect(f32[I.hawkingVmax]).toBeCloseTo(2.0)
    expect(f32[I.hawkingLh]).toBeCloseTo(0.6)
  })

  it('normalizes corrupted blackHoleRingdown BH params before uniform packing', () => {
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
        config: createTdseConfig({
          potentialType: 'blackHoleRingdown',
          bhMass: Number.NaN,
          bhMultipoleL: 0,
          bhSpin: 2,
        }),
      })
    )

    expect(f32[I.bhMass]).toBeCloseTo(1)
    expect(f32[I.bhMultipoleL]).toBeCloseTo(2)
    expect(f32[I.bhSpin]).toBeCloseTo(2)
  })

  it('packs analog-Hawking fields (offsets 760-784)', () => {
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
        config: createTdseConfig({
          hawkingVmax: 2.5,
          hawkingLh: 0.4,
          hawkingDeltaN: 0.2,
          hawkingInjectRate: 0.07,
          hawkingPairInjection: true,
          hawkingSeed: 4242,
        }),
        hawkingStepIndex: 12345,
      })
    )

    expect(f32[I.hawkingVmax]).toBeCloseTo(2.5)
    expect(f32[I.hawkingLh]).toBeCloseTo(0.4)
    expect(f32[I.hawkingDeltaN]).toBeCloseTo(0.2) // clamp preserves 0.2
    expect(f32[I.hawkingInjectRate]).toBeCloseTo(0.07)
    expect(u32[I.hawkingPairInjection]).toBe(1)
    expect(u32[I.hawkingSeed]).toBe(4242)
    expect(u32[I.hawkingStepIndex]).toBe(12345)
    // _padHawk0 stays zero. wormholeCosTau / wormholeSinTau host the
    // host-precomputed wormhole trig cache. Derive tauG from the same
    // config that drove writeTdseUniforms() so future default changes don't
    // make the assertion stale even though the packing is still correct.
    expect(u32[I._padHawk0]).toBe(0)
    const trigConfig = DEFAULT_TDSE_CONFIG
    const tauG = 0.5 * trigConfig.dt * Math.max(0, trigConfig.wormholeCouplingG ?? 0)
    expect(f32[I.wormholeCosTau]).toBeCloseTo(Math.cos(tauG), 6)
    expect(f32[I.wormholeSinTau]).toBeCloseTo(Math.sin(tauG), 6)
  })

  it('normalizes wormhole mirror axis to the active lattice before GPU upload', () => {
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
        config: createTdseConfig({
          latticeDim: 2,
          gridSize: [64, 64],
          wormholeMirrorAxis: 2,
        } as Partial<TdseConfig>),
      })
    )

    expect(u32[I.wormholeMirrorAxis]).toBe(1)
  })

  it('clamps hawkingDeltaN into [0, 0.6]', () => {
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
      uniformParams({ config: createTdseConfig({ hawkingDeltaN: 2.0 }) })
    )
    expect(f32[I.hawkingDeltaN]).toBeCloseTo(0.6) // clamped from 2.0 → 0.6
  })

  it('clamps negative hawkingDeltaN to 0.0', () => {
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
      uniformParams({ config: createTdseConfig({ hawkingDeltaN: -1.0 }) })
    )
    expect(f32[I.hawkingDeltaN]).toBe(0.0)
  })

  it('clamps negative hawkingInjectRate to 0.0', () => {
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
      uniformParams({ config: createTdseConfig({ hawkingInjectRate: -0.1 }) })
    )
    expect(f32[I.hawkingInjectRate]).toBe(0.0)
  })

  it('clamps hawkingInjectRate above 0.5 back to 0.5', () => {
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
      uniformParams({ config: createTdseConfig({ hawkingInjectRate: 5.0 }) })
    )
    expect(f32[I.hawkingInjectRate]).toBeCloseTo(0.5)
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

describe('prePackTdseFrameSnapshots', () => {
  it('preserves needsInit for step 0 and clears it for later snapshots', () => {
    const uniformData = new ArrayBuffer(TDSE_UNIFORMS_LAYOUT.totalSize)
    const uniformU32 = new Uint32Array(uniformData)
    const uniformF32 = new Float32Array(uniformData)
    const snapshots: Float32Array[] = []
    const device = {
      queue: {
        writeBuffer: vi.fn((_buffer: GPUBuffer, _offset: number, data: ArrayBuffer) => {
          snapshots.push(new Float32Array(data.slice(0)))
        }),
      },
    } as unknown as GPUDevice
    const state = createTdseUniformStepStagingState()
    state.buffer = {} as GPUBuffer
    state.size = TDSE_UNIFORMS_LAYOUT.totalSize * 3

    const staging = prePackTdseFrameSnapshots({
      ...uniformParams({
        config: createTdseConfig({
          harmonicOmega: 2,
          harmonicOmegaInit: 5,
        }),
        needsInit: true,
      }),
      state,
      device,
      stepsThisFrame: 2,
      uniformData,
      uniformU32,
      uniformF32,
    })

    expect(staging).toBe(state.buffer)
    expect(snapshots).toHaveLength(3)
    expect(snapshots[0]![I.harmonicOmega]).toBeCloseTo(5)
    expect(snapshots[1]![I.harmonicOmega]).toBeCloseTo(2)
    expect(snapshots[2]![I.harmonicOmega]).toBeCloseTo(2)
  })
})
