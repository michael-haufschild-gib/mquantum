import { describe, expect, it } from 'vitest'
import { PAPER_TEXTURE_SHADER } from '@/rendering/webgpu/passes/PaperTexturePass'

describe('PaperTexturePass shader parity', () => {
  it('keeps upstream frame-mask edge blending flow', () => {
    expect(PAPER_TEXTURE_SHADER).toContain('fn getUvFrame(')
    expect(PAPER_TEXTURE_SHADER).toContain('let imageUV = uv + 0.02 * normalImage;')
    expect(PAPER_TEXTURE_SHADER).toContain('paperColor = mix(paperColor, imageColor.rgb, frame);')
  })

  it('applies contrast-driven paper relief before frame composition', () => {
    expect(PAPER_TEXTURE_SHADER).toContain('let relief = 0.6 * pow(uniforms.contrast, 0.4) * (res - 0.7);')
    expect(PAPER_TEXTURE_SHADER).toContain('imageColor = vec4f(imageColor.rgb + relief, imageColor.a);')
    expect(PAPER_TEXTURE_SHADER).toContain('paperColor -= 0.007 * dropsVal;')
  })

  it('uses central-difference fiber gradient and global intensity blend', () => {
    expect(PAPER_TEXTURE_SHADER).toContain('return length(vec2f(n1 - n2, n3 - n4)) / (2.0 * epsilon);')
    expect(PAPER_TEXTURE_SHADER).toContain('let finalColor = mix(inputColor.rgb, paperColor, uniforms.intensity);')
  })
})
