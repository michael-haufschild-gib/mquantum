import { describe, expect, it } from 'vitest'
import { BloomPass } from '@/rendering/webgpu/passes/BloomPass'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import {
  bloomPrefilterShader,
  bloomDownsampleShader,
  bloomUpsampleShader,
  bloomCompositeShader,
  bloomCopyShader,
} from '@/rendering/webgpu/shaders/postprocessing/bloom.wgsl'

function primeInternals(pass: BloomPass): Record<string, unknown> {
  const internals = pass as unknown as Record<string, unknown>

  internals['device'] = {} as GPUDevice
  internals['sampler'] = {} as GPUSampler

  internals['prefilterPipeline'] = {} as GPURenderPipeline
  internals['prefilterBGL'] = {} as GPUBindGroupLayout
  internals['prefilterUB'] = {} as GPUBuffer

  internals['downsamplePipeline'] = {} as GPURenderPipeline
  internals['downsampleBGL'] = {} as GPUBindGroupLayout

  internals['upsamplePipeline'] = {} as GPURenderPipeline
  internals['upsampleBGL'] = {} as GPUBindGroupLayout
  internals['upsampleUB'] = {} as GPUBuffer

  internals['compositePipeline'] = {} as GPURenderPipeline
  internals['compositeBGL'] = {} as GPUBindGroupLayout
  internals['compositeUB'] = {} as GPUBuffer

  internals['copyPipeline'] = {} as GPURenderPipeline
  internals['copyBGL'] = {} as GPUBindGroupLayout

  // Mock textures: 5 down + 4 up
  internals['downMips'] = new Array(5).fill({}) as GPUTexture[]
  internals['downMipViews'] = new Array(5).fill({}) as GPUTextureView[]
  internals['upMips'] = new Array(4).fill({}) as GPUTexture[]
  internals['upMipViews'] = new Array(4).fill({}) as GPUTextureView[]
  internals['textureSize'] = { width: 1920, height: 1080 }

  internals['ensureTextures'] = () => undefined
  internals['createBindGroup'] = () => ({}) as GPUBindGroup
  internals['writeUniformBuffer'] = () => undefined
  internals['renderFullscreen'] = () => undefined

  return internals
}

describe('BloomPass (progressive downsample/upsample)', () => {
  it('prefilter shader uses luminance instead of max(r,g,b)', () => {
    expect(bloomPrefilterShader).toContain('fn luminance(c: vec3f) -> f32')
    expect(bloomPrefilterShader).toContain('dot(c, vec3f(0.2126, 0.7152, 0.0722))')
    expect(bloomPrefilterShader).not.toContain('max(color.r, max(color.g, color.b))')
  })

  it('prefilter shader applies Karis average weighting', () => {
    expect(bloomPrefilterShader).toContain('1.0 / (1.0 + luminance(t')
  })

  it('prefilter shader is alpha-aware for premultiplied bloom input', () => {
    expect(bloomPrefilterShader).toContain('fn extractBloomSample(colorSample: vec4f')
    expect(bloomPrefilterShader).toContain('let straightColor = colorSample.rgb / alpha')
    expect(bloomPrefilterShader).toContain('return thresholded * alpha')
  })

  it('prefilter shader clamps negative radiance before thresholding', () => {
    expect(bloomPrefilterShader).toContain('let radiance = max(color, vec3f(0.0))')
    expect(bloomPrefilterShader).toContain('return radiance * factor')
  })

  it('downsample shader uses 13-tap filter with no uniforms', () => {
    expect(bloomDownsampleShader).toContain('textureDimensions(tInput)')
    expect(bloomDownsampleShader).not.toContain('var<uniform>')
    // Verify 5 overlapping blocks with correct weights
    expect(bloomDownsampleShader).toContain('0.125')
    expect(bloomDownsampleShader).toContain('0.03125')
  })

  it('upsample shader uses 9-tap tent filter with additive blend', () => {
    expect(bloomUpsampleShader).toContain('struct UpsampleUniforms')
    expect(bloomUpsampleShader).toContain('filterRadius')
    expect(bloomUpsampleShader).toContain('tLowerMip')
    expect(bloomUpsampleShader).toContain('tCurrentMip')
    // 9-tap weights: center 4, edges 2, corners 1, all /16
    expect(bloomUpsampleShader).toContain('* 4.0')
    expect(bloomUpsampleShader).toContain('* 2.0')
    expect(bloomUpsampleShader).toContain('1.0 / 16.0')
    // Additive blend
    expect(bloomUpsampleShader).toContain('bloom + current')
  })

  it('composite shader adds bloom with gain multiplier', () => {
    expect(bloomCompositeShader).toContain('struct CompositeUniforms')
    expect(bloomCompositeShader).toContain('bloomGain')
    expect(bloomCompositeShader).toContain('sceneColor + uniforms.bloomGain * bloomColor')
  })

  it('copy shader passes through without modification', () => {
    expect(bloomCopyShader).toContain('textureSample(tInput, linearSampler, input.uv)')
    expect(bloomCopyShader).not.toContain('var<uniform>')
  })

  it('uses zero-strength fast path (single copy pass) when gain=0', () => {
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
    } as unknown as WebGPURenderContext

    pass.execute(ctx)

    expect(renderPassCount).toBe(1)
  })

  it('runs 10 render passes for full bloom pipeline', () => {
    const pass = new BloomPass()
    primeInternals(pass)

    let renderPassCount = 0
    const ctx = {
      size: { width: 1920, height: 1080 },
      frame: {
        stores: {
          postProcessing: {
            bloomGain: 0.8,
            bloomThreshold: 1.0,
            bloomKnee: 0.2,
            bloomRadius: 1.0,
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
    } as unknown as WebGPURenderContext

    pass.execute(ctx)

    // 1 prefilter + 4 downsample + 4 upsample + 1 composite = 10
    expect(renderPassCount).toBe(10)
  })

  it('accepts constructor options', () => {
    const pass = new BloomPass({
      gain: 1.5,
      threshold: 0.5,
      knee: 0.3,
      filterRadius: 2.0,
    })
    const internals = pass as unknown as Record<string, number>
    expect(internals['gain']).toBe(1.5)
    expect(internals['threshold']).toBe(0.5)
    expect(internals['knee']).toBe(0.3)
    expect(internals['filterRadius']).toBe(2.0)
  })

  it('clamps constructor option values', () => {
    const pass = new BloomPass({
      gain: 99,
      threshold: -1,
      knee: 99,
      filterRadius: 0.1,
    })
    const internals = pass as unknown as Record<string, number>
    expect(internals['gain']).toBe(3)
    expect(internals['threshold']).toBe(0)
    expect(internals['knee']).toBe(5)
    expect(internals['filterRadius']).toBe(0.25)
  })

  it('declares both scene and bloom source dependencies when resources differ', () => {
    const pass = new BloomPass({
      inputResource: 'hdr-color',
      bloomInputResource: 'object-color',
      outputResource: 'bloom-output',
    })

    expect(pass.config.inputs).toHaveLength(2)
    expect(pass.config.inputs[0]?.resourceId).toBe('hdr-color')
    expect(pass.config.inputs[1]?.resourceId).toBe('object-color')
  })

  it('uses scene input for zero-gain passthrough even with separate bloom source', () => {
    const pass = new BloomPass({
      inputResource: 'hdr-color',
      bloomInputResource: 'object-color',
    })
    primeInternals(pass)

    const sceneView = {} as GPUTextureView
    const bloomView = {} as GPUTextureView
    const outputView = {} as GPUTextureView

    let copiedInput: GPUTextureView | null = null
    ;(pass as unknown as { renderCopy: (...args: unknown[]) => void }).renderCopy = (...args) => {
      copiedInput = args[1] as GPUTextureView
    }

    const ctx = {
      size: { width: 1280, height: 720 },
      frame: { stores: { postProcessing: { bloomGain: 0 } } },
      getTextureView: (resourceId: string) =>
        resourceId === 'object-color' ? bloomView : sceneView,
      getWriteTarget: () => outputView,
      getCanvasTextureView: () => outputView,
      beginRenderPass: () => ({ end: () => undefined }) as unknown as GPURenderPassEncoder,
    } as unknown as WebGPURenderContext

    pass.execute(ctx)

    expect(copiedInput).toBe(sceneView)
  })
})
