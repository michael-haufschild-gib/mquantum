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
import {
  computeFsfCosmologyCoefs,
  computeFsfVacuumDispersion,
} from '@/lib/physics/freeScalar/vacuumDispersion'
import { estimateVacuumMaxPhi, estimateVacuumMaxPi } from '@/lib/physics/freeScalar/vacuumSpectrum'
import { computeStridesPadded } from '@/rendering/webgpu/passes/computePassUtils'
import {
  computeFsfConfigHash,
  computeFsfInitHash,
  computeFsfMaxPhiEstimate,
  estimateFsfMaxFieldValue,
  FSF_UNIFORM_SIZE,
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

  it('changes when cosmology is enabled vs disabled', () => {
    const base = createConfig()
    const off = computeFsfInitHash({
      ...base,
      cosmology: { ...base.cosmology, enabled: false },
    })
    const on = computeFsfInitHash({
      ...base,
      cosmology: { ...base.cosmology, enabled: true },
    })
    expect(off).not.toBe(on)
    expect(off).toContain('_cosmo0')
    expect(on).toContain('_cosmo1_')
  })

  it('changes when any cosmology parameter changes', () => {
    const base = createConfig({
      cosmology: {
        enabled: true,
        preset: 'deSitter',
        steepness: 2,
        hubble: 1,
        eta0: -1,
      },
    })
    const h = computeFsfInitHash(base)
    const hPreset = computeFsfInitHash({
      ...base,
      cosmology: { ...base.cosmology, preset: 'ekpyrotic' },
    })
    const hSteep = computeFsfInitHash({
      ...base,
      cosmology: { ...base.cosmology, steepness: 3 },
    })
    const hHubble = computeFsfInitHash({
      ...base,
      cosmology: { ...base.cosmology, hubble: 2 },
    })
    const hEta = computeFsfInitHash({
      ...base,
      cosmology: { ...base.cosmology, eta0: -2 },
    })
    // All four must differ from each other and from the base.
    const all = [h, hPreset, hSteep, hHubble, hEta]
    expect(new Set(all).size).toBe(all.length)
  })

  it('combines cosmology and self-interaction in the hash', () => {
    const base = createConfig({
      selfInteractionEnabled: true,
      selfInteractionLambda: 0.1,
      selfInteractionVev: 1.0,
      cosmology: {
        enabled: true,
        preset: 'deSitter',
        steepness: 2,
        hubble: 1,
        eta0: -1,
      },
    })
    const hash = computeFsfInitHash(base)
    expect(hash).toContain('_cosmo1_deSitter')
    expect(hash).toContain('_si0.1')
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
      simEta: 0,
      preheatingTime: 0,
      preheatingReferenceEta: 0,
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
      simEta: 0,
      preheatingTime: 0,
      preheatingReferenceEta: 0,
    })

    const u32 = new Uint32Array(uniformData)
    // offset 16 = index 4: gridSize[0]
    expect(u32[4]).toBe(16)
    // offset 20 = index 5: gridSize[1]
    expect(u32[5]).toBe(32)
    // offset 24 = index 6: gridSize[2]
    expect(u32[6]).toBe(64)
  })

  it('reuses caller-owned stride scratch and clears inactive dimensions', () => {
    const config = createConfig({ gridSize: [16, 32], latticeDim: 2 })
    const uniformData = new ArrayBuffer(512)
    const strideScratch = new Array<number>(12)
    strideScratch.fill(999)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeFsfUniforms(mockDevice, {} as GPUBuffer, uniformData, {
      config,
      totalSites: 16 * 32,
      maxFieldValue: 1.0,
      simEta: 0,
      preheatingTime: 0,
      preheatingReferenceEta: 0,
      strideScratch,
    })

    expect(strideScratch[0]).toBe(32)
    expect(strideScratch[1]).toBe(1)
    for (let d = 2; d < strideScratch.length; d++) {
      expect(strideScratch[d]).toBe(0)
    }

    const u32 = new Uint32Array(uniformData)
    // strides start at byte offset 64, u32 index 16.
    expect(u32[16]).toBe(32)
    expect(u32[17]).toBe(1)
  })

  it('packs spacing array starting at offset 112', () => {
    const config = createConfig({ spacing: [0.1, 0.2, 0.3], latticeDim: 3 })
    const uniformData = new ArrayBuffer(512)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeFsfUniforms(mockDevice, {} as GPUBuffer, uniformData, {
      config,
      totalSites: 32768,
      maxFieldValue: 1.0,
      simEta: 0,
      preheatingTime: 0,
      preheatingReferenceEta: 0,
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
      simEta: 0,
      preheatingTime: 0,
      preheatingReferenceEta: 0,
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
      simEta: 0,
      preheatingTime: 0,
      preheatingReferenceEta: 0,
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
      simEta: 0,
      preheatingTime: 0,
      preheatingReferenceEta: 0,
    })
    // energyDensity → 2
    expect(new Uint32Array(uniformData)[41]).toBe(2)
  })

  it('maps freezeOutStrain field view to shader enum 4', () => {
    const uniformData = new ArrayBuffer(512)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeFsfUniforms(mockDevice, {} as GPUBuffer, uniformData, {
      config: createConfig({ fieldView: 'freezeOutStrain' }),
      totalSites: 32768,
      maxFieldValue: 1.0,
      simEta: 0,
      preheatingTime: 0,
      preheatingReferenceEta: 0,
    })

    expect(new Uint32Array(uniformData)[41]).toBe(4)
  })

  it('maps equationOfState field view to shader enum 5', () => {
    const uniformData = new ArrayBuffer(512)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeFsfUniforms(mockDevice, {} as GPUBuffer, uniformData, {
      config: createConfig({ fieldView: 'equationOfState' }),
      totalSites: 32768,
      maxFieldValue: 1.0,
      simEta: 0,
      preheatingTime: 0,
      preheatingReferenceEta: 0,
    })

    expect(new Uint32Array(uniformData)[41]).toBe(5)
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
      simEta: 0,
      preheatingTime: 0,
      preheatingReferenceEta: 0,
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
      maxFieldValue: 1.0,
      simEta: 0,
      preheatingTime: 0,
      preheatingReferenceEta: 0,
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
      maxFieldValue: 1.0,
      simEta: 0,
      preheatingTime: 0,
      preheatingReferenceEta: 0,
    })

    expect(new Uint32Array(uniformData)[120]).toBe(0)
  })

  it('encodes absorberEnabled as 1u for plain PML configs', () => {
    // Non-kink configs with absorber on must pack `1u` at index 123 so
    // the shader falls through its target-0 damping path — bit-identical
    // to the pre-fix behaviour for every non-domainWall preset.
    const config = createConfig({
      initialCondition: 'gaussianPacket',
      absorberEnabled: true,
      selfInteractionEnabled: false,
    })
    const uniformData = new ArrayBuffer(FSF_UNIFORM_SIZE)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeFsfUniforms(mockDevice, {} as GPUBuffer, uniformData, {
      config,
      totalSites: 32768,
      maxFieldValue: 1.0,
      simEta: 0,
      preheatingTime: 0,
      preheatingReferenceEta: 0,
    })

    expect(new Uint32Array(uniformData)[123]).toBe(1)
  })

  it('encodes absorberEnabled as 2u for kink+self-interaction configs', () => {
    // The domainWall preset (kinkProfile + selfInteractionEnabled +
    // absorberEnabled) selects the vacuum-aware PML branch so the absorber
    // damps toward the local ±v vacuum instead of dragging the asymptotic
    // tails toward 0. The CPU must emit `2u` at index 123 so the absorber
    // shader takes the sign-of-x branch.
    const config = createConfig({
      initialCondition: 'kinkProfile',
      absorberEnabled: true,
      selfInteractionEnabled: true,
      selfInteractionVev: 1.0,
    })
    const uniformData = new ArrayBuffer(FSF_UNIFORM_SIZE)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeFsfUniforms(mockDevice, {} as GPUBuffer, uniformData, {
      config,
      totalSites: 32768,
      maxFieldValue: 1.0,
      simEta: 0,
      preheatingTime: 0,
      preheatingReferenceEta: 0,
    })

    expect(new Uint32Array(uniformData)[123]).toBe(2)
  })

  it('falls back to 1u when kinkProfile is used without self-interaction', () => {
    // kinkProfile without self-interaction has no well-defined vacuum
    // (no double well → no ±v branches), so the kink-aware PML would damp
    // toward an arbitrary value. Revert to the plain target-0 path.
    const config = createConfig({
      initialCondition: 'kinkProfile',
      absorberEnabled: true,
      selfInteractionEnabled: false,
    })
    const uniformData = new ArrayBuffer(FSF_UNIFORM_SIZE)
    const mockDevice = { queue: { writeBuffer: vi.fn() } } as unknown as GPUDevice

    writeFsfUniforms(mockDevice, {} as GPUBuffer, uniformData, {
      config,
      totalSites: 32768,
      maxFieldValue: 1.0,
      simEta: 0,
      preheatingTime: 0,
      preheatingReferenceEta: 0,
    })

    expect(new Uint32Array(uniformData)[123]).toBe(1)
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

  it('returns 1.0 for bounded freezeOutStrain view', () => {
    const config = createConfig({
      fieldView: 'freezeOutStrain',
      autoScale: true,
    })

    expect(estimateFsfMaxFieldValue(config, 123)).toBe(1.0)
  })

  it('returns 1.0 for bounded equationOfState view', () => {
    const config = createConfig({
      fieldView: 'equationOfState',
      autoScale: true,
    })

    expect(estimateFsfMaxFieldValue(config, 123)).toBe(1.0)
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

  it('non-vacuum energyDensity estimate rescales by aPotential/aFull = 1/a² under cosmology', () => {
    // For a plane-wave / packet init the canonical Hamiltonian density is
    //   H_can ≈ aPotential·φ₀²·ω² (time-averaged)
    // and the proper (shader-rendered) density is H_can/aFull, giving a
    // cosmology→Minkowski scale ratio of aPotential/aFull = 1/a², NOT the
    // naive 1/aFull = 1/a^n a buggy estimator would produce by dropping
    // the aPotential factor.
    const flatConfig = createConfig({
      initialCondition: 'gaussianPacket',
      fieldView: 'energyDensity',
      autoScale: true,
      packetAmplitude: 1.0,
      mass: 1.0,
    })
    const flatEstimate = estimateFsfMaxFieldValue(flatConfig, 1.0)

    // de Sitter η₀=-10, H=1, n=4 ⇒ a(η₀)=0.1, 1/a²=100. The cosmology
    // estimate carries the same aPotential·ω² canonical prefactor as the
    // shader, so the ratio is bounded to the 1/a² window rather than the
    // 1/a^n blowup that motivated the original "black render" bug.
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

    expect(Number.isFinite(cosmoEstimate)).toBe(true)
    expect(cosmoEstimate).toBeGreaterThan(flatEstimate)
    // 1/a² = 100; the dispersion also shifts (m²a²=0.01 vs m²=1) which
    // pulls the ratio slightly below 100. Guard band [40, 200] accepts
    // the physical ≈80 value and rejects both a regression back to the
    // 1/a^n = 10⁴ inflation (failing >200) and an over-correction that
    // would bring the ratio below the 1/a² floor (failing <40).
    const ratio = cosmoEstimate / flatEstimate
    expect(ratio).toBeGreaterThan(40)
    expect(ratio).toBeLessThan(200)
  })

  it('singleMode + deSitter estimator tracks shader peak within an order of magnitude', () => {
    // Regression test for the "deSitter plane-wave renders black under
    // autoScale" bug. The shader's peak canonical H for a single plane
    // wave is aPotential·A²·ω² (at the π-maximum of the oscillation).
    // Divided by aFull to land in proper density:
    //   shaderPeak = aPotential · A² · ω² / aFull = A²·ω²/a²
    // The estimator must track this to within ~2× so normRho≈1 at the
    // initial time — otherwise the field renders black under autoScale
    // (estimator too big) or saturates to a full white cube (too small).
    const config = createConfig({
      initialCondition: 'singleMode',
      fieldView: 'energyDensity',
      autoScale: true,
      packetAmplitude: 1.0,
      modeK: [3, 0, 0],
      mass: 1.0,
      cosmology: {
        enabled: true,
        preset: 'deSitter',
        steepness: 5,
        hubble: 2,
        eta0: -8,
      },
    })
    const estimate = estimateFsfMaxFieldValue(config, 1.0)

    // Hand-computed spatial peak of the proper energy density ρ_proper for
    // the single plane wave:
    //   a = 1/(H·|η|) = 1/(2·8) = 0.0625, a² ≈ 3.906e-3
    //   latticeL = 32·0.1 = 3.2, kPhys = 2π·3/3.2 ≈ 5.8905
    //   sk = 2·sin(kPhys·a_spacing/2)/a_spacing = 2·sin(0.29452)/0.1 ≈ 5.8057
    //   k_lat² = sk² ≈ 33.706
    //   ω² = k_lat² + m²·a² ≈ 33.706 + 3.906e-3 ≈ 33.710
    //   shaderPeakBound = A²·ω²/a² ≈ 33.710/3.906e-3 ≈ 8629.8
    //
    // Why `ω²/a²` is the right reference bound (derivation):
    // The pointwise canonical H for δφ = A·cos(kx−ωt) evaluates to
    //   H_can(x,t) = ½·aPotential·A²·(ω² − k²·cos(2(kx−ωt)))
    // and the proper density divides by aFull = aPotential·a², giving
    //   ρ_proper(x,t) = ½·A²·(ω² − k²·cos(2(kx−ωt)))/a².
    // Its extrema are ½·A²·(ω²±k²)/a². For the massless-dominated regime
    // here (m²·a² ≈ 3.9e-3 ≪ k² ≈ 33.7) the spatial peak equals
    //   ρ_peak = ½·A²·(ω²+k²)/a² ≈ A²·ω²/a² = shaderPeakBound,
    // so the hand-computed bound matches the true spatial peak up to a
    // sub-percent mass-term correction. The estimator's time-average
    // convention puts it at exactly half the bound.
    const a = 1 / (2 * 8)
    const latticeL = 32 * 0.1
    const kPhys = (2 * Math.PI * 3) / latticeL
    const sk = (2 * Math.sin(kPhys * 0.05)) / 0.1
    const omegaSq = sk * sk + 1 * a * a
    const shaderPeakBound = (omegaSq / (a * a)) * 1

    // The estimator carries the ½·A²·ω²/a² time-average, so the spatial
    // peak is at most 2× it. Demand the estimator lands in [0.2, 1.0]
    // times the hand-computed bound — this catches a regression to the
    // pre-fix factor-~128 overshoot (estimator ≈ 275,000) while staying
    // tight enough to reject an over-correction that would under-fill
    // the dynamic range.
    expect(estimate).toBeGreaterThan(shaderPeakBound * 0.2)
    expect(estimate).toBeLessThan(shaderPeakBound * 1.0)
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

  it('still returns the vacuum estimate for vacuumNoise even when autoScale is off', () => {
    // Regression: `bianchiKasnerCigar` and similar cosmology presets use
    // autoScale=false to preserve the brightness-grows-with-η signature.
    // Under the pre-fix code the estimator short-circuited to 1.0,
    // leaving the shader saturated on massless 64³ lattices whose typical
    // vacuum amplitude exceeds 1. The fix keeps the static, physics-based
    // estimator for vacuumNoise regardless of autoScale — calibrating the
    // initial frame while letting later η evolution push normRho above 1.
    const base = {
      initialCondition: 'vacuumNoise' as const,
      latticeDim: 3,
      gridSize: [32, 32, 32] as [number, number, number],
      spacing: [0.15, 0.15, 0.15] as [number, number, number],
      mass: 0,
    }
    const autoOn = createConfig({ ...base, autoScale: true })
    const autoOff = createConfig({ ...base, autoScale: false })

    const withAutoOn = computeFsfMaxPhiEstimate(autoOn)
    const withAutoOff = computeFsfMaxPhiEstimate(autoOff)

    // Bit-identical: both branches run the same vacuum estimator.
    expect(withAutoOff).toBe(withAutoOn)
    // And the estimate must be finite, positive, and ≠ 1.0 (the pre-fix
    // sentinel) for a massless 32³ cosmology-off vacuum on this lattice —
    // guards against a silent regression back to the short-circuit.
    expect(Number.isFinite(withAutoOff)).toBe(true)
    expect(withAutoOff).toBeGreaterThan(0)
    expect(withAutoOff).not.toBe(1.0)
  })

  it('estimateFsfMaxFieldValue returns physics-based value for vacuumNoise + autoScale=false', () => {
    // Sibling of the computeFsfMaxPhiEstimate test above — same rationale
    // at the maxFieldValue layer. Bianchi-Kasner Cigar initialization at
    // η₀=1.5 in n=4 has every aPot_d = 1, so the anisotropic path reduces
    // to the isotropic estimator.
    const base = {
      initialCondition: 'vacuumNoise' as const,
      latticeDim: 3,
      gridSize: [32, 32, 32] as [number, number, number],
      spacing: [0.15, 0.15, 0.15] as [number, number, number],
      mass: 0,
      fieldView: 'energyDensity' as const,
    }
    const autoOn = createConfig({ ...base, autoScale: true })
    const autoOff = createConfig({ ...base, autoScale: false })

    const phi0 = computeFsfMaxPhiEstimate(autoOff)
    const withAutoOn = estimateFsfMaxFieldValue(autoOn, phi0)
    const withAutoOff = estimateFsfMaxFieldValue(autoOff, phi0)
    expect(withAutoOff).toBe(withAutoOn)
    expect(withAutoOff).toBeGreaterThan(0)
    expect(withAutoOff).not.toBe(1.0)
  })

  it('vacuum estimator diverges from isotropic baseline under anisotropic Bianchi-I', () => {
    // Regression: `resolveVacuumAutoScale` must route through the
    // axis-weighted dispersion when any aPotentialRatio_d ≠ 1, otherwise
    // the visualizer mis-normalizes initial vacuum brightness on Kasner
    // presets (collapses back to scalar `m²·a²`). Compare:
    //   isotropic baseline — flat-Minkowski, no cosmology
    //   anisotropic — bianchiKasner with the canonical (-1/3, 2/3, 2/3)
    //                 triple, evaluated at η₀=2 (axis-weighted ω_k path)
    // The estimates must differ; equality would prove the anisotropic
    // metadata never reached `estimateVacuumMaxPhi`/`estimateVacuumEnergy`.
    const base = {
      initialCondition: 'vacuumNoise' as const,
      latticeDim: 3,
      gridSize: [32, 32, 32] as [number, number, number],
      spacing: [0.15, 0.15, 0.15] as [number, number, number],
      mass: 0.3,
      fieldView: 'energyDensity' as const,
    }
    const isotropic = createConfig({
      ...base,
      autoScale: true,
      cosmology: { ...DEFAULT_FREE_SCALAR_CONFIG.cosmology, enabled: false },
    })
    const anisotropic = createConfig({
      ...base,
      autoScale: true,
      cosmology: {
        ...DEFAULT_FREE_SCALAR_CONFIG.cosmology,
        enabled: true,
        preset: 'bianchiKasner',
        eta0: 2,
        kasnerExponents: { p1: -1 / 3, p2: 2 / 3, p3: 2 / 3 },
      },
    })

    const phi0Iso = computeFsfMaxPhiEstimate(isotropic)
    const phi0Aniso = computeFsfMaxPhiEstimate(anisotropic)

    const isoEstimate = estimateFsfMaxFieldValue(isotropic, phi0Iso)
    const anisoEstimate = estimateFsfMaxFieldValue(anisotropic, phi0Aniso)

    expect(Number.isFinite(isoEstimate)).toBe(true)
    expect(Number.isFinite(anisoEstimate)).toBe(true)
    expect(isoEstimate).toBeGreaterThan(0)
    expect(anisoEstimate).toBeGreaterThan(0)
    // Must not collapse to the scalar-isotropic value — the axis ratios
    // (1, 2, 2) shift the per-axis k-weighted ω, yielding a distinct
    // brightness calibration. Same value would prove the anisotropic
    // dispersion was silently reduced to the scalar branch.
    expect(anisoEstimate).not.toBe(isoEstimate)
  })

  it('vacuum phi/pi auto-scale uses aKinetic for anisotropic Bianchi-I rescale', () => {
    const eta0 = 2
    const config = createConfig({
      initialCondition: 'vacuumNoise',
      latticeDim: 3,
      gridSize: [32, 32, 32],
      spacing: [0.15, 0.15, 0.15],
      mass: 0.3,
      autoScale: true,
      cosmology: {
        ...DEFAULT_FREE_SCALAR_CONFIG.cosmology,
        enabled: true,
        preset: 'bianchiKasner',
        eta0,
        kasnerExponents: { p1: -1 / 3, p2: 2 / 3, p3: 2 / 3 },
      },
    })
    const dispersion = computeFsfVacuumDispersion(config, eta0)
    if (typeof dispersion !== 'object') {
      throw new Error('expected anisotropic Bianchi-I dispersion')
    }
    const coefs = computeFsfCosmologyCoefs(config, eta0)

    const rawPhi = estimateVacuumMaxPhi(config, dispersion)
    const expectedPhi = rawPhi * Math.sqrt(coefs.aKinetic)
    expect(computeFsfMaxPhiEstimate(config)).toBeCloseTo(expectedPhi, 8)

    const piConfig = { ...config, fieldView: 'pi' as const }
    const rawPi = estimateVacuumMaxPi(piConfig, dispersion)
    const expectedPi = rawPi / Math.sqrt(coefs.aKinetic)
    expect(estimateFsfMaxFieldValue(piConfig, expectedPhi)).toBeCloseTo(expectedPi, 8)
  })
})
