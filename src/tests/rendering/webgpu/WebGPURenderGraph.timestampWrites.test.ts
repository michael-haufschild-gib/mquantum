import { describe, expect, it, vi } from 'vitest'
import type {
  WebGPURenderPass,
  WebGPURenderPassConfig,
  WebGPUResourceAccess,
} from '@/rendering/webgpu/core/types'

function createRenderPassConfig(
  id: string,
  outputs: WebGPUResourceAccess[]
): WebGPURenderPassConfig {
  return {
    id,
    inputs: [],
    outputs,
  }
}

function createNoopRenderPassEncoder(): GPURenderPassEncoder {
  return {
    end: vi.fn(),
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    draw: vi.fn(),
    drawIndexed: vi.fn(),
  } as unknown as GPURenderPassEncoder
}

function createNoopComputePassEncoder(): GPUComputePassEncoder {
  return {
    end: vi.fn(),
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups: vi.fn(),
  } as unknown as GPUComputePassEncoder
}

function ensureGPUConstants(): void {
  if (!('GPUTextureUsage' in globalThis)) {
    ;(globalThis as unknown as { GPUTextureUsage: Record<string, number> }).GPUTextureUsage = {
      TEXTURE_BINDING: 1 << 0,
      RENDER_ATTACHMENT: 1 << 1,
      COPY_SRC: 1 << 2,
      COPY_DST: 1 << 3,
    }
  }
  if (!('GPUMapMode' in globalThis)) {
    ;(globalThis as unknown as { GPUMapMode: Record<string, number> }).GPUMapMode = {
      READ: 1,
      WRITE: 2,
    }
  }
}

async function createGraphHarness(pass: WebGPURenderPass) {
  ensureGPUConstants()
  const { WebGPURenderGraph } = await import('@/rendering/webgpu/graph/WebGPURenderGraph')

  const beginRenderPass = vi.fn((_: GPURenderPassDescriptor) => createNoopRenderPassEncoder())
  const beginComputePass = vi.fn((_: GPUComputePassDescriptor) => createNoopComputePassEncoder())
  const resolveQuerySet = vi.fn()
  const copyBufferToBuffer = vi.fn()

  const commandEncoder: GPUCommandEncoder = {
    beginRenderPass,
    beginComputePass,
    resolveQuerySet,
    copyBufferToBuffer,
    finish: vi.fn(() => ({}) as GPUCommandBuffer),
  } as unknown as GPUCommandEncoder

  const queue = {
    submit: vi.fn(),
    onSubmittedWorkDone: vi.fn().mockResolvedValue(undefined),
  } as unknown as GPUQueue

  const device: GPUDevice = {
    createCommandEncoder: vi.fn(() => commandEncoder),
    queue,
  } as unknown as GPUDevice

  const textureView = {} as GPUTextureView
  const texture = {
    createView: vi.fn(() => textureView),
  } as unknown as GPUTexture

  const timestampReadBuffer = {
    mapAsync: vi.fn().mockResolvedValue(undefined),
    getMappedRange: vi.fn(() => {
      const values = new BigUint64Array(2)
      values[0] = 1000n
      values[1] = 4000n
      return values.buffer
    }),
    unmap: vi.fn(),
  } as unknown as GPUBuffer

  const pool = {
    getTexture: vi.fn(() => null),
    getTextureView: vi.fn(() => null),
    getWriteTextureView: vi.fn(() => textureView),
    getReadTextureView: vi.fn(() => textureView),
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
      getFormat: () => GPUTextureFormat
      getCapabilities: () => { timestampQuery: boolean } | null
    }
    pool: typeof pool
    initialized: boolean
    compiled: boolean
    width: number
    height: number
    resources: Map<string, unknown>
    passes: Map<string, WebGPURenderPass>
    passOrder: string[]
    storeGetters: Map<string, () => unknown>
    gpuTimingEnabled: boolean
    timestampQuerySet: GPUQuerySet | null
    timestampBuffer: GPUBuffer | null
    timestampReadBuffer: GPUBuffer | null
    timestampReadbackInFlight: boolean
  }

  graphInternals.deviceManager = {
    getDevice: () => device,
    getCurrentTexture: () => texture,
    getFormat: () => 'rgba8unorm',
    getCapabilities: () => ({ timestampQuery: true }),
  }
  graphInternals.pool = pool
  graphInternals.initialized = true
  graphInternals.compiled = true
  graphInternals.width = 64
  graphInternals.height = 64
  graphInternals.resources = new Map([['out', {}]])
  graphInternals.passes = new Map([[pass.id, pass]])
  graphInternals.passOrder = [pass.id]
  graphInternals.storeGetters = new Map()
  graphInternals.gpuTimingEnabled = true
  graphInternals.timestampQuerySet = {} as GPUQuerySet
  graphInternals.timestampBuffer = {} as GPUBuffer
  graphInternals.timestampReadBuffer = timestampReadBuffer
  graphInternals.timestampReadbackInFlight = false

  return {
    graph,
    beginRenderPass,
    beginComputePass,
    resolveQuerySet,
    copyBufferToBuffer,
  }
}

describe('WebGPURenderGraph timestampWrites wiring', () => {
  it('memoizes pass enabled-state checks per frame', async () => {
    const enabledSpy = vi.fn(() => true)
    const pass: WebGPURenderPass = {
      id: 'memo-enabled-pass',
      config: {
        ...createRenderPassConfig('memo-enabled-pass', [
          { resourceId: 'out', access: 'write', binding: 0 },
        ]),
        enabled: enabledSpy,
      },
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: (ctx) => {
        const passEncoder = ctx.beginRenderPass({
          label: 'memo-enabled-pass',
          colorAttachments: [
            {
              view: ctx.getWriteTarget('out')!,
              loadOp: 'clear',
              storeOp: 'store',
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
            },
          ],
        })
        passEncoder.end()
      },
      dispose: vi.fn(),
    }

    const harness = await createGraphHarness(pass)
    harness.graph.execute(1 / 60)

    expect(enabledSpy).toHaveBeenCalledTimes(1)
  })

  it('injects timestampWrites into render pass descriptors and resolves query data', async () => {
    const pass: WebGPURenderPass = {
      id: 'render-pass',
      config: createRenderPassConfig('render-pass', [
        { resourceId: 'out', access: 'write', binding: 0 },
      ]),
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: (ctx) => {
        const passEncoder = ctx.beginRenderPass({
          label: 'test-render',
          colorAttachments: [
            {
              view: ctx.getWriteTarget('out')!,
              loadOp: 'clear',
              storeOp: 'store',
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
            },
          ],
        })
        passEncoder.end()
      },
      dispose: vi.fn(),
    }

    const { graph, beginRenderPass, resolveQuerySet, copyBufferToBuffer } =
      await createGraphHarness(pass)
    graph.execute(1 / 60)

    expect(beginRenderPass).toHaveBeenCalledTimes(1)
    const descriptor = beginRenderPass.mock.calls[0]?.[0]
    if (!descriptor) {
      throw new Error('Expected render pass descriptor to be captured')
    }
    expect(descriptor.timestampWrites).toBeDefined()
    expect(resolveQuerySet).toHaveBeenCalledTimes(1)
    expect(copyBufferToBuffer).toHaveBeenCalledTimes(1)
  })

  it('injects timestampWrites into compute pass descriptors', async () => {
    const pass: WebGPURenderPass = {
      id: 'compute-pass',
      config: createRenderPassConfig('compute-pass', [
        { resourceId: 'out', access: 'write', binding: 0 },
      ]),
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: (ctx) => {
        const computePass = ctx.beginComputePass({ label: 'test-compute' })
        computePass.end()
      },
      dispose: vi.fn(),
    }

    const { graph, beginComputePass, resolveQuerySet, copyBufferToBuffer } =
      await createGraphHarness(pass)
    graph.execute(1 / 60)

    expect(beginComputePass).toHaveBeenCalledTimes(1)
    const descriptor = beginComputePass.mock.calls[0]?.[0]
    if (!descriptor) {
      throw new Error('Expected compute pass descriptor to be captured')
    }
    expect(descriptor.timestampWrites).toBeDefined()
    expect(resolveQuerySet).toHaveBeenCalledTimes(1)
    expect(copyBufferToBuffer).toHaveBeenCalledTimes(1)
  })

  it('skips timestamp instrumentation while readback is in flight', async () => {
    const pass: WebGPURenderPass = {
      id: 'render-pass',
      config: createRenderPassConfig('render-pass', [
        { resourceId: 'out', access: 'write', binding: 0 },
      ]),
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: (ctx) => {
        const passEncoder = ctx.beginRenderPass({
          label: 'test-render',
          colorAttachments: [
            {
              view: ctx.getWriteTarget('out')!,
              loadOp: 'clear',
              storeOp: 'store',
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
            },
          ],
        })
        passEncoder.end()
      },
      dispose: vi.fn(),
    }

    const harness = await createGraphHarness(pass)
    const graphInternals = harness.graph as unknown as { timestampReadbackInFlight: boolean }
    graphInternals.timestampReadbackInFlight = true

    harness.graph.execute(1 / 60)

    expect(harness.beginRenderPass).toHaveBeenCalledTimes(1)
    const descriptor = harness.beginRenderPass.mock.calls[0]?.[0]
    if (!descriptor) {
      throw new Error('Expected render pass descriptor to be captured')
    }
    expect(descriptor.timestampWrites).toBeUndefined()
    expect(harness.resolveQuerySet).not.toHaveBeenCalled()
    expect(harness.copyBufferToBuffer).not.toHaveBeenCalled()
  })

  it('runs registered before-submit hooks exactly while registered', async () => {
    const pass: WebGPURenderPass = {
      id: 'before-submit-pass',
      config: createRenderPassConfig('before-submit-pass', [
        { resourceId: 'out', access: 'write', binding: 0 },
      ]),
      initialize: vi.fn().mockResolvedValue(undefined),
      execute: (ctx) => {
        const passEncoder = ctx.beginRenderPass({
          label: 'before-submit',
          colorAttachments: [
            {
              view: ctx.getWriteTarget('out')!,
              loadOp: 'clear',
              storeOp: 'store',
              clearValue: { r: 0, g: 0, b: 0, a: 1 },
            },
          ],
        })
        passEncoder.end()
      },
      dispose: vi.fn(),
    }

    const { graph } = await createGraphHarness(pass)
    const hook = vi.fn()

    graph.registerBeforeSubmitHook('test-before-submit', hook)
    graph.execute(1 / 60)

    expect(hook).toHaveBeenCalledTimes(1)
    const hookContext = hook.mock.calls[0]?.[0]
    expect(hookContext).toBeDefined()
    expect(hookContext.encoder).toBeDefined()
    expect(hookContext.canvasTexture).toBeDefined()
    expect(hookContext.size).toEqual({ width: 64, height: 64 })

    graph.unregisterBeforeSubmitHook('test-before-submit')
    graph.execute(1 / 60)
    expect(hook).toHaveBeenCalledTimes(1)
  })
})
