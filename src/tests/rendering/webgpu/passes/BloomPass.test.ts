import { describe, expect, it } from 'vitest'
import { BloomPass } from '@/rendering/webgpu/passes/BloomPass'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import {
  bloomThresholdShader,
  createBloomBlurComputeShader,
  createBloomCompositeShader,
} from '@/rendering/webgpu/shaders/postprocessing/bloom.wgsl'

function primeInternals(pass: BloomPass): Record<string, unknown> {
  const internals = pass as unknown as Record<string, unknown>

  internals['device'] = {} as GPUDevice
  internals['sampler'] = {} as GPUSampler

  internals['thresholdPipeline'] = {} as GPURenderPipeline
  internals['thresholdBGL'] = {} as GPUBindGroupLayout
  internals['thresholdUB'] = {} as GPUBuffer

  internals['blurBGL'] = {} as GPUBindGroupLayout
  internals['blurPipelines'] = new Array(5).fill({}) as GPUComputePipeline[]
  internals['blurUBs'] = new Array(10).fill({}) as GPUBuffer[]

  internals['compositeUB'] = {} as GPUBuffer
  internals['compositePipelines'] = new Array(5).fill({}) as GPURenderPipeline[]
  internals['compositeBGLs'] = new Array(5).fill({}) as GPUBindGroupLayout[]

  internals['copyPipeline'] = {} as GPURenderPipeline
  internals['copyBGL'] = {} as GPUBindGroupLayout

  internals['convolutionPipeline'] = {} as GPURenderPipeline
  internals['convolutionBGL'] = {} as GPUBindGroupLayout
  internals['convolutionUB'] = {} as GPUBuffer

  internals['thresholdTexture'] = {} as GPUTexture
  internals['thresholdTextureView'] = {} as GPUTextureView
  internals['horizontalTextures'] = new Array(5).fill({}) as GPUTexture[]
  internals['verticalTextures'] = new Array(5).fill({}) as GPUTexture[]
  internals['horizontalTextureViews'] = new Array(5).fill({}) as GPUTextureView[]
  internals['verticalTextureViews'] = new Array(5).fill({}) as GPUTextureView[]

  internals['ensureGaussianTextures'] = () => undefined
  internals['ensureConvolutionTexture'] = () => undefined

  internals['createBindGroup'] = () => ({}) as GPUBindGroup
  internals['writeUniformBuffer'] = () => undefined
  internals['renderFullscreen'] = () => undefined

  return internals
}

function createMockComputePassEncoder(): GPUComputePassEncoder {
  return {
    setPipeline: () => undefined,
    setBindGroup: () => undefined,
    dispatchWorkgroups: () => undefined,
    end: () => undefined,
  } as unknown as GPUComputePassEncoder
}

describe('BloomPass v2', () => {
  it('precomputes coefficients for gaussian kernels', () => {
    const pass = new BloomPass()
    const gaussianCoefficients = (pass as unknown as { gaussianCoefficients: Float32Array[] })
      .gaussianCoefficients

    expect(gaussianCoefficients).toHaveLength(5)
    expect(gaussianCoefficients[0]![5]).toBeGreaterThan(0)
    expect(gaussianCoefficients[0]![6]).toBe(0)
    expect(gaussianCoefficients[4]![21]).toBeGreaterThan(0)
    expect(gaussianCoefficients[4]![22]).toBe(0)
  })

  it('uses soft threshold with max-component brightness', () => {
    expect(bloomThresholdShader).toContain(
      'fn softThreshold(color: vec3f, threshold: f32, knee: f32) -> vec3f'
    )
    expect(bloomThresholdShader).toContain('max(color.r, max(color.g, color.b))')
    expect(bloomThresholdShader).not.toContain('luminance')
  })

  it('specializes blur compute and composite shader generation by level count', () => {
    const blurShader = createBloomBlurComputeShader(22)
    expect(blurShader).toContain('for (var i = 1u; i < 22u; i++)')
    expect(blurShader).toContain('@compute @workgroup_size(256, 1, 1)')
    expect(blurShader).toContain('var<workgroup> tile')

    const compositeL2 = createBloomCompositeShader(2)
    expect(compositeL2).toContain('@binding(4) var linearSampler')
    expect(compositeL2).toContain('tMip0')
    expect(compositeL2).toContain('tMip1')
    expect(compositeL2).not.toContain('tMip2')
  })

  it('uses zero-strength fast path (single copy pass)', () => {
    const pass = new BloomPass()
    primeInternals(pass)

    let renderPassCount = 0
    const ctx = {
      size: { width: 1280, height: 720 },
      frame: { stores: { postProcessing: { bloomGain: 0 } } },
      getTextureView: () => ({}) as GPUTextureView,
      getWriteTarget: () => ({}) as GPUTextureView,
      getCanvasTextureView: () => ({}) as GPUTextureView,
      beginRenderPass: () => {
        renderPassCount += 1
        return { end: () => undefined } as unknown as GPURenderPassEncoder
      },
      beginComputePass: () => createMockComputePassEncoder(),
    } as unknown as WebGPURenderContext

    pass.execute(ctx)

    expect(renderPassCount).toBe(1)
  })

  it('runs threshold + blur + composite for one active gaussian level', () => {
    const pass = new BloomPass()
    primeInternals(pass)

    let renderPassCount = 0
    let computePassCount = 0
    const ctx = {
      size: { width: 1280, height: 720 },
      frame: {
        stores: {
          postProcessing: {
            bloomGain: 1,
            bloomThreshold: 0,
            bloomBands: [
              { enabled: true, weight: 1, size: 1, tint: '#ffffff' },
              { enabled: false, weight: 0.8, size: 1, tint: '#ffffff' },
              { enabled: false, weight: 0.6, size: 1, tint: '#ffffff' },
              { enabled: false, weight: 0.4, size: 1, tint: '#ffffff' },
              { enabled: false, weight: 0.2, size: 1, tint: '#ffffff' },
            ],
          },
        },
      },
      getTextureView: () => ({}) as GPUTextureView,
      getWriteTarget: () => ({}) as GPUTextureView,
      getCanvasTextureView: () => ({}) as GPUTextureView,
      beginRenderPass: () => {
        renderPassCount += 1
        return { end: () => undefined } as unknown as GPURenderPassEncoder
      },
      beginComputePass: () => {
        computePassCount += 1
        return createMockComputePassEncoder()
      },
    } as unknown as WebGPURenderContext

    pass.execute(ctx)

    // threshold + composite = 2 render passes
    expect(renderPassCount).toBe(2)
    // 1 level * (H + V) = 2 compute passes
    expect(computePassCount).toBe(2)
  })

  it('does not collapse active levels when lower band weight is zero', () => {
    const pass = new BloomPass()
    primeInternals(pass)

    let renderPassCount = 0
    let computePassCount = 0
    const ctx = {
      size: { width: 1280, height: 720 },
      frame: {
        stores: {
          postProcessing: {
            bloomGain: 1,
            bloomThreshold: 0,
            bloomBands: [
              { enabled: true, weight: 0, size: 1, tint: '#ffffff' },
              { enabled: true, weight: 1, size: 1, tint: '#ffffff' },
              { enabled: false, weight: 0.6, size: 1, tint: '#ffffff' },
              { enabled: false, weight: 0.4, size: 1, tint: '#ffffff' },
              { enabled: false, weight: 0.2, size: 1, tint: '#ffffff' },
            ],
          },
        },
      },
      getTextureView: () => ({}) as GPUTextureView,
      getWriteTarget: () => ({}) as GPUTextureView,
      getCanvasTextureView: () => ({}) as GPUTextureView,
      beginRenderPass: () => {
        renderPassCount += 1
        return { end: () => undefined } as unknown as GPURenderPassEncoder
      },
      beginComputePass: () => {
        computePassCount += 1
        return createMockComputePassEncoder()
      },
    } as unknown as WebGPURenderContext

    pass.execute(ctx)

    // threshold + composite = 2 render passes
    expect(renderPassCount).toBe(2)
    // 2 levels * (H + V) = 4 compute passes
    expect(computePassCount).toBe(4)
  })

  it('writes higher mip blur uniforms with previous-level input dimensions', () => {
    const pass = new BloomPass()
    const internals = pass as unknown as Record<string, unknown>

    internals['gaussianTextureSize'] = { width: 1920, height: 1080 }
    internals['lastBlurSizeKey'] = ''

    const blurBuffers = Array.from({ length: 10 }, () => ({} as GPUBuffer))
    internals['blurUBs'] = blurBuffers

    const writesByBuffer = new Map<GPUBuffer, Float32Array>()
    internals['writeUniformBuffer'] = (
      _device: GPUDevice,
      buffer: GPUBuffer,
      data: Float32Array
    ) => {
      writesByBuffer.set(buffer, new Float32Array(data))
    }

    ;(
      pass as unknown as {
        writeBlurUniformsIfNeeded: (device: GPUDevice) => void
      }
    ).writeBlurUniformsIfNeeded({} as GPUDevice)

    const level1Horizontal = writesByBuffer.get(blurBuffers[2]!)
    const level1Vertical = writesByBuffer.get(blurBuffers[3]!)
    expect(level1Horizontal).toBeDefined()
    expect(level1Vertical).toBeDefined()

    const level1HorizontalU32 = new Uint32Array(level1Horizontal!.buffer.slice(0))
    const level1VerticalU32 = new Uint32Array(level1Vertical!.buffer.slice(0))

    // Level 1 outputs quarter-res but must read from previous half-res level.
    expect(level1HorizontalU32[0]).toBe(480)
    expect(level1HorizontalU32[1]).toBe(270)
    expect(level1HorizontalU32[2]).toBe(960)
    expect(level1HorizontalU32[3]).toBe(540)

    // Vertical pass reads same-size horizontal intermediate.
    expect(level1VerticalU32[0]).toBe(480)
    expect(level1VerticalU32[1]).toBe(270)
    expect(level1VerticalU32[2]).toBe(480)
    expect(level1VerticalU32[3]).toBe(270)
  })
})
