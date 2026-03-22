import { describe, expect, it } from 'vitest'

import {
  parseHexColorToLinearRgb,
  parseHexColorToSrgbRgb,
  srgbToLinearChannel,
} from '@/rendering/webgpu/utils/color'

describe('rendering/webgpu/utils/color', () => {
  describe('srgbToLinearChannel', () => {
    it('converts edge cases exactly', () => {
      expect(srgbToLinearChannel(0)).toBe(0)
      expect(srgbToLinearChannel(1)).toBe(1)
    })

    it('matches the sRGB transfer function at the piecewise boundary', () => {
      // Spec: linear = c / 12.92 for c <= 0.04045
      expect(srgbToLinearChannel(0.04045)).toBeCloseTo(0.04045 / 12.92, 7)
    })

    it('converts mid-gray (~0.5) to expected linear value', () => {
      // Reference: sRGB EOTF (IEC 61966-2-1)
      const expected = Math.pow((0.5 + 0.055) / 1.055, 2.4)
      expect(srgbToLinearChannel(0.5)).toBeCloseTo(expected, 7)
    })

    it('clamps out-of-range input into [0, 1]', () => {
      expect(srgbToLinearChannel(-1)).toBe(0)
      expect(srgbToLinearChannel(2)).toBe(1)
    })
  })

  describe('parseHexColorToSrgbRgb', () => {
    it('parses #RGB', () => {
      expect(parseHexColorToSrgbRgb('#000')).toEqual([0, 0, 0])
      expect(parseHexColorToSrgbRgb('#fff')).toEqual([1, 1, 1])
      expect(parseHexColorToSrgbRgb('#0f8')).toEqual([0, 1, 0x88 / 0xff])
    })

    it('parses #RRGGBB and ignores alpha in #RRGGBBAA', () => {
      expect(parseHexColorToSrgbRgb('#112233')).toEqual([0x11 / 0xff, 0x22 / 0xff, 0x33 / 0xff])
      expect(parseHexColorToSrgbRgb('#112233aa')).toEqual([0x11 / 0xff, 0x22 / 0xff, 0x33 / 0xff])
    })

    it('returns null on invalid input', () => {
      expect(parseHexColorToSrgbRgb('')).toBeNull()
      expect(parseHexColorToSrgbRgb('#12')).toBeNull()
      expect(parseHexColorToSrgbRgb('#zzzzzz')).toBeNull()
      expect(parseHexColorToSrgbRgb('#ff00zz')).toBeNull()
    })

    it('returns null for non-string inputs', () => {
      expect(parseHexColorToSrgbRgb(null as unknown as string)).toBeNull()
      expect(parseHexColorToSrgbRgb(undefined as unknown as string)).toBeNull()
      expect(parseHexColorToSrgbRgb(42 as unknown as string)).toBeNull()
    })

    it('is case insensitive', () => {
      const lower = parseHexColorToSrgbRgb('#ff0000')
      const upper = parseHexColorToSrgbRgb('#FF0000')
      const mixed = parseHexColorToSrgbRgb('#Ff0000')
      expect(lower).toEqual(upper)
      expect(lower).toEqual(mixed)
    })

    it('handles hex without # prefix', () => {
      const withHash = parseHexColorToSrgbRgb('#ff0000')
      const withoutHash = parseHexColorToSrgbRgb('ff0000')
      expect(withoutHash).toEqual(withHash)
    })

    it('rejects 4-digit and 5-digit hex', () => {
      expect(parseHexColorToSrgbRgb('#1234')).toBeNull()
      expect(parseHexColorToSrgbRgb('#12345')).toBeNull()
    })

    it('rejects 9+ digit hex', () => {
      expect(parseHexColorToSrgbRgb('#123456789')).toBeNull()
    })
  })

  describe('parseHexColorToLinearRgb', () => {
    it('returns fallback when input is invalid', () => {
      expect(parseHexColorToLinearRgb('nope', [0.1, 0.2, 0.3])).toEqual([0.1, 0.2, 0.3])
    })

    it('converts #808080 from sRGB to linear', () => {
      const rgb = parseHexColorToLinearRgb('#808080', [0, 0, 0])
      const srgb = 0x80 / 0xff
      const expected = srgbToLinearChannel(srgb)
      expect(rgb[0]).toBeCloseTo(expected, 7)
      expect(rgb[1]).toBeCloseTo(expected, 7)
      expect(rgb[2]).toBeCloseTo(expected, 7)
    })

    it('gamma correction: linear < sRGB for mid-range values', () => {
      // sRGB encoding has higher values than linear for mid-range colors
      // because gamma compression brightens darks
      const rgb = parseHexColorToLinearRgb('#808080', [0, 0, 0])
      const srgbValue = 0x80 / 0xff // ~0.502
      expect(rgb[0]).toBeLessThan(srgbValue) // linear ~0.216 < sRGB ~0.502
    })

    it('pure black and white are identity transforms', () => {
      const black = parseHexColorToLinearRgb('#000000', [1, 1, 1])
      expect(black).toEqual([0, 0, 0])

      const white = parseHexColorToLinearRgb('#ffffff', [0, 0, 0])
      expect(white[0]).toBeCloseTo(1, 7)
      expect(white[1]).toBeCloseTo(1, 7)
      expect(white[2]).toBeCloseTo(1, 7)
    })

    it('reuses cached linear conversion for repeated hex strings', () => {
      const first = parseHexColorToLinearRgb('#FFAA00', [0, 0, 0])
      const second = parseHexColorToLinearRgb('  #ffaa00  ', [0, 0, 0])
      expect(second).toBe(first)
    })

    it('parses whitespace-wrapped hex input on a cold cache entry', () => {
      const fallback: [number, number, number] = [0.9, 0.8, 0.7]
      const parsed = parseHexColorToLinearRgb('  #123456  ', fallback)
      const expected = parseHexColorToLinearRgb('#123456', [0, 0, 0])

      expect(parsed).not.toBe(fallback)
      expect(parsed[0]).toBeCloseTo(expected[0], 7)
      expect(parsed[1]).toBeCloseTo(expected[1], 7)
      expect(parsed[2]).toBeCloseTo(expected[2], 7)
    })
  })
})
