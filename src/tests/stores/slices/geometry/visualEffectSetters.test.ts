/**
 * Tests for compound visual effect setters in visualEffectSetters.ts.
 *
 * Focuses on setters with custom logic beyond simple clamping: plane normal
 * normalization, PML reflection boundary rejection, window min/max ordering
 * invariant, integer-rounding setters, and raymarch quality sync.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { RAYMARCH_QUALITY_TO_SAMPLES } from '@/lib/geometry/extended/types'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

const getSchroedinger = () => useExtendedObjectStore.getState().schroedinger

describe('visualEffectSetters — compound logic', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  describe('setSchroedingerRaymarchQuality', () => {
    it('syncs sampleCount with quality preset', () => {
      for (const quality of ['fast', 'balanced', 'quality', 'ultra'] as const) {
        useExtendedObjectStore.getState().setSchroedingerRaymarchQuality(quality)
        const config = getSchroedinger()
        expect(config.raymarchQuality).toBe(quality)
        expect(config.sampleCount).toBe(RAYMARCH_QUALITY_TO_SAMPLES[quality])
      }
    })

    it('fast quality maps to fewest samples', () => {
      useExtendedObjectStore.getState().setSchroedingerRaymarchQuality('fast')
      const fastSamples = getSchroedinger().sampleCount

      useExtendedObjectStore.getState().setSchroedingerRaymarchQuality('ultra')
      const ultraSamples = getSchroedinger().sampleCount

      expect(fastSamples).toBeLessThan(ultraSamples)
    })
  })

  describe('setSchroedingerPmlTargetReflection', () => {
    it('accepts values in open interval (0, 1)', () => {
      useExtendedObjectStore.getState().setSchroedingerPmlTargetReflection(0.5)
      expect(getSchroedinger().pmlTargetReflection).toBe(0.5)

      useExtendedObjectStore.getState().setSchroedingerPmlTargetReflection(1e-12)
      expect(getSchroedinger().pmlTargetReflection).toBe(1e-12)

      useExtendedObjectStore.getState().setSchroedingerPmlTargetReflection(0.999)
      expect(getSchroedinger().pmlTargetReflection).toBe(0.999)
    })

    it('rejects exact boundary values 0 and 1', () => {
      const before = getSchroedinger().pmlTargetReflection

      useExtendedObjectStore.getState().setSchroedingerPmlTargetReflection(0)
      expect(getSchroedinger().pmlTargetReflection).toBe(before)

      useExtendedObjectStore.getState().setSchroedingerPmlTargetReflection(1)
      expect(getSchroedinger().pmlTargetReflection).toBe(before)
    })

    it('rejects negative values', () => {
      const before = getSchroedinger().pmlTargetReflection
      useExtendedObjectStore.getState().setSchroedingerPmlTargetReflection(-0.5)
      expect(getSchroedinger().pmlTargetReflection).toBe(before)
    })

    it('rejects NaN and Infinity', () => {
      const before = getSchroedinger().pmlTargetReflection
      useExtendedObjectStore.getState().setSchroedingerPmlTargetReflection(NaN)
      expect(getSchroedinger().pmlTargetReflection).toBe(before)

      useExtendedObjectStore.getState().setSchroedingerPmlTargetReflection(Infinity)
      expect(getSchroedinger().pmlTargetReflection).toBe(before)
    })
  })

  describe('cross-section plane normal normalization', () => {
    it('normalizes non-unit vectors to unit length', () => {
      useExtendedObjectStore.getState().setSchroedingerCrossSectionPlaneNormal([3, 4, 0])
      const normal = getSchroedinger().crossSectionPlaneNormal
      const length = Math.hypot(normal[0], normal[1], normal[2])
      expect(length).toBeCloseTo(1.0, 10)
      expect(normal[0]).toBeCloseTo(0.6, 5)
      expect(normal[1]).toBeCloseTo(0.8, 5)
    })

    it('falls back to [0,0,1] for zero-length vector', () => {
      useExtendedObjectStore.getState().setSchroedingerCrossSectionPlaneNormal([0, 0, 0])
      expect(getSchroedinger().crossSectionPlaneNormal).toEqual([0, 0, 1])
    })

    it('falls back to [0,0,1] for near-zero vector', () => {
      useExtendedObjectStore.getState().setSchroedingerCrossSectionPlaneNormal([1e-7, 0, 0])
      expect(getSchroedinger().crossSectionPlaneNormal).toEqual([0, 0, 1])
    })

    it('falls back to [0,0,1] for NaN components', () => {
      useExtendedObjectStore.getState().setSchroedingerCrossSectionPlaneNormal([NaN, 1, 0])
      expect(getSchroedinger().crossSectionPlaneNormal).toEqual([0, 0, 1])
    })

    it('falls back to [0,0,1] for Infinity components', () => {
      useExtendedObjectStore.getState().setSchroedingerCrossSectionPlaneNormal([Infinity, 0, 0])
      expect(getSchroedinger().crossSectionPlaneNormal).toEqual([0, 0, 1])
    })

    it('sets planeMode to free when normal is set directly', () => {
      useExtendedObjectStore.getState().setSchroedingerCrossSectionPlaneNormal([1, 0, 0])
      expect(getSchroedinger().crossSectionPlaneMode).toBe('free')
    })
  })

  describe('cross-section axis presets', () => {
    it('axis preset updates normal and sets axisAligned mode', () => {
      useExtendedObjectStore.getState().setSchroedingerCrossSectionAxis('x')
      expect(getSchroedinger().crossSectionPlaneNormal).toEqual([1, 0, 0])
      expect(getSchroedinger().crossSectionPlaneMode).toBe('axisAligned')

      useExtendedObjectStore.getState().setSchroedingerCrossSectionAxis('y')
      expect(getSchroedinger().crossSectionPlaneNormal).toEqual([0, 1, 0])

      useExtendedObjectStore.getState().setSchroedingerCrossSectionAxis('z')
      expect(getSchroedinger().crossSectionPlaneNormal).toEqual([0, 0, 1])
    })

    it('switching from free to axis resets to axisAligned mode', () => {
      useExtendedObjectStore.getState().setSchroedingerCrossSectionPlaneNormal([1, 1, 0])
      expect(getSchroedinger().crossSectionPlaneMode).toBe('free')

      useExtendedObjectStore.getState().setSchroedingerCrossSectionAxis('z')
      expect(getSchroedinger().crossSectionPlaneMode).toBe('axisAligned')
    })
  })

  describe('cross-section window ordering invariant', () => {
    it('setting min below current max preserves ordering', () => {
      useExtendedObjectStore.getState().setSchroedingerCrossSectionWindowMax(5.0)
      useExtendedObjectStore.getState().setSchroedingerCrossSectionWindowMin(2.0)
      const config = getSchroedinger()
      expect(config.crossSectionWindowMin).toBe(2.0)
      expect(config.crossSectionWindowMax).toBeGreaterThan(config.crossSectionWindowMin)
    })

    it('setting min above current max pushes max up', () => {
      useExtendedObjectStore.getState().setSchroedingerCrossSectionWindowMax(1.0)
      useExtendedObjectStore.getState().setSchroedingerCrossSectionWindowMin(3.0)
      const config = getSchroedinger()
      expect(config.crossSectionWindowMax).toBeGreaterThan(config.crossSectionWindowMin)
    })

    it('setting max below current min pushes min down', () => {
      useExtendedObjectStore.getState().setSchroedingerCrossSectionWindowMin(5.0)
      useExtendedObjectStore.getState().setSchroedingerCrossSectionWindowMax(2.0)
      const config = getSchroedinger()
      expect(config.crossSectionWindowMax).toBeGreaterThan(config.crossSectionWindowMin)
    })

    it('rejects NaN for window min', () => {
      const before = getSchroedinger().crossSectionWindowMin
      useExtendedObjectStore.getState().setSchroedingerCrossSectionWindowMin(NaN)
      expect(getSchroedinger().crossSectionWindowMin).toBe(before)
    })

    it('rejects NaN for window max', () => {
      const before = getSchroedinger().crossSectionWindowMax
      useExtendedObjectStore.getState().setSchroedingerCrossSectionWindowMax(NaN)
      expect(getSchroedinger().crossSectionWindowMax).toBe(before)
    })

    it('clamps window values to [-10, 10]', () => {
      useExtendedObjectStore.getState().setSchroedingerCrossSectionWindowMin(-20)
      expect(getSchroedinger().crossSectionWindowMin).toBe(-10)

      useExtendedObjectStore.getState().setSchroedingerCrossSectionWindowMax(20)
      expect(getSchroedinger().crossSectionWindowMax).toBe(10)
    })
  })

  describe('probabilityCurrentSteps integer clamping', () => {
    it('floors fractional values', () => {
      useExtendedObjectStore.getState().setSchroedingerProbabilityCurrentSteps(10.9)
      expect(getSchroedinger().probabilityCurrentSteps).toBe(10)
    })

    it('clamps to [4, 64]', () => {
      useExtendedObjectStore.getState().setSchroedingerProbabilityCurrentSteps(1)
      expect(getSchroedinger().probabilityCurrentSteps).toBe(4)

      useExtendedObjectStore.getState().setSchroedingerProbabilityCurrentSteps(100)
      expect(getSchroedinger().probabilityCurrentSteps).toBe(64)
    })

    it('rejects NaN', () => {
      const before = getSchroedinger().probabilityCurrentSteps
      useExtendedObjectStore.getState().setSchroedingerProbabilityCurrentSteps(NaN)
      expect(getSchroedinger().probabilityCurrentSteps).toBe(before)
    })
  })

  describe('wignerDimensionIndex integer clamping', () => {
    it('floors fractional indices', () => {
      useExtendedObjectStore.getState().setSchroedingerWignerDimensionIndex(2.7)
      expect(getSchroedinger().wignerDimensionIndex).toBe(2)
    })

    it('clamps to [0, 10]', () => {
      useExtendedObjectStore.getState().setSchroedingerWignerDimensionIndex(-1)
      expect(getSchroedinger().wignerDimensionIndex).toBe(0)

      useExtendedObjectStore.getState().setSchroedingerWignerDimensionIndex(20)
      expect(getSchroedinger().wignerDimensionIndex).toBe(10)
    })

    it('rejects NaN', () => {
      const before = getSchroedinger().wignerDimensionIndex
      useExtendedObjectStore.getState().setSchroedingerWignerDimensionIndex(NaN)
      expect(getSchroedinger().wignerDimensionIndex).toBe(before)
    })
  })

  describe('wignerQuadPoints rounding', () => {
    it('rounds to nearest integer', () => {
      useExtendedObjectStore.getState().setSchroedingerWignerQuadPoints(12.6)
      expect(getSchroedinger().wignerQuadPoints).toBe(13)
    })

    it('clamps to [8, 64]', () => {
      useExtendedObjectStore.getState().setSchroedingerWignerQuadPoints(2)
      expect(getSchroedinger().wignerQuadPoints).toBe(8)

      useExtendedObjectStore.getState().setSchroedingerWignerQuadPoints(200)
      expect(getSchroedinger().wignerQuadPoints).toBe(64)
    })

    it('rejects NaN', () => {
      const before = getSchroedinger().wignerQuadPoints
      useExtendedObjectStore.getState().setSchroedingerWignerQuadPoints(NaN)
      expect(getSchroedinger().wignerQuadPoints).toBe(before)
    })
  })

  describe('wignerCacheResolution rounding', () => {
    it('rounds to nearest integer', () => {
      useExtendedObjectStore.getState().setSchroedingerWignerCacheResolution(256.7)
      expect(getSchroedinger().wignerCacheResolution).toBe(257)
    })

    it('clamps to [128, 1024]', () => {
      useExtendedObjectStore.getState().setSchroedingerWignerCacheResolution(10)
      expect(getSchroedinger().wignerCacheResolution).toBe(128)

      useExtendedObjectStore.getState().setSchroedingerWignerCacheResolution(2000)
      expect(getSchroedinger().wignerCacheResolution).toBe(1024)
    })

    it('rejects NaN', () => {
      const before = getSchroedinger().wignerCacheResolution
      useExtendedObjectStore.getState().setSchroedingerWignerCacheResolution(NaN)
      expect(getSchroedinger().wignerCacheResolution).toBe(before)
    })
  })

  describe('classicalOverlayTrailFraction', () => {
    it('clamps to [0.1, 1.0]', () => {
      useExtendedObjectStore.getState().setSchroedingerClassicalOverlayTrailFraction(0.05)
      expect(getSchroedinger().classicalOverlayTrailFraction).toBe(0.1)

      useExtendedObjectStore.getState().setSchroedingerClassicalOverlayTrailFraction(2.0)
      expect(getSchroedinger().classicalOverlayTrailFraction).toBe(1.0)
    })

    it('rejects NaN', () => {
      const before = getSchroedinger().classicalOverlayTrailFraction
      useExtendedObjectStore.getState().setSchroedingerClassicalOverlayTrailFraction(NaN)
      expect(getSchroedinger().classicalOverlayTrailFraction).toBe(before)
    })
  })

  describe('version bumps on compound setters', () => {
    it('raymarchQuality change bumps version', () => {
      const v1 = useExtendedObjectStore.getState().schroedingerVersion
      useExtendedObjectStore.getState().setSchroedingerRaymarchQuality('ultra')
      const v2 = useExtendedObjectStore.getState().schroedingerVersion
      expect(v2).toBeGreaterThan(v1)
    })

    it('cross-section axis change bumps version', () => {
      const v1 = useExtendedObjectStore.getState().schroedingerVersion
      useExtendedObjectStore.getState().setSchroedingerCrossSectionAxis('x')
      const v2 = useExtendedObjectStore.getState().schroedingerVersion
      expect(v2).toBeGreaterThan(v1)
    })

    it('cross-section plane normal change bumps version', () => {
      const v1 = useExtendedObjectStore.getState().schroedingerVersion
      useExtendedObjectStore.getState().setSchroedingerCrossSectionPlaneNormal([1, 0, 0])
      const v2 = useExtendedObjectStore.getState().schroedingerVersion
      expect(v2).toBeGreaterThan(v1)
    })
  })
})
