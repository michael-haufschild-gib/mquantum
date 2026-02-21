import { describe, expect, it, vi } from 'vitest'

import { FrameBlendingPass } from '@/rendering/webgpu/passes/FrameBlendingPass'
import { TemporalCloudPass } from '@/rendering/webgpu/passes/TemporalCloudPass'
import { TemporalCloudDepthPass } from '@/rendering/webgpu/passes/TemporalCloudDepthPass'
import { TemporalDepthCapturePass } from '@/rendering/webgpu/passes/TemporalDepthCapturePass'
import { WebGPUTemporalCloudPass } from '@/rendering/webgpu/passes/WebGPUTemporalCloudPass'

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

    ;(pass as unknown as Record<string, unknown>).device = device
    ;(pass as unknown as Record<string, unknown>).blendPipeline = {} as GPURenderPipeline
    ;(pass as unknown as Record<string, unknown>).copyPipeline = {} as GPURenderPipeline
    ;(pass as unknown as Record<string, unknown>).passBindGroupLayout = {} as GPUBindGroupLayout
    ;(pass as unknown as Record<string, unknown>).copyBindGroupLayout = {} as GPUBindGroupLayout
    ;(pass as unknown as Record<string, unknown>).uniformBuffer = {} as GPUBuffer
    ;(pass as unknown as Record<string, unknown>).sampler = {} as GPUSampler
    ;(pass as unknown as Record<string, unknown>).historyTexture = historyTexture
    ;(pass as unknown as Record<string, unknown>).historyView = historyView
    ;(pass as unknown as Record<string, unknown>).historyInitialized = true
    ;(pass as unknown as Record<string, unknown>).lastWidth = 800
    ;(pass as unknown as Record<string, unknown>).lastHeight = 600
    ;(pass as unknown as Record<string, unknown>).renderFullscreen = vi.fn()

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

    expect((device as { createBindGroup: ReturnType<typeof vi.fn> }).createBindGroup).toHaveBeenCalledTimes(1)
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

    ;(pass as unknown as Record<string, unknown>).device = device
    ;(pass as unknown as Record<string, unknown>).reprojectionPipeline = {} as GPURenderPipeline
    ;(pass as unknown as Record<string, unknown>).reconstructionPipeline = {} as GPURenderPipeline
    ;(pass as unknown as Record<string, unknown>).reprojectionUniformBuffer = {} as GPUBuffer
    ;(pass as unknown as Record<string, unknown>).reconstructionUniformBuffer = {} as GPUBuffer
    ;(pass as unknown as Record<string, unknown>).passBindGroupLayout = {} as GPUBindGroupLayout
    ;(pass as unknown as Record<string, unknown>).reconstructionBindGroupLayout = {} as GPUBindGroupLayout
    ;(pass as unknown as Record<string, unknown>).sampler = {} as GPUSampler
    ;(pass as unknown as Record<string, unknown>).hasValidHistory = true
    ;(pass as unknown as Record<string, unknown>).frameIndex = 0
    ;(pass as unknown as Record<string, unknown>).renderFullscreen = vi.fn()

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

    expect((device as { createBindGroup: ReturnType<typeof vi.fn> }).createBindGroup).toHaveBeenCalledTimes(2)
  })

  it('reuses WebGPUTemporalCloud bind groups across ping-pong frames', () => {
    const pass = new WebGPUTemporalCloudPass({
      quarterColorInput: 'quarterColor',
      quarterPositionInput: 'quarterPosition',
      outputResource: 'temporalOut',
    })

    const device = {
      queue: { writeBuffer: vi.fn() },
      createBindGroup: vi.fn(() => ({}) as GPUBindGroup),
    } as unknown as GPUDevice

    const quarterColorView = {} as GPUTextureView
    const quarterPositionView = {} as GPUTextureView
    const outputView = {} as GPUTextureView
    const outputTexture = {} as GPUTexture
    const reprojHistoryView = {} as GPUTextureView
    const accumulationViewA = {} as GPUTextureView
    const accumulationViewB = {} as GPUTextureView
    const accumulationTextureA = {} as GPUTexture
    const accumulationTextureB = {} as GPUTexture

    ;(pass as unknown as Record<string, unknown>).device = device
    ;(pass as unknown as Record<string, unknown>).reprojectionPipeline = {} as GPURenderPipeline
    ;(pass as unknown as Record<string, unknown>).reconstructionPipeline = {} as GPURenderPipeline
    ;(pass as unknown as Record<string, unknown>).reprojectionBindGroupLayout0 = {} as GPUBindGroupLayout
    ;(pass as unknown as Record<string, unknown>).reprojectionBindGroupLayout1 = {} as GPUBindGroupLayout
    ;(pass as unknown as Record<string, unknown>).reconstructionBindGroupLayout0 = {} as GPUBindGroupLayout
    ;(pass as unknown as Record<string, unknown>).reconstructionBindGroupLayout1 = {} as GPUBindGroupLayout
    ;(pass as unknown as Record<string, unknown>).temporalUniformBuffer = {} as GPUBuffer
    ;(pass as unknown as Record<string, unknown>).linearSampler = {} as GPUSampler
    ;(pass as unknown as Record<string, unknown>).nearestSampler = {} as GPUSampler
    ;(pass as unknown as Record<string, unknown>).reprojectedHistoryView = reprojHistoryView
    ;(pass as unknown as Record<string, unknown>).accumulationViewA = accumulationViewA
    ;(pass as unknown as Record<string, unknown>).accumulationViewB = accumulationViewB
    ;(pass as unknown as Record<string, unknown>).accumulationTextureA = accumulationTextureA
    ;(pass as unknown as Record<string, unknown>).accumulationTextureB = accumulationTextureB
    ;(pass as unknown as Record<string, unknown>).hasValidHistory = true
    ;(pass as unknown as Record<string, unknown>).lastWidth = 800
    ;(pass as unknown as Record<string, unknown>).lastHeight = 600
    ;(pass as unknown as Record<string, unknown>).renderFullscreen = vi.fn()

    const renderContext = {
      size: { width: 800, height: 600 },
      encoder: { copyTextureToTexture: vi.fn() },
      beginRenderPass: vi.fn(() => createRenderPassEncoder()),
      getTextureView: vi.fn((id: string) => {
        if (id === 'quarterColor') return quarterColorView
        if (id === 'quarterPosition') return quarterPositionView
        return null
      }),
      getWriteTarget: vi.fn((id: string) => (id === 'temporalOut' ? outputView : null)),
      getResource: vi.fn((id: string) => (id === 'temporalOut' ? { texture: outputTexture } : null)),
      frame: {
        stores: {
          camera: {
            viewProjectionMatrix: {
              elements: Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0)),
            },
            position: [0, 0, 0],
          },
        },
      },
    } as unknown as Parameters<WebGPUTemporalCloudPass['execute']>[0]

    pass.execute(renderContext)
    pass.execute(renderContext)
    pass.execute(renderContext)

    // 1x reprojection uniforms + 2x reprojection ping-pong variants +
    // 1x reconstruction uniforms + 1x reconstruction textures.
    expect((device as { createBindGroup: ReturnType<typeof vi.fn> }).createBindGroup).toHaveBeenCalledTimes(5)
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

    ;(pass as unknown as Record<string, unknown>).device = device
    ;(pass as unknown as Record<string, unknown>).renderPipeline = {} as GPURenderPipeline
    ;(pass as unknown as Record<string, unknown>).uniformBuffer = {} as GPUBuffer
    ;(pass as unknown as Record<string, unknown>).passBindGroupLayout = {} as GPUBindGroupLayout
    ;(pass as unknown as Record<string, unknown>).sampler = {} as GPUSampler
    ;(pass as unknown as Record<string, unknown>).renderFullscreen = vi.fn()

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

    expect((device as { createBindGroup: ReturnType<typeof vi.fn> }).createBindGroup).toHaveBeenCalledTimes(1)
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
