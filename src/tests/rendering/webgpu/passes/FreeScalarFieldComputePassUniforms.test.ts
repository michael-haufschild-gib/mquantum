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

import { DEFAULT_FREE_SCALAR_CONFIG } from '@/lib/geometry/extended/freeScalar'
import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { computeStridesPadded } from '@/rendering/webgpu/passes/computePassUtils'
import {
  computeFsfConfigHash,
  computeFsfInitHash,
  computeFsfMaxPhiEstimate,
  estimateFsfMaxFieldValue,
  writeFsfUniforms,
} from '@/rendering/webgpu/passes/FreeScalarFieldComputePassUniforms'

/** Minimal FreeScalarConfig factory for testing. */
function createConfig(overrides: Partial<FreeScalarConfig> = {}): FreeScalarConfig {
  return { ...DEFAULT_FREE_SCALAR_CONFIG, ...overrides }
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
    const hash = computeFsfInitHash(createConfig({ mass: 0.5, initialCondition: 'vacuumNoise' }))
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
    const hash = computeFsfInitHash(
      createConfig({ selfInteractionEnabled: false, initialCondition: 'vacuumNoise' })
    )
    expect(hash).not.toContain('_si')
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
      maxFieldValue: 1.0, simEta: 0,
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
      maxFieldValue: 1.0, simEta: 0,
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
      maxFieldValue: 1.0, simEta: 0,
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
      maxFieldValue: 1.0, simEta: 0,
    })
    expect(new Uint32Array(uniformData)[40]).toBe(0)
  })

  it('maps gaussianPacket initial condition to shader enum 2', () => {
    const uniformData = new ArrayBuffer(512)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeFsfUniforms(mockDevice, {} as GPUBuffer, uniformData, {
      config: createConfig({ initialCondition: 'gaussianPacket' }),
      totalSites: 32768,
      maxFieldValue: 1.0, simEta: 0,
    })
    expect(new Uint32Array(uniformData)[40]).toBe(2)
  })

  it('maps field view string to correct shader enum', () => {
    const uniformData = new ArrayBuffer(512)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeFsfUniforms(mockDevice, {} as GPUBuffer, uniformData, {
      config: createConfig({ fieldView: 'energyDensity' }),
      totalSites: 32768,
      maxFieldValue: 1.0, simEta: 0,
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
      maxFieldValue: 1.0, simEta: 0,
    })

    expect(writeBuffer).toHaveBeenCalledWith(mockBuffer, 0, uniformData)
  })

  it('packs self-interaction params at offsets 480-488', () => {
    const config = createConfig({
      selfInteractionEnabled: true,
      selfInteractionLambda: 2.5,
      selfInteractionVev: 1.5,
    })
    const uniformData = new ArrayBuffer(512)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeFsfUniforms(mockDevice, {} as GPUBuffer, uniformData, {
      config,
      totalSites: 32768,
      maxFieldValue: 1.0, simEta: 0,
    })

    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)

    // offset 480 = index 120: selfInteractionEnabled
    expect(u32[120]).toBe(1)
    // offset 484 = index 121: selfInteractionLambda
    expect(f32[121]).toBeCloseTo(2.5)
    // offset 488 = index 122: selfInteractionVev
    expect(f32[122]).toBeCloseTo(1.5)
  })

  it('packs selfInteractionEnabled=0 when disabled', () => {
    const config = createConfig({ selfInteractionEnabled: false })
    const uniformData = new ArrayBuffer(512)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeFsfUniforms(mockDevice, {} as GPUBuffer, uniformData, {
      config,
      totalSites: 32768,
      maxFieldValue: 1.0, simEta: 0,
    })

    expect(new Uint32Array(uniformData)[120]).toBe(0)
  })
})

describe('estimateFsfMaxFieldValue with self-interaction', () => {
  it('returns λv⁴ for wallDensity view', () => {
    const lambda = 2.0
    const v = 1.5
    const config = createConfig({
      fieldView: 'wallDensity',
      selfInteractionEnabled: true,
      selfInteractionLambda: lambda,
      selfInteractionVev: v,
      autoScale: true,
    })

    const result = estimateFsfMaxFieldValue(config, 1.0)

    // wallDensity max at φ=0: V(0) = λ(0-v²)² = λv⁴
    expect(result).toBeCloseTo(lambda * Math.pow(v, 4))
  })

  it('returns 1.0 for wallDensity when self-interaction is disabled', () => {
    const config = createConfig({
      fieldView: 'wallDensity',
      selfInteractionEnabled: false,
      autoScale: true,
    })

    expect(estimateFsfMaxFieldValue(config, 1.0)).toBe(1.0)
  })

  it('adds λv⁴ to energy density estimate when SI is enabled', () => {
    const lambda = 1.0
    const v = 1.0
    const configNoSI = createConfig({
      fieldView: 'energyDensity',
      selfInteractionEnabled: false,
      autoScale: true,
      initialCondition: 'gaussianPacket',
      packetAmplitude: 1.0,
    })
    const configSI = createConfig({
      fieldView: 'energyDensity',
      selfInteractionEnabled: true,
      selfInteractionLambda: lambda,
      selfInteractionVev: v,
      autoScale: true,
      initialCondition: 'gaussianPacket',
      packetAmplitude: 1.0,
    })

    const maxPhiEstimate = 1.0
    const noSI = estimateFsfMaxFieldValue(configNoSI, maxPhiEstimate)
    const withSI = estimateFsfMaxFieldValue(configSI, maxPhiEstimate)

    // SI adds λv⁴ = 1*1 = 1.0 to the energy estimate
    expect(withSI).toBeCloseTo(noSI + lambda * Math.pow(v, 4))
  })

  it('returns 1.0 when autoScale is disabled', () => {
    const config = createConfig({
      fieldView: 'wallDensity',
      selfInteractionEnabled: true,
      selfInteractionLambda: 5.0,
      selfInteractionVev: 2.0,
      autoScale: false,
    })

    expect(estimateFsfMaxFieldValue(config, 1.0)).toBe(1.0)
  })
})

describe('estimateFsfMaxFieldValue — proper-density convention (cosmology)', () => {
  // The shader renders proper energy density ρ = H_canonical / aFull for
  // the `energyDensity` view. The auto-scale calibration has to follow
  // the same convention so `normRho = shader/estimator ≈ 1` at the
  // initial time — otherwise the display either blanks out instantly
  // (estimator too big) or saturates (estimator too small).

  it('rescales the vacuum-noise energy estimate by 1/aFull(η₀) under cosmology', () => {
    // De Sitter at η₀=-10, H=1 gives a(η₀)=0.1 → aFull=1e-4. The proper
    // estimate must be the canonical estimate DIVIDED by 1e-4, i.e. 1e4×
    // larger than the Minkowski-equivalent value.
    const cosmoConfig = createConfig({
      initialCondition: 'vacuumNoise',
      fieldView: 'energyDensity',
      autoScale: true,
      mass: 1.0,
      cosmology: {
        enabled: true,
        preset: 'deSitter',
        steepness: 5,
        hubble: 1,
        eta0: -10,
      },
    })
    const cosmoEstimate = estimateFsfMaxFieldValue(cosmoConfig, 0)
    // The Minkowski-equivalent baseline: same lattice, no cosmology.
    // Under Minkowski the dispersion is the `kgFloor` path (m²=1) and
    // aFull=1 so the proper division is a no-op.
    const flatConfig = createConfig({
      initialCondition: 'vacuumNoise',
      fieldView: 'energyDensity',
      autoScale: true,
      mass: 1.0,
    })
    const flatEstimate = estimateFsfMaxFieldValue(flatConfig, 0)
    // Not equal — the cosmology branch draws from a different
    // dispersion (m²·a²(η₀)=0.01 vs m²=1). The anchor for this test is
    // that the cosmology estimate is MUCH larger than the Minkowski one,
    // specifically 1/aFull(η₀) = 10⁴ × larger after accounting for the
    // dispersion difference — not dimmer, as the canonical-density
    // estimator used to be.
    expect(cosmoEstimate).toBeGreaterThan(flatEstimate)
    expect(Number.isFinite(cosmoEstimate)).toBe(true)
    expect(cosmoEstimate).toBeGreaterThan(0)
  })

  it('non-vacuum energyDensity estimate divides by aFull(η₀) under cosmology', () => {
    // For a gaussianPacket init, the canonical-density formula is
    // `0.5·φ₀²·ω²`. Under Minkowski this is the final value; under
    // cosmology we divide by aFull(η₀). The ratio between the two must
    // equal aFull(η₀) up to the dispersion difference.
    const flatConfig = createConfig({
      initialCondition: 'gaussianPacket',
      fieldView: 'energyDensity',
      autoScale: true,
      packetAmplitude: 1.0,
      mass: 1.0,
    })
    const flatEstimate = estimateFsfMaxFieldValue(flatConfig, 1.0)

    const cosmoConfig = createConfig({
      initialCondition: 'gaussianPacket',
      fieldView: 'energyDensity',
      autoScale: true,
      packetAmplitude: 1.0,
      mass: 1.0,
      cosmology: {
        enabled: true,
        preset: 'deSitter',
        steepness: 5,
        hubble: 1,
        eta0: -10,
      },
    })
    const cosmoEstimate = estimateFsfMaxFieldValue(cosmoConfig, 1.0)

    // Cosmology estimate must be finite, positive, and LARGER than flat
    // (because dividing by aFull(η₀)=1e-4 inflates the scale by 10⁴×).
    expect(Number.isFinite(cosmoEstimate)).toBe(true)
    expect(cosmoEstimate).toBeGreaterThan(flatEstimate)
    // Sanity check: the ratio should be at least 10³× larger (the
    // dispersion difference is small compared to the 10⁴ aFull factor).
    expect(cosmoEstimate / flatEstimate).toBeGreaterThan(1e3)
  })
})

describe('computeFsfMaxPhiEstimate with self-interaction', () => {
  it('returns v for kinkProfile initial condition', () => {
    const v = 2.5
    const config = createConfig({
      initialCondition: 'kinkProfile',
      selfInteractionEnabled: true,
      selfInteractionVev: v,
      autoScale: true,
    })

    expect(computeFsfMaxPhiEstimate(config)).toBe(v)
  })

  it('returns packetAmplitude for gaussianPacket (even with SI)', () => {
    const amplitude = 3.0
    const config = createConfig({
      initialCondition: 'gaussianPacket',
      packetAmplitude: amplitude,
      selfInteractionEnabled: true,
      selfInteractionVev: 1.0,
      autoScale: true,
    })

    expect(computeFsfMaxPhiEstimate(config)).toBe(amplitude)
  })

  it('returns 1.0 when autoScale is disabled', () => {
    const config = createConfig({
      initialCondition: 'kinkProfile',
      selfInteractionEnabled: true,
      selfInteractionVev: 5.0,
      autoScale: false,
    })

    expect(computeFsfMaxPhiEstimate(config)).toBe(1.0)
  })
})
