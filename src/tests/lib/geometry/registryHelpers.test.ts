/**
 * Tests for the object type registry helper functions.
 *
 * Verifies lookups, dimension constraint checking, and validation
 * for the supported ObjectTypes ('schroedinger', 'pauliSpinor').
 *
 * The per-ObjectType view is derived from QUANTUM_TYPE_REGISTRY by helpers
 * — there is no separate ObjectType registry constant.
 */

import { describe, expect, it } from 'vitest'

import {
  getAvailableTypesForDimension,
  getConfigStoreKey,
  getControlsComponentKey,
  getDimensionConstraints,
  getRecommendedDimension,
  getUnavailabilityReason,
  hasTimelineControls,
  isAvailableForDimension,
  isRaymarchingType,
  isValidObjectType,
} from '@/lib/geometry/registry/helpers'

describe('per-ObjectType helper aggregation', () => {
  it('returns derived facts for registered object types', () => {
    expect(getDimensionConstraints('schroedinger')).toMatchObject({ min: 2, max: 11 })
    expect(getControlsComponentKey('schroedinger')).toBe('SchroedingerControls')
    expect(getConfigStoreKey('schroedinger')).toBe('schroedinger')

    expect(getDimensionConstraints('pauliSpinor')).toMatchObject({ min: 3, max: 6 })
    expect(getControlsComponentKey('pauliSpinor')).toBe('PauliSpinorControls')
    expect(getConfigStoreKey('pauliSpinor')).toBe('pauliSpinor')
  })

  it('returns undefined for invalid type', () => {
    // @ts-expect-error intentional invalid type
    expect(getDimensionConstraints('invalid')).toBeUndefined()
    // @ts-expect-error intentional invalid type
    expect(getControlsComponentKey('invalid')).toBeUndefined()
    // @ts-expect-error intentional invalid type
    expect(getConfigStoreKey('invalid')).toBeUndefined()
  })
})

describe('isRaymarchingType', () => {
  it('all registered object types use raymarching', () => {
    expect(isRaymarchingType('schroedinger')).toBe(true)
    expect(isRaymarchingType('pauliSpinor')).toBe(true)
  })
})

describe('dimension constraints', () => {
  it('returns exact dimension ranges', () => {
    expect(getDimensionConstraints('schroedinger')).toMatchObject({
      min: 2,
      max: 11,
      recommended: 4,
    })
    expect(getDimensionConstraints('pauliSpinor')).toMatchObject({
      min: 3,
      max: 6,
      recommended: 3,
    })
  })

  it('returns exact recommended dimensions', () => {
    expect(getRecommendedDimension('schroedinger')).toBe(4)
    expect(getRecommendedDimension('pauliSpinor')).toBe(3)
  })
})

describe('isAvailableForDimension', () => {
  it('returns true at inclusive bounds for each object type', () => {
    expect(isAvailableForDimension('schroedinger', 2)).toBe(true)
    expect(isAvailableForDimension('schroedinger', 11)).toBe(true)
    expect(isAvailableForDimension('pauliSpinor', 3)).toBe(true)
    expect(isAvailableForDimension('pauliSpinor', 6)).toBe(true)
  })

  it('returns false outside each range', () => {
    expect(isAvailableForDimension('schroedinger', 1)).toBe(false)
    expect(isAvailableForDimension('schroedinger', 12)).toBe(false)
    expect(isAvailableForDimension('pauliSpinor', 2)).toBe(false)
    expect(isAvailableForDimension('pauliSpinor', 7)).toBe(false)
  })

  it('returns false for invalid type', () => {
    // @ts-expect-error intentional
    expect(isAvailableForDimension('nonexistent', 4)).toBe(false)
  })
})

describe('getUnavailabilityReason', () => {
  it('returns undefined when available', () => {
    expect(getUnavailabilityReason('schroedinger', 4)).toBeUndefined()
    expect(getUnavailabilityReason('pauliSpinor', 3)).toBeUndefined()
  })

  it('returns exact lower-bound reason', () => {
    expect(getUnavailabilityReason('schroedinger', 1)).toBe('Requires 2D+')
    expect(getUnavailabilityReason('pauliSpinor', 2)).toBe('Requires 3D+')
  })

  it('returns exact upper-bound reason', () => {
    expect(getUnavailabilityReason('schroedinger', 12)).toBe('Max 11D')
    expect(getUnavailabilityReason('pauliSpinor', 7)).toBe('Max 6D')
  })

  it('returns reason for unknown type', () => {
    // @ts-expect-error intentional
    const reason = getUnavailabilityReason('unknown', 4)
    expect(reason).toContain('Unknown')
  })
})

describe('getAvailableTypesForDimension', () => {
  it('returns exact availability and disabled reasons at 2D', () => {
    expect(getAvailableTypesForDimension(2)).toEqual([
      {
        type: 'schroedinger',
        name: 'Schrödinger Slices',
        description: 'Organic volumes from an N-dimensional wavefunction.',
        available: true,
        disabledReason: undefined,
      },
      {
        type: 'pauliSpinor',
        name: 'Pauli Spinor',
        description:
          'Two-component spinor wavefunction in a magnetic field. Visualizes spin precession and Stern-Gerlach splitting.',
        available: false,
        disabledReason: 'Requires 3D+',
      },
      {
        type: 'bellPair',
        name: 'Bell Pair',
        description:
          'Two-qubit entangled spin state. Drives the CHSH / Bell experiment with live S(N) plot crossing the classical bound toward Tsirelson.',
        available: false,
        disabledReason: 'Requires 3D+',
      },
    ])
  })

  it('returns exact availability and disabled reasons above Pauli Spinor max', () => {
    expect(
      getAvailableTypesForDimension(7).map(({ type, available, disabledReason }) => ({
        type,
        available,
        disabledReason,
      }))
    ).toEqual([
      { type: 'schroedinger', available: true, disabledReason: undefined },
      { type: 'pauliSpinor', available: false, disabledReason: 'Max 6D' },
      { type: 'bellPair', available: false, disabledReason: 'Max 3D' },
    ])
  })
})

describe('isValidObjectType', () => {
  it('validates registered object types', () => {
    expect(isValidObjectType('schroedinger')).toBe(true)
    expect(isValidObjectType('pauliSpinor')).toBe(true)
  })

  it('rejects invalid types', () => {
    expect(isValidObjectType('fractal')).toBe(false)
    expect(isValidObjectType('')).toBe(false)
    expect(isValidObjectType('polytope')).toBe(false)
  })
})

describe('UI helpers', () => {
  it('returns exact controls component keys', () => {
    expect(getControlsComponentKey('schroedinger')).toBe('SchroedingerControls')
    expect(getControlsComponentKey('pauliSpinor')).toBe('PauliSpinorControls')
  })

  it('returns exact timeline-control support', () => {
    expect(hasTimelineControls('schroedinger')).toBe(true)
    expect(hasTimelineControls('pauliSpinor')).toBe(true)
  })

  it('returns exact config store keys', () => {
    expect(getConfigStoreKey('schroedinger')).toBe('schroedinger')
    expect(getConfigStoreKey('pauliSpinor')).toBe('pauliSpinor')
  })
})
