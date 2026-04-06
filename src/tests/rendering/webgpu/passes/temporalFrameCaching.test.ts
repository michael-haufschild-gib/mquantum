import { describe, expect, it, vi } from 'vitest'

import { TemporalDepthCapturePass } from '@/rendering/webgpu/passes/TemporalDepthCapturePass'

import { createMockRenderPassEncoder } from '../../../__mocks__/webgpu'

describe('pass resource caching', () => {
  it('uses one render pass plus texture copy in TemporalDepthCapture execution', () => {
    const pass = new TemporalDepthCapturePass({
      positionInput: 'position',
      outputResource: 'temporalOut',
    })

    const device = {
      queue: { writeBuffer: vi.fn() },
      createBindGroup: vi.fn(() => ({}) as GPUBindGroup),
    } as unknown as GPUDevice

    const positionView = {} as GPUTextureView
    const outputView = {} as GPUTextureView
    const outputTexture = {} as GPUTexture

    ;(pass as unknown as Record<string, unknown>).device = device
    ;(pass as unknown as Record<string, unknown>).renderPipeline = {} as GPURenderPipeline
    ;(pass as unknown as Record<string, unknown>).passBindGroupLayout = {} as GPUBindGroupLayout
    ;(pass as unknown as Record<string, unknown>).sampler = {} as GPUSampler
    ;(pass as unknown as Record<string, unknown>).historyTexture = {} as GPUTexture
    ;(pass as unknown as Record<string, unknown>).historyView = {} as GPUTextureView
    ;(pass as unknown as Record<string, unknown>).lastWidth = 800
    ;(pass as unknown as Record<string, unknown>).lastHeight = 600
    ;(pass as unknown as Record<string, unknown>).renderFullscreen = vi.fn()
    vi.spyOn(pass, 'isEnabled').mockReturnValue(true)

    const beginRenderPass = vi.fn(() => createMockRenderPassEncoder())
    const copyTextureToTexture = vi.fn()

    const renderContext = {
      size: { width: 800, height: 600 },
      encoder: { copyTextureToTexture },
      beginRenderPass,
      getTextureView: vi.fn((id: string) => (id === 'position' ? positionView : null)),
      getWriteTarget: vi.fn((id: string) => (id === 'temporalOut' ? outputView : null)),
      getTexture: vi.fn((id: string) => (id === 'temporalOut' ? outputTexture : null)),
      frame: { stores: {} },
    } as unknown as Parameters<TemporalDepthCapturePass['execute']>[0]

    pass.execute(renderContext)

    expect(beginRenderPass).toHaveBeenCalledTimes(1)
    expect(copyTextureToTexture).toHaveBeenCalledTimes(1)
  })
})
