import { describe, expect, it, vi } from 'vitest'

import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { QwDiagnostics } from '@/rendering/webgpu/passes/QuantumWalkDiagnostics'

type QwDiagnosticsHarness = {
  reducePipeline: GPUComputePipeline
  finalizePipeline: GPUComputePipeline
  uniformBuffer: GPUBuffer
  partialNormBuffer: GPUBuffer
  partialPosSumBuffer: GPUBuffer
  partialPosSqSumBuffer: GPUBuffer
  resultBuffer: GPUBuffer
  stagingBuffer: GPUBuffer
  dispatch(
    ctx: WebGPURenderContext,
    coinStateA: GPUBuffer,
    totalSites: number,
    latticeDim: number,
    gridSize0: number,
    stepCount: number
  ): void
}

function createPassEncoder(): GPUComputePassEncoder {
  return {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups: vi.fn(),
    end: vi.fn(),
  } as unknown as GPUComputePassEncoder
}

describe('QwDiagnostics uniform upload reuse', () => {
  it('reuses and clears the diagnostic uniform upload array', () => {
    const diag = new QwDiagnostics() as unknown as QwDiagnosticsHarness
    const pipeline = {
      getBindGroupLayout: vi.fn(() => ({})),
    } as unknown as GPUComputePipeline
    const uniformBuffer = { size: 32 } as GPUBuffer
    const largeBuffer = { size: 4096 } as GPUBuffer
    const writeBuffer = vi.fn()
    const ctx = {
      device: {
        queue: {
          writeBuffer,
          onSubmittedWorkDone: vi.fn(() => new Promise<void>(() => {})),
        },
        createBindGroup: vi.fn(() => ({})),
      },
      encoder: {
        copyBufferToBuffer: vi.fn(),
      },
      beginComputePass: vi.fn(() => createPassEncoder()),
    } as unknown as WebGPURenderContext

    diag.reducePipeline = pipeline
    diag.finalizePipeline = pipeline
    diag.uniformBuffer = uniformBuffer
    diag.partialNormBuffer = largeBuffer
    diag.partialPosSumBuffer = largeBuffer
    diag.partialPosSqSumBuffer = largeBuffer
    diag.resultBuffer = largeBuffer
    diag.stagingBuffer = largeBuffer

    diag.dispatch(ctx, largeBuffer, 512, 2, 64, 10)
    const first = writeBuffer.mock.calls[0]![2] as Uint32Array
    expect(Array.from(first)).toEqual([512, 4, 2, 64, 8, 0, 0, 0])

    first[6] = 123
    diag.dispatch(ctx, largeBuffer, 64, 1, 64, 20)
    const second = writeBuffer.mock.calls[1]![2] as Uint32Array
    expect(second).toBe(first)
    expect(Array.from(second)).toEqual([64, 2, 1, 64, 1, 0, 0, 0])
  })
})
