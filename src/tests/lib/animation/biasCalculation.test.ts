import { describe, it, expect } from 'vitest'
import {
  GOLDEN_RATIO,
  MIN_MULTIPLIER,
  MAX_MULTIPLIER,
  MAX_DEVIATION,
  getPlaneMultiplier,
} from '@/lib/animation/biasCalculation'

describe('biasCalculation', () => {
  describe('constants', () => {
    it('should have correct GOLDEN_RATIO value', () => {
      const expectedPhi = (1 + Math.sqrt(5)) / 2
      expect(GOLDEN_RATIO).toBeCloseTo(expectedPhi, 10)
      expect(GOLDEN_RATIO).toBeCloseTo(1.618034, 5)
    })

    it('should have safe MIN_MULTIPLIER', () => {
      expect(MIN_MULTIPLIER).toBe(0.1)
      expect(MIN_MULTIPLIER).toBeGreaterThan(0)
    })

    it('should have reasonable MAX_MULTIPLIER', () => {
      expect(MAX_MULTIPLIER).toBe(3.0)
    })

    it('should have MAX_DEVIATION that creates meaningful spread', () => {
      expect(MAX_DEVIATION).toBe(0.8)
      expect(1 - MAX_DEVIATION).toBeCloseTo(0.2)
      expect(1 + MAX_DEVIATION).toBeCloseTo(1.8)
    })
  })

  describe('getPlaneMultiplier', () => {
    it('should return 1.0 when bias is 0', () => {
      expect(getPlaneMultiplier(0, 10, 0)).toBe(1.0)
      expect(getPlaneMultiplier(5, 10, 0)).toBe(1.0)
      expect(getPlaneMultiplier(54, 55, 0)).toBe(1.0)
    })

    it('should return varied value for plane 0 at non-zero bias', () => {
      const mult = getPlaneMultiplier(0, 10, 1.0)
      expect(mult).not.toBe(1.0)
      expect(mult).toBeGreaterThan(1.0)
    })

    it('should return values within [MIN_MULTIPLIER, MAX_MULTIPLIER] at any bias', () => {
      for (let planeIndex = 0; planeIndex < 55; planeIndex++) {
        const mult = getPlaneMultiplier(planeIndex, 55, 1.0)
        expect(mult).toBeGreaterThanOrEqual(MIN_MULTIPLIER)
        expect(mult).toBeLessThanOrEqual(MAX_MULTIPLIER)
      }
    })

    it('should create varied multipliers at max bias', () => {
      const multipliers = [
        getPlaneMultiplier(0, 10, 1.0),
        getPlaneMultiplier(1, 10, 1.0),
        getPlaneMultiplier(2, 10, 1.0),
        getPlaneMultiplier(3, 10, 1.0),
      ]

      multipliers.forEach((mult) => {
        expect(mult).not.toBe(1.0)
      })

      const unique = new Set(multipliers.map((m) => m.toFixed(6)))
      expect(unique.size).toBe(4)
    })

    it('should scale variation with bias value', () => {
      const index = 1
      const bias0 = getPlaneMultiplier(index, 10, 0)
      const bias25 = getPlaneMultiplier(index, 10, 0.25)
      const bias50 = getPlaneMultiplier(index, 10, 0.5)
      const bias100 = getPlaneMultiplier(index, 10, 1.0)

      expect(bias0).toBe(1.0)

      const dev25 = Math.abs(bias25 - 1)
      const dev50 = Math.abs(bias50 - 1)
      const dev100 = Math.abs(bias100 - 1)

      expect(dev50).toBeGreaterThan(dev25)
      expect(dev100).toBeGreaterThan(dev50)
    })

    it('should handle single plane', () => {
      const multiplier = getPlaneMultiplier(0, 1, 1.0)
      expect(multiplier).toBeGreaterThan(1.0)
      expect(multiplier).toBeLessThanOrEqual(MAX_MULTIPLIER)
    })

    it('should handle very small bias', () => {
      const multiplier = getPlaneMultiplier(1, 10, 0.001)
      expect(multiplier).toBeCloseTo(1.0, 2)
    })

    it('should handle bias exactly at boundaries', () => {
      const atZero = getPlaneMultiplier(1, 10, 0)
      const atOne = getPlaneMultiplier(1, 10, 1)

      expect(atZero).toBe(1.0)
      expect(atOne).toBeGreaterThanOrEqual(MIN_MULTIPLIER)
      expect(atOne).toBeLessThanOrEqual(MAX_MULTIPLIER)
    })
  })
})
