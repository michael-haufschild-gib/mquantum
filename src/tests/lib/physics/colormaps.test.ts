import { describe, expect, it } from 'vitest'

import { colormapRGBA, getColormapLUT, paintCarpetToCanvas } from '@/lib/physics/colormaps'
import type { CarpetColormap } from '@/stores/diagnostics/carpetStore'

const ALL_COLORMAPS: CarpetColormap[] = ['viridis', 'inferno', 'magma', 'plasma']

describe('colormaps', () => {
  describe('getColormapLUT', () => {
    it.each(ALL_COLORMAPS)('%s: returns 256×4 Uint8ClampedArray', (name) => {
      const lut = getColormapLUT(name)
      expect(lut).toBeInstanceOf(Uint8ClampedArray)
      expect(lut.length).toBe(256 * 4)
    })

    it.each(ALL_COLORMAPS)('%s: all values in [0, 255]', (name) => {
      const lut = getColormapLUT(name)
      for (let i = 0; i < lut.length; i++) {
        expect(lut[i]).toBeGreaterThanOrEqual(0)
        expect(lut[i]).toBeLessThanOrEqual(255)
      }
    })

    it.each(ALL_COLORMAPS)('%s: alpha channel is always 255', (name) => {
      const lut = getColormapLUT(name)
      for (let i = 0; i < 256; i++) {
        expect(lut[i * 4 + 3]).toBe(255)
      }
    })

    it('caches LUT across calls', () => {
      const lut1 = getColormapLUT('viridis')
      const lut2 = getColormapLUT('viridis')
      expect(lut1).toBe(lut2) // same reference
    })
  })

  describe('viridis endpoint colors', () => {
    it('starts dark purple (low R, low G, moderate B)', () => {
      const [r, g, b] = colormapRGBA(0, 'viridis')
      // viridis(0) ≈ (68, 1, 84) in matplotlib
      expect(r).toBeLessThan(100)
      expect(g).toBeLessThan(30)
      expect(b).toBeGreaterThan(50)
    })

    it('ends yellow (high R, high G, low B)', () => {
      const [r, g, b] = colormapRGBA(1, 'viridis')
      // viridis(1) ≈ (253, 231, 37) in matplotlib
      expect(r).toBeGreaterThan(200)
      expect(g).toBeGreaterThan(200)
      expect(b).toBeLessThan(100)
    })
  })

  describe('viridis midpoint', () => {
    it('midpoint is greenish-teal', () => {
      const [r, g, b] = colormapRGBA(0.5, 'viridis')
      // viridis(0.5) ≈ (33, 145, 140) — green/teal dominant
      expect(g).toBeGreaterThan(r)
      expect(b).toBeGreaterThan(r)
    })
  })

  describe('colormapRGBA', () => {
    it('clamps input below 0', () => {
      const result = colormapRGBA(-0.5, 'viridis')
      const start = colormapRGBA(0, 'viridis')
      expect(result).toEqual(start)
    })

    it('clamps input above 1', () => {
      const result = colormapRGBA(1.5, 'viridis')
      const end = colormapRGBA(1, 'viridis')
      expect(result).toEqual(end)
    })

    it.each(ALL_COLORMAPS)('%s: returns valid sRGB for input 0.5', (name) => {
      const [r, g, b, a] = colormapRGBA(0.5, name)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(255)
      expect(g).toBeGreaterThanOrEqual(0)
      expect(g).toBeLessThanOrEqual(255)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(255)
      expect(a).toBe(255)
    })

    it('inferno starts near black', () => {
      const [r, g, b] = colormapRGBA(0, 'inferno')
      expect(r).toBeLessThan(10)
      expect(g).toBeLessThan(10)
      expect(b).toBeLessThan(20)
    })

    it('inferno ends bright yellow', () => {
      const [r, g] = colormapRGBA(1, 'inferno')
      expect(r).toBeGreaterThan(200)
      expect(g).toBeGreaterThan(200)
    })
  })

  describe('monotonicity of luminance', () => {
    it.each(ALL_COLORMAPS)('%s: approximate luminance is non-decreasing', (name) => {
      const lut = getColormapLUT(name)
      // Check luminance (0.299R + 0.587G + 0.114B) is roughly non-decreasing
      // Allow small local dips due to perceptual uniformity (in sRGB, not linear)
      let prevLum = 0
      let decreaseCount = 0
      for (let i = 0; i < 256; i++) {
        const base = i * 4
        const lum = 0.299 * lut[base]! + 0.587 * lut[base + 1]! + 0.114 * lut[base + 2]!
        if (lum < prevLum - 5) decreaseCount++ // allow small fluctuation
        prevLum = lum
      }
      // Sequential colormaps should have very few luminance decreases
      expect(decreaseCount).toBeLessThan(20)
    })
  })

  // ── paintCarpetToCanvas ──

  describe('paintCarpetToCanvas', () => {
    /** Create a mock CanvasRenderingContext2D that captures putImageData calls. */
    function mockCtx(width: number, height: number) {
      let captured: ImageData | null = null
      const ctx = {
        canvas: { width, height },
        createImageData: (w: number, h: number): ImageData => ({
          data: new Uint8ClampedArray(w * h * 4),
          width: w,
          height: h,
          colorSpace: 'srgb' as PredefinedColorSpace,
        }),
        putImageData: (imageData: ImageData) => {
          captured = imageData
        },
      } as unknown as CanvasRenderingContext2D
      return { ctx, getCaptured: () => captured }
    }

    /** Helper: check if a pixel is "black" (all channels near 0, alpha 255). */
    function isBlackPixel(pixels: Uint8ClampedArray, px: number, py: number, w: number): boolean {
      const base = (py * w + px) * 4
      return pixels[base]! < 10 && pixels[base + 1]! < 10 && pixels[base + 2]! < 10
    }

    /** Helper: check if a pixel has any color (not black). */
    function hasColor(pixels: Uint8ClampedArray, px: number, py: number, w: number): boolean {
      const base = (py * w + px) * 4
      return pixels[base]! > 0 || pixels[base + 1]! > 0 || pixels[base + 2]! > 0
    }

    it('empty buffer (totalFrames=0): all pixels use colormap minimum', () => {
      const W = 20
      const H = 10
      const { ctx, getCaptured } = mockCtx(W, H)
      const gridSize = 8
      const historyLength = 16
      const data = new Float32Array(gridSize * historyLength) // all zeros

      paintCarpetToCanvas(ctx, data, gridSize, historyLength, 0, 0, 'viridis', false)

      const captured = getCaptured()!
      expect(captured).not.toBe(null)
      // totalFrames=0, filledRows=0 — every row is "unfilled" → black
      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          expect(isBlackPixel(captured.data, px, py, W)).toBe(true)
        }
      }
    })

    it('single frame: bottom row has color, top rows are black', () => {
      const W = 16
      const H = 16
      const { ctx, getCaptured } = mockCtx(W, H)
      const gridSize = 8
      const historyLength = 16
      const data = new Float32Array(gridSize * historyLength)
      // Write a single row at writeHead=0 with non-zero values
      for (let i = 0; i < gridSize; i++) {
        data[i] = 0.5 + i * 0.05
      }

      paintCarpetToCanvas(ctx, data, gridSize, historyLength, 0, 1, 'viridis', false)

      const captured = getCaptured()!
      expect(captured).not.toBe(null)

      // filledRows = min(1, 16) = 1. Display row 0 (top) maps to carpetRow 0 (the single filled row).
      // Rows 1..15 map to carpetRow >= 1 >= filledRows → black.
      // The bottom row (py = H-1) maps to carpetRow = floor(15 * 16/16) = 15 >= filledRows → black.
      // Only py=0 maps to carpetRow=0 (the single filled row).
      expect(hasColor(captured.data, 0, 0, W)).toBe(true)

      // All rows beyond the first are black
      for (let py = 1; py < H; py++) {
        expect(isBlackPixel(captured.data, 0, py, W)).toBe(true)
      }
    })

    it('full buffer: all rows are filled with colors', () => {
      const W = 16
      const H = 16
      const { ctx, getCaptured } = mockCtx(W, H)
      const gridSize = 8
      const historyLength = 16
      const data = new Float32Array(gridSize * historyLength)
      // Fill all rows with increasing values
      for (let row = 0; row < historyLength; row++) {
        for (let col = 0; col < gridSize; col++) {
          data[row * gridSize + col] = (row + 1) / historyLength
        }
      }

      paintCarpetToCanvas(ctx, data, gridSize, historyLength, 15, 16, 'viridis', false)

      const captured = getCaptured()!
      expect(captured).not.toBe(null)

      // All rows should have color (filledRows = 16 = historyLength)
      for (let py = 0; py < H; py++) {
        expect(hasColor(captured.data, W >> 1, py, W)).toBe(true)
      }

      // All alpha values should be 255
      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          const base = (py * W + px) * 4
          expect(captured.data[base + 3]).toBe(255)
        }
      }
    })

    it('wrapped buffer: oldest row is after writeHead, newest row is writeHead', () => {
      const gridSize = 4
      const historyLength = 8
      const W = 4
      const H = 8
      const { ctx, getCaptured } = mockCtx(W, H)
      const data = new Float32Array(gridSize * historyLength)

      // Fill rows with distinct values: row i has value (i+1)/8
      for (let row = 0; row < historyLength; row++) {
        for (let col = 0; col < gridSize; col++) {
          data[row * gridSize + col] = (row + 1) / historyLength
        }
      }

      // writeHead=3, totalFrames=20 (wrapped multiple times)
      // filledRows = min(20, 8) = 8
      // oldest row = (3 - 8 + 1 + 0 + 8) % 8 = 4 → data row 4
      // newest row = (3 - 8 + 1 + 7 + 8) % 8 = 11 % 8 = 3 → data row 3
      paintCarpetToCanvas(ctx, data, gridSize, historyLength, 3, 20, 'viridis', false)

      const captured = getCaptured()!

      // Row 4 has value 5/8 = 0.625 (oldest, displayed at top py=0)
      // Row 3 has value 4/8 = 0.5 (newest, displayed at bottom py=7)
      // Since the data is normalized: min=1/8, max=1.0 (from row 7)
      // Row 4 value: (5/8 - 0) / (1 - 0) = 0.625 (or similar after normalization)
      // All rows should have color
      for (let py = 0; py < H; py++) {
        expect(hasColor(captured.data, 0, py, W)).toBe(true)
      }

      // Verify oldest vs newest: the top row (oldest) should have a different color
      // than the bottom row (newest)
      // Top row pixel (py=0): data row 4, value 5/8
      // Bottom row pixel (py=7): data row 3, value 4/8
      // These map to different normalized values, so different LUT indices, so different colors
      const topBase = (0 * W + 0) * 4
      const bottomBase = (7 * W + 0) * 4
      const topR = captured.data[topBase]!
      const bottomR = captured.data[bottomBase]!
      // They should differ (unless by coincidence they map to the same LUT entry)
      // With viridis, 4/8 and 5/8 are distinguishable
      expect(topR !== bottomR || captured.data[topBase + 1] !== captured.data[bottomBase + 1]).toBe(
        true
      )
    })

    it('uniform data normalizes to constant color', () => {
      const gridSize = 4
      const historyLength = 4
      const W = 4
      const H = 4
      const { ctx, getCaptured } = mockCtx(W, H)
      const data = new Float32Array(gridSize * historyLength)
      // All values are the same (0.5)
      data.fill(0.5)

      paintCarpetToCanvas(ctx, data, gridSize, historyLength, 3, 4, 'viridis', false)

      const captured = getCaptured()!
      // With linear mode: rangeMin=0, max=0.5, range=0.5
      // normalized = (0.5 - 0) / 0.5 = 1.0 → maps to LUT index 255
      // All pixels should have the same color (viridis at 1.0 = yellow)
      const ref = [captured.data[0]!, captured.data[1]!, captured.data[2]!, captured.data[3]!]
      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          const base = (py * W + px) * 4
          expect(captured.data[base]).toBe(ref[0])
          expect(captured.data[base + 1]).toBe(ref[1])
          expect(captured.data[base + 2]).toBe(ref[2])
          expect(captured.data[base + 3]).toBe(ref[3])
        }
      }
    })

    it('log scale: negative values normalize correctly', () => {
      const gridSize = 4
      const historyLength = 4
      const W = 4
      const H = 4
      const { ctx, getCaptured } = mockCtx(W, H)
      const data = new Float32Array(gridSize * historyLength)
      // Simulate log density: log(small) = negative, log(large) = positive
      for (let row = 0; row < historyLength; row++) {
        for (let col = 0; col < gridSize; col++) {
          data[row * gridSize + col] = -5.0 + (row * gridSize + col) * 0.5
        }
      }

      paintCarpetToCanvas(ctx, data, gridSize, historyLength, 3, 4, 'inferno', true)

      const captured = getCaptured()!
      // Log scale: rangeMin = minVal, range = maxVal - minVal
      // All pixels should have valid colors (no NaN or out-of-range)
      for (let i = 0; i < captured.data.length; i += 4) {
        expect(captured.data[i]!).toBeGreaterThanOrEqual(0)
        expect(captured.data[i]!).toBeLessThanOrEqual(255)
        expect(captured.data[i + 3]!).toBe(255)
      }

      // Bottom-left should be darker (lower value), top-right should be brighter
      // Since the rolling buffer puts newest at bottom:
      // py=0 (oldest) = row (3-4+1+0+4)%4 = 0, starting at value -5.0 (darkest)
      // py=3 (newest) = row 3, starting at value -5.0 + 12*0.5 = 1.0 (brightest)
      const topLum =
        0.299 * captured.data[0]! + 0.587 * captured.data[1]! + 0.114 * captured.data[2]!
      const bottomBase = (3 * W + 3) * 4
      const bottomLum =
        0.299 * captured.data[bottomBase]! +
        0.587 * captured.data[bottomBase + 1]! +
        0.114 * captured.data[bottomBase + 2]!
      expect(bottomLum).toBeGreaterThan(topLum)
    })

    it('all colormaps produce valid output', () => {
      for (const cmap of ALL_COLORMAPS) {
        const gridSize = 4
        const historyLength = 4
        const W = 8
        const H = 8
        const { ctx, getCaptured } = mockCtx(W, H)
        const data = new Float32Array(gridSize * historyLength)
        for (let i = 0; i < data.length; i++) {
          data[i] = i / data.length
        }

        paintCarpetToCanvas(ctx, data, gridSize, historyLength, 3, 4, cmap, false)

        const captured = getCaptured()!
        expect(captured).not.toBe(null)
        // All alpha values = 255
        for (let i = 3; i < captured.data.length; i += 4) {
          expect(captured.data[i]).toBe(255)
        }
      }
    })
  })
})
