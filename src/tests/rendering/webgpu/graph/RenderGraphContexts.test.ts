import { describe, expect, it } from 'vitest'

import { WebGPUResourcePool } from '@/rendering/webgpu/core/WebGPUResourcePool'
import { RenderContextImpl } from '@/rendering/webgpu/graph/RenderGraphContexts'
import { createMockCommandEncoder, createMockTexture, mockWebGPU } from '@/tests/__mocks__/webgpu'

describe('RenderContextImpl', () => {
  it('resolves aliases consistently for sampler lookups', () => {
    const pool = new WebGPUResourcePool()
    pool.initialize(mockWebGPU.device)
    pool.setSize(8, 8)
    pool.addResource({
      id: 'source',
      type: 'texture',
      size: { mode: 'fixed', width: 8, height: 8 },
      format: 'rgba8unorm',
    })

    const sourceSampler = pool.getSampler('source')
    const ctx = new RenderContextImpl(
      mockWebGPU.device,
      createMockCommandEncoder(),
      null,
      { width: 8, height: 8 },
      pool,
      createMockTexture().createView(),
      new Map([['alias', 'source']])
    )

    expect(ctx.getSampler('alias')).toBe(sourceSampler)
    expect(ctx.getTextureView('alias')).toBe(pool.getTextureView('source'))
  })
})
