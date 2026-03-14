/**
 * Object Type Registry Tests
 *
 * Tests for the centralized object type registry and helper functions.
 * Only 'schroedinger' exists as the sole object type.
 */

import { describe, it, expect } from 'vitest'
import {
  // Registry data
  OBJECT_TYPE_REGISTRY,
  // Core lookups
  getObjectTypeEntry,
  // Rendering capabilities
  isRaymarchingType,
  // Dimension constraints
  getDimensionConstraints,
  isAvailableForDimension,
  getAvailableTypesForDimension,
  getRecommendedDimension,
  // UI
  getControlsComponentKey,
  hasTimelineControls,
  // Validation
  isValidObjectType,
  getConfigStoreKey,
} from '@/lib/geometry/registry'

describe('Object Type Registry', () => {
  describe('Registry Structure', () => {
    it('contains schroedinger and pauliSpinor object types', () => {
      const types = Array.from(OBJECT_TYPE_REGISTRY.keys())
      expect(types).toHaveLength(2)
      expect(types).toContain('schroedinger')
      expect(types).toContain('pauliSpinor')
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

  describe('pauliSpinor entry', () => {
    it('returns valid entry for pauliSpinor', () => {
      const entry = getObjectTypeEntry('pauliSpinor')
      expect(entry).toBeDefined()
      expect(entry?.type).toBe('pauliSpinor')
      expect(entry?.configStoreKey).toBe('pauliSpinor')
    })

    it('pauliSpinor recommends 3D', () => {
      expect(getRecommendedDimension('pauliSpinor')).toBe(3)
    })

    it('pauliSpinor controls component key is PauliSpinorControls', () => {
      expect(getControlsComponentKey('pauliSpinor')).toBe('PauliSpinorControls')
    })

    it('pauliSpinor has timeline controls', () => {
      expect(hasTimelineControls('pauliSpinor')).toBe(true)
    })

    it('pauliSpinor config store key is pauliSpinor', () => {
      expect(getConfigStoreKey('pauliSpinor')).toBe('pauliSpinor')
    })

    it('isValidObjectType accepts pauliSpinor', () => {
      expect(isValidObjectType('pauliSpinor')).toBe(true)
    })
  })

  describe('Rendering Capabilities', () => {
    it('isRaymarchingType identifies schroedinger as raymarched', () => {
      expect(isRaymarchingType('schroedinger')).toBe(true)
    })

    it('isRaymarchingType identifies pauliSpinor as raymarched', () => {
      expect(isRaymarchingType('pauliSpinor')).toBe(true)
    })
  })

  describe('Dimension Constraints', () => {
    it('returns dimension constraints for schroedinger', () => {
      const constraints = getDimensionConstraints('schroedinger')
      expect(constraints?.min).toBe(2)
      expect(constraints?.max).toBe(11)
      expect(constraints?.recommended).toBe(4)
    })

    it('isAvailableForDimension checks constraints', () => {
      expect(isAvailableForDimension('schroedinger', 3)).toBe(true)
      expect(isAvailableForDimension('schroedinger', 11)).toBe(true)
    })

    it('getAvailableTypesForDimension returns filtered list', () => {
      const typesAt4D = getAvailableTypesForDimension(4)
      expect(typesAt4D.length).toBe(2)
      const types = typesAt4D.map((t) => t.type)
      expect(types).toContain('schroedinger')
      expect(types).toContain('pauliSpinor')
      expect(typesAt4D.every((t) => t.available)).toBe(true)
    })

    it('getRecommendedDimension returns value for schroedinger', () => {
      expect(getRecommendedDimension('schroedinger')).toBe(4)
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
    it('isValidObjectType validates correctly', () => {
      expect(isValidObjectType('schroedinger')).toBe(true)
      expect(isValidObjectType('invalid')).toBe(false)
      expect(isValidObjectType('')).toBe(false)
      expect(isValidObjectType('hypercube')).toBe(false)
    })

    it('getConfigStoreKey returns correct key', () => {
      expect(getConfigStoreKey('schroedinger')).toBe('schroedinger')
    })
  })
})
