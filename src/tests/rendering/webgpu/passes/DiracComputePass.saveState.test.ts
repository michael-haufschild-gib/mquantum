import { describe, expect, it, vi } from 'vitest'

import type { DiracConfig } from '@/lib/geometry/extended/dirac'
import { DEFAULT_DIRAC_CONFIG } from '@/lib/geometry/extended/dirac'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { DiracComputePass } from '@/rendering/webgpu/passes/DiracComputePass'

interface DiracPassInternals {
  spinorBuffer: GPUBuffer | null
  currentSpinorSize: number
  totalSites: number
  initialized: boolean
  pendingInjection: { re: Float32Array; im: Float32Array } | null
  maybeInitialize(ctx: WebGPURenderContext, config: DiracConfig): void
}

function createContext(writeBuffer = vi.fn()): WebGPURenderContext {
  return {
    device: {
      queue: { writeBuffer },
    },
  } as unknown as WebGPURenderContext
}

function createReadyPass(): DiracComputePass {
  const pass = new DiracComputePass()
  const internals = pass as unknown as DiracPassInternals
  internals.spinorBuffer = { label: 'spinor' } as unknown as GPUBuffer
  internals.currentSpinorSize = 4
  internals.totalSites = 2
  internals.initialized = false
  return pass
}

const config: DiracConfig = {
  ...DEFAULT_DIRAC_CONFIG,
  latticeDim: 3,
  gridSize: [2, 1, 1],
  needsReset: false,
}

describe('DiracComputePass save-state injection', () => {
  it('rejects length-mismatched save-state data instead of partial-uploading stale tails', () => {
    const writeBuffer = vi.fn()
    const pass = createReadyPass()
    const internals = pass as unknown as DiracPassInternals
    pass.setLoadedWavefunction(new Float32Array([1, 2]), new Float32Array(8))

    expect(() => internals.maybeInitialize(createContext(writeBuffer), config)).toThrow(
      '[Dirac] Invalid save-state length: expected re=im=8, got re=2, im=8'
    )
    expect(internals.pendingInjection).toBeNull()
    expect(writeBuffer).not.toHaveBeenCalled()
  })

  it('uploads exact-length save-state data as interleaved complex spinor', () => {
    const writeBuffer = vi.fn()
    const pass = createReadyPass()
    const internals = pass as unknown as DiracPassInternals
    pass.setLoadedWavefunction(
      new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]),
      new Float32Array([9, 10, 11, 12, 13, 14, 15, 16])
    )

    internals.maybeInitialize(createContext(writeBuffer), config)

    expect(internals.pendingInjection).toBeNull()
    expect(writeBuffer).toHaveBeenCalledTimes(1)
    const interleaved = writeBuffer.mock.calls[0]?.[2] as Float32Array
    expect(Array.from(interleaved)).toEqual([1, 9, 2, 10, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15, 8, 16])
  })
})
