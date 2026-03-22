/**
 * Tests for animation-wasm.ts helper functions
 *
 * These are pure TypeScript functions that can be tested without WASM.
 */

import { describe, expect, it } from 'vitest'

import { float64ToVector } from '@/lib/wasm/animation-wasm'

describe('animation-wasm helpers', () => {
  describe('float64ToVector', () => {
    it('converts Float64Array to number array', () => {
      const input = new Float64Array([1.5, 2.5, 3.5])
      const result = float64ToVector(input)

      expect(result).toEqual([1.5, 2.5, 3.5])
    })

    it('handles empty array', () => {
      const input = new Float64Array([])
      const result = float64ToVector(input)

      expect(result).toEqual([])
    })
  })
})
