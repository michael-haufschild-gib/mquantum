/**
 * Tests for E8 root system generator
 */

import { describe, it, expect } from 'vitest'
import { generateE8Roots, verifyE8Roots } from '@/lib/geometry/extended/e8-roots'

describe('E8 Root System', () => {
  describe('generateE8Roots', () => {
    it('should generate exactly 240 roots', () => {
      const roots = generateE8Roots()
      expect(roots.length).toBe(240)
    })

    it('should generate 8-dimensional vectors', () => {
      const roots = generateE8Roots()
      for (const root of roots) {
        expect(root.length).toBe(8)
      }
    })

    it('should generate roots with consistent length', () => {
      const roots = generateE8Roots(1.0)

      // All roots should have the same length (normalized to 1)
      const firstLengthSq = roots[0]!.reduce((sum, x) => sum + x * x, 0)

      for (const root of roots) {
        const lengthSq = root.reduce((sum, x) => sum + x * x, 0)
        expect(lengthSq).toBeCloseTo(firstLengthSq, 5)
      }
    })

    it('should scale roots correctly', () => {
      const scale = 2.5
      const unscaledRoots = generateE8Roots(1.0)
      const scaledRoots = generateE8Roots(scale)

      // Lengths should scale proportionally
      const unscaledLengthSq = unscaledRoots[0]!.reduce((sum, x) => sum + x * x, 0)
      const scaledLengthSq = scaledRoots[0]!.reduce((sum, x) => sum + x * x, 0)

      // Length scales by scale, so length^2 scales by scale^2
      expect(scaledLengthSq / unscaledLengthSq).toBeCloseTo(scale * scale, 5)
    })

    it('should generate unique roots (no duplicates)', () => {
      const roots = generateE8Roots()
      const rootStrings = roots.map((r) => r.map((x) => x.toFixed(6)).join(','))
      const uniqueRoots = new Set(rootStrings)
      expect(uniqueRoots.size).toBe(240)
    })

    describe('D8 component (112 roots)', () => {
      it('should include roots of form ±e_i ± e_j', () => {
        const roots = generateE8Roots(1.0)

        // Count roots with exactly 2 non-zero coordinates
        const d8Roots = roots.filter((root) => {
          const nonZeroCount = root.filter((x) => Math.abs(x) > 1e-10).length
          return nonZeroCount === 2
        })

        // Should have 112 D8-style roots
        // 8 choose 2 = 28 pairs, 4 sign combinations each = 112
        expect(d8Roots.length).toBe(112)
      })
    })

    describe('Half-integer component (128 roots)', () => {
      it('should include roots with all coordinates ±½ (normalized)', () => {
        const roots = generateE8Roots(1.0)

        // Count roots where all 8 coordinates are non-zero
        const halfIntRoots = roots.filter((root) => {
          const nonZeroCount = root.filter((x) => Math.abs(x) > 1e-10).length
          return nonZeroCount === 8
        })

        // Should have 128 half-integer roots
        // 2^8 / 2 = 128 (only even number of minus signs)
        expect(halfIntRoots.length).toBe(128)
      })

      it('should have half-integer roots with even parity', () => {
        const roots = generateE8Roots(1.0)

        // For half-integer roots, count negative coordinates
        const halfIntRoots = roots.filter((root) => {
          const nonZeroCount = root.filter((x) => Math.abs(x) > 1e-10).length
          return nonZeroCount === 8
        })

        for (const root of halfIntRoots) {
          const negativeCount = root.filter((x) => x < 0).length
          // Even parity: 0, 2, 4, 6, or 8 negative signs
          expect(negativeCount % 2).toBe(0)
        }
      })
    })
  })

  describe('verifyE8Roots', () => {
    it('should validate correct E8 roots', () => {
      const roots = generateE8Roots()
      const result = verifyE8Roots(roots)

      expect(result.valid).toBe(true)
      expect(result.rootCount).toBe(240)
      expect(result.allLength2).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('should detect incorrect root count', () => {
      const roots = generateE8Roots().slice(0, 200)
      const result = verifyE8Roots(roots)

      expect(result.valid).toBe(false)
      expect(result.rootCount).toBe(200)
      expect(result.issues.some((i) => i.includes('Expected 240'))).toBe(true)
    })

    it('should detect inconsistent lengths', () => {
      const roots = generateE8Roots()
      // Corrupt one root
      roots[0] = [10, 0, 0, 0, 0, 0, 0, 0]

      const result = verifyE8Roots(roots)

      // First root is now different length, so allSameLength should be false
      // But since it checks from index 1 onwards against index 0, and index 0 is corrupted,
      // it will find issues starting from the second root
      expect(result.issues.length).toBeGreaterThan(0)
    })

    it('should handle empty array', () => {
      const result = verifyE8Roots([])

      expect(result.valid).toBe(false)
      expect(result.rootCount).toBe(0)
      expect(result.issues.some((i) => i.includes('Expected 240'))).toBe(true)
    })
  })

  describe('mathematical properties', () => {
    it('should have roots that are negation pairs', () => {
      const roots = generateE8Roots()

      // For every root v, -v should also be a root
      const rootSet = new Set(roots.map((r) => r.map((x) => x.toFixed(6)).join(',')))

      for (const root of roots) {
        const negated = root.map((x) => -x)
        const negatedKey = negated.map((x) => x.toFixed(6)).join(',')
        expect(rootSet.has(negatedKey)).toBe(true)
      }
    })

    it('should form a closed system under negation', () => {
      const roots = generateE8Roots()

      // Count distinct pairs (root, -root)
      const seen = new Set<string>()
      let pairCount = 0

      for (const root of roots) {
        const key = root.map((x) => x.toFixed(6)).join(',')
        const negatedKey = root.map((x) => (-x).toFixed(6)).join(',')

        if (!seen.has(key) && !seen.has(negatedKey)) {
          pairCount++
          seen.add(key)
          seen.add(negatedKey)
        }
      }

      // Should have 120 pairs (240 / 2)
      expect(pairCount).toBe(120)
    })
  })
})
