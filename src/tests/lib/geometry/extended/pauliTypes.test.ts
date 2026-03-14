/**
 * Unit tests for PauliConfig types, defaults, and presets.
 */

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PAULI_CONFIG,
  type PauliConfig,
  type PauliFieldType,
  type PauliFieldView,
  type PauliInitialCondition,
  type PauliPotentialType,
} from '@/lib/geometry/extended/types'
import { PAULI_SCENARIO_PRESETS } from '@/lib/physics/pauli/presets'

describe('DEFAULT_PAULI_CONFIG', () => {
  it('has valid grid dimensions matching latticeDim', () => {
    expect(DEFAULT_PAULI_CONFIG.gridSize).toHaveLength(DEFAULT_PAULI_CONFIG.latticeDim)
    expect(DEFAULT_PAULI_CONFIG.spacing).toHaveLength(DEFAULT_PAULI_CONFIG.latticeDim)
  })

  it('has grid sizes that are powers of 2', () => {
    for (const size of DEFAULT_PAULI_CONFIG.gridSize) {
      expect(Math.log2(size) % 1).toBe(0)
    }
  })

  it('has dt within the clamping range [0.0001, 0.1]', () => {
    expect(DEFAULT_PAULI_CONFIG.dt).toBeGreaterThanOrEqual(0.0001)
    expect(DEFAULT_PAULI_CONFIG.dt).toBeLessThanOrEqual(0.1)
  })

  it('has valid spherical coordinate ranges for field direction', () => {
    const [theta, phi] = DEFAULT_PAULI_CONFIG.fieldDirection
    expect(theta).toBeGreaterThanOrEqual(0)
    expect(theta).toBeLessThanOrEqual(Math.PI)
    expect(phi).toBeGreaterThanOrEqual(0)
    expect(phi).toBeLessThanOrEqual(2 * Math.PI)
  })

  it('has valid spherical coordinate ranges for spin direction', () => {
    const [theta, phi] = DEFAULT_PAULI_CONFIG.initialSpinDirection
    expect(theta).toBeGreaterThanOrEqual(0)
    expect(theta).toBeLessThanOrEqual(Math.PI)
    expect(phi).toBeGreaterThanOrEqual(0)
    expect(phi).toBeLessThanOrEqual(2 * Math.PI)
  })

  it('has spin colors in [0, 1] range', () => {
    for (const c of DEFAULT_PAULI_CONFIG.spinUpColor) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
    for (const c of DEFAULT_PAULI_CONFIG.spinDownColor) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })

  it('starts with needsReset true for initial setup', () => {
    expect(DEFAULT_PAULI_CONFIG.needsReset).toBe(true)
  })

  it('has packetCenter and packetMomentum arrays of length 11 (max dims)', () => {
    expect(DEFAULT_PAULI_CONFIG.packetCenter).toHaveLength(11)
    expect(DEFAULT_PAULI_CONFIG.packetMomentum).toHaveLength(11)
  })
})

describe('PauliConfig type constraints', () => {
  it('fieldType values are valid', () => {
    const validTypes: PauliFieldType[] = ['uniform', 'gradient', 'rotating', 'quadrupole']
    expect(validTypes).toContain(DEFAULT_PAULI_CONFIG.fieldType)
  })

  it('fieldView values are valid', () => {
    const validViews: PauliFieldView[] = ['spinDensity', 'totalDensity', 'spinExpectation', 'coherence']
    expect(validViews).toContain(DEFAULT_PAULI_CONFIG.fieldView)
  })

  it('initialCondition values are valid', () => {
    const validConditions: PauliInitialCondition[] = ['gaussianSpinUp', 'gaussianSpinDown', 'gaussianSuperposition', 'planeWaveSpinor']
    expect(validConditions).toContain(DEFAULT_PAULI_CONFIG.initialCondition)
  })

  it('potentialType values are valid', () => {
    const validPotentials: PauliPotentialType[] = ['none', 'harmonicTrap', 'barrier', 'doubleWell']
    expect(validPotentials).toContain(DEFAULT_PAULI_CONFIG.potentialType)
  })
})

describe('PAULI_SCENARIO_PRESETS', () => {
  it('has at least 3 presets', () => {
    expect(PAULI_SCENARIO_PRESETS.length).toBeGreaterThanOrEqual(3)
  })

  it('each preset has unique id', () => {
    const ids = PAULI_SCENARIO_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('each preset has name, description, and overrides', () => {
    for (const preset of PAULI_SCENARIO_PRESETS) {
      expect(preset.name.length).toBeGreaterThan(0)
      expect(preset.description.length).toBeGreaterThan(0)
      expect(Object.keys(preset.overrides).length).toBeGreaterThan(0)
    }
  })

  it('preset overrides only contain valid PauliConfig keys', () => {
    const validKeys = new Set(Object.keys(DEFAULT_PAULI_CONFIG))
    for (const preset of PAULI_SCENARIO_PRESETS) {
      for (const key of Object.keys(preset.overrides)) {
        expect(validKeys.has(key)).toBe(true)
      }
    }
  })

  it('no preset overrides latticeDim or gridSize (dimension-agnostic)', () => {
    for (const preset of PAULI_SCENARIO_PRESETS) {
      expect(preset.overrides).not.toHaveProperty('latticeDim')
      expect(preset.overrides).not.toHaveProperty('gridSize')
    }
  })
})
