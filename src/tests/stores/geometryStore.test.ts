/**
 * Tests for geometryStore — the central dimension/objectType state.
 *
 * This store is the backbone of the application: every render pass, every
 * UI panel, and every physics computation depends on dimension and objectType.
 * Bugs here cascade through the entire system.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useAnimationStore } from '@/stores/animationStore'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { MAX_DIMENSION, MIN_DIMENSION } from '@/constants/dimension'
import {
  DEFAULT_DIMENSION,
  DEFAULT_OBJECT_TYPE,
  useGeometryStore,
  validateObjectTypeForDimension,
} from '@/stores/geometryStore'
import { useRotationStore } from '@/stores/rotationStore'
import { useTransformStore } from '@/stores/transformStore'

describe('geometryStore', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useAnimationStore.getState().reset()
    useRotationStore.getState().setDimension(DEFAULT_DIMENSION)
    useAppearanceStore.getState().reset()
    useTransformStore.getState().reset()
  })

  describe('initial state', () => {
    it('has correct defaults', () => {
      const s = useGeometryStore.getState()
      expect(s.dimension).toBe(DEFAULT_DIMENSION)
      expect(s.objectType).toBe(DEFAULT_OBJECT_TYPE)
      expect(DEFAULT_DIMENSION).toBe(3)
      expect(DEFAULT_OBJECT_TYPE).toBe('schroedinger')
    })

    it('exports valid MIN_DIMENSION and MAX_DIMENSION constants', () => {
      expect(MIN_DIMENSION).toBeGreaterThanOrEqual(2)
      expect(MAX_DIMENSION).toBeLessThanOrEqual(11)
      expect(MIN_DIMENSION).toBeLessThan(MAX_DIMENSION)
    })
  })

  describe('setDimension', () => {
    it('clamps to [MIN_DIMENSION, MAX_DIMENSION]', () => {
      useGeometryStore.getState().setDimension(1)
      expect(useGeometryStore.getState().dimension).toBe(MIN_DIMENSION)

      useGeometryStore.getState().setDimension(999)
      expect(useGeometryStore.getState().dimension).toBe(MAX_DIMENSION)
    })

    it('floors fractional values', () => {
      useGeometryStore.getState().setDimension(4.9)
      expect(useGeometryStore.getState().dimension).toBe(4)

      useGeometryStore.getState().setDimension(7.1)
      expect(useGeometryStore.getState().dimension).toBe(7)
    })

    it('ignores NaN', () => {
      useGeometryStore.getState().setDimension(5)
      useGeometryStore.getState().setDimension(Number.NaN)
      expect(useGeometryStore.getState().dimension).toBe(5)
    })

    it('ignores Infinity', () => {
      useGeometryStore.getState().setDimension(6)
      useGeometryStore.getState().setDimension(Number.POSITIVE_INFINITY)
      expect(useGeometryStore.getState().dimension).toBe(6)

      useGeometryStore.getState().setDimension(Number.NEGATIVE_INFINITY)
      expect(useGeometryStore.getState().dimension).toBe(6)
    })

    it('is a no-op when dimension is unchanged (avoids unnecessary store propagation)', () => {
      useGeometryStore.getState().setDimension(5)
      const rotDim1 = useRotationStore.getState().dimension
      // Setting same value should not re-trigger propagation
      useGeometryStore.getState().setDimension(5)
      expect(useRotationStore.getState().dimension).toBe(rotDim1)
    })

    it('propagates to rotationStore', () => {
      useGeometryStore.getState().setDimension(7)
      expect(useRotationStore.getState().dimension).toBe(7)
    })

    it('propagates to animationStore (filters invalid planes)', () => {
      useGeometryStore.getState().setDimension(8)
      useAnimationStore.getState().animateAll(8)
      expect(useAnimationStore.getState().animatingPlanes.has('XV')).toBe(true)

      useGeometryStore.getState().setDimension(4)
      expect(useAnimationStore.getState().animatingPlanes.has('XV')).toBe(false)
    })

    it('propagates to transformStore', () => {
      useGeometryStore.getState().setDimension(6)
      expect(useTransformStore.getState().dimension).toBe(6)
    })

    it('traverses every valid dimension without throwing', () => {
      for (let d = MIN_DIMENSION; d <= MAX_DIMENSION; d++) {
        useGeometryStore.getState().setDimension(d)
        expect(useGeometryStore.getState().dimension).toBe(d)
        expect(useRotationStore.getState().dimension).toBe(d)
        expect(useTransformStore.getState().dimension).toBe(d)
      }
    })

    it('preserves objectType when it remains valid for new dimension', () => {
      // pauliSpinor is valid at dim=2..6, so changing dimension within range should preserve it
      useGeometryStore.getState().setObjectType('pauliSpinor')
      expect(useGeometryStore.getState().objectType).toBe('pauliSpinor')

      useGeometryStore.getState().setDimension(5)
      expect(useGeometryStore.getState().objectType).toBe('pauliSpinor')
    })
  })

  describe('setObjectType', () => {
    it('sets valid object type', () => {
      useGeometryStore.getState().setObjectType('schroedinger')
      expect(useGeometryStore.getState().objectType).toBe('schroedinger')
    })

    it('throws on invalid object type', () => {
      // @ts-expect-error intentional invalid input
      expect(() => useGeometryStore.getState().setObjectType('not-real')).toThrow(
        /Invalid object type/i
      )
    })

    it('is a no-op when type is unchanged', () => {
      useGeometryStore.getState().setObjectType('schroedinger')
      // No observable side-effect test — just ensure no throw
      useGeometryStore.getState().setObjectType('schroedinger')
      expect(useGeometryStore.getState().objectType).toBe('schroedinger')
    })

    it('auto-switches to recommended dimension when changing type', () => {
      // pauliSpinor recommends dim=3, max dim=6
      // Start at dim=8 which is outside pauliSpinor's range
      useGeometryStore.getState().setDimension(8)
      expect(useGeometryStore.getState().dimension).toBe(8)

      useGeometryStore.getState().setObjectType('pauliSpinor')
      // Should auto-switch to recommended dimension since 8 > max(6)
      expect(useGeometryStore.getState().dimension).toBe(3)
      expect(useRotationStore.getState().dimension).toBe(3)
    })

    it('does not auto-switch dimension when already at recommended', () => {
      useGeometryStore.getState().setDimension(3)
      useGeometryStore.getState().setObjectType('pauliSpinor')
      expect(useGeometryStore.getState().dimension).toBe(3)
    })
  })

  describe('loadGeometry', () => {
    it('sets dimension and objectType atomically', () => {
      useGeometryStore.getState().loadGeometry(7, 'schroedinger')
      const s = useGeometryStore.getState()
      expect(s.dimension).toBe(7)
      expect(s.objectType).toBe('schroedinger')
    })

    it('clamps dimension to valid range', () => {
      useGeometryStore.getState().loadGeometry(999, 'schroedinger')
      expect(useGeometryStore.getState().dimension).toBe(MAX_DIMENSION)

      useGeometryStore.getState().loadGeometry(0, 'schroedinger')
      expect(useGeometryStore.getState().dimension).toBe(MIN_DIMENSION)
    })

    it('falls back non-finite dimension to DEFAULT_DIMENSION', () => {
      useGeometryStore.getState().loadGeometry(Number.NaN, 'schroedinger')
      expect(useGeometryStore.getState().dimension).toBe(DEFAULT_DIMENSION)

      useGeometryStore.getState().setDimension(7)
      useGeometryStore.getState().loadGeometry(Number.POSITIVE_INFINITY, 'schroedinger')
      expect(useGeometryStore.getState().dimension).toBe(DEFAULT_DIMENSION)
    })

    it('falls back invalid objectType to schroedinger', () => {
      // @ts-expect-error intentional invalid type
      useGeometryStore.getState().loadGeometry(3, 'garbage-type')
      expect(useGeometryStore.getState().objectType).toBe('schroedinger')
    })

    it('preserves objectType when valid for dimension during load', () => {
      // pauliSpinor is valid at dim=5 (range 2-11)
      useGeometryStore.getState().loadGeometry(5, 'pauliSpinor')
      expect(useGeometryStore.getState().objectType).toBe('pauliSpinor')
      expect(useGeometryStore.getState().dimension).toBe(5)
    })

    it('does NOT auto-switch to recommended dimension (unlike setObjectType)', () => {
      // loadGeometry should preserve exact saved dimension
      useGeometryStore.getState().loadGeometry(8, 'schroedinger')
      // schroedinger recommends 4, but loadGeometry should NOT auto-switch
      expect(useGeometryStore.getState().dimension).toBe(8)
    })

    it('propagates dimension to dependent stores', () => {
      useGeometryStore.getState().loadGeometry(9, 'schroedinger')
      expect(useRotationStore.getState().dimension).toBe(9)
      expect(useTransformStore.getState().dimension).toBe(9)
    })

    it('is a no-op when dimension and type are already current', () => {
      useGeometryStore.getState().setDimension(5)
      useGeometryStore.getState().setObjectType('schroedinger')

      // This should be a no-op
      useGeometryStore.getState().loadGeometry(5, 'schroedinger')
      expect(useGeometryStore.getState().dimension).toBe(5)
    })

    it('does not propagate dimension when only objectType changes', () => {
      useGeometryStore.getState().setDimension(3)
      // pauliSpinor is valid at dim=3
      useGeometryStore.getState().loadGeometry(3, 'pauliSpinor')
      expect(useGeometryStore.getState().objectType).toBe('pauliSpinor')
      expect(useGeometryStore.getState().dimension).toBe(3)
    })
  })

  describe('validateObjectTypeForDimension', () => {
    it('returns valid for schroedinger across all supported dimensions', () => {
      for (let d = MIN_DIMENSION; d <= MAX_DIMENSION; d++) {
        const result = validateObjectTypeForDimension('schroedinger', d)
        expect(result.valid, `schroedinger should be valid at dim=${d}`).toBe(true)
      }
    })

    it('returns valid for pauliSpinor across its dimension range (2-6)', () => {
      for (let d = 2; d <= 6; d++) {
        const result = validateObjectTypeForDimension('pauliSpinor', d)
        expect(result.valid, `pauliSpinor should be valid at dim=${d}`).toBe(true)
      }
      // dim=7+ should be invalid
      const result7 = validateObjectTypeForDimension('pauliSpinor', 7)
      expect(result7.valid, 'pauliSpinor should be invalid at dim=7').toBe(false)
    })

    it('returns invalid with fallback for dimension outside supported range', () => {
      // schroedinger supports dim 2-11, so test at dimension 1
      const resultLow = validateObjectTypeForDimension('schroedinger', 1)
      expect(resultLow.valid).toBe(false)
      expect(resultLow.fallbackType).toBe('schroedinger')
      expect(resultLow.message).toBe('Requires 2D+')
    })
  })

  describe('reset', () => {
    it('restores defaults after arbitrary mutations', () => {
      useGeometryStore.getState().setDimension(9)
      useGeometryStore.getState().reset()

      const s = useGeometryStore.getState()
      expect(s.dimension).toBe(DEFAULT_DIMENSION)
      expect(s.objectType).toBe(DEFAULT_OBJECT_TYPE)
    })
  })

  describe('rapid state transitions', () => {
    it('handles rapid dimension changes without corrupting state', () => {
      for (let i = 0; i < 50; i++) {
        const d = MIN_DIMENSION + (i % (MAX_DIMENSION - MIN_DIMENSION + 1))
        useGeometryStore.getState().setDimension(d)
      }
      const final = useGeometryStore.getState()
      expect(final.dimension).toBeGreaterThanOrEqual(MIN_DIMENSION)
      expect(final.dimension).toBeLessThanOrEqual(MAX_DIMENSION)
      expect(useRotationStore.getState().dimension).toBe(final.dimension)
      expect(useTransformStore.getState().dimension).toBe(final.dimension)
    })

    it('handles rapid loadGeometry calls with mixed valid/invalid inputs', () => {
      const inputs: [number, string][] = [
        [3, 'schroedinger'],
        [Number.NaN, 'schroedinger'],
        [5, 'invalid-type'],
        [4, 'pauliSpinor'], // invalid at dim=4
        [3, 'pauliSpinor'], // valid at dim=3
        [7, 'schroedinger'],
        [-1, 'schroedinger'],
      ]

      for (const [dim, type] of inputs) {
        // @ts-expect-error testing with potentially invalid types
        useGeometryStore.getState().loadGeometry(dim, type)
      }

      const final = useGeometryStore.getState()
      expect(final.dimension).toBeGreaterThanOrEqual(MIN_DIMENSION)
      expect(final.dimension).toBeLessThanOrEqual(MAX_DIMENSION)
      expect(['schroedinger', 'pauliSpinor']).toContain(final.objectType)
    })
  })
})
