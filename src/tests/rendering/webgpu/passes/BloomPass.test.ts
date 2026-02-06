import { describe, expect, it } from 'vitest'
import { BloomPass } from '@/rendering/webgpu/passes/BloomPass'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import {
  bloomThresholdShader,
  createBloomBlurShader,
} from '@/rendering/webgpu/shaders/postprocessing/bloom.wgsl'

describe('BloomPass parity', () => {
  it('precomputes coefficients for updated UnrealBloomPass kernel radii', () => {
    const pass = new BloomPass()
    const gaussianCoefficients = (pass as unknown as { gaussianCoefficients: Float32Array[] })
      .gaussianCoefficients

    expect(gaussianCoefficients).toHaveLength(5)

    // Kernel radius 6: indices 0-5 are used, 6 is unused.
    expect(gaussianCoefficients[0]![5]).toBeGreaterThan(0)
    expect(gaussianCoefficients[0]![6]).toBe(0)

    // Kernel radius 22: indices 0-21 are used, 22 is unused.
    expect(gaussianCoefficients[4]![21]).toBeGreaterThan(0)
    expect(gaussianCoefficients[4]![22]).toBe(0)
  })

  it('uses unnormalized gaussian coefficients like UnrealBloomPass', () => {
    const pass = new BloomPass()
    const gaussianCoefficients = (pass as unknown as { gaussianCoefficients: Float32Array[] })
      .gaussianCoefficients
    const largestKernelCoeffs = gaussianCoefficients[4]!

    let symmetricWeightSum = largestKernelCoeffs[0]!
    for (let i = 1; i < 22; i++) {
      symmetricWeightSum += 2 * largestKernelCoeffs[i]!
    }

    // UnrealBloomPass intentionally avoids post-normalizing this sum.
    expect(symmetricWeightSum).toBeLessThan(1.0)
    expect(symmetricWeightSum).toBeGreaterThan(0.99)
  })

  it('uses high-pass threshold without hdrPeak normalization', () => {
    expect(bloomThresholdShader).not.toContain('hdrPeak')
    expect(bloomThresholdShader).toContain('let lum = luminance(color);')
  })

  it('generates blur shader loop bound that matches UnrealBloomPass', () => {
    const blurShader = createBloomBlurShader(22)

    expect(blurShader).toContain('coefficients: array<vec4f, 6>')
    expect(blurShader).toContain('for (var i = 1u; i < 22u; i++)')
  })

  it('executes blur passes only up to the active level count', () => {
    const pass = new BloomPass()
    const internals = pass as unknown as Record<string, unknown>

    internals['device'] = {} as GPUDevice
    internals['thresholdPipeline'] = {} as GPURenderPipeline
    internals['compositePipeline'] = {} as GPURenderPipeline
    internals['thresholdBGL'] = {} as GPUBindGroupLayout
    internals['blurBGL'] = {} as GPUBindGroupLayout
    internals['compositeBGL'] = {} as GPUBindGroupLayout
    internals['thresholdUB'] = {} as GPUBuffer
    internals['compositeUB'] = {} as GPUBuffer
    internals['sampler'] = {} as GPUSampler
    internals['blurPipelines'] = new Array(5).fill({}) as GPURenderPipeline[]
    internals['blurUBs'] = new Array(10).fill({}) as GPUBuffer[]
    internals['thresholdTexture'] = {} as GPUTexture
    internals['thresholdTextureView'] = {} as GPUTextureView
    internals['horizontalTextures'] = new Array(5).fill({}) as GPUTexture[]
    internals['verticalTextures'] = new Array(5).fill({}) as GPUTexture[]
    internals['horizontalTextureViews'] = new Array(5).fill({}) as GPUTextureView[]
    internals['verticalTextureViews'] = new Array(5).fill({}) as GPUTextureView[]

    ;(internals['ensureTextures'] as (device: GPUDevice, width: number, height: number) => void) = () =>
      undefined
    ;(internals['createBindGroup'] as (
      device: GPUDevice,
      layout: GPUBindGroupLayout,
      entries: unknown[],
      label?: string
    ) => GPUBindGroup) = () => ({}) as GPUBindGroup
    ;(internals['writeUniformBuffer'] as (
      device: GPUDevice,
      buffer: GPUBuffer,
      data: ArrayBuffer | Float32Array | Uint32Array | Int32Array | Uint8Array,
      offset?: number
    ) => void) = () => undefined
    ;(internals['renderFullscreen'] as (
      passEncoder: GPURenderPassEncoder,
      pipeline: GPURenderPipeline,
      bindGroups: GPUBindGroup[]
    ) => void) = () => undefined

    let passCount = 0
    const ctx = {
      size: { width: 1280, height: 720 },
      frame: { stores: { postProcessing: { bloomLevels: 1 } } },
      getTextureView: () => ({}) as GPUTextureView,
      getWriteTarget: () => ({}) as GPUTextureView,
      getCanvasTextureView: () => ({}) as GPUTextureView,
      beginRenderPass: () => {
        passCount += 1
        return {
          end: () => undefined,
        } as unknown as GPURenderPassEncoder
      },
    } as unknown as WebGPURenderContext

    pass.execute(ctx)

    // threshold + (1 level * H/V blur) + composite
    expect(passCount).toBe(4)
  })
})
