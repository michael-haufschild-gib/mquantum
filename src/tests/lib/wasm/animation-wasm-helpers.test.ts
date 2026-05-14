/**
 * Tests for animation-wasm.ts helper functions
 *
 * These are pure TypeScript functions that can be tested without WASM.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { getWasmRuntime } from '@/lib/wasm/animation/runtime'
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

function resetRuntimeSnapshot(): void {
  const runtime = getWasmRuntime() as {
    ready: boolean
    module: ReturnType<typeof getWasmRuntime>['module']
  }
  runtime.ready = false
  runtime.module = null
}

describe('animation-wasm helpers', () => {
  afterEach(() => {
    resetRuntimeSnapshot()
  })

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

    it('keeps a stable runtime snapshot object for wrapper hot paths', async () => {
      const runtime = getWasmRuntime()
      await initAnimationWasm()
      expect(getWasmRuntime()).toBe(runtime)
      expect(runtime.ready).toBe(false)
      expect(runtime.module).toBeNull()
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

  describe('WASM vector wrappers validate dimensions before dispatch', () => {
    it('rejects mismatched dot-product vectors', () => {
      const dot = vi.fn(() => 0)
      const runtime = getWasmRuntime() as {
        ready: boolean
        module: ReturnType<typeof getWasmRuntime>['module']
      }
      runtime.ready = true
      runtime.module = { dot_product_wasm: dot } as unknown as ReturnType<
        typeof getWasmRuntime
      >['module']

      expect(dotProductWasm(new Float64Array([1, 2, 3]), new Float64Array([4, 5]))).toBeNull()
      expect(dot).not.toHaveBeenCalled()
    })

    it('rejects mismatched subtraction vectors', () => {
      const subtract = vi.fn(() => new Float64Array([0]))
      const runtime = getWasmRuntime() as {
        ready: boolean
        module: ReturnType<typeof getWasmRuntime>['module']
      }
      runtime.ready = true
      runtime.module = { subtract_vectors_wasm: subtract } as unknown as ReturnType<
        typeof getWasmRuntime
      >['module']

      expect(subtractVectorsWasm(new Float64Array([1, 2, 3]), new Float64Array([4, 5]))).toBeNull()
      expect(subtract).not.toHaveBeenCalled()
    })
  })
})
