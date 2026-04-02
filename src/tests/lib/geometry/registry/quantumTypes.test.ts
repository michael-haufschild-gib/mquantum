import { describe, expect, it } from 'vitest'

import { QUANTUM_TYPE_REGISTRY } from '@/lib/geometry/registry/quantumTypes'

describe('QUANTUM_TYPE_REGISTRY', () => {
  it('contains exactly the expected quantum type keys', () => {
    const expectedKeys = [
      'harmonicOscillator',
      'hydrogenND',
      'hydrogenNDCoupled',
      'freeScalarField',
      'tdseDynamics',
      'becDynamics',
      'diracEquation',
      'quantumWalk',
      'pauliSpinor',
    ]
    expect(QUANTUM_TYPE_REGISTRY.size).toBe(expectedKeys.length)
    for (const key of expectedKeys) {
      expect(QUANTUM_TYPE_REGISTRY.has(key as never), `missing key: ${key}`).toBe(true)
    }
  })

  it('has matching key and entry.key for every entry', () => {
    for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
      expect(entry.key).toBe(key)
    }
  })

  it('every entry has valid dimension constraints (min <= max, min >= 1, max <= 11)', () => {
    for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
      const { min, max } = entry.dimensions
      expect(min, `${key}: min >= 1`).toBeGreaterThanOrEqual(1)
      expect(max, `${key}: max <= 11`).toBeLessThanOrEqual(11)
      expect(min, `${key}: min <= max`).toBeLessThanOrEqual(max)
    }
  })

  it('every entry has a recommended dimension within [min, max]', () => {
    for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
      const { min, max, recommended } = entry.dimensions
      expect(recommended, `${key}: recommended >= min`).toBeGreaterThanOrEqual(min)
      expect(recommended, `${key}: recommended <= max`).toBeLessThanOrEqual(max)
    }
  })

  it('every entry has a non-empty name and description', () => {
    for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
      expect(entry.name.length, `${key}: name`).toBeGreaterThan(0)
      expect(entry.description.length, `${key}: description`).toBeGreaterThan(0)
    }
  })

  it('every entry has a valid category', () => {
    const validCategories = new Set(['analytic', 'compute'])
    for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
      expect(validCategories.has(entry.category), `${key}: category "${entry.category}"`).toBe(true)
    }
  })

  it('every entry has valid internal.objectType', () => {
    const validObjectTypes = new Set(['schroedinger', 'pauliSpinor'])
    for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
      expect(
        validObjectTypes.has(entry.internal.objectType),
        `${key}: objectType "${entry.internal.objectType}"`
      ).toBe(true)
    }
  })

  it('analytic modes have objectType "schroedinger"', () => {
    for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
      if (entry.category === 'analytic') {
        expect(entry.internal.objectType, `${key}`).toBe('schroedinger')
      }
    }
  })

  it('compute modes (except pauliSpinor) have objectType "schroedinger"', () => {
    for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
      if (entry.category === 'compute' && key !== 'pauliSpinor') {
        expect(entry.internal.objectType, `${key}`).toBe('schroedinger')
      }
    }
  })

  it('pauliSpinor has objectType "pauliSpinor"', () => {
    const pauli = QUANTUM_TYPE_REGISTRY.get('pauliSpinor')!
    expect(pauli.internal.objectType).toBe('pauliSpinor')
    expect(pauli.category).toBe('compute')
  })

  it('every entry has a controlsComponentKey', () => {
    for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
      expect(entry.ui.controlsComponentKey.length, `${key}: controlsComponentKey`).toBeGreaterThan(
        0
      )
    }
  })

  it('compute modes require min dimension >= 3', () => {
    for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
      if (entry.category === 'compute') {
        expect(entry.dimensions.min, `${key}: compute mode min dim >= 3`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('rendering method is "raymarch" for all entries', () => {
    for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
      expect(entry.rendering.renderMethod, `${key}`).toBe('raymarch')
    }
  })
})
