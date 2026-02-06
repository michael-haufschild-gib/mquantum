import { describe, expect, it, vi } from 'vitest'

import { FrameBlendingPass } from '@/rendering/webgpu/passes/FrameBlendingPass'
import { TemporalCloudPass } from '@/rendering/webgpu/passes/TemporalCloudPass'
import { TemporalCloudDepthPass } from '@/rendering/webgpu/passes/TemporalCloudDepthPass'
import { TemporalDepthCapturePass } from '@/rendering/webgpu/passes/TemporalDepthCapturePass'

function createRenderPassEncoder(): GPURenderPassEncoder {
  return {
    end: vi.fn(),
  } as unknown as GPURenderPassEncoder
}

describe('pass resource caching', () => {
  it('reuses FrameBlending bind groups across frames with stable views', () => {
    const pass = new FrameBlendingPass({
      colorInput: 'input',
      outputResource: 'output',
      blendFactor: 0.4,
    })

    const device = {
      queue: { writeBuffer: vi.fn() },
      createBindGroup: vi.fn(() => ({}) as GPUBindGroup),
    } as unknown as GPUDevice

    const colorView = {} as GPUTextureView
    const outputView = {} as GPUTextureView
    const outputTexture = {} as GPUTexture
    const historyTexture = {} as GPUTexture
    const historyView = {} as GPUTextureView

    ;(pass as any).device = device
    ;(pass as any).blendPipeline = {} as GPURenderPipeline
    ;(pass as any).copyPipeline = {} as GPURenderPipeline
    ;(pass as any).passBindGroupLayout = {} as GPUBindGroupLayout
    ;(pass as any).copyBindGroupLayout = {} as GPUBindGroupLayout
    ;(pass as any).uniformBuffer = {} as GPUBuffer
    ;(pass as any).sampler = {} as GPUSampler
    ;(pass as any).historyTexture = historyTexture
    ;(pass as any).historyView = historyView
    ;(pass as any).historyInitialized = true
    ;(pass as any).lastWidth = 800
    ;(pass as any).lastHeight = 600
    ;(pass as any).renderFullscreen = vi.fn()

    const renderContext = {
      size: { width: 800, height: 600 },
      encoder: {
        copyTextureToTexture: vi.fn(),
      },
      beginRenderPass: vi.fn(() => createRenderPassEncoder()),
      getTextureView: vi.fn((id: string) => (id === 'input' ? colorView : null)),
      getWriteTarget: vi.fn((id: string) => (id === 'output' ? outputView : null)),
      getTexture: vi.fn((id: string) => (id === 'output' ? outputTexture : null)),
      frame: {
        stores: {
          postProcessing: { frameBlendingFactor: 0.4 },
        },
      },
    } as unknown as Parameters<FrameBlendingPass['execute']>[0]

    pass.execute(renderContext)
    pass.execute(renderContext)

    expect((device as any).createBindGroup).toHaveBeenCalledTimes(1)
  })

  it('reuses TemporalCloud reprojection/reconstruction bind groups across frames', () => {
    const pass = new TemporalCloudPass({
      cloudColorInput: 'cloudColor',
      cloudPositionInput: 'cloudPosition',
      accumulationColorBuffer: 'accColor',
      accumulationPositionBuffer: 'accPosition',
      reprojectionColorOutput: 'reprojColor',
      reprojectionValidityOutput: 'reprojValidity',
    })

    const device = {
      queue: { writeBuffer: vi.fn() },
      createBindGroup: vi.fn(() => ({}) as GPUBindGroup),
    } as unknown as GPUDevice

    const cloudColorView = {} as GPUTextureView
    const cloudPositionView = {} as GPUTextureView
    const accColorReadView = {} as GPUTextureView
    const accPositionReadView = {} as GPUTextureView
    const accColorWriteView = {} as GPUTextureView
    const accPositionWriteView = {} as GPUTextureView
    const reprojColorView = {} as GPUTextureView
    const reprojValidityView = {} as GPUTextureView

    ;(pass as any).device = device
    ;(pass as any).reprojectionPipeline = {} as GPURenderPipeline
    ;(pass as any).reconstructionPipeline = {} as GPURenderPipeline
    ;(pass as any).reprojectionUniformBuffer = {} as GPUBuffer
    ;(pass as any).reconstructionUniformBuffer = {} as GPUBuffer
    ;(pass as any).passBindGroupLayout = {} as GPUBindGroupLayout
    ;(pass as any).reconstructionBindGroupLayout = {} as GPUBindGroupLayout
    ;(pass as any).sampler = {} as GPUSampler
    ;(pass as any).hasValidHistory = true
    ;(pass as any).frameIndex = 0
    ;(pass as any).renderFullscreen = vi.fn()

    const renderContext = {
      size: { width: 800, height: 600 },
      beginRenderPass: vi.fn(() => createRenderPassEncoder()),
      getTextureView: vi.fn((id: string) => {
        if (id === 'cloudColor') return cloudColorView
        if (id === 'cloudPosition') return cloudPositionView
        if (id === 'reprojColor') return reprojColorView
        if (id === 'reprojValidity') return reprojValidityView
        return null
      }),
      getReadTextureView: vi.fn((id: string) => {
        if (id === 'accColor') return accColorReadView
        if (id === 'accPosition') return accPositionReadView
        return null
      }),
      getWriteTarget: vi.fn((id: string) => {
        if (id === 'accColor') return accColorWriteView
        if (id === 'accPosition') return accPositionWriteView
        if (id === 'reprojColor') return reprojColorView
        if (id === 'reprojValidity') return reprojValidityView
        return null
      }),
      getResource: vi.fn((id: string) => (id === 'cloudColor' ? { width: 400, height: 300 } : null)),
      frame: {
        stores: {
          camera: {
            viewProjectionMatrix: { elements: Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0)) },
            position: [0, 0, 0],
          },
        },
      },
    } as unknown as Parameters<TemporalCloudPass['execute']>[0]

    pass.execute(renderContext)
    pass.execute(renderContext)

    expect((device as any).createBindGroup).toHaveBeenCalledTimes(2)
  })

  it('reuses TemporalCloudDepth bind groups when input view is unchanged', () => {
    const pass = new TemporalCloudDepthPass({
      positionInput: 'position',
      outputResource: 'depthOut',
    })

    const device = {
      queue: { writeBuffer: vi.fn() },
      createBindGroup: vi.fn(() => ({}) as GPUBindGroup),
    } as unknown as GPUDevice

    const positionView = {} as GPUTextureView
    const outputView = {} as GPUTextureView

    ;(pass as any).device = device
    ;(pass as any).renderPipeline = {} as GPURenderPipeline
    ;(pass as any).uniformBuffer = {} as GPUBuffer
    ;(pass as any).passBindGroupLayout = {} as GPUBindGroupLayout
    ;(pass as any).sampler = {} as GPUSampler
    ;(pass as any).renderFullscreen = vi.fn()

    const renderContext = {
      size: { width: 640, height: 360 },
      beginRenderPass: vi.fn(() => createRenderPassEncoder()),
      getTextureView: vi.fn((id: string) => (id === 'position' ? positionView : null)),
      getWriteTarget: vi.fn((id: string) => (id === 'depthOut' ? outputView : null)),
      frame: {
        stores: {
          camera: {
            near: 0.1,
            far: 1000,
            viewProjectionMatrix: { elements: Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0)) },
          },
        },
      },
    } as unknown as Parameters<TemporalCloudDepthPass['execute']>[0]

    pass.execute(renderContext)
    pass.execute(renderContext)

    expect((device as any).createBindGroup).toHaveBeenCalledTimes(1)
  })

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

    ;(pass as any).device = device
    ;(pass as any).renderPipeline = {} as GPURenderPipeline
    ;(pass as any).passBindGroupLayout = {} as GPUBindGroupLayout
    ;(pass as any).sampler = {} as GPUSampler
    ;(pass as any).historyTexture = {} as GPUTexture
    ;(pass as any).historyView = {} as GPUTextureView
    ;(pass as any).lastWidth = 800
    ;(pass as any).lastHeight = 600
    ;(pass as any).renderFullscreen = vi.fn()
    vi.spyOn(pass, 'isEnabled').mockReturnValue(true)

    const beginRenderPass = vi.fn(() => createRenderPassEncoder())
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
