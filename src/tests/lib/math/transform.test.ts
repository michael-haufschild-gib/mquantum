/**
 * Tests for n-dimensional transformation operations
 */

import { describe, it, expect } from 'vitest'
import { createScaleMatrix, multiplyMatrixVector } from '@/lib/math'

describe('Transform Operations', () => {
  describe('createScaleMatrix', () => {
    it('creates non-uniform scale matrix', () => {
      const S = createScaleMatrix(3, [2, 3, 4])
      expect(S).toEqual(new Float32Array([2, 0, 0, 0, 3, 0, 0, 0, 4]))
    })

    it('scales vector correctly', () => {
      const S = createScaleMatrix(3, [2, 3, 4])
      const v = [1, 1, 1]
      const scaled = multiplyMatrixVector(S, v)
      expect(scaled).toEqual([2, 3, 4])
    })

    it('works with 4D', () => {
      const S = createScaleMatrix(4, [1, 2, 3, 4])
      const v = [5, 5, 5, 5]
      const scaled = multiplyMatrixVector(S, v)
      expect(scaled).toEqual([5, 10, 15, 20])
    })

    it('throws error if scales array length does not match dimension', () => {
      expect(() => createScaleMatrix(3, [1, 2])).toThrow()
      expect(() => createScaleMatrix(3, [1, 2, 3, 4])).toThrow()
    })

    it('handles negative scale (reflection)', () => {
      const S = createScaleMatrix(3, [-1, 1, 1])
      const v = [1, 2, 3]
      const scaled = multiplyMatrixVector(S, v)
      expect(scaled).toEqual([-1, 2, 3])
    })

    it('throws error if any scale factor is non-finite', () => {
      expect(() => createScaleMatrix(3, [1, Number.NaN, 1])).toThrow('finite')
      expect(() => createScaleMatrix(3, [1, Number.POSITIVE_INFINITY, 1])).toThrow('finite')
    })
  })
})
