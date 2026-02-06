import { describe, expect, it } from 'vitest'
import { BloomPass } from '@/rendering/webgpu/passes/BloomPass'
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
})
