import { describe, expect, it } from 'vitest'

import {
  generateVolumeRaymarchGridBlock,
  generateVolumeRaymarchGridSimpleBlock,
} from '@/rendering/webgpu/shaders/schroedinger/volume/volumeRaymarchGrid.wgsl'

import { functionSlice } from './wgslTestHelpers'

describe('Wheeler-DeWitt overlay WGSL sharpening', () => {
  const variants = [
    ['full grid raymarcher', generateVolumeRaymarchGridBlock(false)],
    ['simple grid raymarcher', generateVolumeRaymarchGridSimpleBlock()],
  ] as const

  it.each(variants)('sharpens WDW overlay alpha in %s', (_name, source) => {
    const body = functionSlice(source, 'volumeRaymarchGrid')

    expect(source).toContain('const WDW_OVERLAY_ALPHA_FLOOR: f32 = 0.08;')
    expect(source).toContain('const WDW_OVERLAY_ALPHA_CEIL: f32 = 0.35;')
    expect(source).toContain('fn sharpenWdwOverlayAlpha(rawAlpha: f32) -> f32')
    expect(body).toContain('let wdwOverlayAlpha = sharpenWdwOverlayAlpha(gridSample.a);')
    expect(body).toContain('wdwOverlayAlpha > WDW_OVERLAY_VISIBLE_EPS')
    expect(body).toContain('sharpenWdwOverlayAlpha(probeMid.a) > WDW_OVERLAY_VISIBLE_EPS')
    expect(body).toContain('sharpenWdwOverlayAlpha(probeFar.a) > WDW_OVERLAY_VISIBLE_EPS')
    expect(body).toContain(
      'clamp(wdwOverlayAlpha * min(adaptiveStep * invStepLen, 2.0) * 0.5, 0.0, 0.35)'
    )
    expect(body).not.toContain(
      'clamp(gridSample.a * min(adaptiveStep * invStepLen, 2.0) * 0.5, 0.0, 0.35)'
    )
  })
})
