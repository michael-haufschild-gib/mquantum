import { describe, expect, it } from 'vitest'

import { DEFAULT_DIRAC_CONFIG, type DiracConfig } from '@/lib/geometry/extended/dirac'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { DiracComputePass } from '@/rendering/webgpu/passes/DiracComputePass'

type PotentialDirtyHarness = {
  consumePotentialDirty(config: DiracConfig): boolean
  invalidatePotential(): void
  refreshPotentialIfDirty(ctx: WebGPURenderContext, config: DiracConfig): void
}

function createConfig(overrides: Partial<DiracConfig> = {}): DiracConfig {
  return {
    ...DEFAULT_DIRAC_CONFIG,
    ...overrides,
    gridSize: overrides.gridSize ?? [...DEFAULT_DIRAC_CONFIG.gridSize],
    spacing: overrides.spacing ?? [...DEFAULT_DIRAC_CONFIG.spacing],
  }
}

describe('DiracComputePass potential dirty tracking', () => {
  it('does not mark unchanged potential config dirty after first capture', () => {
    const pass = new DiracComputePass() as unknown as PotentialDirtyHarness
    const config = createConfig()

    expect(pass.consumePotentialDirty(config)).toBe(true)
    expect(pass.consumePotentialDirty(config)).toBe(false)
  })

  it('detects scalar, spacing, lattice dimension, and explicit invalidation changes', () => {
    const pass = new DiracComputePass() as unknown as PotentialDirtyHarness
    const config = createConfig()

    expect(pass.consumePotentialDirty(config)).toBe(true)
    expect(
      pass.consumePotentialDirty({ ...config, potentialStrength: config.potentialStrength + 1 })
    ).toBe(true)
    expect(
      pass.consumePotentialDirty({ ...config, potentialStrength: config.potentialStrength + 1 })
    ).toBe(false)

    const changedSpacing = createConfig({ spacing: [0.2, 0.15, 0.15] })
    expect(pass.consumePotentialDirty(changedSpacing)).toBe(true)
    expect(pass.consumePotentialDirty(changedSpacing)).toBe(false)

    const changedDim = createConfig({
      latticeDim: 2,
      gridSize: [64, 64],
      spacing: [0.2, 0.15],
    })
    expect(pass.consumePotentialDirty(changedDim)).toBe(true)
    expect(pass.consumePotentialDirty(changedDim)).toBe(false)

    pass.invalidatePotential()
    expect(pass.consumePotentialDirty(changedDim)).toBe(true)
  })

  it('does not consume dirty state while GPU bind groups are unavailable', () => {
    const pass = new DiracComputePass() as unknown as PotentialDirtyHarness
    const config = createConfig()

    pass.refreshPotentialIfDirty({} as WebGPURenderContext, config)
    expect(pass.consumePotentialDirty(config)).toBe(true)
  })
})
