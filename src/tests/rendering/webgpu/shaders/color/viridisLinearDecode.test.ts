/**
 * Regression: the volume `viridis()` returned matplotlib's sRGB-encoded stops
 * as if they were linear. The volume pipeline is linear and ToScreenPass
 * always applies linearToSRGB, so the colormap was encoded twice —
 * viridis(0) displayed ≈ (0.56, 0.06, 0.61) instead of (0.27, 0.00, 0.33) and
 * the ramp lost its perceptual uniformity (and no longer matched the CPU LUT).
 *
 * @module tests/rendering/webgpu/shaders/color/viridisLinearDecode
 */

import { describe, expect, it } from 'vitest'

import { colormapRGBA } from '@/lib/physics/colormaps'
import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'
import { generateMainBlockBifurcationHorizon } from '@/rendering/webgpu/shaders/schroedinger/mainBifurcationHorizon.wgsl'
import { generateMainBlockCoherenceHorizon } from '@/rendering/webgpu/shaders/schroedinger/mainCoherenceHorizon.wgsl'
import { generateMainBlockHilbertPolya } from '@/rendering/webgpu/shaders/schroedinger/mainHilbertPolya.wgsl'
import { generateMainBlockModularKnot } from '@/rendering/webgpu/shaders/schroedinger/mainModularKnot.wgsl'
import { generateMainBlockRiemannZeta } from '@/rendering/webgpu/shaders/schroedinger/mainRiemannZeta.wgsl'
import { generateWdwZetaLib } from '@/rendering/webgpu/shaders/schroedinger/wdwZetaLib.wgsl'

import { functionSlice } from '../../wgslTestHelpers'

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linearToSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

describe('volume viridis colour space', () => {
  const { wgsl } = composeSchroedingerShader({
    dimension: 3,
    quantumMode: 'harmonicOscillator',
    colorAlgorithm: 19,
    termCount: 1,
  } as never)

  it('decodes the interpolated sRGB colour to linear before returning', () => {
    const viridis = functionSlice(wgsl, 'viridis')
    expect(viridis).toContain('return viridisSrgbToLinear(vec3f(r, g, b));')
    const decode = functionSlice(wgsl, 'viridisSrgbToLinear')
    expect(decode).toContain('select(hi, lo, c <= vec3f(0.04045))')
  })

  it('round-trips through the screen encode to the CPU sRGB LUT endpoints', () => {
    // Shader endpoint stops (sRGB) → decode → ToScreenPass encode == CPU LUT.
    for (const [t, stop] of [
      [0, [0.267, 0.005, 0.329]],
      [1, [0.993, 0.906, 0.144]],
    ] as const) {
      const cpu = colormapRGBA(t, 'viridis')
      for (let ch = 0; ch < 3; ch++) {
        const displayed = linearToSrgb(srgbToLinear(stop[ch]!))
        expect(Math.round(displayed * 255)).toBeCloseTo(cpu[ch]!, -0.5)
      }
    }
  })
})

// The dedicated-mode main blocks each carry their own viridis copy ("matches
// emission.wgsl") with the same sRGB-encoded stops; they were still returned
// raw after the volume fix, so viridis in those modes stayed double-encoded.
describe('dedicated-mode viridis copies decode to linear', () => {
  const blocks: [string, string][] = [
    ['bh', generateMainBlockBifurcationHorizon()],
    ['ch', generateMainBlockCoherenceHorizon()],
    ['hp', generateMainBlockHilbertPolya()],
    ['mk', generateMainBlockModularKnot()],
    ['rz', generateMainBlockRiemannZeta()],
    ['wz', generateWdwZetaLib()],
  ]
  it.each(blocks)('%sViridis returns the decoded colour', (prefix, wgsl) => {
    const body = functionSlice(wgsl, `${prefix}Viridis`)
    expect(body).toContain(`return ${prefix}SrgbToLinear(vec3f(r, g, b));`)
    const decode = functionSlice(wgsl, `${prefix}SrgbToLinear`)
    expect(decode).toContain('pow((c + vec3f(0.055)) / 1.055, vec3f(2.4))')
    expect(decode).toContain('c / 12.92')
  })
})
