import { describe, expect, it } from 'vitest'

import { DEFAULT_PAULI_CONFIG, type PauliConfig } from '@/lib/geometry/extended/pauli'
import { PauliComputePass } from '@/rendering/webgpu/passes/PauliComputePass'

type PotentialDirtyHarness = {
  consumePauliPotentialDirty(config: PauliConfig): boolean
  invalidatePauliPotential(): void
}

function createConfig(overrides: Partial<PauliConfig> = {}): PauliConfig {
  return {
    ...DEFAULT_PAULI_CONFIG,
    ...overrides,
    gridSize: overrides.gridSize ?? [...DEFAULT_PAULI_CONFIG.gridSize],
    spacing: overrides.spacing ?? [...DEFAULT_PAULI_CONFIG.spacing],
  }
}

describe('PauliComputePass potential dirty tracking', () => {
  it('does not mark an unchanged potential config dirty after first capture', () => {
    const pass = new PauliComputePass() as unknown as PotentialDirtyHarness
    const config = createConfig()

    expect(pass.consumePauliPotentialDirty(config)).toBe(true)
    expect(pass.consumePauliPotentialDirty(createConfig())).toBe(false)
  })

  it('detects potential scalar, grid, spacing, and explicit invalidation changes', () => {
    const pass = new PauliComputePass() as unknown as PotentialDirtyHarness
    const config = createConfig()

    expect(pass.consumePauliPotentialDirty(config)).toBe(true)
    expect(pass.consumePauliPotentialDirty({ ...config, wellDepth: config.wellDepth + 1 })).toBe(
      true
    )
    expect(pass.consumePauliPotentialDirty(createConfig({ wellDepth: config.wellDepth + 1 }))).toBe(
      false
    )

    const changedGrid = createConfig({ gridSize: [32, 64, 64], spacing: [0.15, 0.15, 0.15] })
    expect(pass.consumePauliPotentialDirty(changedGrid)).toBe(true)
    expect(
      pass.consumePauliPotentialDirty(
        createConfig({ gridSize: [32, 64, 64], spacing: [0.15, 0.15, 0.15] })
      )
    ).toBe(false)

    const changedSpacing = createConfig({ gridSize: [32, 64, 64], spacing: [0.2, 0.15, 0.15] })
    expect(pass.consumePauliPotentialDirty(changedSpacing)).toBe(true)
    expect(
      pass.consumePauliPotentialDirty(
        createConfig({ gridSize: [32, 64, 64], spacing: [0.2, 0.15, 0.15] })
      )
    ).toBe(false)

    pass.invalidatePauliPotential()
    expect(pass.consumePauliPotentialDirty(changedSpacing)).toBe(true)
  })
})
