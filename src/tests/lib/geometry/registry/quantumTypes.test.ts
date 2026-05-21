import { describe, expect, it } from 'vitest'

import {
  getQuantumTypeCompileContextFields,
  getQuantumTypeEvolutionResetKind,
  getQuantumTypeValidation,
  QUANTUM_TYPE_REGISTRY,
  supportsOpenQuantumForQuantumType,
} from '@/lib/geometry/registry'

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
      'wheelerDeWitt',
      'antiDeSitter',
      'pauliSpinor',
      'bellTest',
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

  it('every present shaderUniformId is unique', () => {
    const ownersById = new Map<number, string>()
    for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
      const id = entry.runtime.shaderUniformId
      if (id === undefined) continue

      const existingOwner = ownersById.get(id)
      expect(existingOwner, `${key}: shaderUniformId ${id} already used by ${existingOwner}`).toBe(
        undefined
      )
      ownersById.set(id, key)
    }
  })

  it('every present stateSaveId is unique', () => {
    const ownersById = new Map<number, string>()
    for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
      const id = entry.runtime.stateSaveId
      if (id === undefined) continue

      const existingOwner = ownersById.get(id)
      expect(existingOwner, `${key}: stateSaveId ${id} already used by ${existingOwner}`).toBe(
        undefined
      )
      ownersById.set(id, key)
    }
  })

  it('declares evolution reset behavior for every entry', () => {
    const resetKinds = Object.fromEntries(
      [...QUANTUM_TYPE_REGISTRY.keys()].map((key) => [key, getQuantumTypeEvolutionResetKind(key)])
    )

    expect(resetKinds).toEqual({
      harmonicOscillator: 'schroedingerAnalytic',
      hydrogenND: 'schroedingerAnalytic',
      hydrogenNDCoupled: 'schroedingerAnalytic',
      freeScalarField: 'freeScalarField',
      tdseDynamics: 'tdse',
      becDynamics: 'bec',
      diracEquation: 'dirac',
      quantumWalk: 'quantumWalk',
      wheelerDeWitt: 'wheelerDeWitt',
      antiDeSitter: 'antiDeSitter',
      pauliSpinor: 'pauli',
      bellTest: 'bellPair',
    })
  })

  it('marks open-quantum support only for analytic density-matrix modes', () => {
    const supportedKeys = [...QUANTUM_TYPE_REGISTRY.keys()].filter((key) =>
      supportsOpenQuantumForQuantumType(key)
    )

    expect(supportedKeys).toEqual(['harmonicOscillator', 'hydrogenND', 'hydrogenNDCoupled'])
  })

  it('maps compile-context fields only to modes that need selector state', () => {
    const compileContextByKey = Object.fromEntries(
      [...QUANTUM_TYPE_REGISTRY.keys()].map((key) => [key, getQuantumTypeCompileContextFields(key)])
    )

    expect(compileContextByKey).toEqual({
      harmonicOscillator: [],
      hydrogenND: [],
      hydrogenNDCoupled: [],
      freeScalarField: ['freeScalarInitialCondition'],
      tdseDynamics: [],
      becDynamics: [],
      diracEquation: ['diracFieldView'],
      quantumWalk: [],
      wheelerDeWitt: [],
      antiDeSitter: [],
      pauliSpinor: [],
      bellTest: [],
    })
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

  it('every entry declares user-visible validation evidence', () => {
    const validLevels = new Set(['A', 'R', 'P', 'C', 'F'])
    const validConfidence = new Set(['strong', 'partial', 'fixture'])

    for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
      const { validation } = entry
      expect(validation.levels.length, `${key}: levels`).toBeGreaterThan(0)
      expect(
        validation.levels.every((level) => validLevels.has(level)),
        `${key}: valid levels`
      ).toBe(true)
      expect(validConfidence.has(validation.confidence), `${key}: confidence`).toBe(true)
      expect(validation.summary.length, `${key}: summary`).toBeGreaterThan(20)
      expect(validation.testRefs.length, `${key}: testRefs`).toBeGreaterThan(0)
      expect(validation.source, `${key}: source`).toBe('docs/physics/validation-status.md')
    }
  })

  it('exposes validation metadata through the public helper', () => {
    expect(getQuantumTypeValidation('hydrogenND')?.levels).toEqual(['R', 'A', 'P'])
    expect(getQuantumTypeValidation('pauliSpinor')?.confidence).toBe('fixture')
  })

  it('every entry has valid internal.objectType', () => {
    const validObjectTypes = new Set(['schroedinger', 'pauliSpinor', 'bellPair'])
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

  it('compute modes (except pauliSpinor and bellTest) have objectType "schroedinger"', () => {
    for (const [key, entry] of QUANTUM_TYPE_REGISTRY) {
      if (entry.category === 'compute' && key !== 'pauliSpinor' && key !== 'bellTest') {
        expect(entry.internal.objectType, `${key}`).toBe('schroedinger')
      }
    }
  })

  it('bellTest has objectType "bellPair"', () => {
    const bell = QUANTUM_TYPE_REGISTRY.get('bellTest')!
    expect(bell.internal.objectType).toBe('bellPair')
    expect(bell.category).toBe('compute')
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
