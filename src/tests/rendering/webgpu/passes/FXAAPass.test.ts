import { describe, expect, it } from 'vitest'

import { FXAAPass } from '@/rendering/webgpu/passes/FXAAPass'
import { fxaaShader } from '@/rendering/webgpu/shaders/postprocessing/fxaa.wgsl'

type TestableFXAAPass = {
  subpixelQuality: number
  edgeThreshold: number
  edgeThresholdMin: number
}

describe('FXAAPass option sanitization', () => {
  it('keeps constructor uniforms finite and non-negative', () => {
    const pass = new FXAAPass({
      subpixelQuality: Number.POSITIVE_INFINITY,
      edgeThreshold: Number.NaN,
      edgeThresholdMin: -1,
    }) as unknown as TestableFXAAPass

    expect(pass.subpixelQuality).toBe(0.75)
    expect(pass.edgeThreshold).toBe(0.125)
    expect(pass.edgeThresholdMin).toBe(0)
  })

  it('clamps mutable subpixel quality and ignores non-finite threshold updates', () => {
    const pass = new FXAAPass()
    const internals = pass as unknown as TestableFXAAPass

    pass.setSubpixelQuality(2)
    pass.setEdgeThreshold(Number.NaN)
    pass.setEdgeThresholdMin(Number.NEGATIVE_INFINITY)

    expect(internals.subpixelQuality).toBe(1)
    expect(internals.edgeThreshold).toBe(0.125)
    expect(internals.edgeThresholdMin).toBe(0.0625)
  })
})

describe('fxaaShader', () => {
  it('uses explicit LOD sampling and floors luma range before division', () => {
    expect(fxaaShader).toContain('textureSampleLevel')
    expect(fxaaShader).toContain('let safeLumRange = max(lumRange, 1e-6)')
    expect(fxaaShader).toContain('abs(lumaAverage - lumC) / safeLumRange')
  })
})
