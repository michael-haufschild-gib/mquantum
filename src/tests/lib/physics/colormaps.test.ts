import { describe, expect, it } from 'vitest'

import { colormapRGBA, getColormapLUT } from '@/lib/physics/colormaps'
import type { CarpetColormap } from '@/stores/carpetStore'

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
        const lum = 0.299 * lut[base] + 0.587 * lut[base + 1] + 0.114 * lut[base + 2]
        if (lum < prevLum - 5) decreaseCount++ // allow small fluctuation
        prevLum = lum
      }
      // Sequential colormaps should have very few luminance decreases
      expect(decreaseCount).toBeLessThan(20)
    })
  })
})
