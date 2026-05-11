import { describe, expect, it } from 'vitest'

import {
  DEFAULT_QUANTUM_WALK_CONFIG,
  type QuantumWalkConfig,
} from '@/lib/geometry/extended/quantumWalk'
import { QuantumWalkComputePass } from '@/rendering/webgpu/passes/QuantumWalkComputePass'

type ConfigDirtyHarness = {
  consumeConfigDirty(config: QuantumWalkConfig): boolean
}

function createConfig(overrides: Partial<QuantumWalkConfig> = {}): QuantumWalkConfig {
  return {
    ...DEFAULT_QUANTUM_WALK_CONFIG,
    ...overrides,
    gridSize: overrides.gridSize ?? [...DEFAULT_QUANTUM_WALK_CONFIG.gridSize],
    spacing: overrides.spacing ?? [...DEFAULT_QUANTUM_WALK_CONFIG.spacing],
    initialPosition: overrides.initialPosition ?? [...DEFAULT_QUANTUM_WALK_CONFIG.initialPosition],
    slicePositions: overrides.slicePositions ?? [...DEFAULT_QUANTUM_WALK_CONFIG.slicePositions],
  }
}

describe('QuantumWalkComputePass config dirty tracking', () => {
  it('does not mark unchanged config dirty after first capture', () => {
    const pass = new QuantumWalkComputePass() as unknown as ConfigDirtyHarness
    const config = createConfig()

    expect(pass.consumeConfigDirty(config)).toBe(true)
    expect(pass.consumeConfigDirty(config)).toBe(false)
  })

  it('detects grid, lattice, coin type, coin bias, and coin initial changes', () => {
    const pass = new QuantumWalkComputePass() as unknown as ConfigDirtyHarness
    const config = createConfig()

    expect(pass.consumeConfigDirty(config)).toBe(true)
    expect(pass.consumeConfigDirty({ ...config, gridSize: [32, 64] })).toBe(true)
    expect(pass.consumeConfigDirty({ ...config, gridSize: [32, 64] })).toBe(false)

    expect(pass.consumeConfigDirty({ ...config, coinType: 'hadamard' })).toBe(true)
    expect(pass.consumeConfigDirty({ ...config, coinType: 'hadamard' })).toBe(false)

    expect(pass.consumeConfigDirty({ ...config, coinBias: config.coinBias + 0.1 })).toBe(true)
    expect(pass.consumeConfigDirty({ ...config, coinBias: config.coinBias + 0.1 })).toBe(false)

    expect(pass.consumeConfigDirty({ ...config, coinInitial: 'symmetric' })).toBe(true)
    expect(pass.consumeConfigDirty({ ...config, coinInitial: 'symmetric' })).toBe(false)

    const changedDim = createConfig({
      latticeDim: 3,
      gridSize: [32, 32, 32],
      spacing: [0.1, 0.1, 0.1],
      initialPosition: [16, 16, 16],
    })
    expect(pass.consumeConfigDirty(changedDim)).toBe(true)
    expect(pass.consumeConfigDirty(changedDim)).toBe(false)
  })
})
