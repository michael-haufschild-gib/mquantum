/**
 * FreeScalarFieldComputePassUniforms tests.
 *
 * Tests the pure-logic uniform packing functions: config hashing, strides,
 * enum mapping, and buffer layout. These are the CPU-side computations that
 * determine what values reach the GPU compute shader.
 *
 * A bug here means the shader receives wrong grid dimensions, wrong mass,
 * wrong field view mode, or wrong initial condition — producing silently
 * incorrect physics.
 */
import { describe, expect, it, vi } from 'vitest'

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { computeStridesPadded } from '@/rendering/webgpu/passes/computePassUtils'
import {
  computeFsfConfigHash,
  computeFsfInitHash,
  writeFsfUniforms,
} from '@/rendering/webgpu/passes/FreeScalarFieldComputePassUniforms'

/** Minimal FreeScalarConfig factory for testing. */
function createConfig(overrides: Partial<FreeScalarConfig> = {}): FreeScalarConfig {
  return {
    latticeDim: 3,
    gridSize: [32, 32, 32],
    spacing: [0.15, 0.15, 0.15],
    mass: 0.5,
    dt: 0.01,
    stepsPerFrame: 2,
    initialCondition: 'vacuumNoise',
    modeK: [1, 0, 0],
    packetCenter: [0, 0, 0],
    packetWidth: 0.5,
    packetAmplitude: 1.0,
    vacuumSeed: 42,
    fieldView: 'phi',
    autoScale: true,
    showPotential: false,
    absorberEnabled: false,
    absorberWidth: 0.15,
    pmlTargetReflection: 1e-6,
    selfInteractionEnabled: false,
    selfInteractionLambda: 0,
    selfInteractionVev: 0,
    diagnosticsEnabled: true,
    diagnosticsInterval: 5,
    slicePositions: [],
    ...overrides,
  } as FreeScalarConfig
}

describe('computeFsfConfigHash', () => {
  it('encodes grid dimensions and lattice dim', () => {
    const hash = computeFsfConfigHash(createConfig({ gridSize: [64, 64, 64], latticeDim: 3 }))
    expect(hash).toBe('64x64x64_d3')
  })

  it('different grid sizes produce different hashes', () => {
    const h1 = computeFsfConfigHash(createConfig({ gridSize: [32, 32, 32] }))
    const h2 = computeFsfConfigHash(createConfig({ gridSize: [64, 64, 64] }))
    expect(h1).not.toBe(h2)
  })

  it('different lattice dims produce different hashes', () => {
    const h1 = computeFsfConfigHash(createConfig({ latticeDim: 2 }))
    const h2 = computeFsfConfigHash(createConfig({ latticeDim: 3 }))
    expect(h1).not.toBe(h2)
  })
})

describe('computeFsfInitHash', () => {
  it('encodes initial condition, mass, modeK, and packet params', () => {
    const hash = computeFsfInitHash(createConfig())
    expect(hash).toContain('vacuumNoise')
    expect(hash).toContain('m0.5')
    expect(hash).toContain('s42')
  })

  it('different initial conditions produce different hashes', () => {
    const h1 = computeFsfInitHash(createConfig({ initialCondition: 'vacuumNoise' }))
    const h2 = computeFsfInitHash(createConfig({ initialCondition: 'gaussianPacket' }))
    expect(h1).not.toBe(h2)
  })

  it('includes self-interaction params when enabled', () => {
    const hash = computeFsfInitHash(
      createConfig({
        selfInteractionEnabled: true,
        selfInteractionLambda: 0.1,
        selfInteractionVev: 1.0,
      })
    )
    expect(hash).toContain('si0.1')
    expect(hash).toContain('v1')
  })

  it('omits self-interaction params when disabled', () => {
    const hash = computeFsfInitHash(createConfig({ selfInteractionEnabled: false }))
    expect(hash).not.toContain('si')
  })
})

describe('computeStridesPadded (used by FSF uniform packing)', () => {
  it('computes correct strides for 3D grid', () => {
    const strides = computeStridesPadded([8, 16, 32], 3)
    // C-order: strides[2] = 1, strides[1] = 32, strides[0] = 16*32 = 512
    expect(strides[2]).toBe(1)
    expect(strides[1]).toBe(32)
    expect(strides[0]).toBe(512)
  })

  it('returns stride of 1 for 1D grid', () => {
    const strides = computeStridesPadded([64], 1)
    expect(strides[0]).toBe(1)
  })

  it('unused dimensions are zero', () => {
    const strides = computeStridesPadded([32, 32], 2)
    // Dims 2+ should be 0 (MAX_DIM=12, so indices 2-11 are zero)
    for (let d = 2; d < strides.length; d++) {
      expect(strides[d]).toBe(0)
    }
  })
})

describe('writeFsfUniforms', () => {
  it('packs latticeDim, totalSites, mass, dt into correct offsets', () => {
    const config = createConfig({ latticeDim: 3, mass: 0.5, dt: 0.01 })
    const totalSites = 32 * 32 * 32

    const uniformData = new ArrayBuffer(512)
    const mockDevice = {
      queue: { writeBuffer: vi.fn() },
    } as unknown as GPUDevice
    const mockBuffer = {} as GPUBuffer

    writeFsfUniforms(mockDevice, mockBuffer, uniformData, {
      config,
      totalSites,
      maxFieldValue: 1.0,
    })

    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)

    // offset 0: latticeDim
    expect(u32[0]).toBe(3)
    // offset 4: totalSites
    expect(u32[1]).toBe(32768)
    // offset 8: mass
    expect(f32[2]).toBeCloseTo(0.5)
    // offset 12: dt
    expect(f32[3]).toBeCloseTo(0.01)
  })

  it('packs gridSize array starting at offset 16', () => {
    const config = createConfig({ gridSize: [16, 32, 64], latticeDim: 3 })
    const uniformData = new ArrayBuffer(512)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeFsfUniforms(mockDevice, {} as GPUBuffer, uniformData, {
      config,
      totalSites: 16 * 32 * 64,
      maxFieldValue: 1.0,
    })

    const u32 = new Uint32Array(uniformData)
    // offset 16 = index 4: gridSize[0]
    expect(u32[4]).toBe(16)
    // offset 20 = index 5: gridSize[1]
    expect(u32[5]).toBe(32)
    // offset 24 = index 6: gridSize[2]
    expect(u32[6]).toBe(64)
  })

  it('packs spacing array starting at offset 112', () => {
    const config = createConfig({ spacing: [0.1, 0.2, 0.3], latticeDim: 3 })
    const uniformData = new ArrayBuffer(512)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeFsfUniforms(mockDevice, {} as GPUBuffer, uniformData, {
      config,
      totalSites: 32768,
      maxFieldValue: 1.0,
    })

    const f32 = new Float32Array(uniformData)
    // offset 112 = index 28: spacing[0]
    expect(f32[28]).toBeCloseTo(0.1)
    expect(f32[29]).toBeCloseTo(0.2)
    expect(f32[30]).toBeCloseTo(0.3)
  })

  it('maps vacuumNoise initial condition to shader enum 0', () => {
    const uniformData = new ArrayBuffer(512)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeFsfUniforms(mockDevice, {} as GPUBuffer, uniformData, {
      config: createConfig({ initialCondition: 'vacuumNoise' }),
      totalSites: 32768,
      maxFieldValue: 1.0,
    })
    expect(new Uint32Array(uniformData)[40]).toBe(0)
  })

  it('maps gaussianPacket initial condition to shader enum 2', () => {
    const uniformData = new ArrayBuffer(512)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeFsfUniforms(mockDevice, {} as GPUBuffer, uniformData, {
      config: createConfig({ initialCondition: 'gaussianPacket' }),
      totalSites: 32768,
      maxFieldValue: 1.0,
    })
    expect(new Uint32Array(uniformData)[40]).toBe(2)
  })

  it('maps field view string to correct shader enum', () => {
    const uniformData = new ArrayBuffer(512)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeFsfUniforms(mockDevice, {} as GPUBuffer, uniformData, {
      config: createConfig({ fieldView: 'energyDensity' }),
      totalSites: 32768,
      maxFieldValue: 1.0,
    })
    // energyDensity → 2
    expect(new Uint32Array(uniformData)[41]).toBe(2)
  })

  it('uploads the buffer to the GPU via device.queue.writeBuffer', () => {
    const uniformData = new ArrayBuffer(512)
    const writeBuffer = vi.fn()
    const mockDevice = { queue: { writeBuffer } } as unknown as GPUDevice
    const mockBuffer = {} as GPUBuffer

    writeFsfUniforms(mockDevice, mockBuffer, uniformData, {
      config: createConfig(),
      totalSites: 32768,
      maxFieldValue: 1.0,
    })

    expect(writeBuffer).toHaveBeenCalledWith(mockBuffer, 0, uniformData)
  })
})
