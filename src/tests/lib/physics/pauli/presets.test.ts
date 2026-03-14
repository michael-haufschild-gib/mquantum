/**
 * Unit tests for Pauli scenario presets.
 */

import { describe, it, expect } from 'vitest'
import { PAULI_SCENARIO_PRESETS, type PauliScenarioPreset } from '@/lib/physics/pauli/presets'
import { DEFAULT_PAULI_CONFIG } from '@/lib/geometry/extended/types'

describe('PAULI_SCENARIO_PRESETS', () => {
  it('contains exactly 6 presets', () => {
    expect(PAULI_SCENARIO_PRESETS).toHaveLength(6)
  })

  it('all ids are unique', () => {
    const ids = PAULI_SCENARIO_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(6)
  })

  it('each preset has non-empty name and description', () => {
    for (const preset of PAULI_SCENARIO_PRESETS) {
      expect(preset.name.length).toBeGreaterThan(0)
      expect(preset.description.length).toBeGreaterThan(0)
    }
  })

  it('no preset overrides latticeDim or gridSize (dimension-agnostic)', () => {
    for (const preset of PAULI_SCENARIO_PRESETS) {
      expect(preset.overrides).not.toHaveProperty('latticeDim')
      expect(preset.overrides).not.toHaveProperty('gridSize')
      expect(preset.overrides).not.toHaveProperty('spacing')
    }
  })

  it('all override keys are valid PauliConfig fields', () => {
    const validKeys = new Set(Object.keys(DEFAULT_PAULI_CONFIG))
    for (const preset of PAULI_SCENARIO_PRESETS) {
      for (const key of Object.keys(preset.overrides)) {
        expect(validKeys.has(key), `Invalid key "${key}" in preset "${preset.id}"`).toBe(true)
      }
    }
  })

  it('all presets set fieldView to a valid PauliFieldView', () => {
    const validViews = new Set(['spinDensity', 'totalDensity', 'spinExpectation', 'coherence'])
    for (const preset of PAULI_SCENARIO_PRESETS) {
      if (preset.overrides.fieldView) {
        expect(validViews.has(preset.overrides.fieldView)).toBe(true)
      }
    }
  })

  it('all presets set fieldType to a valid PauliFieldType', () => {
    const validTypes = new Set(['uniform', 'gradient', 'rotating', 'quadrupole'])
    for (const preset of PAULI_SCENARIO_PRESETS) {
      if (preset.overrides.fieldType) {
        expect(validTypes.has(preset.overrides.fieldType)).toBe(true)
      }
    }
  })

  it('dt overrides are within clamping range [0.0001, 0.1]', () => {
    for (const preset of PAULI_SCENARIO_PRESETS) {
      if (preset.overrides.dt !== undefined) {
        expect(preset.overrides.dt).toBeGreaterThanOrEqual(0.0001)
        expect(preset.overrides.dt).toBeLessThanOrEqual(0.1)
      }
    }
  })

  it('fieldStrength overrides are within clamping range [0, 50]', () => {
    for (const preset of PAULI_SCENARIO_PRESETS) {
      if (preset.overrides.fieldStrength !== undefined) {
        expect(preset.overrides.fieldStrength).toBeGreaterThanOrEqual(0)
        expect(preset.overrides.fieldStrength).toBeLessThanOrEqual(50)
      }
    }
  })

  it('stepsPerFrame overrides are within clamping range [1, 16]', () => {
    for (const preset of PAULI_SCENARIO_PRESETS) {
      if (preset.overrides.stepsPerFrame !== undefined) {
        expect(preset.overrides.stepsPerFrame).toBeGreaterThanOrEqual(1)
        expect(preset.overrides.stepsPerFrame).toBeLessThanOrEqual(16)
      }
    }
  })

  // === Named preset spot-checks ===

  it('larmorPrecession uses uniform field with spin in x-z plane', () => {
    const larmor = PAULI_SCENARIO_PRESETS.find((p) => p.id === 'larmorPrecession')!
    expect(larmor.overrides.fieldType).toBe('uniform')
    expect(larmor.overrides.initialSpinDirection![0]).toBe(Math.PI / 2) // theta = π/2 = x-y plane
    expect(larmor.overrides.initialCondition).toBe('gaussianSuperposition')
  })

  it('sternGerlach uses gradient field for spatial splitting', () => {
    const sg = PAULI_SCENARIO_PRESETS.find((p) => p.id === 'sternGerlach')!
    expect(sg.overrides.fieldType).toBe('gradient')
    expect(sg.overrides.gradientStrength).toBeGreaterThan(0)
  })

  it('spinFlip uses rotating field for Rabi oscillations', () => {
    const rabi = PAULI_SCENARIO_PRESETS.find((p) => p.id === 'spinFlip')!
    expect(rabi.overrides.fieldType).toBe('rotating')
    expect(rabi.overrides.rotatingFrequency).toBeGreaterThan(0)
    expect(rabi.overrides.initialCondition).toBe('gaussianSpinUp')
  })

  it('freeSpinUp has zero field strength', () => {
    const free = PAULI_SCENARIO_PRESETS.find((p) => p.id === 'freeSpinUp')!
    expect(free.overrides.fieldStrength).toBe(0)
    expect(free.overrides.fieldView).toBe('totalDensity')
  })
})
