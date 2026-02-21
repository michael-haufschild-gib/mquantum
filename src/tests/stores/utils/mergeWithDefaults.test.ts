/**
 * Tests for mergeWithDefaults utility
 *
 * Ensures that old saved scenes get default values for new parameters.
 */

import { describe, it, expect } from 'vitest'
import { mergeExtendedObjectState } from '@/stores/utils/mergeWithDefaults'
import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/types'

describe('mergeExtendedObjectState', () => {
  describe('handles missing config properties', () => {
    it('fills in missing properties with defaults for schroedinger', () => {
      // Simulate old saved scene without new properties
      const oldSavedState = {
        schroedinger: {
          scale: 1.5, // User's saved value
          quantumMode: 'hydrogenOrbital', // Legacy saved value
          // Many other properties are MISSING (simulating old save)
        },
      }

      const merged = mergeExtendedObjectState(oldSavedState)
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      // User's saved values should be preserved
      expect(schroedinger.scale).toBe(1.5)
      expect(schroedinger.quantumMode).toBe('hydrogenND')

      // Missing values should get defaults
      expect(schroedinger.densityGain).toBe(DEFAULT_SCHROEDINGER_CONFIG.densityGain)
      expect(schroedinger.sampleCount).toBe(DEFAULT_SCHROEDINGER_CONFIG.sampleCount)
      expect(schroedinger.powderScale).toBe(DEFAULT_SCHROEDINGER_CONFIG.powderScale)
    })
  })

  describe('preserves existing values', () => {
    it('does not override saved values with defaults', () => {
      const savedState = {
        schroedinger: {
          sampleCount: 64, // User explicitly saved this
          densityGain: 5.0, // User explicitly saved this
        },
      }

      const merged = mergeExtendedObjectState(savedState)
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      // User's explicit values should NOT be overridden
      expect(schroedinger.sampleCount).toBe(64)
      expect(schroedinger.densityGain).toBe(5.0)
    })

    it('drops unknown loaded keys that are not part of defaults', () => {
      const savedState = {
        schroedinger: {
          sampleCount: 64,
          mysteryExtended: 42,
          cosineParams: {
            a: [0.1, 0.2, 0.3] as [number, number, number],
            mysteryNested: true,
          },
        },
      }

      const merged = mergeExtendedObjectState(savedState)
      const schroedinger = merged.schroedinger as Record<string, unknown>
      expect(schroedinger.sampleCount).toBe(64)
      expect(schroedinger.mysteryExtended).toBeUndefined()

      const cosineParams = schroedinger.cosineParams as Record<string, unknown>
      expect(cosineParams.a).toEqual([0.1, 0.2, 0.3])
      expect(cosineParams.mysteryNested).toBeUndefined()
    })
  })

  describe('legacy uncertainty shimmer migration', () => {
    it('maps shimmer fields to uncertainty boundary fields', () => {
      const savedState = {
        schroedinger: {
          shimmerEnabled: true,
          shimmerStrength: 0.72,
        },
      }

      const merged = mergeExtendedObjectState(savedState)
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      expect((schroedinger as unknown as Record<string, unknown>).uncertaintyBoundaryEnabled).toBe(
        true
      )
      expect(
        (schroedinger as unknown as Record<string, unknown>).uncertaintyBoundaryStrength
      ).toBeCloseTo(0.72, 5)
    })
  })

  describe('handles nested objects', () => {
    it('merges nested cosineParams in schroedinger', () => {
      const savedState = {
        schroedinger: {
          cosineParams: {
            a: [0.3, 0.3, 0.3] as [number, number, number],
            // b, c, d are MISSING
          },
        },
      }

      const merged = mergeExtendedObjectState(savedState)
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      // User's saved nested value should be preserved
      expect(schroedinger.cosineParams.a).toEqual([0.3, 0.3, 0.3])

      // Missing nested values should get defaults
      expect(schroedinger.cosineParams.b).toEqual(
        DEFAULT_SCHROEDINGER_CONFIG.cosineParams.b
      )
      expect(schroedinger.cosineParams.c).toEqual(
        DEFAULT_SCHROEDINGER_CONFIG.cosineParams.c
      )
      expect(schroedinger.cosineParams.d).toEqual(
        DEFAULT_SCHROEDINGER_CONFIG.cosineParams.d
      )
    })
  })

  describe('handles arrays correctly', () => {
    it('replaces arrays entirely instead of merging', () => {
      const savedState = {
        schroedinger: {
          parameterValues: [0.5, 0.3], // User's 2-element array
        },
      }

      const merged = mergeExtendedObjectState(savedState)
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      // Arrays should be replaced, not merged
      expect(schroedinger.parameterValues).toEqual([0.5, 0.3])
    })
  })

  describe('handles undefined/null config', () => {
    it('uses full defaults when config is undefined', () => {
      const savedState = {
        // schroedinger is completely missing
      }

      const merged = mergeExtendedObjectState(savedState)
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      // Should be full defaults
      expect(schroedinger.sampleCount).toBe(DEFAULT_SCHROEDINGER_CONFIG.sampleCount)
      expect(schroedinger.scale).toBe(DEFAULT_SCHROEDINGER_CONFIG.scale)
    })

    it('uses full defaults when config is null', () => {
      const savedState = {
        schroedinger: null,
      }

      const merged = mergeExtendedObjectState(savedState)
      const schroedinger = merged.schroedinger as typeof DEFAULT_SCHROEDINGER_CONFIG

      expect(schroedinger.sampleCount).toBe(DEFAULT_SCHROEDINGER_CONFIG.sampleCount)
    })
  })
})
