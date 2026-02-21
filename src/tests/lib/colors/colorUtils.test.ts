import { describe, expect, it } from 'vitest'

import { hex8ToHsv, hexToHsv, parseColorToHsv } from '@/lib/colors/colorUtils'

describe('colorUtils', () => {
  describe('hex8ToHsv', () => {
    it('returns fallback black for invalid 8-digit hex', () => {
      expect(hex8ToHsv('#gggggggg')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
    })

    it('returns fallback black for invalid 4-digit hex', () => {
      expect(hex8ToHsv('#zzzz')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
    })
  })

  describe('parseColorToHsv', () => {
    it('falls back to black for invalid hex8 input', () => {
      expect(parseColorToHsv('#gggg')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
    })

    it('falls back to black for malformed 6-digit hex with invalid trailing chars', () => {
      expect(parseColorToHsv('#ff00zz')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
    })

    it('parses valid rgba input with alpha', () => {
      expect(parseColorToHsv('rgba(255, 0, 0, 0.5)')).toEqual({ h: 0, s: 1, v: 1, a: 0.5 })
    })

    it('falls back to black for rgb/rgba strings with leading or trailing junk', () => {
      expect(parseColorToHsv('rgba(255,0,0,1)junk')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
      expect(parseColorToHsv('junk rgba(255,0,0,1)')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
    })

    it('falls back to black for malformed rgb/rgba formats', () => {
      expect(parseColorToHsv('rgb(255,0,0,0.5)')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
      expect(parseColorToHsv('rgba(255,0,0,1..2)')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
    })
  })

  describe('hexToHsv', () => {
    it('falls back to black for malformed 6-digit hex with mixed invalid chars', () => {
      expect(hexToHsv('#12gg34')).toEqual({ h: 0, s: 0, v: 0, a: 1 })
    })
  })
})
