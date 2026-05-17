import { describe, expect, it, vi } from 'vitest'

import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import type { TdsePipelineResult } from '@/rendering/webgpu/passes/TDSEComputePassSetup'
import {
  type DispatchComputeFn,
  dispatchGramSchmidt,
  type GramSchmidtState,
  type PostGSRenormResources,
} from '@/rendering/webgpu/passes/TDSEGramSchmidt'
import {
  createMockBindGroup,
  createMockBuffer,
  createMockCommandEncoder,
  createMockComputePassEncoder,
} from '@/tests/__mocks__/webgpu'

function pipeline(label: string): GPUComputePipeline {
  return { label } as unknown as GPUComputePipeline
}

function bindGroupLayout(label: string): GPUBindGroupLayout {
  return { label } as unknown as GPUBindGroupLayout
}

function copyBufferSource(data: AllowSharedBufferSource): ArrayBuffer {
  if (ArrayBuffer.isView(data)) {
    const copy = new ArrayBuffer(data.byteLength)
    new Uint8Array(copy).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
    return copy
  }
  const copy = new ArrayBuffer(data.byteLength)
  new Uint8Array(copy).set(new Uint8Array(data))
  return copy
}

function createDeviceWithWriteSnapshots() {
  const writeSnapshots: ArrayBuffer[] = []
  const device = {
    createBindGroup: vi.fn(() => createMockBindGroup()),
    queue: {
      writeBuffer: vi.fn((_buffer: GPUBuffer, _offset: number, data: AllowSharedBufferSource) => {
        writeSnapshots.push(copyBufferSource(data))
      }),
    },
  } as unknown as GPUDevice

  return { device, writeSnapshots }
}

function createRenderContext(device: GPUDevice): WebGPURenderContext {
  return {
    device,
    encoder: createMockCommandEncoder(),
    frame: null,
    size: { width: 1, height: 1 },
    getTexture: vi.fn(() => null),
    getTextureView: vi.fn(() => null),
    getWriteTarget: vi.fn(() => null),
    getReadTextureView: vi.fn(() => null),
    getSampler: vi.fn(() => null),
    getResource: vi.fn(() => null),
    beginRenderPass: vi.fn(),
    beginComputePass: vi.fn(() => createMockComputePassEncoder()),
    getCanvasTextureView: vi.fn(),
  } as unknown as WebGPURenderContext
}

function createPipelines(): TdsePipelineResult {
  return {
    gsReducePipeline: pipeline('gs-reduce'),
    gsReduceBGL: bindGroupLayout('gs-reduce-bgl'),
    gsFinalizePipeline: pipeline('gs-finalize'),
    gsFinalizeBGL: bindGroupLayout('gs-finalize-bgl'),
    gsSubtractPipeline: pipeline('gs-subtract'),
    gsSubtractBGL: bindGroupLayout('gs-subtract-bgl'),
  } as unknown as TdsePipelineResult
}

function createState(overrides: Partial<GramSchmidtState> = {}): GramSchmidtState {
  return {
    gsEigenstates: [],
    gsUniformBuffer: null,
    gsPartialReBuffer: null,
    gsPartialImBuffer: null,
    gsResultBuffer: null,
    gsNumWorkgroups: 0,
    gsBufferTotalSites: 0,
    psiBuffer: null,
    totalSites: 0,
    pl: null,
    eigenstateGeneration: 0,
    ...overrides,
  }
}

function readU32(buffer: ArrayBuffer): number[] {
  return Array.from(new Uint32Array(buffer))
}

function readSubtractUniform(buffer: ArrayBuffer): { totalSites: number; normSquared: number } {
  const u32 = new Uint32Array(buffer)
  const f32 = new Float32Array(buffer)
  return {
    totalSites: u32[0]!,
    normSquared: f32[1]!,
  }
}

describe('dispatchGramSchmidt', () => {
  it('does nothing until all dispatch prerequisites are available', () => {
    const { device } = createDeviceWithWriteSnapshots()
    const ctx = createRenderContext(device)
    const dispatch = vi.fn<DispatchComputeFn>()

    dispatchGramSchmidt(ctx, createState(), dispatch)
    dispatchGramSchmidt(
      ctx,
      createState({
        gsEigenstates: [{ psi: createMockBuffer('eigen'), normSquared: 1, energy: NaN, ipr: NaN }],
        psiBuffer: createMockBuffer('psi'),
        totalSites: 513,
        pl: createPipelines(),
      }),
      dispatch
    )

    expect(dispatch).not.toHaveBeenCalled()
    expect(ctx.beginComputePass).not.toHaveBeenCalled()
    expect(device.createBindGroup).not.toHaveBeenCalled()
    expect(device.queue.writeBuffer).not.toHaveBeenCalled()
  })

  it('does not dispatch when GS scalar dimensions are stale or invalid', () => {
    const { device } = createDeviceWithWriteSnapshots()
    const ctx = createRenderContext(device)
    const dispatch = vi.fn<DispatchComputeFn>()
    const baseState = {
      gsEigenstates: [{ psi: createMockBuffer('eigen'), normSquared: 1, energy: NaN, ipr: NaN }],
      gsUniformBuffer: createMockBuffer('gs-uniform'),
      gsPartialReBuffer: createMockBuffer('gs-partial-re'),
      gsPartialImBuffer: createMockBuffer('gs-partial-im'),
      gsResultBuffer: createMockBuffer('gs-result'),
      psiBuffer: createMockBuffer('psi'),
      pl: createPipelines(),
    }

    dispatchGramSchmidt(
      ctx,
      createState({
        ...baseState,
        totalSites: 0,
        gsNumWorkgroups: 1,
      }),
      dispatch
    )
    dispatchGramSchmidt(
      ctx,
      createState({
        ...baseState,
        totalSites: 513,
        gsNumWorkgroups: 0,
      }),
      dispatch
    )
    dispatchGramSchmidt(
      ctx,
      createState({
        ...baseState,
        totalSites: 513,
        gsNumWorkgroups: 1,
      }),
      dispatch
    )

    expect(dispatch).not.toHaveBeenCalled()
    expect(ctx.beginComputePass).not.toHaveBeenCalled()
    expect(device.queue.writeBuffer).not.toHaveBeenCalled()
  })

  it('dispatches reduce, finalize, and subtract once per stored eigenstate', () => {
    const { device, writeSnapshots } = createDeviceWithWriteSnapshots()
    const ctx = createRenderContext(device)
    const pl = createPipelines()
    const dispatch = vi.fn<DispatchComputeFn>()
    const psi = createMockBuffer('psi')
    const eigenA = createMockBuffer('eigen-a')
    const eigenB = createMockBuffer('eigen-b')
    const state = createState({
      gsEigenstates: [
        { psi: eigenA, normSquared: 0.5, energy: NaN, ipr: NaN },
        { psi: eigenB, normSquared: 2, energy: NaN, ipr: NaN },
      ],
      gsUniformBuffer: createMockBuffer('gs-uniform'),
      gsPartialReBuffer: createMockBuffer('gs-partial-re'),
      gsPartialImBuffer: createMockBuffer('gs-partial-im'),
      gsResultBuffer: createMockBuffer('gs-result'),
      gsNumWorkgroups: 5,
      psiBuffer: psi,
      totalSites: 513,
      pl,
    })

    dispatchGramSchmidt(ctx, state, dispatch)

    expect(dispatch.mock.calls.map((call) => (call[1] as GPUComputePipeline).label)).toEqual([
      'gs-reduce',
      'gs-finalize',
      'gs-subtract',
      'gs-reduce',
      'gs-finalize',
      'gs-subtract',
    ])
    expect(dispatch.mock.calls.map((call) => call[3])).toEqual([5, 1, 9, 5, 1, 9])
    expect(ctx.beginComputePass).toHaveBeenCalledTimes(6)
    expect(device.createBindGroup).toHaveBeenCalledTimes(6)
    expect(device.queue.writeBuffer).toHaveBeenCalledTimes(4)

    expect(readU32(writeSnapshots[0]!)).toEqual([513, 5, 0, 0])
    expect(readSubtractUniform(writeSnapshots[1]!)).toEqual({ totalSites: 513, normSquared: 0.5 })
    expect(readU32(writeSnapshots[2]!)).toEqual([513, 5, 0, 0])
    expect(readSubtractUniform(writeSnapshots[3]!)).toEqual({ totalSites: 513, normSquared: 2 })

    const firstReduce = vi.mocked(device.createBindGroup).mock.calls[0]![0]
    const firstReduceEntries = Array.from(firstReduce.entries)
    expect(firstReduceEntries[1]!.resource).toEqual({ buffer: eigenA })
    expect(firstReduceEntries[2]!.resource).toEqual({ buffer: psi })

    const secondReduce = vi.mocked(device.createBindGroup).mock.calls[3]![0]
    const secondReduceEntries = Array.from(secondReduce.entries)
    expect(secondReduceEntries[1]!.resource).toEqual({ buffer: eigenB })
    expect(secondReduceEntries[2]!.resource).toEqual({ buffer: psi })
  })

  it('runs post-GS renormalization after all projection subtraction passes', () => {
    const { device } = createDeviceWithWriteSnapshots()
    const ctx = createRenderContext(device)
    const pl = createPipelines()
    const dispatch = vi.fn<DispatchComputeFn>()
    const state = createState({
      gsEigenstates: [{ psi: createMockBuffer('eigen'), normSquared: 1, energy: NaN, ipr: NaN }],
      gsUniformBuffer: createMockBuffer('gs-uniform'),
      gsPartialReBuffer: createMockBuffer('gs-partial-re'),
      gsPartialImBuffer: createMockBuffer('gs-partial-im'),
      gsResultBuffer: createMockBuffer('gs-result'),
      gsNumWorkgroups: 5,
      psiBuffer: createMockBuffer('psi'),
      totalSites: 513,
      pl,
    })
    const post: PostGSRenormResources = {
      diagReducePipeline: pipeline('post-reduce'),
      diagReduceBG: createMockBindGroup(),
      diagFinalizePipeline: pipeline('post-finalize'),
      diagFinalizeBG: createMockBindGroup(),
      renormalizePipeline: pipeline('post-renormalize'),
      renormalizeBG: createMockBindGroup(),
      diagNumWorkgroups: 7,
    }

    dispatchGramSchmidt(ctx, state, dispatch, post)

    expect(dispatch.mock.calls.map((call) => (call[1] as GPUComputePipeline).label)).toEqual([
      'gs-reduce',
      'gs-finalize',
      'gs-subtract',
      'post-reduce',
      'post-finalize',
      'post-renormalize',
    ])
    expect(dispatch.mock.calls.map((call) => call[3])).toEqual([5, 1, 9, 7, 1, 9])
  })
})
