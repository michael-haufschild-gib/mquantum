import { describe, expect, it, vi } from 'vitest'

import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { requestMeasurementReadback } from '@/rendering/webgpu/passes/TDSEMeasurementReadback'

function createStagingBuffer(values: number[]): GPUBuffer {
  const bytes = new Float32Array(values).buffer
  const buffer = {
    mapState: 'unmapped' as GPUBufferMapState,
    mapAsync: vi.fn(() => {
      buffer.mapState = 'mapped' as GPUBufferMapState
      return Promise.resolve()
    }),
    getMappedRange: vi.fn(() => bytes),
    unmap: vi.fn(() => {
      buffer.mapState = 'unmapped' as GPUBufferMapState
    }),
    destroy: vi.fn(),
  }
  return buffer as unknown as GPUBuffer
}

describe('requestMeasurementReadback', () => {
  it('maps the staging buffer without a queue-wide submitted-work fence', async () => {
    const staging = createStagingBuffer([1, 2, 3, 4])
    const psiBuffer = { label: 'psi' } as GPUBuffer
    const copyBufferToBuffer = vi.fn()
    const onSubmittedWorkDone = vi.fn().mockResolvedValue(undefined)

    const ctx = {
      device: {
        createBuffer: vi.fn(() => staging),
        queue: { onSubmittedWorkDone },
      },
      encoder: { copyBufferToBuffer },
    } as unknown as WebGPURenderContext

    const resultPromise = requestMeasurementReadback(ctx, {
      psiBuffer,
      totalSites: 2,
      simTime: 12.5,
    })

    expect(copyBufferToBuffer).toHaveBeenCalledWith(psiBuffer, 0, staging, 0, 16)
    expect(onSubmittedWorkDone).not.toHaveBeenCalled()
    expect(staging.mapAsync).not.toHaveBeenCalled()

    await Promise.resolve()

    expect(staging.mapAsync).toHaveBeenCalledWith(GPUMapMode.READ)
    const result = await resultPromise

    expect(Array.from(result!.re)).toEqual([1, 3])
    expect(Array.from(result!.im)).toEqual([2, 4])
    expect(result!.simTime).toBe(12.5)
    expect(staging.unmap).toHaveBeenCalled()
    expect(staging.destroy).toHaveBeenCalled()
  })

  it('returns null without creating a staging buffer when psi is unavailable', async () => {
    const createBuffer = vi.fn()
    const copyBufferToBuffer = vi.fn()
    const ctx = {
      device: {
        createBuffer,
        queue: { onSubmittedWorkDone: vi.fn() },
      },
      encoder: { copyBufferToBuffer },
    } as unknown as WebGPURenderContext

    await expect(
      requestMeasurementReadback(ctx, { psiBuffer: null, totalSites: 2, simTime: 0 })
    ).resolves.toBeNull()

    expect(createBuffer).not.toHaveBeenCalled()
    expect(copyBufferToBuffer).not.toHaveBeenCalled()
  })
})
