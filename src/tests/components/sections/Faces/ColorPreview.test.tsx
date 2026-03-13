import { ColorPreview } from '@/components/sections/Faces/ColorPreview'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function hexToRgb(hex: string): [number, number, number] {
  const parsed = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!parsed) return [0, 0, 0]
  return [parseInt(parsed[1]!, 16), parseInt(parsed[2]!, 16), parseInt(parsed[3]!, 16)]
}

describe('ColorPreview', () => {
  beforeEach(() => {
    useAppearanceStore.getState().reset()
  })

  it('renders spectral hues for radialDistance instead of red-only cosine fallback', async () => {
    const sampledHex: string[] = []
    const mockContext: Partial<CanvasRenderingContext2D> = {
      clearRect: vi.fn(),
      fillStyle: '#000000',
      fillRect: vi.fn(() => {
        const fillStyle = mockContext.fillStyle
        sampledHex.push(typeof fillStyle === 'string' ? fillStyle : '')
      }),
    }

    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
    getContextSpy.mockImplementationOnce(((contextType: string) =>
      contextType === '2d' ? (mockContext as CanvasRenderingContext2D) : null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- getContext has overloaded signatures
    ) as any)

    try {
      useAppearanceStore.getState().setColorAlgorithm('radialDistance')
      render(<ColorPreview width={96} height={8} />)

      await waitFor(() => {
        expect(sampledHex.length).toBe(96)
      })
    } finally {
      getContextSpy.mockRestore()
    }

    const sampledRgb = sampledHex.map(hexToRgb)
    const hasGreenDominant = sampledRgb.some(([r, g, b]) => g > r && g > b)
    const hasBlueDominant = sampledRgb.some(([r, g, b]) => b > r && b > g)

    expect(hasGreenDominant).toBe(true)
    expect(hasBlueDominant).toBe(true)
  })
})
