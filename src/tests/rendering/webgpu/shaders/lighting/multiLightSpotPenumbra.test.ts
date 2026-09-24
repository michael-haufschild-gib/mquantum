/**
 * Spot-light attenuation with zero penumbra.
 *
 * Regression: penumbra 0 (allowed by clampPenumbra and the UI) packs
 * spotCosInner == spotCosOuter, and getSpotAttenuation called
 * smoothstep(cosOuter, cosInner, …) with equal edges — a division by zero
 * whose result is undefined/indeterminate (NaN at the cone rim can bloom).
 *
 * @module tests/rendering/webgpu/shaders/multiLightSpotPenumbra
 */

import { describe, expect, it } from 'vitest'

import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'
import { multiLightBlock } from '@/rendering/webgpu/shaders/shared/lighting/multi-light.wgsl'

describe('getSpotAttenuation', () => {
  it('handles equal cone edges with an explicit hard edge before smoothstep', () => {
    const fn = multiLightBlock.slice(
      multiLightBlock.indexOf('fn getSpotAttenuation('),
      multiLightBlock.indexOf('fn getDistanceAttenuation(')
    )
    const guard = fn.indexOf('if (cosInner - cosOuter <= 1e-6) {')
    const hardEdge = fn.indexOf('return select(0.0, 1.0, cosAngle >= cosOuter);')
    const smooth = fn.indexOf('return smoothstep(cosOuter, cosInner, cosAngle);')
    expect(guard).toBeGreaterThan(0)
    expect(hardEdge).toBeGreaterThan(guard)
    expect(smooth).toBeGreaterThan(hardEdge)
  })

  it('still composes into the isosurface shader', () => {
    const { wgsl } = composeSchroedingerShader({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      isosurface: true,
    })
    expect(wgsl).toContain('fn getSpotAttenuation(')
    expect(wgsl).toBeValidWGSL('fragment')
  })
})
