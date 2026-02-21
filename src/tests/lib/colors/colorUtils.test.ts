import { describe, expect, it } from 'vitest'

import { hex8ToHsv, parseColorToHsv } from '@/lib/colors/colorUtils'

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
  })
})
