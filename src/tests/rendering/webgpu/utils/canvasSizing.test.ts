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
})

describe('sanitizePixelSize', () => {
  it('sanitizes direct render-graph dimensions', () => {
    expect(sanitizePixelSize(640.9, Number.NEGATIVE_INFINITY)).toEqual({ width: 640, height: 1 })
  })
})
