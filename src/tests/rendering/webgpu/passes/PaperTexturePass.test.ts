import { describe, expect, it } from 'vitest'

import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { PAPER_TEXTURE_SHADER, PaperTexturePass } from '@/rendering/webgpu/passes/PaperTexturePass'

type PaperInternals = {
  contrast: number
  roughness: number
  fiberSize: number
  foldCount: number
  seed: number
  intensity: number
  updateFromStores: (ctx: WebGPURenderContext) => void
}

describe('PaperTexturePass input sanitization', () => {
  it('sanitizes constructor numeric options', () => {
    const pass = new PaperTexturePass({
      colorInput: 'ldr-color',
      outputResource: 'paper-output',
      contrast: Number.NaN,
      roughness: 2,
      fiberSize: -1,
      foldCount: 99,
      seed: Number.POSITIVE_INFINITY,
      intensity: -1,
    }) as unknown as PaperInternals

    expect(pass.contrast).toBe(0.5)
    expect(pass.roughness).toBe(1)
    expect(pass.fiberSize).toBe(0.1)
    expect(pass.foldCount).toBe(15)
    expect(pass.seed).toBe(42)
    expect(pass.intensity).toBe(0)
  })

  it('preserves prior values for non-finite store updates', () => {
    const pass = new PaperTexturePass({
      colorInput: 'ldr-color',
      outputResource: 'paper-output',
      contrast: 0.3,
      roughness: 0.4,
      fiberSize: 1.2,
      foldCount: 4,
      seed: 123,
      intensity: 0.8,
    }) as unknown as PaperInternals

    pass.updateFromStores({
      frame: {
        stores: {
          postProcessing: {
            paperContrast: Number.NaN,
            paperRoughness: Number.POSITIVE_INFINITY,
            paperFiberSize: Number.NEGATIVE_INFINITY,
            paperFoldCount: Number.NaN,
            paperSeed: Number.POSITIVE_INFINITY,
            paperIntensity: Number.NaN,
          },
        },
      },
    } as unknown as WebGPURenderContext)

    expect(pass.contrast).toBe(0.3)
    expect(pass.roughness).toBe(0.4)
    expect(pass.fiberSize).toBe(1.2)
    expect(pass.foldCount).toBe(4)
    expect(pass.seed).toBe(123)
    expect(pass.intensity).toBe(0.8)
  })
})

describe('PaperTexturePass shader parity', () => {
  it('keeps upstream frame-mask edge blending flow', () => {
    expect(PAPER_TEXTURE_SHADER).toContain('fn getUvFrame(')
    expect(PAPER_TEXTURE_SHADER).toContain('let imageUV = uv + 0.02 * normalImage;')
    expect(PAPER_TEXTURE_SHADER).toContain('paperColor = mix(paperColor, imageColor.rgb, frame);')
  })

  it('applies contrast-driven paper relief before frame composition', () => {
    expect(PAPER_TEXTURE_SHADER).toContain(
      'let relief = 0.6 * pow(uniforms.contrast, 0.4) * (res - 0.7);'
    )
    expect(PAPER_TEXTURE_SHADER).toContain(
      'imageColor = vec4f(imageColor.rgb + relief, imageColor.a);'
    )
    expect(PAPER_TEXTURE_SHADER).toContain('paperColor -= 0.007 * dropsVal;')
  })

  it('uses central-difference fiber gradient and global intensity blend', () => {
    expect(PAPER_TEXTURE_SHADER).toContain(
      'return length(vec2f(n1 - n2, n3 - n4)) / (2.0 * epsilon);'
    )
    expect(PAPER_TEXTURE_SHADER).toContain(
      'let finalColor = mix(inputColor.rgb, paperColor, uniforms.intensity);'
    )
  })
})
