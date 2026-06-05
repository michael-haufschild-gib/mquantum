import { describe, expect, it } from 'vitest'

import { DEFAULT_DIRAC_CONFIG, type DiracConfig } from '@/lib/geometry/extended/dirac'
import { DEFAULT_PAULI_CONFIG, type PauliConfig } from '@/lib/geometry/extended/pauli'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { DiracStrategy } from '@/rendering/webgpu/renderers/strategies/DiracStrategy'
import { PauliStrategy } from '@/rendering/webgpu/renderers/strategies/PauliStrategy'
import type { SchroedingerSnapshot } from '@/rendering/webgpu/renderers/strategies/types'

function ctxWithColor(colorAlgorithm: string): WebGPURenderContext {
  return {
    frame: {
      stores: {
        appearance: { colorAlgorithm },
      },
    },
  } as unknown as WebGPURenderContext
}

describe('compute strategy effective config identity', () => {
  it('DiracStrategy returns the original config when PML and field view are unchanged', () => {
    const strategy = new DiracStrategy() as unknown as {
      deriveEffectiveConfig: (
        config: DiracConfig,
        ctx: WebGPURenderContext,
        schroedinger: SchroedingerSnapshot | undefined
      ) => DiracConfig
    }
    const config: DiracConfig = {
      ...DEFAULT_DIRAC_CONFIG,
      fieldView: 'totalDensity',
      needsReset: false,
    }

    const result = strategy.deriveEffectiveConfig(config, ctxWithColor('phaseDensity'), undefined)

    expect(result).toBe(config)
  })

  it('DiracStrategy only clones when the color algorithm forces a different field view', () => {
    const strategy = new DiracStrategy() as unknown as {
      deriveEffectiveConfig: (
        config: DiracConfig,
        ctx: WebGPURenderContext,
        schroedinger: SchroedingerSnapshot | undefined
      ) => DiracConfig
    }
    const config: DiracConfig = {
      ...DEFAULT_DIRAC_CONFIG,
      fieldView: 'spinDensity',
      needsReset: false,
    }

    const result = strategy.deriveEffectiveConfig(
      config,
      ctxWithColor('quantumPotential'),
      undefined
    )

    expect(result).not.toBe(config)
    expect(result.fieldView).toBe('totalDensity')
  })

  it('PauliStrategy returns the original config when PML and field view are unchanged', () => {
    const strategy = new PauliStrategy() as unknown as {
      deriveEffectiveConfig: (
        config: PauliConfig,
        ctx: WebGPURenderContext,
        schroedinger: SchroedingerSnapshot | undefined
      ) => PauliConfig
    }
    const config: PauliConfig = {
      ...DEFAULT_PAULI_CONFIG,
      fieldView: 'spinDensity',
      needsReset: false,
    }

    const result = strategy.deriveEffectiveConfig(
      config,
      ctxWithColor('pauliSpinDensity'),
      undefined
    )

    expect(result).toBe(config)
  })

  it('PauliStrategy only clones when the color algorithm forces a different field view', () => {
    const strategy = new PauliStrategy() as unknown as {
      deriveEffectiveConfig: (
        config: PauliConfig,
        ctx: WebGPURenderContext,
        schroedinger: SchroedingerSnapshot | undefined
      ) => PauliConfig
    }
    const config: PauliConfig = {
      ...DEFAULT_PAULI_CONFIG,
      fieldView: 'spinDensity',
      needsReset: false,
    }

    const result = strategy.deriveEffectiveConfig(
      config,
      ctxWithColor('pauliSpinExpectation'),
      undefined
    )

    expect(result).not.toBe(config)
    expect(result.fieldView).toBe('spinExpectation')
  })
})
