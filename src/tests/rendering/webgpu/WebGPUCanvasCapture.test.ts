import { describe, expect, it, vi } from 'vitest'

import { WebGPUCanvasCapture } from '@/rendering/webgpu/utils/WebGPUCanvasCapture'

function ensureGPUConstants(): void {
  if (!('GPUBufferUsage' in globalThis)) {
    ;(globalThis as unknown as { GPUBufferUsage: Record<string, number> }).GPUBufferUsage = {
      COPY_DST: 1 << 0,
      MAP_READ: 1 << 1,
    }
  }
  if (!('GPUMapMode' in globalThis)) {
    ;(globalThis as unknown as { GPUMapMode: Record<string, number> }).GPUMapMode = {
      READ: 1 << 0,
    }
  }
}

function makeDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

describe('WebGPUCanvasCapture', () => {
  it('reports cancellation when disposed before in-flight readback completes', async () => {
    ensureGPUConstants()

    const gate = makeDeferred<void>()
    const readbackBuffer = {
      mapAsync: vi.fn(async () => {}),
      getMappedRange: vi.fn(() => new Uint8Array(16).buffer),
      unmap: vi.fn(),
      destroy: vi.fn(),
    }
    const device = {
      createBuffer: vi.fn(() => readbackBuffer),
      queue: {
        onSubmittedWorkDone: vi.fn(() => gate.promise),
      },
    } as unknown as GPUDevice

    const capture = new WebGPUCanvasCapture(device)
    const encoder = {
      copyTextureToBuffer: vi.fn(),
    } as unknown as GPUCommandEncoder

    const onSuccess = vi.fn()
    const onError = vi.fn()

    capture.queueCapture({
      encoder,
      texture: {} as GPUTexture,
      width: 2,
      height: 2,
      format: 'bgra8unorm',
      requestId: 7,
      onSuccess,
      onError,
    })

    capture.dispose()
    gate.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(onSuccess).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith('Screenshot capture canceled.', 7)
  })
})
