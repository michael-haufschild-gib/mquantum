/**
 * Object Type Registry Tests
 *
 * Tests for the centralized object type registry and helper functions.
 * Only 'schroedinger' exists as the sole object type.
 */

import { describe, expect, it } from 'vitest'

import {
  getAvailableTypesForDimension,
  getConfigStoreKey,
  // UI
  getControlsComponentKey,
  // Dimension constraints
  getDimensionConstraints,
  // Core lookups
  getObjectTypeEntry,
  getRecommendedDimension,
  hasTimelineControls,
  isAvailableForDimension,
  // Rendering capabilities
  isRaymarchingType,
  // Validation
  isValidObjectType,
  // Registry data
  OBJECT_TYPE_REGISTRY,
} from '@/lib/geometry/registry'
import { getControlsComponent, hasControlsComponent } from '@/lib/geometry/registry/components'

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
      expect(entry).toMatchObject({ type: 'schroedinger' })
      expect(entry?.name).toBe('Schrödinger Slices')
      expect(entry?.description.length).toBeGreaterThan(10)
    })

    it('returns undefined for invalid object type', () => {
      const entry = getObjectTypeEntry('invalid-type' as never)
      expect(entry).toBeUndefined()
    })
  })

  describe('pauliSpinor entry', () => {
    it('returns valid entry for pauliSpinor', () => {
      const entry = getObjectTypeEntry('pauliSpinor')
      expect(entry).toMatchObject({ type: 'pauliSpinor' })
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

  describe('Component Loader', () => {
    it('hasControlsComponent returns true for registered keys', () => {
      expect(hasControlsComponent('SchroedingerControls')).toBe(true)
      expect(hasControlsComponent('PauliSpinorControls')).toBe(true)
    })

    it('hasControlsComponent returns false for unknown keys', () => {
      expect(hasControlsComponent('NonexistentControls')).toBe(false)
      expect(hasControlsComponent('')).toBe(false)
    })

    it('getControlsComponent returns a lazy component for registered keys', () => {
      const component = getControlsComponent('SchroedingerControls')
      // React.lazy components have $$typeof set to the lazy symbol
      expect(component).toHaveProperty('$$typeof')
    })

    it('getControlsComponent returns null for unknown keys', () => {
      const component = getControlsComponent('UnknownControls')
      expect(component).toBe(null)
    })

    it('getControlsComponent caches results (second call returns same ref)', () => {
      const first = getControlsComponent('SchroedingerControls')
      const second = getControlsComponent('SchroedingerControls')
      expect(first).toBe(second)
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
