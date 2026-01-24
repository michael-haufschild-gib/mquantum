/**
 * Tests for shared renderer base types and utilities.
 */

import { describe, expect, it } from 'vitest'
import {
  applyRotationInPlace,
  createWorkingArrays,
  MAX_DIMENSION,
  QUALITY_RESTORE_DELAY_MS,
} from '@/rendering/renderers/base/types'

describe('base/types', () => {
  describe('constants', () => {
    it('should have MAX_DIMENSION = 11', () => {
      expect(MAX_DIMENSION).toBe(11)
    })

    it('should have QUALITY_RESTORE_DELAY_MS = 150', () => {
      expect(QUALITY_RESTORE_DELAY_MS).toBe(150)
    })
  })

  describe('createWorkingArrays', () => {
    it('should create arrays with correct sizes', () => {
      const arrays = createWorkingArrays()

      expect(arrays.unitX.length).toBe(MAX_DIMENSION)
      expect(arrays.unitY.length).toBe(MAX_DIMENSION)
      expect(arrays.unitZ.length).toBe(MAX_DIMENSION)
      expect(arrays.origin.length).toBe(MAX_DIMENSION)
      expect(arrays.rotatedX.length).toBe(MAX_DIMENSION)
      expect(arrays.rotatedY.length).toBe(MAX_DIMENSION)
      expect(arrays.rotatedZ.length).toBe(MAX_DIMENSION)
      expect(arrays.rotatedOrigin.length).toBe(MAX_DIMENSION)
    })

    it('should initialize arrays to zero', () => {
      const arrays = createWorkingArrays()

      for (let i = 0; i < MAX_DIMENSION; i++) {
        expect(arrays.unitX[i]).toBe(0)
        expect(arrays.unitY[i]).toBe(0)
        expect(arrays.unitZ[i]).toBe(0)
        expect(arrays.origin[i]).toBe(0)
        expect(arrays.rotatedX[i]).toBe(0)
        expect(arrays.rotatedY[i]).toBe(0)
        expect(arrays.rotatedZ[i]).toBe(0)
        expect(arrays.rotatedOrigin[i]).toBe(0)
      }
    })

    it('should create Float32Arrays for rotated vectors', () => {
      const arrays = createWorkingArrays()

      expect(arrays.rotatedX).toBeInstanceOf(Float32Array)
      expect(arrays.rotatedY).toBeInstanceOf(Float32Array)
      expect(arrays.rotatedZ).toBeInstanceOf(Float32Array)
      expect(arrays.rotatedOrigin).toBeInstanceOf(Float32Array)
    })
  })

  describe('applyRotationInPlace', () => {
    it('should apply identity matrix without change', () => {
      const dimension = 3
      // Identity matrix (3x3, row-major)
      const identity = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
      const input = [1, 2, 3]
      const output = new Float32Array(MAX_DIMENSION)

      applyRotationInPlace(identity, input, output, dimension)

      expect(output[0]).toBeCloseTo(1)
      expect(output[1]).toBeCloseTo(2)
      expect(output[2]).toBeCloseTo(3)
    })

    it('should rotate 90 degrees around Z axis', () => {
      const dimension = 3
      // 90 degree rotation around Z (row-major): [[0, -1, 0], [1, 0, 0], [0, 0, 1]]
      const rotZ90 = new Float32Array([0, -1, 0, 1, 0, 0, 0, 0, 1])
      const input = [1, 0, 0] // Unit X vector
      const output = new Float32Array(MAX_DIMENSION)

      applyRotationInPlace(rotZ90, input, output, dimension)

      expect(output[0]).toBeCloseTo(0)
      expect(output[1]).toBeCloseTo(1)
      expect(output[2]).toBeCloseTo(0)
    })

    it('should handle higher dimensions', () => {
      const dimension = 4
      // 4x4 identity matrix
      const identity4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
      const input = [1, 2, 3, 4]
      const output = new Float32Array(MAX_DIMENSION)

      applyRotationInPlace(identity4, input, output, dimension)

      expect(output[0]).toBeCloseTo(1)
      expect(output[1]).toBeCloseTo(2)
      expect(output[2]).toBeCloseTo(3)
      expect(output[3]).toBeCloseTo(4)
    })

    it('should clear output array beyond dimension', () => {
      const dimension = 3
      const identity = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
      const input = [1, 2, 3]
      const output = new Float32Array(MAX_DIMENSION)
      // Pre-fill with non-zero values
      output.fill(999)

      applyRotationInPlace(identity, input, output, dimension)

      // Values beyond dimension should be cleared to 0
      for (let i = dimension; i < MAX_DIMENSION; i++) {
        expect(output[i]).toBe(0)
      }
    })

    it('should work with Float32Array input', () => {
      const dimension = 3
      const identity = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
      const input = new Float32Array([1, 2, 3])
      const output = new Float32Array(MAX_DIMENSION)

      applyRotationInPlace(identity, input, output, dimension)

      expect(output[0]).toBeCloseTo(1)
      expect(output[1]).toBeCloseTo(2)
      expect(output[2]).toBeCloseTo(3)
    })
  })
})
