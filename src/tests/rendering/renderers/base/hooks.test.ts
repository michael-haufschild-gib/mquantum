/**
 * Tests for shared renderer base hooks.
 *
 * Note: These tests focus on the hook exports and types rather than
 * full integration testing, since hooks require React rendering context.
 * Integration tests would be done via Playwright E2E tests.
 */

import {
  calculateSafeProjectionDistance,
  DEFAULT_PROJECTION_DISTANCE,
  useProjectionDistanceCache,
  useQualityTracking,
  useRotationUpdates,
} from '@/rendering/renderers/base'
import { describe, expect, it } from 'vitest'

describe('base/hooks exports', () => {
  describe('useQualityTracking', () => {
    it('should be exported as a function', () => {
      expect(typeof useQualityTracking).toBe('function')
    })
  })

  describe('useRotationUpdates', () => {
    it('should be exported as a function', () => {
      expect(typeof useRotationUpdates).toBe('function')
    })
  })

  describe('useProjectionDistanceCache', () => {
    it('should be exported as a function', () => {
      expect(typeof useProjectionDistanceCache).toBe('function')
    })
  })

  describe('calculateSafeProjectionDistance', () => {
    it('should be exported as a function', () => {
      expect(typeof calculateSafeProjectionDistance).toBe('function')
    })
  })

  describe('DEFAULT_PROJECTION_DISTANCE', () => {
    it('should be exported as a number', () => {
      expect(typeof DEFAULT_PROJECTION_DISTANCE).toBe('number')
      expect(DEFAULT_PROJECTION_DISTANCE).toBeGreaterThan(0)
    })
  })
})
