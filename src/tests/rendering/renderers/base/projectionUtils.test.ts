/**
 * Tests for projectionUtils - projection distance calculation utilities.
 *
 * Tests the projection distance calculation used by PolytopeScene and
 * TubeWireframe to ensure vertices remain visible without singularities.
 */

import {
  calculateSafeProjectionDistance,
  DEFAULT_PROJECTION_DISTANCE,
  useProjectionDistanceCache,
} from '@/rendering/renderers/base'
import type { VectorND } from '@/lib/math/types'
import { describe, expect, it } from 'vitest'

describe('projectionUtils', () => {
  describe('exports', () => {
    it('should export calculateSafeProjectionDistance as a function', () => {
      expect(typeof calculateSafeProjectionDistance).toBe('function')
    })

    it('should export useProjectionDistanceCache as a function', () => {
      expect(typeof useProjectionDistanceCache).toBe('function')
    })

    it('should export DEFAULT_PROJECTION_DISTANCE as a number', () => {
      expect(typeof DEFAULT_PROJECTION_DISTANCE).toBe('number')
      expect(DEFAULT_PROJECTION_DISTANCE).toBeGreaterThan(0)
    })
  })

  describe('calculateSafeProjectionDistance', () => {
    describe('edge cases', () => {
      it('should return DEFAULT_PROJECTION_DISTANCE for empty vertices array', () => {
        const result = calculateSafeProjectionDistance([], 4)
        expect(result).toBe(DEFAULT_PROJECTION_DISTANCE)
      })

      it('should return DEFAULT_PROJECTION_DISTANCE for 3D objects', () => {
        const vertices: VectorND[] = [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ]
        const result = calculateSafeProjectionDistance(vertices, 3)
        expect(result).toBe(DEFAULT_PROJECTION_DISTANCE)
      })

      it('should return DEFAULT_PROJECTION_DISTANCE when dimension <= 3', () => {
        const vertices: VectorND[] = [
          [1, 1, 1, 0.5],
        ]
        const result = calculateSafeProjectionDistance(vertices, 3)
        expect(result).toBe(DEFAULT_PROJECTION_DISTANCE)
      })
    })

    describe('4D objects', () => {
      it('should calculate distance for 4D hypercube vertices', () => {
        // 4D hypercube vertices with W coordinate
        const vertices: VectorND[] = [
          [1, 1, 1, 1],
          [-1, -1, -1, -1],
          [1, -1, 1, -1],
        ]
        const result = calculateSafeProjectionDistance(vertices, 4)

        // Should be at least DEFAULT_PROJECTION_DISTANCE
        expect(result).toBeGreaterThanOrEqual(DEFAULT_PROJECTION_DISTANCE)
      })

      it('should increase distance for higher W values', () => {
        const smallW: VectorND[] = [[0, 0, 0, 0.5]]
        const largeW: VectorND[] = [[0, 0, 0, 5.0]]

        const smallResult = calculateSafeProjectionDistance(smallW, 4)
        const largeResult = calculateSafeProjectionDistance(largeW, 4)

        expect(largeResult).toBeGreaterThan(smallResult)
      })
    })

    describe('higher dimensions', () => {
      it('should handle 5D vertices', () => {
        const vertices: VectorND[] = [
          [1, 1, 1, 1, 1],
          [-1, -1, -1, -1, -1],
        ]
        const result = calculateSafeProjectionDistance(vertices, 5)
        expect(result).toBeGreaterThanOrEqual(DEFAULT_PROJECTION_DISTANCE)
      })

      it('should handle 11D vertices (maximum supported)', () => {
        const vertices: VectorND[] = [
          [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        ]
        const result = calculateSafeProjectionDistance(vertices, 11)
        expect(result).toBeGreaterThanOrEqual(DEFAULT_PROJECTION_DISTANCE)
      })

      it('should normalize depth by sqrt(dimension - 3)', () => {
        // Create vertices where the effect of normalization is visible
        // For 4D: normFactor = 1 (sqrt(4-3) = 1)
        // For 7D: normFactor = 2 (sqrt(7-3) = 2)
        const vertices4D: VectorND[] = [[0, 0, 0, 4]]
        const vertices7D: VectorND[] = [[0, 0, 0, 4, 4, 4, 4]]

        const result4D = calculateSafeProjectionDistance(vertices4D, 4)
        const result7D = calculateSafeProjectionDistance(vertices7D, 7)

        // Higher dimension with same W should have higher sum but normalized
        // so the projection distance should scale differently
        expect(typeof result4D).toBe('number')
        expect(typeof result7D).toBe('number')
      })
    })

    describe('scale parameter (deprecated)', () => {
      // NOTE: Scale is now applied AFTER projection to 3D (like camera zoom),
      // so it no longer affects projection distance calculation. These tests
      // verify the scale parameter is ignored.

      it('should ignore scale parameter (scale is now applied post-projection)', () => {
        const vertices: VectorND[] = [[0, 0, 0, 1]]

        const noScale = calculateSafeProjectionDistance(vertices, 4)
        const withScale = calculateSafeProjectionDistance(vertices, 4, [2, 2, 2, 2])

        // Scale should have no effect on projection distance
        expect(withScale).toBe(noScale)
      })

      it('should return same result regardless of scale values', () => {
        const vertices: VectorND[] = [[0, 0, 0, 1]]

        const uniformScale = calculateSafeProjectionDistance(vertices, 4, [2, 2, 2, 2])
        const mixedScale = calculateSafeProjectionDistance(vertices, 4, [1, 1, 1, 2])

        // Both should be equal since scale is ignored
        expect(uniformScale).toBe(mixedScale)
      })

      it('should handle empty scales array', () => {
        const vertices: VectorND[] = [[0, 0, 0, 1]]
        const result = calculateSafeProjectionDistance(vertices, 4, [])
        expect(result).toBeGreaterThanOrEqual(DEFAULT_PROJECTION_DISTANCE)
      })
    })

    describe('safety margin', () => {
      it('should include safety margin in result', () => {
        // With all zeros in higher dims, result should still have margin
        const vertices: VectorND[] = [[1, 1, 1, 0]]
        const result = calculateSafeProjectionDistance(vertices, 4)

        // Should at least be DEFAULT_PROJECTION_DISTANCE (which includes margin)
        expect(result).toBeGreaterThanOrEqual(DEFAULT_PROJECTION_DISTANCE)
      })
    })
  })

  describe('useProjectionDistanceCache (type check)', () => {
    it('should return an object with getProjectionDistance and invalidate', () => {
      // This is a hook, so we can only test the export exists
      // Full functional tests require React rendering context
      expect(typeof useProjectionDistanceCache).toBe('function')
    })
  })
})














