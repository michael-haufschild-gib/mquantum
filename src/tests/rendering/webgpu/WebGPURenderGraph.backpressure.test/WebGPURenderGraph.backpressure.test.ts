import { afterEach, describe, expect, it, vi } from 'vitest'

import { WebGPURenderGraph } from '@/rendering/webgpu/graph/WebGPURenderGraph'
import { createMockCommandEncoder, createMockTexture } from '@/tests/__mocks__/webgpu'

function createDeferred(): {
  promise: Promise<void>
  resolve: () => void
  reject: () => void
} {
  let resolveValue: (() => void) | null = null
  let rejectValue: (() => void) | null = null
  const promise = new Promise<void>((resolve, reject) => {
    resolveValue = resolve
    rejectValue = () => reject(new Error('GPU queue failed'))
  })

  return {
    promise,
    resolve: () => resolveValue?.(),
    reject: () => rejectValue?.(),
  }
}

function createBackpressureGraph(workDone: Promise<void>) {
  const commandEncoder = createMockCommandEncoder()
  const queue = {
    submit: vi.fn(),
    onSubmittedWorkDone: vi.fn(() => workDone),
  } as unknown as GPUQueue
  const device = {
    createCommandEncoder: vi.fn(() => commandEncoder),
    queue,
  } as unknown as GPUDevice
  const texture = createMockTexture()
  const pool = {
    getTexture: vi.fn(() => null),
    getTextureView: vi.fn(() => null),
    getWriteTextureView: vi.fn(() => null),
    getReadTextureView: vi.fn(() => null),
    getSampler: vi.fn(() => null),
    getResource: vi.fn(() => null),
    swapPingPong: vi.fn(),
    getVRAMUsage: vi.fn(() => 0),
  }

  const graph = new WebGPURenderGraph()
  const graphInternals = graph as unknown as {
    deviceManager: {
      getDevice: () => GPUDevice
      getCurrentTexture: () => GPUTexture
      getCapabilities: () => null
    }
    pool: typeof pool
    initialized: boolean
    compiled: boolean
    width: number
    height: number
    resources: Map<string, unknown>
    passes: Map<string, unknown>
    passOrder: string[]
    storeGetters: Map<string, () => unknown>
  }

  graphInternals.deviceManager = {
    getDevice: () => device,
    getCurrentTexture: () => texture,
    getCapabilities: () => null,
  }
  graphInternals.pool = pool
  graphInternals.initialized = true
  graphInternals.compiled = true
  graphInternals.width = 64
  graphInternals.height = 64
  graphInternals.resources = new Map()
  graphInternals.passes = new Map()
  graphInternals.passOrder = []
  graphInternals.storeGetters = new Map()

  return { graph, queue }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('WebGPURenderGraph frame backpressure', () => {
  it('keeps backpressure active until submitted GPU work completes', async () => {
    const gate = createDeferred()
    const { graph, queue } = createBackpressureGraph(gate.promise)

    graph.execute(1 / 60, 'none')

    expect(queue.submit).toHaveBeenCalledOnce()
    expect(queue.onSubmittedWorkDone).toHaveBeenCalledOnce()
    expect(graph.isFrameBackpressureActive()).toBe(true)

    gate.resolve()
    await gate.promise
    await Promise.resolve()

    expect(graph.isFrameBackpressureActive()).toBe(false)
  })

  it('clears backpressure when submitted GPU work rejects', async () => {
    const gate = createDeferred()
    const { graph } = createBackpressureGraph(gate.promise)

    graph.execute(1 / 60, 'none')
    expect(graph.isFrameBackpressureActive()).toBe(true)

    gate.reject()
    await expect(gate.promise).rejects.toThrow('GPU queue failed')
    await Promise.resolve()

    expect(graph.isFrameBackpressureActive()).toBe(false)
  })
})
