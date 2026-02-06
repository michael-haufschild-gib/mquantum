/**
 * Object Type Registry Tests
 *
 * Tests for the centralized object type registry and helper functions.
 * After cleanup, only 'schroedinger' remains as the sole object type.
 */

import { describe, it, expect } from 'vitest'
import {
  // Registry data
  getAllObjectTypes,
  // Core lookups
  getObjectTypeEntry,
  // Rendering capabilities
  canRenderFaces,
  canRenderEdges,
  isRaymarchingType,
  isRaymarchingFractal,
  getFaceDetectionMethod,
  determineRenderMode,
  // Dimension constraints
  getDimensionConstraints,
  isAvailableForDimension,
  getAvailableTypesForDimension,
  getRecommendedDimension,
  // Animation
  getAnimationCapabilities,
  hasTypeSpecificAnimations,
  getAvailableAnimationSystems,
  // UI
  getControlsComponentKey,
  hasTimelineControls,
  // Validation
  getValidObjectTypes,
  isValidObjectType,
  getTypeName,
  getTypeDescription,
} from '@/lib/geometry/registry'

describe('Object Type Registry', () => {
  describe('Registry Structure', () => {
    it('contains only schroedinger object type', () => {
      const types = getAllObjectTypes()
      expect(types).toHaveLength(1)
      expect(types).toContain('schroedinger')
    })

    it('returns valid entry for schroedinger', () => {
      const entry = getObjectTypeEntry('schroedinger')
      expect(entry).toBeDefined()
      expect(entry?.type).toBe('schroedinger')
      expect(entry?.name).toBeTruthy()
      expect(entry?.description).toBeTruthy()
    })

    it('returns undefined for invalid object type', () => {
      const entry = getObjectTypeEntry('invalid-type' as never)
      expect(entry).toBeUndefined()
    })
  })

  describe('Rendering Capabilities', () => {
    it('schroedinger supports faces and edges', () => {
      expect(canRenderFaces('schroedinger')).toBe(true)
      expect(canRenderEdges('schroedinger')).toBe(true)
    })

    it('isRaymarchingType identifies schroedinger as raymarched', () => {
      expect(isRaymarchingType('schroedinger')).toBe(true)
    })

    it('isRaymarchingFractal checks dimension', () => {
      expect(isRaymarchingFractal('schroedinger', 3)).toBe(true)
      expect(isRaymarchingFractal('schroedinger', 4)).toBe(true)
    })

    it('returns correct face detection method', () => {
      expect(getFaceDetectionMethod('schroedinger')).toBe('none')
    })

    it('determineRenderMode returns correct mode', () => {
      expect(determineRenderMode('schroedinger', 4)).toBe('raymarch-schroedinger')
      expect(determineRenderMode('schroedinger', 2)).toBe('none')
    })
  })

  describe('Dimension Constraints', () => {
    it('returns dimension constraints for schroedinger', () => {
      const constraints = getDimensionConstraints('schroedinger')
      expect(constraints?.min).toBe(3)
      expect(constraints?.max).toBe(11)
      expect(constraints?.recommended).toBe(4)
    })

    it('isAvailableForDimension checks constraints', () => {
      expect(isAvailableForDimension('schroedinger', 3)).toBe(true)
      expect(isAvailableForDimension('schroedinger', 11)).toBe(true)
    })

    it('getAvailableTypesForDimension returns filtered list', () => {
      const typesAt4D = getAvailableTypesForDimension(4)
      expect(typesAt4D.length).toBe(1)
      expect(typesAt4D[0]?.type).toBe('schroedinger')
      expect(typesAt4D[0]?.available).toBe(true)
    })

    it('getRecommendedDimension returns value for schroedinger', () => {
      expect(getRecommendedDimension('schroedinger')).toBe(4)
    })
  })

  describe('Animation Capabilities', () => {
    it('hasTypeSpecificAnimations returns true for schroedinger', () => {
      expect(hasTypeSpecificAnimations('schroedinger')).toBe(true)
    })

    it('getAnimationCapabilities returns animation config', () => {
      const anim = getAnimationCapabilities('schroedinger')
      expect(anim?.hasTypeSpecificAnimations).toBe(true)
      expect(Object.keys(anim?.systems ?? {})).toContain('sliceAnimation')
    })

    it('getAvailableAnimationSystems filters by dimension', () => {
      const systems4D = getAvailableAnimationSystems('schroedinger', 4)
      expect(Object.keys(systems4D)).toContain('sliceAnimation')

      const systems3D = getAvailableAnimationSystems('schroedinger', 3)
      expect(Object.keys(systems3D)).not.toContain('sliceAnimation')
    })
  })

  describe('UI Components', () => {
    it('returns controls component key for schroedinger', () => {
      expect(getControlsComponentKey('schroedinger')).toBe('SchroedingerControls')
    })

    it('hasTimelineControls returns true for schroedinger', () => {
      expect(hasTimelineControls('schroedinger')).toBe(true)
    })
  })

  describe('Validation', () => {
    it('getValidObjectTypes returns all types', () => {
      const validTypes = getValidObjectTypes()
      expect(validTypes).toHaveLength(1)
      expect(validTypes).toContain('schroedinger')
    })

    it('isValidObjectType validates correctly', () => {
      expect(isValidObjectType('schroedinger')).toBe(true)
      expect(isValidObjectType('invalid')).toBe(false)
      expect(isValidObjectType('')).toBe(false)
      expect(isValidObjectType('hypercube')).toBe(false)
    })

    it('getTypeName returns display name', () => {
      expect(getTypeName('schroedinger')).toBe('Schr\u00f6dinger Slices')
    })

    it('getTypeDescription returns description', () => {
      const desc = getTypeDescription('schroedinger')
      expect(desc).toBeTruthy()
      expect(typeof desc).toBe('string')
    })
  })
})
