import { describe, expect, it } from 'vitest'
import { parseHexColorToLinearRgb, parseHexColorToSrgbRgb, srgbToLinearChannel } from '@/rendering/webgpu/utils/color'

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
      // Reference: Three.js Color.convertSRGBToLinear()
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

    it('reuses cached linear conversion for repeated hex strings', () => {
      const first = parseHexColorToLinearRgb('#FFAA00', [0, 0, 0])
      const second = parseHexColorToLinearRgb('  #ffaa00  ', [0, 0, 0])
      expect(second).toBe(first)
    })
  })
})
