/* global GPURenderPipelineDescriptor */
import { describe, expect, it, vi } from 'vitest'
import type { WebGPUSetupContext } from '@/rendering/webgpu/core/types'
import { CubemapCapturePass } from '@/rendering/webgpu/passes/CubemapCapturePass'

function ensureGpuConstants(): void {
  if (!('GPUShaderStage' in globalThis)) {
    ;(globalThis as unknown as { GPUShaderStage: Record<string, number> }).GPUShaderStage = {
      VERTEX: 1 << 0,
      FRAGMENT: 1 << 1,
      COMPUTE: 1 << 2,
    }
  }

  if (!('GPUColorWrite' in globalThis)) {
    ;(globalThis as unknown as { GPUColorWrite: Record<string, number> }).GPUColorWrite = {
      ALL: 0xf,
    }
  }
}

describe('CubemapCapturePass', () => {
  it('creates a cubemap pipeline that matches the cubemap render target format', async () => {
    ensureGpuConstants()

    const createRenderPipeline = vi.fn((descriptor: GPURenderPipelineDescriptor) => {
      return { descriptor } as unknown as GPURenderPipeline
    })

    const device = {
      createBindGroupLayout: vi.fn(() => ({} as GPUBindGroupLayout)),
      createPipelineLayout: vi.fn(() => ({} as GPUPipelineLayout)),
      createRenderPipeline,
    } as unknown as GPUDevice

    const pass = new CubemapCapturePass()
    const internals = pass as unknown as Record<string, unknown>
    internals['createShaderModule'] = vi.fn(() => ({} as GPUShaderModule))
    internals['createUniformBuffer'] = vi.fn(() => ({} as GPUBuffer))
    internals['initializeCubemapHistory'] = vi.fn()

    await (
      pass as unknown as { createPipeline: (ctx: WebGPUSetupContext) => Promise<void> }
    ).createPipeline({
      device,
      format: 'bgra8unorm',
    } as unknown as WebGPUSetupContext)

    expect(createRenderPipeline).toHaveBeenCalledTimes(1)
    const descriptor = createRenderPipeline.mock.calls[0]?.[0] as GPURenderPipelineDescriptor
    const fragmentTargets = Array.from(descriptor.fragment?.targets ?? [])
    expect(fragmentTargets[0]?.format).toBe('rgba16float')
  })

  it('detects procedural animation from proceduralSettings.timeScale', () => {
    const pass = new CubemapCapturePass()
    const isSkyboxAnimating = (
      pass as unknown as {
        isSkyboxAnimating: (env: unknown, isPlaying: boolean) => boolean
      }
    ).isSkyboxAnimating

    expect(
      isSkyboxAnimating(
        {
          skyboxMode: 'procedural_aurora',
          skyboxAnimationMode: 'none',
          skyboxAnimationSpeed: 0,
          proceduralSettings: { timeScale: 0.2 },
        },
        true
      )
    ).toBe(true)

    expect(
      isSkyboxAnimating(
        {
          skyboxMode: 'procedural_aurora',
          skyboxAnimationMode: 'none',
          skyboxAnimationSpeed: 0,
          proceduralSettings: { timeScale: 0 },
        },
        true
      )
    ).toBe(false)
  })
})
