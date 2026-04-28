import { describe, expect, it } from 'vitest'

import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { FrameBlendingPass, frameBlendingShader } from '@/rendering/webgpu/passes/FrameBlendingPass'

type FrameBlendingInternals = Record<string, unknown>

function primeInternals(pass: FrameBlendingPass): FrameBlendingInternals {
  const internals = pass as unknown as FrameBlendingInternals

  internals['device'] = {
    createBindGroup: () => ({}) as GPUBindGroup,
  } as unknown as GPUDevice
  internals['blendPipeline'] = {} as GPURenderPipeline
  internals['copyPipeline'] = {} as GPURenderPipeline
  internals['passBindGroupLayout'] = {} as GPUBindGroupLayout
  internals['copyBindGroupLayout'] = {} as GPUBindGroupLayout
  internals['uniformBuffer'] = {} as GPUBuffer
  internals['sampler'] = {} as GPUSampler
  internals['historyView'] = {} as GPUTextureView
  internals['historyTexture'] = {} as GPUTexture
  internals['ensureHistoryBuffer'] = () => undefined
  internals['renderFullscreen'] = () => undefined

  return internals
}

function makeRenderContext(
  postProcessing: Record<string, unknown>,
  labels: string[] = []
): WebGPURenderContext {
  return {
    size: { width: 800, height: 600 },
    frame: { stores: { postProcessing } },
    getTextureView: () => ({}) as GPUTextureView,
    getWriteTarget: () => ({}) as GPUTextureView,
    getTexture: () => ({}) as GPUTexture,
    encoder: {
      copyTextureToTexture: () => undefined,
    } as unknown as GPUCommandEncoder,
    beginRenderPass: ({ label }: { label?: string }) => {
      labels.push(label ?? '')
      return { end: () => undefined } as unknown as GPURenderPassEncoder
    },
  } as unknown as WebGPURenderContext
}

function requireUploadedUniforms(data: Float32Array | null): Float32Array {
  expect(data?.length).toBe(5)
  return data ?? new Float32Array(0)
}

describe('FrameBlendingPass horizon memory', () => {
  it('keeps the frame-blending uniform buffer at five floats', () => {
    expect(frameBlendingShader).toContain('blendFactor: f32')
    expect(frameBlendingShader).toContain('horizonStrength: f32')
    expect(frameBlendingShader).toContain('horizonRadius: f32')
    expect(frameBlendingShader).toContain('horizonEchoes: f32')
    expect(frameBlendingShader).toContain('horizonSpin: f32')
  })

  it('preserves exact linear mix when horizon memory is disabled', () => {
    expect(frameBlendingShader).toContain('if (horizonStrength <= 0.0001) {')
    expect(frameBlendingShader).toContain('return mix(current, previous, blendFactor);')
  })

  it('encodes previous-frame gradient refraction and center-origin echo shells', () => {
    expect(frameBlendingShader).toContain('previousGradient')
    expect(frameBlendingShader).toContain('refractedUv')
    expect(frameBlendingShader).toContain('let center = vec2f(0.5)')
    expect(frameBlendingShader).toContain('for (var i = 1; i <= 6; i = i + 1)')
    expect(frameBlendingShader).toContain('changeGate')
    expect(frameBlendingShader).toContain('tangentDir')
    expect(frameBlendingShader).toContain('spinAngle')
    expect(frameBlendingShader).toContain('spunDir')
    expect(frameBlendingShader).toContain(
      'let changeGate = 1.0 - smoothstep(0.01, 0.25, abs(currentLum - previousLum));'
    )
  })

  it('copies the current frame directly on the first initialized frame', () => {
    const pass = new FrameBlendingPass({ colorInput: 'scene-color', outputResource: 'out' })
    const internals = primeInternals(pass)
    internals['historyInitialized'] = false

    const labels: string[] = []
    pass.execute(makeRenderContext({}, labels))

    expect(labels).toEqual(['frame-blending-copy-to-output'])
    expect(internals['historyInitialized']).toBe(true)
  })

  it('updates horizon memory uniforms from store snapshots without rebuilding pass resources', () => {
    const pass = new FrameBlendingPass({ colorInput: 'scene-color', outputResource: 'out' })
    const internals = primeInternals(pass)
    internals['historyInitialized'] = true

    let uploaded: Float32Array | null = null
    internals['writeUniformBuffer'] = (
      _device: GPUDevice,
      _buffer: GPUBuffer,
      data: Float32Array
    ) => {
      uploaded = new Float32Array(data)
    }

    pass.execute(
      makeRenderContext({
        frameBlendingFactor: 2,
        horizonMemoryEnabled: true,
        horizonMemoryStrength: 2,
        horizonMemoryRadius: 0,
        horizonMemoryEchoes: 4.6,
        horizonMemorySpin: 2,
      })
    )

    const uniformData = requireUploadedUniforms(uploaded)
    expect(uniformData[0]).toBe(1)
    expect(uniformData[1]).toBe(1.5)
    expect(uniformData[2]).toBeCloseTo(0.05)
    expect(uniformData[3]).toBe(5)
    expect(uniformData[4]).toBe(1)
  })

  it('writes zero horizon strength when memory is disabled in the store', () => {
    const pass = new FrameBlendingPass({ colorInput: 'scene-color', outputResource: 'out' })
    const internals = primeInternals(pass)
    internals['historyInitialized'] = true

    let uploaded: Float32Array | null = null
    internals['writeUniformBuffer'] = (
      _device: GPUDevice,
      _buffer: GPUBuffer,
      data: Float32Array
    ) => {
      uploaded = new Float32Array(data)
    }

    pass.execute(
      makeRenderContext({
        frameBlendingFactor: 0.4,
        horizonMemoryEnabled: false,
        horizonMemoryStrength: 1.2,
        horizonMemoryRadius: 0.8,
        horizonMemoryEchoes: 3,
        horizonMemorySpin: 0.75,
      })
    )

    const uniformData = requireUploadedUniforms(uploaded)
    expect(uniformData[0]).toBeCloseTo(0.4)
    expect(uniformData[1]).toBe(0)
    expect(uniformData[2]).toBeCloseTo(0.8)
    expect(uniformData[3]).toBe(3)
    expect(uniformData[4]).toBeCloseTo(0.75)
  })
})
