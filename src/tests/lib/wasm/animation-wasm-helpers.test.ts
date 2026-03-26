/**
 * Tests for animation-wasm.ts helper functions
 *
 * These are pure TypeScript functions that can be tested without WASM.
 */

import { describe, expect, it } from 'vitest'

import {
  composeRotationsIndexedWasm,
  dotProductWasm,
  float64ToVector,
  initAnimationWasm,
  isAnimationWasmReady,
  magnitudeWasm,
  multiplyMatricesWasm,
  multiplyMatrixVectorWasm,
  normalizeVectorWasm,
  subtractVectorsWasm,
} from '@/lib/wasm/animation-wasm'

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

    it('preserves high-precision values', () => {
      const input = new Float64Array([Math.PI, Math.E, Number.EPSILON])
      const result = float64ToVector(input)
      expect(result[0]).toBe(Math.PI)
      expect(result[1]).toBe(Math.E)
      expect(result[2]).toBe(Number.EPSILON)
    })
  })

  describe('isAnimationWasmReady', () => {
    it('returns false in test environment (WASM mocked)', () => {
      expect(isAnimationWasmReady()).toBe(false)
    })
  })

  describe('initAnimationWasm', () => {
    it('resolves without error in test environment', async () => {
      await expect(initAnimationWasm()).resolves.toBeUndefined()
    })

    it('is idempotent (multiple calls do not throw)', async () => {
      await initAnimationWasm()
      await initAnimationWasm()
      // Both calls resolve without error — WASM skips init in test mode
    })
  })

  describe('WASM functions return null when not ready', () => {
    it('composeRotationsIndexedWasm returns null', () => {
      const indices = new Uint32Array([0, 1])
      const angles = new Float64Array([Math.PI / 4])
      expect(composeRotationsIndexedWasm(3, indices, angles, 1)).toBeNull()
    })

    it('multiplyMatrixVectorWasm returns null', () => {
      const matrix = new Float64Array(9)
      const vector = new Float64Array(3)
      expect(multiplyMatrixVectorWasm(matrix, vector, 3)).toBeNull()
    })

    it('multiplyMatricesWasm returns null', () => {
      const a = new Float64Array(9)
      const b = new Float64Array(9)
      expect(multiplyMatricesWasm(a, b, 3)).toBeNull()
    })

    it('dotProductWasm returns null', () => {
      const a = new Float64Array([1, 2, 3])
      const b = new Float64Array([4, 5, 6])
      expect(dotProductWasm(a, b)).toBeNull()
    })

    it('magnitudeWasm returns null', () => {
      const v = new Float64Array([3, 4])
      expect(magnitudeWasm(v)).toBeNull()
    })

    it('normalizeVectorWasm returns null', () => {
      const v = new Float64Array([3, 4])
      expect(normalizeVectorWasm(v)).toBeNull()
    })

    it('subtractVectorsWasm returns null', () => {
      const a = new Float64Array([1, 2])
      const b = new Float64Array([3, 4])
      expect(subtractVectorsWasm(a, b)).toBeNull()
    })
  })
})
