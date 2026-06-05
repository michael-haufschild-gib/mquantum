import { describe, expect, it } from 'vitest'

import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { normalizeSceneClearColor, ScenePass } from '@/rendering/webgpu/passes/ScenePass'

type RenderPassDescriptor = Parameters<WebGPURenderContext['beginRenderPass']>[0]

function primeScenePass(pass: ScenePass): void {
  ;(pass as unknown as Record<string, unknown>)['device'] = {} as GPUDevice
}

function makeRenderContext(descriptors: RenderPassDescriptor[]): WebGPURenderContext {
  return {
    getWriteTarget: () => ({}) as GPUTextureView,
    beginRenderPass: (descriptor: RenderPassDescriptor) => {
      descriptors.push(descriptor)
      return { end: () => undefined } as unknown as GPURenderPassEncoder
    },
  } as unknown as WebGPURenderContext
}

function firstClearValue(descriptor: RenderPassDescriptor): GPUColor {
  const attachment = Array.from(descriptor.colorAttachments)[0]
  if (!attachment) throw new Error('expected color attachment')
  return attachment.clearValue as GPUColor
}

describe('ScenePass clear behavior', () => {
  it('normalizes clear colors before they reach WebGPU render-pass descriptors', () => {
    expect(
      normalizeSceneClearColor({
        r: Number.NaN,
        g: -0.25,
        b: 2,
        a: Number.POSITIVE_INFINITY,
      })
    ).toEqual({ r: 0, g: 0, b: 1, a: 1 })
  })

  it('uses transparent black when background rendering is disabled', () => {
    const pass = new ScenePass({
      outputResource: 'scene-render',
      clearColor: { r: 0.2, g: 0.4, b: 0.6, a: 1 },
      renderBackground: false,
    })
    primeScenePass(pass)

    const descriptors: RenderPassDescriptor[] = []
    pass.execute(makeRenderContext(descriptors))

    expect(firstClearValue(descriptors[0]!)).toEqual({ r: 0, g: 0, b: 0, a: 0 })
  })

  it('applies runtime background and clear-color updates to the next clear', () => {
    const pass = new ScenePass({
      outputResource: 'scene-render',
      clearColor: { r: 0.2, g: 0.4, b: 0.6, a: 1 },
      renderBackground: true,
    })
    primeScenePass(pass)
    pass.setRenderBackground(false)
    pass.setClearColor({ r: 9, g: Number.NaN, b: 0.25, a: -1 })
    pass.setRenderBackground(true)

    const descriptors: RenderPassDescriptor[] = []
    pass.execute(makeRenderContext(descriptors))

    expect(firstClearValue(descriptors[0]!)).toEqual({ r: 1, g: 0, b: 0.25, a: 0 })
  })
})
