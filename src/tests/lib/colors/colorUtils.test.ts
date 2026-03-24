/**
 * Tests for color conversion utilities.
 *
 * Verifies:
 * - HSV <-> RGB <-> Hex roundtrip integrity
 * - Edge cases: black, white, pure primary/secondary colors
 * - Input validation and fallback behavior
 * - Palette generation and contrast color selection
 * - All six hue sextants in HSV-to-RGB conversion
 */

import { describe, expect, it } from 'vitest'

import {
  generatePalette,
  getContrastColor,
  hex8ToHsv,
  hexToHsv,
  hsvToHex,
  hsvToHex8,
  hsvToRgb,
  isValidHex,
  parseColorToHsv,
  rgbToHex,
  rgbToHsv,
} from '@/lib/colors/colorUtils'

describe('hexToHsv', () => {
  it('converts pure red #FF0000 to h=0, s=1, v=1', () => {
    const hsv = hexToHsv('#FF0000')
    expect(hsv.h).toBeCloseTo(0, 2)
    expect(hsv.s).toBeCloseTo(1, 2)
    expect(hsv.v).toBeCloseTo(1, 2)
    expect(hsv.a).toBe(1)
  })

  it('converts pure green #00FF00 to h=1/3', () => {
    const hsv = hexToHsv('#00FF00')
    expect(hsv.h).toBeCloseTo(1 / 3, 4)
    expect(hsv.s).toBeCloseTo(1, 2)
    expect(hsv.v).toBeCloseTo(1, 2)
  })

  it('converts pure blue #0000FF to h=2/3', () => {
    const hsv = hexToHsv('#0000FF')
    expect(hsv.h).toBeCloseTo(2 / 3, 4)
    expect(hsv.s).toBeCloseTo(1, 2)
    expect(hsv.v).toBeCloseTo(1, 2)
  })

  it('converts white #FFFFFF to s=0, v=1', () => {
    const hsv = hexToHsv('#FFFFFF')
    expect(hsv.s).toBeCloseTo(0, 2)
    expect(hsv.v).toBeCloseTo(1, 2)
  })

  it('converts black #000000 to s=0, v=0', () => {
    const hsv = hexToHsv('#000000')
    expect(hsv.s).toBeCloseTo(0, 2)
    expect(hsv.v).toBeCloseTo(0, 2)
  })

  it('converts shorthand #F00 to red', () => {
    const hsv = hexToHsv('#F00')
    expect(hsv.h).toBeCloseTo(0, 2)
    expect(hsv.s).toBeCloseTo(1, 2)
    expect(hsv.v).toBeCloseTo(1, 2)
  })

  it('returns black fallback for invalid hex', () => {
    expect(hexToHsv('#12gg34')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
    expect(hexToHsv('')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
    expect(hexToHsv('#')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
  })
})

describe('hex8ToHsv', () => {
  it('parses 8-digit hex with full alpha', () => {
    const hsv = hex8ToHsv('#FF0000FF')
    expect(hsv.h).toBeCloseTo(0, 2)
    expect(hsv.s).toBeCloseTo(1, 2)
    expect(hsv.v).toBeCloseTo(1, 2)
    expect(hsv.a).toBeCloseTo(1, 2)
  })

  it('parses 8-digit hex with half alpha', () => {
    const hsv = hex8ToHsv('#FF000080')
    expect(hsv.a).toBeCloseTo(128 / 255, 2)
  })

  it('parses 4-digit shorthand hex8', () => {
    const hsv = hex8ToHsv('#F008')
    // #F008 expands to #FF000088
    expect(hsv.h).toBeCloseTo(0, 2)
    expect(hsv.s).toBeCloseTo(1, 2)
    expect(hsv.a).toBeCloseTo(0x88 / 255, 2)
  })

  it('returns black fallback for invalid hex8', () => {
    expect(hex8ToHsv('#gggggggg')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
    expect(hex8ToHsv('#zzzz')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
  })
})

describe('rgbToHsv', () => {
  it('converts pure red', () => {
    const hsv = rgbToHsv(255, 0, 0)
    expect(hsv.h).toBeCloseTo(0, 2)
    expect(hsv.s).toBeCloseTo(1, 2)
    expect(hsv.v).toBeCloseTo(1, 2)
  })

  it('converts pure green', () => {
    const hsv = rgbToHsv(0, 255, 0)
    expect(hsv.h).toBeCloseTo(1 / 3, 4)
  })

  it('converts pure blue', () => {
    const hsv = rgbToHsv(0, 0, 255)
    expect(hsv.h).toBeCloseTo(2 / 3, 4)
  })

  it('converts cyan (R=0)', () => {
    const hsv = rgbToHsv(0, 255, 255)
    expect(hsv.h).toBeCloseTo(0.5, 4)
    expect(hsv.s).toBeCloseTo(1, 2)
  })

  it('converts magenta', () => {
    const hsv = rgbToHsv(255, 0, 255)
    expect(hsv.h).toBeCloseTo(5 / 6, 4)
    expect(hsv.s).toBeCloseTo(1, 2)
  })

  it('converts yellow', () => {
    const hsv = rgbToHsv(255, 255, 0)
    expect(hsv.h).toBeCloseTo(1 / 6, 4)
    expect(hsv.s).toBeCloseTo(1, 2)
  })

  it('handles achromatic colors (gray)', () => {
    const hsv = rgbToHsv(128, 128, 128)
    expect(hsv.s).toBeCloseTo(0, 2)
    expect(hsv.v).toBeCloseTo(128 / 255, 2)
  })

  it('preserves alpha', () => {
    const hsv = rgbToHsv(255, 0, 0, 0.5)
    expect(hsv.a).toBe(0.5)
  })
})

describe('hsvToRgb', () => {
  it('converts pure red (h=0)', () => {
    const rgb = hsvToRgb(0, 1, 1)
    expect(rgb.r).toBe(255)
    expect(rgb.g).toBe(0)
    expect(rgb.b).toBe(0)
  })

  it('converts pure green (h=1/3)', () => {
    const rgb = hsvToRgb(1 / 3, 1, 1)
    expect(rgb.r).toBe(0)
    expect(rgb.g).toBe(255)
    expect(rgb.b).toBe(0)
  })

  it('converts pure blue (h=2/3)', () => {
    const rgb = hsvToRgb(2 / 3, 1, 1)
    expect(rgb.r).toBe(0)
    expect(rgb.g).toBe(0)
    expect(rgb.b).toBe(255)
  })

  it('converts white (s=0, v=1)', () => {
    const rgb = hsvToRgb(0, 0, 1)
    expect(rgb.r).toBe(255)
    expect(rgb.g).toBe(255)
    expect(rgb.b).toBe(255)
  })

  it('converts black (v=0)', () => {
    const rgb = hsvToRgb(0, 1, 0)
    expect(rgb.r).toBe(0)
    expect(rgb.g).toBe(0)
    expect(rgb.b).toBe(0)
  })

  it('covers all six hue sextants', () => {
    // Sextant 0: h=0
    const s0 = hsvToRgb(0 / 6, 1, 1)
    expect(s0.r).toBe(255)
    expect(s0.b).toBe(0)

    // Sextant 1: h=1/6
    const s1 = hsvToRgb(1 / 6, 1, 1)
    expect(s1.g).toBe(255)
    expect(s1.b).toBe(0)

    // Sextant 2: h=2/6
    const s2 = hsvToRgb(2 / 6, 1, 1)
    expect(s2.r).toBe(0)
    expect(s2.g).toBe(255)

    // Sextant 3: h=3/6
    const s3 = hsvToRgb(3 / 6, 1, 1)
    expect(s3.r).toBe(0)
    expect(s3.b).toBe(255)

    // Sextant 4: h=4/6
    const s4 = hsvToRgb(4 / 6, 1, 1)
    expect(s4.g).toBe(0)
    expect(s4.b).toBe(255)

    // Sextant 5: h=5/6
    const s5 = hsvToRgb(5 / 6, 1, 1)
    expect(s5.r).toBe(255)
    expect(s5.g).toBe(0)
  })

  it('preserves alpha', () => {
    const rgb = hsvToRgb(0, 1, 1, 0.75)
    expect(rgb.a).toBe(0.75)
  })
})

describe('hsvToHex', () => {
  it('produces #ff0000 for pure red', () => {
    expect(hsvToHex(0, 1, 1).toLowerCase()).toBe('#ff0000')
  })

  it('produces #000000 for black', () => {
    expect(hsvToHex(0, 0, 0).toLowerCase()).toBe('#000000')
  })

  it('produces #ffffff for white', () => {
    expect(hsvToHex(0, 0, 1).toLowerCase()).toBe('#ffffff')
  })
})

describe('hsvToHex8', () => {
  it('appends alpha byte to hex', () => {
    const hex8 = hsvToHex8(0, 1, 1, 1)
    expect(hex8.toLowerCase()).toBe('#ff0000ff')
  })

  it('encodes half alpha as 80', () => {
    const hex8 = hsvToHex8(0, 1, 1, 0.5)
    // 0.5 * 255 = 127.5, rounded = 128 = 0x80
    expect(hex8.toLowerCase()).toMatch(/#ff000080/)
  })

  it('encodes zero alpha as 00', () => {
    const hex8 = hsvToHex8(0, 1, 1, 0)
    expect(hex8.toLowerCase()).toBe('#ff000000')
  })
})

describe('rgbToHex', () => {
  it('converts pure red', () => {
    expect(rgbToHex(255, 0, 0).toLowerCase()).toBe('#ff0000')
  })

  it('pads single-digit channels with leading zero', () => {
    expect(rgbToHex(0, 0, 1).toLowerCase()).toBe('#000001')
    expect(rgbToHex(0, 15, 0).toLowerCase()).toBe('#000f00')
  })

  it('handles black', () => {
    expect(rgbToHex(0, 0, 0).toLowerCase()).toBe('#000000')
  })
})

describe('HSV <-> RGB <-> Hex roundtrip', () => {
  const testColors = [
    { name: 'red', hex: '#FF0000' },
    { name: 'green', hex: '#00FF00' },
    { name: 'blue', hex: '#0000FF' },
    { name: 'white', hex: '#FFFFFF' },
    { name: 'black', hex: '#000000' },
    { name: 'cyan', hex: '#00FFFF' },
    { name: 'magenta', hex: '#FF00FF' },
    { name: 'yellow', hex: '#FFFF00' },
    { name: 'gray', hex: '#808080' },
    { name: 'dark teal', hex: '#1A4040' },
  ]

  for (const { name, hex } of testColors) {
    it(`roundtrips ${name}: hex -> hsv -> hex`, () => {
      const hsv = hexToHsv(hex)
      const roundtripped = hsvToHex(hsv.h, hsv.s, hsv.v)
      expect(roundtripped.toUpperCase()).toBe(hex.toUpperCase())
    })
  }
})

describe('isValidHex', () => {
  it('accepts valid 3-digit hex', () => {
    expect(isValidHex('#F00')).toBe(true)
    expect(isValidHex('#abc')).toBe(true)
  })

  it('accepts valid 4-digit hex (with alpha)', () => {
    expect(isValidHex('#F00F')).toBe(true)
  })

  it('accepts valid 6-digit hex', () => {
    expect(isValidHex('#FF0000')).toBe(true)
    expect(isValidHex('#abcdef')).toBe(true)
  })

  it('accepts valid 8-digit hex', () => {
    expect(isValidHex('#FF0000FF')).toBe(true)
  })

  it('rejects invalid formats', () => {
    expect(isValidHex('')).toBe(false)
    expect(isValidHex('#')).toBe(false)
    expect(isValidHex('#GG0000')).toBe(false)
    expect(isValidHex('FF0000')).toBe(false) // missing #
    expect(isValidHex('#FF00')).toBe(true) // 4-digit is valid
    expect(isValidHex('#FF00000')).toBe(false) // 7 digits
    expect(isValidHex('#FF000000F')).toBe(false) // 9 digits
  })
})

describe('parseColorToHsv', () => {
  it('parses 6-digit hex', () => {
    const hsv = parseColorToHsv('#FF0000')
    expect(hsv.h).toBeCloseTo(0, 2)
    expect(hsv.s).toBeCloseTo(1, 2)
    expect(hsv.v).toBeCloseTo(1, 2)
    expect(hsv.a).toBe(1)
  })

  it('parses 3-digit hex', () => {
    const hsv = parseColorToHsv('#F00')
    expect(hsv.h).toBeCloseTo(0, 2)
    expect(hsv.s).toBeCloseTo(1, 2)
  })

  it('parses 8-digit hex with alpha', () => {
    const hsv = parseColorToHsv('#FF000080')
    expect(hsv.h).toBeCloseTo(0, 2)
    expect(hsv.a).toBeCloseTo(128 / 255, 2)
  })

  it('parses rgb() string', () => {
    const hsv = parseColorToHsv('rgb(0, 255, 0)')
    expect(hsv.h).toBeCloseTo(1 / 3, 4)
    expect(hsv.s).toBeCloseTo(1, 2)
    expect(hsv.v).toBeCloseTo(1, 2)
  })

  it('parses rgba() string', () => {
    const hsv = parseColorToHsv('rgba(255, 0, 0, 0.5)')
    expect(hsv.h).toBeCloseTo(0, 2)
    expect(hsv.s).toBeCloseTo(1, 2)
    expect(hsv.a).toBe(0.5)
  })

  it('falls back to black for invalid input', () => {
    expect(parseColorToHsv('not-a-color')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
    expect(parseColorToHsv('')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
    expect(parseColorToHsv('#gggg')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
  })

  it('falls back for rgb/rgba with trailing junk', () => {
    expect(parseColorToHsv('rgba(255,0,0,1)junk')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
    expect(parseColorToHsv('junk rgba(255,0,0,1)')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
  })

  it('falls back for malformed rgb/rgba', () => {
    // rgb with 4 args should fail (that's rgba)
    expect(parseColorToHsv('rgb(255,0,0,0.5)')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
  })

  it('trims whitespace around input', () => {
    const hsv = parseColorToHsv('  #FF0000  ')
    expect(hsv.h).toBeCloseTo(0, 2)
    expect(hsv.s).toBeCloseTo(1, 2)
  })
})

describe('generatePalette', () => {
  it('returns 2*count items (tints + shades)', () => {
    const palette = generatePalette(0, 1, 0.5, 4)
    expect(palette).toHaveLength(8) // 4 tints + 4 shades
  })

  it('returns valid hex strings', () => {
    const palette = generatePalette(0.5, 0.8, 0.7)
    for (const hex of palette) {
      expect(isValidHex(hex), `${hex} should be valid hex`).toBe(true)
    }
  })

  it('tints are lighter, shades are darker than the base', () => {
    const h = 0.6
    const s = 0.8
    const v = 0.5
    const palette = generatePalette(h, s, v, 3)
    // First 3 are tints (lighter), last 3 are shades (darker)
    for (let i = 0; i < 3; i++) {
      const tintHsv = hexToHsv(palette[i]!)
      // Tints should have higher value or lower saturation
      expect(tintHsv.v).toBeGreaterThanOrEqual(v - 0.01)
    }
    for (let i = 3; i < 6; i++) {
      const shadeHsv = hexToHsv(palette[i]!)
      // Shades should have lower value
      expect(shadeHsv.v).toBeLessThanOrEqual(v + 0.01)
    }
  })

  it('handles edge case count=0', () => {
    const palette = generatePalette(0, 1, 1, 0)
    expect(palette).toHaveLength(0)
  })

  it('handles count=1', () => {
    const palette = generatePalette(0, 1, 1, 1)
    expect(palette).toHaveLength(2) // 1 tint + 1 shade
  })
})

describe('getContrastColor', () => {
  it('returns white for dark colors', () => {
    expect(getContrastColor(0, 1, 0.2)).toBe('white')
    expect(getContrastColor(0.67, 1, 0.3)).toBe('white')
  })

  it('returns black for light colors', () => {
    expect(getContrastColor(0, 0, 1)).toBe('black') // white
    expect(getContrastColor(0.17, 0.3, 0.95)).toBe('black') // light yellow-ish
  })

  it('returns black for pure yellow (high perceptual luminance)', () => {
    // Yellow has high green component which dominates luminance
    expect(getContrastColor(1 / 6, 1, 1)).toBe('black')
  })

  it('returns white for pure blue (low perceptual luminance)', () => {
    expect(getContrastColor(2 / 3, 1, 1)).toBe('white')
  })
})
