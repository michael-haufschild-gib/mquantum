import { describe, expect, it, vi } from 'vitest'

import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { SMAAPass } from '@/rendering/webgpu/passes/SMAAPass'

type TestableSMAAPass = {
  threshold: number
  maxSearchSteps: number
  device: GPUDevice | null
  edgeDetectionPipeline: GPURenderPipeline | null
  blendWeightPipeline: GPURenderPipeline | null
  neighborhoodBlendPipeline: GPURenderPipeline | null
  edgeDetectionBindGroupLayout: GPUBindGroupLayout | null
  blendWeightBindGroupLayout: GPUBindGroupLayout | null
  neighborhoodBlendBindGroupLayout: GPUBindGroupLayout | null
  edgeUniformBuffer: GPUBuffer | null
  blendUniformBuffer: GPUBuffer | null
  neighborhoodUniformBuffer: GPUBuffer | null
  linearSampler: GPUSampler | null
  pointSampler: GPUSampler | null
}

function installExecutableInternals(pass: SMAAPass, device: GPUDevice): void {
  const internals = pass as unknown as TestableSMAAPass
  internals.device = device
  internals.edgeDetectionPipeline = {} as GPURenderPipeline
  internals.blendWeightPipeline = {} as GPURenderPipeline
  internals.neighborhoodBlendPipeline = {} as GPURenderPipeline
  internals.edgeDetectionBindGroupLayout = {} as GPUBindGroupLayout
  internals.blendWeightBindGroupLayout = {} as GPUBindGroupLayout
  internals.neighborhoodBlendBindGroupLayout = {} as GPUBindGroupLayout
  internals.edgeUniformBuffer = {} as GPUBuffer
  internals.blendUniformBuffer = {} as GPUBuffer
  internals.neighborhoodUniformBuffer = {} as GPUBuffer
  internals.linearSampler = {} as GPUSampler
  internals.pointSampler = {} as GPUSampler
}

describe('SMAAPass option sanitization', () => {
  it('sanitizes constructor threshold and search-step values', () => {
    const pass = new SMAAPass({
      threshold: Number.NaN,
      maxSearchSteps: Number.POSITIVE_INFINITY,
    }) as unknown as TestableSMAAPass

    expect(pass.threshold).toBe(0.1)
    expect(pass.maxSearchSteps).toBe(16)
  })

  it('clamps mutable threshold and search-step values', () => {
    const pass = new SMAAPass()
    const internals = pass as unknown as TestableSMAAPass

    pass.setThreshold(-1)
    pass.setMaxSearchSteps(100)

    expect(internals.threshold).toBe(0.05)
    expect(internals.maxSearchSteps).toBe(32)
  })

  it('keeps prior finite values when setters receive non-finite input', () => {
    const pass = new SMAAPass({ threshold: 0.2, maxSearchSteps: 12 })
    const internals = pass as unknown as TestableSMAAPass

    pass.setThreshold(Number.NEGATIVE_INFINITY)
    pass.setMaxSearchSteps(Number.NaN)

    expect(internals.threshold).toBe(0.2)
    expect(internals.maxSearchSteps).toBe(12)
  })

  it('mirrors WGSL integer truncation for fractional search steps', () => {
    const pass = new SMAAPass({ maxSearchSteps: 12.9 }) as unknown as TestableSMAAPass

    expect(pass.maxSearchSteps).toBe(12)
  })

  it('skips GPU texture allocation for degenerate frame sizes', () => {
    const createTexture = vi.fn()
    const device = {
      createTexture,
      queue: { writeBuffer: vi.fn() },
      createBindGroup: vi.fn(),
    } as unknown as GPUDevice
    const pass = new SMAAPass()
    installExecutableInternals(pass, device)

    const ctx = {
      size: { width: 0, height: 720 },
      getTextureView: vi.fn(() => ({}) as GPUTextureView),
      getWriteTarget: vi.fn(() => ({}) as GPUTextureView),
      getCanvasTextureView: vi.fn(() => ({}) as GPUTextureView),
      beginRenderPass: vi.fn(),
    } as unknown as WebGPURenderContext

    pass.execute(ctx)

    expect(createTexture).not.toHaveBeenCalled()
    expect(ctx.beginRenderPass).not.toHaveBeenCalled()
  })
})
