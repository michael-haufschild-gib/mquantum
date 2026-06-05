import { describe, expect, it } from 'vitest'

import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import type { TdseConfig } from '@/lib/geometry/extended/types'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import type { FFTAxisSharedMemParams } from '@/rendering/webgpu/passes/TDSEComputePassDispatchers'
import {
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
