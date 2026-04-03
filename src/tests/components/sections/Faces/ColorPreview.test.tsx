import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ColorPreview } from '@/components/sections/Faces/ColorPreview'
import { useAppearanceStore } from '@/stores/appearanceStore'

describe('ColorPreview', () => {
  beforeEach(() => {
    useAppearanceStore.getState().reset()
  })

  it('renders spectral hues for radialDistance instead of red-only cosine fallback', async () => {
    const width = 96
    const height = 8
    const imageData = {
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    }
    let putCalled = false

    const mockContext: Partial<CanvasRenderingContext2D> = {
      createImageData: vi.fn(
        () => imageData
      ) as unknown as CanvasRenderingContext2D['createImageData'],
      putImageData: vi.fn(() => {
        putCalled = true
      }),
    }

    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    /* eslint-disable @typescript-eslint/no-explicit-any -- getContext has overloaded signatures */
    getContextSpy.mockImplementationOnce(((contextType: string) =>
      contextType === '2d' ? (mockContext as CanvasRenderingContext2D) : null) as any)
    /* eslint-enable @typescript-eslint/no-explicit-any */

    try {
      useAppearanceStore.getState().setColorAlgorithm('radialDistance')
      render(<ColorPreview width={width} height={height} />)

      await waitFor(() => {
        expect(putCalled).toBe(true)
      })
    } finally {
      getContextSpy.mockRestore()
    }

    // Extract column colors from row 0 of the ImageData buffer
    const sampledRgb: Array<[number, number, number]> = []
    for (let x = 0; x < width; x++) {
      const i = x * 4
      sampledRgb.push([imageData.data[i]!, imageData.data[i + 1]!, imageData.data[i + 2]!])
    }

    const hasGreenDominant = sampledRgb.some(([r, g, b]) => g > r && g > b)
    const hasBlueDominant = sampledRgb.some(([r, g, b]) => b > r && b > g)

    expect(hasGreenDominant).toBe(true)
    expect(hasBlueDominant).toBe(true)
  })
})
