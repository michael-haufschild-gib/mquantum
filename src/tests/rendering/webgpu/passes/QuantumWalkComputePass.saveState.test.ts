import { describe, expect, it, vi } from 'vitest'

import type { QuantumWalkConfig } from '@/lib/geometry/extended/quantumWalk'
import { DEFAULT_QUANTUM_WALK_CONFIG } from '@/lib/geometry/extended/quantumWalk'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { QuantumWalkComputePass } from '@/rendering/webgpu/passes/QuantumWalkComputePass'

function createContext(writeBuffer = vi.fn()): WebGPURenderContext {
  return {
    device: {
      queue: { writeBuffer },
    },
  } as unknown as WebGPURenderContext
}

function createReadyPass(): QuantumWalkComputePass {
  const pass = new QuantumWalkComputePass()
  Object.assign(pass as unknown as Record<string, unknown>, {
    pipelinesCreated: true,
    initialized: true,
    totalSites: 4,
    latticeDim: 1,
    lastConfigLatticeDim: config.latticeDim,
    lastConfigCoinType: config.coinType,
    lastConfigCoinBias: config.coinBias,
    lastConfigCoinInitial: config.coinInitial,
    lastConfigGridSize: [...config.gridSize],
    coinStateA: { destroy: vi.fn() } as unknown as GPUBuffer,
    coinStateB: { destroy: vi.fn() } as unknown as GPUBuffer,
  })
  return pass
}

const config: QuantumWalkConfig = {
  ...DEFAULT_QUANTUM_WALK_CONFIG,
  latticeDim: 1,
  gridSize: [4],
  initialPosition: [2],
  spacing: [0.1],
}

describe('QuantumWalkComputePass save-state injection', () => {
  it('rejects length-mismatched save-state data instead of partial-uploading stale tails', () => {
    const writeBuffer = vi.fn()
    const pass = createReadyPass()
    pass.setLoadedWavefunction(new Float32Array([1, 2]), new Float32Array(8))

    expect(() =>
      pass.executeQuantumWalk(
        createContext(writeBuffer),
        config,
        false,
        1,
        undefined,
        undefined,
        undefined,
        1
      )
    ).toThrow('[QuantumWalk] Invalid save-state length: expected re=im=8, got re=2, im=8')
    expect(writeBuffer).not.toHaveBeenCalled()
  })

  it('uploads exact-length save-state data as interleaved complex coin state', () => {
    const writeBuffer = vi.fn()
    const pass = createReadyPass()
    const re = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8])
    const im = new Float32Array([9, 10, 11, 12, 13, 14, 15, 16])
    pass.setLoadedWavefunction(re, im)

    pass.executeQuantumWalk(
      createContext(writeBuffer),
      config,
      false,
      1,
      undefined,
      undefined,
      undefined,
      1
    )

    expect(writeBuffer).toHaveBeenCalledTimes(1)
    const interleaved = writeBuffer.mock.calls[0]?.[2] as Float32Array
    expect(Array.from(interleaved)).toEqual([1, 9, 2, 10, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15, 8, 16])
  })
})
