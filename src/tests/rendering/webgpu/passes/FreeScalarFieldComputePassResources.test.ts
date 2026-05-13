import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_FREE_SCALAR_CONFIG } from '@/lib/geometry/extended/freeScalar'
import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import {
  type FsfInitContext,
  initializeFsfField,
} from '@/rendering/webgpu/passes/FreeScalarFieldComputePassResources'

function createRenderState(writeBuffer = vi.fn()): WebGPURenderContext {
  return {
    device: {
      queue: { writeBuffer },
    },
    encoder: {
      copyBufferToBuffer: vi.fn(),
    },
  } as unknown as WebGPURenderContext
}

function createInitContext(overrides: Partial<FsfInitContext> = {}): FsfInitContext {
  return {
    pl: null,
    bg: null,
    phiBuffer: {} as GPUBuffer,
    piBuffer: {} as GPUBuffer,
    uniformBuffer: null,
    totalSites: 4,
    simEta: 0,
    pendingInjection: null,
    pendingStagingBuffers: [],
    kSpace: {
      invalidateReadbacks: vi.fn(),
    } as unknown as FsfInitContext['kSpace'],
    cosmoCoefsScratch: new Float32Array(6),
    preheatingTime: 0,
    preheatingReferenceEta: 0,
    dispatchCompute: vi.fn(),
    beginComputePass: vi.fn(),
    ...overrides,
  }
}

describe('initializeFsfField save-state injection', () => {
  const config: FreeScalarConfig = {
    ...DEFAULT_FREE_SCALAR_CONFIG,
    initialCondition: 'gaussianPacket',
  }

  it('rejects length-mismatched save-state data instead of partial-uploading stale tails', () => {
    const writeBuffer = vi.fn()
    const renderState = createRenderState(writeBuffer)
    const initState = createInitContext({
      pendingInjection: {
        re: new Float32Array([1, 2]),
        im: new Float32Array([3, 4, 5, 6]),
      },
    })

    expect(() => initializeFsfField(renderState, config, initState)).toThrow(
      '[FSF] Invalid save-state length: expected re=im=4, got re=2, im=4'
    )
    expect(initState.pendingInjection).toBeNull()
    expect(writeBuffer).not.toHaveBeenCalled()
  })

  it('uploads exact-length save-state data to phi and pi buffers', () => {
    const writeBuffer = vi.fn()
    const renderState = createRenderState(writeBuffer)
    const re = new Float32Array([1, 2, 3, 4])
    const im = new Float32Array([5, 6, 7, 8])
    const initState = createInitContext({
      pendingInjection: { re, im },
    })

    const result = initializeFsfField(renderState, config, initState)

    expect(writeBuffer).toHaveBeenNthCalledWith(1, initState.phiBuffer, 0, re)
    expect(writeBuffer).toHaveBeenNthCalledWith(2, initState.piBuffer, 0, im)
    expect(initState.kSpace.invalidateReadbacks).toHaveBeenCalled()
    expect(result.pendingInjection).toBeNull()
    expect(result.initialized).toBe(true)
  })
})
