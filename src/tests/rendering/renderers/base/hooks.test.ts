/**
 * Tests for shared renderer base hooks.
 *
 * Note: These tests focus on the hook exports and types rather than
 * full integration testing, since hooks require React rendering context.
 * Integration tests would be done via Playwright E2E tests.
 */

import { useRotationUpdates } from '@/rendering/renderers/base'
import { describe, expect, it } from 'vitest'

describe('base/hooks exports', () => {
  describe('useRotationUpdates', () => {
    it('should be exported as a function', () => {
      expect(typeof useRotationUpdates).toBe('function')
    })
  })
})
