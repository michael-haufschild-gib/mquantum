import { describe, expect, it } from 'vitest'

import { resolveCanvasPixelSize, sanitizePixelSize } from '@/rendering/webgpu/utils/sceneMath'

describe('resolveCanvasPixelSize', () => {
  it('floors scaled CSS dimensions but never returns zero', () => {
    expect(resolveCanvasPixelSize(200, 100, 0.5)).toEqual({ width: 100, height: 50 })
    expect(resolveCanvasPixelSize(1, 1, 0.25)).toEqual({ width: 1, height: 1 })
  })

  it('sanitizes zero, negative, and non-finite inputs to 1x1', () => {
    expect(resolveCanvasPixelSize(0, -5, Number.NaN)).toEqual({ width: 1, height: 1 })
    expect(resolveCanvasPixelSize(Number.POSITIVE_INFINITY, 12, 1)).toEqual({
      width: 1,
      height: 12,
    })
  })

  it('caps scaled CSS dimensions to the device texture limit', () => {
    expect(resolveCanvasPixelSize(10_000, 8_000, 2, 4096)).toEqual({
      width: 4096,
      height: 4096,
    })
  })
})

describe('sanitizePixelSize', () => {
  it('sanitizes direct render-graph dimensions', () => {
    expect(sanitizePixelSize(640.9, Number.NEGATIVE_INFINITY)).toEqual({ width: 640, height: 1 })
  })

  it('caps direct render-graph dimensions to the provided maximum extent', () => {
    expect(sanitizePixelSize(9000, 512, 8192)).toEqual({ width: 8192, height: 512 })
  })
})
