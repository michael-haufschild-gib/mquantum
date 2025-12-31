/**
 * Tests for mergeWithDefaults utility
 *
 * Ensures that old saved scenes get default values for new parameters.
 */

import { describe, it, expect } from 'vitest'
import { mergeExtendedObjectState } from '@/stores/utils/mergeWithDefaults'
import {
  DEFAULT_MANDELBROT_CONFIG,
  DEFAULT_QUATERNION_JULIA_CONFIG,
} from '@/lib/geometry/extended/types'

describe('mergeExtendedObjectState', () => {
  describe('handles missing config properties', () => {
    it('fills in missing sdfMaxIterations with default for mandelbulb', () => {
      // Simulate old saved scene without the new sdfMaxIterations property
      const oldSavedState = {
        mandelbulb: {
          scale: 1.5, // User's saved value
          mandelbulbPower: 10, // User's saved value
          // sdfMaxIterations is MISSING (new property)
          // sdfSurfaceDistance is MISSING (new property)
        },
      }

      const merged = mergeExtendedObjectState(oldSavedState)
      const mandelbulb = merged.mandelbulb as typeof DEFAULT_MANDELBROT_CONFIG

      // User's saved values should be preserved
      expect(mandelbulb.scale).toBe(1.5)
      expect(mandelbulb.mandelbulbPower).toBe(10)

      // Missing values should get defaults
      expect(mandelbulb.sdfMaxIterations).toBe(DEFAULT_MANDELBROT_CONFIG.sdfMaxIterations)
      expect(mandelbulb.sdfSurfaceDistance).toBe(DEFAULT_MANDELBROT_CONFIG.sdfSurfaceDistance)
    })

    it('fills in missing sdfMaxIterations with default for quaternionJulia', () => {
      const oldSavedState = {
        quaternionJulia: {
          power: 4,
          juliaConstant: [-0.2, 0.8, 0.1, 0.0] as [number, number, number, number],
          // sdfMaxIterations is MISSING
          // sdfSurfaceDistance is MISSING
        },
      }

      const merged = mergeExtendedObjectState(oldSavedState)
      const julia = merged.quaternionJulia as typeof DEFAULT_QUATERNION_JULIA_CONFIG

      // User's saved values should be preserved
      expect(julia.power).toBe(4)
      expect(julia.juliaConstant).toEqual([-0.2, 0.8, 0.1, 0.0])

      // Missing values should get defaults
      expect(julia.sdfMaxIterations).toBe(DEFAULT_QUATERNION_JULIA_CONFIG.sdfMaxIterations)
      expect(julia.sdfSurfaceDistance).toBe(DEFAULT_QUATERNION_JULIA_CONFIG.sdfSurfaceDistance)
    })
  })

  describe('preserves existing values', () => {
    it('does not override saved sdfMaxIterations with default', () => {
      const savedState = {
        mandelbulb: {
          sdfMaxIterations: 50, // User explicitly saved this
          sdfSurfaceDistance: 0.005, // User explicitly saved this
        },
      }

      const merged = mergeExtendedObjectState(savedState)
      const mandelbulb = merged.mandelbulb as typeof DEFAULT_MANDELBROT_CONFIG

      // User's explicit values should NOT be overridden
      expect(mandelbulb.sdfMaxIterations).toBe(50)
      expect(mandelbulb.sdfSurfaceDistance).toBe(0.005)
    })
  })

  describe('handles nested objects', () => {
    it('merges nested cosineParams in quaternionJulia', () => {
      const savedState = {
        quaternionJulia: {
          cosineCoefficients: {
            a: [0.3, 0.3, 0.3] as [number, number, number],
            // b, c, d are MISSING
          },
        },
      }

      const merged = mergeExtendedObjectState(savedState)
      const julia = merged.quaternionJulia as typeof DEFAULT_QUATERNION_JULIA_CONFIG

      // User's saved nested value should be preserved
      expect(julia.cosineCoefficients.a).toEqual([0.3, 0.3, 0.3])

      // Missing nested values should get defaults
      expect(julia.cosineCoefficients.b).toEqual(
        DEFAULT_QUATERNION_JULIA_CONFIG.cosineCoefficients.b
      )
      expect(julia.cosineCoefficients.c).toEqual(
        DEFAULT_QUATERNION_JULIA_CONFIG.cosineCoefficients.c
      )
      expect(julia.cosineCoefficients.d).toEqual(
        DEFAULT_QUATERNION_JULIA_CONFIG.cosineCoefficients.d
      )
    })
  })

  describe('handles arrays correctly', () => {
    it('replaces arrays entirely instead of merging', () => {
      const savedState = {
        mandelbulb: {
          parameterValues: [0.5, 0.3], // User's 2-element array
        },
      }

      const merged = mergeExtendedObjectState(savedState)
      const mandelbulb = merged.mandelbulb as typeof DEFAULT_MANDELBROT_CONFIG

      // Arrays should be replaced, not merged
      expect(mandelbulb.parameterValues).toEqual([0.5, 0.3])
    })
  })

  describe('handles undefined/null config', () => {
    it('uses full defaults when config is undefined', () => {
      const savedState = {
        // mandelbulb is completely missing
      }

      const merged = mergeExtendedObjectState(savedState)
      const mandelbulb = merged.mandelbulb as typeof DEFAULT_MANDELBROT_CONFIG

      // Should be full defaults
      expect(mandelbulb.sdfMaxIterations).toBe(DEFAULT_MANDELBROT_CONFIG.sdfMaxIterations)
      expect(mandelbulb.scale).toBe(DEFAULT_MANDELBROT_CONFIG.scale)
    })

    it('uses full defaults when config is null', () => {
      const savedState = {
        mandelbulb: null,
      }

      const merged = mergeExtendedObjectState(savedState)
      const mandelbulb = merged.mandelbulb as typeof DEFAULT_MANDELBROT_CONFIG

      expect(mandelbulb.sdfMaxIterations).toBe(DEFAULT_MANDELBROT_CONFIG.sdfMaxIterations)
    })
  })
})
