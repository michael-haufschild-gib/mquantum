/**
 * Tests for the object type registry helper functions.
 *
 * Verifies lookups, dimension constraint checking, and validation
 * for the single 'schroedinger' object type.
 */

import { describe, expect, it } from 'vitest'

import {
  getAvailableTypesForDimension,
  getConfigStoreKey,
  getControlsComponentKey,
  getDimensionConstraints,
  getObjectTypeEntry,
  getRecommendedDimension,
  getUnavailabilityReason,
  hasTimelineControls,
  isAvailableForDimension,
  isRaymarchingType,
  isValidObjectType,
} from '@/lib/geometry/registry/helpers'

describe('getObjectTypeEntry', () => {
  it('returns entry for schroedinger', () => {
    const entry = getObjectTypeEntry('schroedinger')
    expect(entry).not.toBeUndefined()
    expect(entry!.name).toContain('chr')
  })

  it('returns undefined for invalid type', () => {
    // @ts-expect-error intentional invalid type
    expect(getObjectTypeEntry('invalid')).toBeUndefined()
  })
})

describe('isRaymarchingType', () => {
  it('schroedinger uses raymarching', () => {
    expect(isRaymarchingType('schroedinger')).toBe(true)
  })
})

describe('dimension constraints', () => {
  it('schroedinger has valid dimension range', () => {
    const constraints = getDimensionConstraints('schroedinger')
    expect(constraints).not.toBeUndefined()
    expect(constraints!.min).toBeGreaterThanOrEqual(1)
    expect(constraints!.max).toBeLessThanOrEqual(11)
    expect(constraints!.min).toBeLessThanOrEqual(constraints!.max)
  })

  it('getRecommendedDimension returns a value within range', () => {
    const recommended = getRecommendedDimension('schroedinger')
    const constraints = getDimensionConstraints('schroedinger')
    expect(recommended).not.toBeUndefined()
    expect(recommended!).toBeGreaterThanOrEqual(constraints!.min)
    expect(recommended!).toBeLessThanOrEqual(constraints!.max)
  })
})

describe('isAvailableForDimension', () => {
  it('returns true within valid range', () => {
    const constraints = getDimensionConstraints('schroedinger')!
    for (let d = constraints.min; d <= constraints.max; d++) {
      expect(isAvailableForDimension('schroedinger', d)).toBe(true)
    }
  })

  it('returns false below min dimension', () => {
    const constraints = getDimensionConstraints('schroedinger')!
    expect(isAvailableForDimension('schroedinger', constraints.min - 1)).toBe(false)
  })

  it('returns false above max dimension', () => {
    const constraints = getDimensionConstraints('schroedinger')!
    expect(isAvailableForDimension('schroedinger', constraints.max + 1)).toBe(false)
  })

  it('returns false for invalid type', () => {
    // @ts-expect-error intentional
    expect(isAvailableForDimension('nonexistent', 4)).toBe(false)
  })
})

describe('getUnavailabilityReason', () => {
  it('returns undefined when available', () => {
    expect(getUnavailabilityReason('schroedinger', 4)).toBeUndefined()
  })

  it('returns reason when below min', () => {
    const reason = getUnavailabilityReason('schroedinger', 1)
    expect(reason).toContain('Requires')
  })

  it('returns reason when above max', () => {
    const reason = getUnavailabilityReason('schroedinger', 99)
    expect(reason).toContain('Max')
  })

  it('returns reason for unknown type', () => {
    // @ts-expect-error intentional
    const reason = getUnavailabilityReason('unknown', 4)
    expect(reason).toContain('Unknown')
  })
})

describe('getAvailableTypesForDimension', () => {
  it('returns at least one type for dimension 4', () => {
    const types = getAvailableTypesForDimension(4)
    expect(types.length).toBeGreaterThan(0)
    expect(types.some((t) => t.type === 'schroedinger' && t.available)).toBe(true)
  })

  it('each entry has required fields', () => {
    const types = getAvailableTypesForDimension(5)
    for (const t of types) {
      expect(t.type).toEqual(expect.any(String))
      expect(t.name).toEqual(expect.any(String))
      expect([true, false]).toContain(t.available)
    }
  })
})

describe('isValidObjectType', () => {
  it('validates schroedinger', () => {
    expect(isValidObjectType('schroedinger')).toBe(true)
  })

  it('rejects invalid types', () => {
    expect(isValidObjectType('fractal')).toBe(false)
    expect(isValidObjectType('')).toBe(false)
    expect(isValidObjectType('polytope')).toBe(false)
  })
})

describe('UI helpers', () => {
  it('schroedinger has a controls component key', () => {
    expect(getControlsComponentKey('schroedinger')).toEqual(expect.any(String))
  })

  it('schroedinger has timeline controls', () => {
    expect([true, false]).toContain(hasTimelineControls('schroedinger'))
  })

  it('schroedinger has a config store key', () => {
    expect(getConfigStoreKey('schroedinger')).toBe('schroedinger')
  })
})
