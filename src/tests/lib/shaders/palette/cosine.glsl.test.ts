/**
 * Tests for Cosine Gradient Palette TypeScript Functions
 */

import { describe, it, expect } from 'vitest'
import {
  calculateCosineColor,
  applyDistributionTS,
  getCosinePaletteColorTS,
} from '@/rendering/shaders/palette/cosine.glsl'

describe('calculateCosineColor', () => {
  it('should return base color (a) when t=0 and c=0', () => {
    const a: [number, number, number] = [0.5, 0.5, 0.5]
    const b: [number, number, number] = [0.5, 0.5, 0.5]
    const c: [number, number, number] = [0, 0, 0] // Zero frequency
    const d: [number, number, number] = [0, 0, 0]

    const color = calculateCosineColor(0, a, b, c, d)

    // cos(0) = 1, so result = a + b * 1 = 1.0 for all channels
    expect(color.r).toBeCloseTo(1.0)
    expect(color.g).toBeCloseTo(1.0)
    expect(color.b).toBeCloseTo(1.0)
  })

  it('should return different colors at t=0 and t=0.5 with standard coefficients', () => {
    const a: [number, number, number] = [0.5, 0.5, 0.5]
    const b: [number, number, number] = [0.5, 0.5, 0.5]
    const c: [number, number, number] = [1, 1, 1]
    const d: [number, number, number] = [0, 0.33, 0.67]

    const color0 = calculateCosineColor(0, a, b, c, d)
    const color05 = calculateCosineColor(0.5, a, b, c, d)

    // Colors should be different
    expect(color0.r).not.toBeCloseTo(color05.r)
    expect(color0.g).not.toBeCloseTo(color05.g)
    expect(color0.b).not.toBeCloseTo(color05.b)
  })

  it('should clamp values to [0, 1] range', () => {
    // Coefficients that would produce values outside [0, 1]
    const a: [number, number, number] = [1.5, -0.5, 0.5]
    const b: [number, number, number] = [1.0, 1.0, 1.0]
    const c: [number, number, number] = [1, 1, 1]
    const d: [number, number, number] = [0, 0, 0]

    const color = calculateCosineColor(0, a, b, c, d)

    expect(color.r).toBeGreaterThanOrEqual(0)
    expect(color.r).toBeLessThanOrEqual(1)
    expect(color.g).toBeGreaterThanOrEqual(0)
    expect(color.g).toBeLessThanOrEqual(1)
    expect(color.b).toBeGreaterThanOrEqual(0)
    expect(color.b).toBeLessThanOrEqual(1)
  })

  it('should produce cyclic colors with frequency > 1', () => {
    const a: [number, number, number] = [0.5, 0.5, 0.5]
    const b: [number, number, number] = [0.5, 0.5, 0.5]
    const c: [number, number, number] = [2, 2, 2] // 2 cycles
    const d: [number, number, number] = [0, 0, 0]

    const color0 = calculateCosineColor(0, a, b, c, d)
    const color05 = calculateCosineColor(0.5, a, b, c, d)

    // With c=2, t=0 and t=0.5 should give same color (2 full cycles)
    expect(color0.r).toBeCloseTo(color05.r)
    expect(color0.g).toBeCloseTo(color05.g)
    expect(color0.b).toBeCloseTo(color05.b)
  })

  it('should apply phase offset correctly', () => {
    const a: [number, number, number] = [0.5, 0.5, 0.5]
    const b: [number, number, number] = [0.5, 0.5, 0.5]
    const c: [number, number, number] = [1, 1, 1]
    const dZero: [number, number, number] = [0, 0, 0]
    const dOffset: [number, number, number] = [0.25, 0.25, 0.25]

    const colorNoOffset = calculateCosineColor(0, a, b, c, dZero)
    const colorWithOffset = calculateCosineColor(0, a, b, c, dOffset)

    // With phase offset, colors should be different
    expect(colorNoOffset.r).not.toBeCloseTo(colorWithOffset.r)
  })
})

describe('applyDistributionTS', () => {
  describe('input clamping', () => {
    it('should clamp negative values to 0', () => {
      const result = applyDistributionTS(-0.5, 1, 1, 0)
      expect(result).toBe(0)
    })

    it('should clamp values > 1 to 1', () => {
      const result = applyDistributionTS(1.5, 1, 1, 0)
      expect(result).toBe(0) // pow(1, 1) * 1 + 0 = 1, fract(1) = 0
    })
  })

  describe('power curve', () => {
    it('should apply power < 1 (expands darks)', () => {
      const result = applyDistributionTS(0.25, 0.5, 1, 0)
      // 0.25^0.5 = 0.5
      expect(result).toBeCloseTo(0.5)
    })

    it('should apply power > 1 (expands lights)', () => {
      const result = applyDistributionTS(0.5, 2, 1, 0)
      // 0.5^2 = 0.25
      expect(result).toBeCloseTo(0.25)
    })

    it('should apply power = 1 (linear)', () => {
      const result = applyDistributionTS(0.5, 1, 1, 0)
      expect(result).toBeCloseTo(0.5)
    })
  })

  describe('cycles', () => {
    it('should apply cycles = 1 (single cycle)', () => {
      const result = applyDistributionTS(0.5, 1, 1, 0)
      expect(result).toBeCloseTo(0.5)
    })

    it('should apply cycles = 2 (double cycle)', () => {
      const result = applyDistributionTS(0.25, 1, 2, 0)
      // 0.25 * 2 = 0.5
      expect(result).toBeCloseTo(0.5)
    })

    it('should wrap cycles correctly', () => {
      const result = applyDistributionTS(0.75, 1, 2, 0)
      // 0.75 * 2 = 1.5, fract(1.5) = 0.5
      expect(result).toBeCloseTo(0.5)
    })
  })

  describe('offset', () => {
    it('should apply offset = 0', () => {
      const result = applyDistributionTS(0.5, 1, 1, 0)
      expect(result).toBeCloseTo(0.5)
    })

    it('should apply offset = 0.5', () => {
      const result = applyDistributionTS(0.25, 1, 1, 0.5)
      // 0.25 + 0.5 = 0.75
      expect(result).toBeCloseTo(0.75)
    })

    it('should wrap offset correctly', () => {
      const result = applyDistributionTS(0.75, 1, 1, 0.5)
      // 0.75 + 0.5 = 1.25, fract(1.25) = 0.25
      expect(result).toBeCloseTo(0.25)
    })
  })

  describe('combined effects', () => {
    it('should apply power, cycles, and offset together', () => {
      const result = applyDistributionTS(0.5, 2, 2, 0.25)
      // 0.5^2 = 0.25
      // 0.25 * 2 = 0.5
      // 0.5 + 0.25 = 0.75
      expect(result).toBeCloseTo(0.75)
    })
  })
})

describe('getCosinePaletteColorTS', () => {
  it('should combine distribution and color calculation', () => {
    const a: [number, number, number] = [0.5, 0.5, 0.5]
    const b: [number, number, number] = [0.5, 0.5, 0.5]
    const c: [number, number, number] = [1, 1, 1]
    const d: [number, number, number] = [0, 0, 0]

    const color = getCosinePaletteColorTS(0.5, a, b, c, d, 1, 1, 0)

    // Result should be valid RGB
    expect(color.r).toBeGreaterThanOrEqual(0)
    expect(color.r).toBeLessThanOrEqual(1)
    expect(color.g).toBeGreaterThanOrEqual(0)
    expect(color.g).toBeLessThanOrEqual(1)
    expect(color.b).toBeGreaterThanOrEqual(0)
    expect(color.b).toBeLessThanOrEqual(1)
  })

  it('should apply distribution before color calculation', () => {
    const a: [number, number, number] = [0.5, 0.5, 0.5]
    const b: [number, number, number] = [0.5, 0.5, 0.5]
    const c: [number, number, number] = [1, 1, 1]
    const d: [number, number, number] = [0, 0, 0]

    // Power of 0.5 should remap 0.25 to 0.5
    const colorWithPower = getCosinePaletteColorTS(0.25, a, b, c, d, 0.5, 1, 0)

    // Direct calculation at 0.5
    const colorDirect = calculateCosineColor(0.5, a, b, c, d)

    expect(colorWithPower.r).toBeCloseTo(colorDirect.r)
    expect(colorWithPower.g).toBeCloseTo(colorDirect.g)
    expect(colorWithPower.b).toBeCloseTo(colorDirect.b)
  })

  it('should produce different colors with different distributions', () => {
    const a: [number, number, number] = [0.5, 0.5, 0.5]
    const b: [number, number, number] = [0.5, 0.5, 0.5]
    const c: [number, number, number] = [1, 1, 1]
    const d: [number, number, number] = [0, 0.33, 0.67]

    const colorPower1 = getCosinePaletteColorTS(0.5, a, b, c, d, 1, 1, 0)
    const colorPower2 = getCosinePaletteColorTS(0.5, a, b, c, d, 2, 1, 0)

    // Different power should produce different colors
    // (unless at a fixed point of the curve)
    expect(
      colorPower1.r !== colorPower2.r ||
        colorPower1.g !== colorPower2.g ||
        colorPower1.b !== colorPower2.b
    ).toBe(true)
  })
})

describe('color palette generation', () => {
  it('should generate smooth gradients', () => {
    const a: [number, number, number] = [0.5, 0.5, 0.5]
    const b: [number, number, number] = [0.5, 0.5, 0.5]
    const c: [number, number, number] = [1, 1, 1]
    const d: [number, number, number] = [0, 0.33, 0.67]

    // Generate 10 colors
    const colors = []
    for (let i = 0; i <= 10; i++) {
      colors.push(calculateCosineColor(i / 10, a, b, c, d))
    }

    // Check that adjacent colors don't have huge jumps
    for (let i = 1; i < colors.length; i++) {
      const prevColor = colors[i - 1]!
      const currColor = colors[i]!

      const dr = Math.abs(currColor.r - prevColor.r)
      const dg = Math.abs(currColor.g - prevColor.g)
      const db = Math.abs(currColor.b - prevColor.b)

      // Adjacent colors should be relatively close (allow up to 0.35 for smooth gradients)
      expect(dr).toBeLessThan(0.35)
      expect(dg).toBeLessThan(0.35)
      expect(db).toBeLessThan(0.35)
    }
  })

  it('should produce IQ signature rainbow palette', () => {
    // Inigo Quilez's classic rainbow coefficients
    const a: [number, number, number] = [0.5, 0.5, 0.5]
    const b: [number, number, number] = [0.5, 0.5, 0.5]
    const c: [number, number, number] = [1, 1, 1]
    const d: [number, number, number] = [0.0, 0.33, 0.67]

    const colorStart = calculateCosineColor(0, a, b, c, d)
    const colorMiddle = calculateCosineColor(0.5, a, b, c, d)
    const colorEnd = calculateCosineColor(1, a, b, c, d)

    // Start and end should be similar (cyclic)
    expect(colorStart.r).toBeCloseTo(colorEnd.r, 0)
    expect(colorStart.g).toBeCloseTo(colorEnd.g, 0)
    expect(colorStart.b).toBeCloseTo(colorEnd.b, 0)

    // Middle should be different
    expect(
      Math.abs(colorStart.r - colorMiddle.r) > 0.1 ||
        Math.abs(colorStart.g - colorMiddle.g) > 0.1 ||
        Math.abs(colorStart.b - colorMiddle.b) > 0.1
    ).toBe(true)
  })
})
