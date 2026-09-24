import { describe, expect, it } from 'vitest'

import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import type { TdseConfig } from '@/lib/geometry/extended/types'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import type { FFTAxisSharedMemParams } from '@/rendering/webgpu/passes/TDSEComputePassDispatchers'
import {
  buildTdseDiagUniforms,
  dispatchFFTAxisSharedMem,
  estimateInitialDensity,
} from '@/rendering/webgpu/passes/TDSEComputePassDispatchers'

function tdseConfig(overrides: Partial<TdseConfig> = {}): TdseConfig {
  return { ...DEFAULT_TDSE_CONFIG, ...overrides }
}

describe('TDSE shared-memory FFT dispatch', () => {
  it('rejects axis dimensions larger than the shader shared-memory arrays', () => {
    expect(() =>
      dispatchFFTAxisSharedMem({} as WebGPURenderContext, 256, 0, {} as FFTAxisSharedMemParams)
    ).toThrow(/TDSE FFT.*max 128/)
  })
})

describe('estimateInitialDensity', () => {
  it('matches Thomas-Fermi shader density for vortex lattice initialization', () => {
    expect(
      estimateInitialDensity(
        tdseConfig({
          initialCondition: 'vortexLattice',
          packetAmplitude: 20,
          interactionStrength: 500,
        })
      )
    ).toBeCloseTo(0.04)
  })

  it('matches Thomas-Fermi shader density for N-D vortex reconnection', () => {
    expect(
      estimateInitialDensity(
        tdseConfig({
          initialCondition: 'ndVortexPair',
          packetAmplitude: 12,
          interactionStrength: 300,
        })
      )
    ).toBeCloseTo(0.04)
  })

  it('matches analog-Hawking shader background density', () => {
    expect(
      estimateInitialDensity(
        tdseConfig({
          initialCondition: 'blackHoleAnalog',
          packetAmplitude: 5,
          interactionStrength: 250,
        })
      )
    ).toBeCloseTo(0.02)
  })

  it('uses attractive black-hole interaction magnitude for background density', () => {
    expect(
      estimateInitialDensity(
        tdseConfig({
          initialCondition: 'blackHoleAnalog',
          packetAmplitude: 5,
          interactionStrength: -250,
        })
      )
    ).toBeCloseTo(0.02)
  })
})

// Regression: the R/T partition placed site i at (i − N/2 + ½)·spacing[0]
// using the RAW slider spacing, while the potential puts the barrier at
// barrierCenter in EFFECTIVE coordinates (compactification / torus metric).
describe('buildTdseDiagUniforms', () => {
  const read = (buf: ArrayBuffer) => ({
    center: new Float32Array(buf)[2]!,
    dx: new Float32Array(buf)[4]!,
  })

  it('uses the torus-metric effective axis-0 spacing', () => {
    const cfg = tdseConfig({
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.1, 0.1, 0.1],
      metric: { kind: 'torus', torusPeriod: [10, 10, 10] },
      barrierCenter: 1,
      branchingEnabled: false,
    })
    const { center, dx } = read(buildTdseDiagUniforms(cfg, 64 ** 3, 4096, [4096, 64, 1]))
    expect(dx).toBeCloseTo(10 / 64, 6)
    expect(center).toBeCloseTo(1, 6)
  })

  it('uses the compactified axis-0 spacing 2πR/N', () => {
    const cfg = tdseConfig({
      latticeDim: 2,
      gridSize: [32, 32],
      spacing: [0.2, 0.2],
      compactDims: [true, false],
      compactRadii: [0.5, 1],
      metric: { kind: 'flat' },
    })
    expect(read(buildTdseDiagUniforms(cfg, 1024, 16, [32, 1])).dx).toBeCloseTo(
      (2 * Math.PI * 0.5) / 32,
      6
    )
  })

  it('keeps the raw spacing on a flat, non-compact lattice and a spacing-invariant branch plane', () => {
    const cfg = tdseConfig({
      latticeDim: 1,
      gridSize: [128],
      spacing: [0.05],
      compactDims: [false],
      metric: { kind: 'flat' },
      branchingEnabled: true,
      branchPlanePosition: 0.5,
    })
    const { center, dx } = read(buildTdseDiagUniforms(cfg, 128, 2, [1]))
    expect(dx).toBeCloseTo(0.05, 7)
    // Branch plane at p = ½ sits at site index p·N/2 + N/2 − ½ regardless of dx.
    expect(center / dx + 64 - 0.5).toBeCloseTo(0.5 * 64 + 64 - 0.5, 4)
  })
})
