/**
 * Tests for color algorithm gating — open quantum algorithms 16-18.
 */
import { describe, expect, it } from 'vitest'

import {
  COLOR_ALGORITHM_TO_INT,
  getAvailableColorAlgorithms,
} from '@/rendering/shaders/palette/types'

describe('COLOR_ALGORITHM_TO_INT open quantum entries', () => {
  it('maps purityMap to 16', () => {
    expect(COLOR_ALGORITHM_TO_INT.purityMap).toBe(16)
  })

  it('maps entropyMap to 17', () => {
    expect(COLOR_ALGORITHM_TO_INT.entropyMap).toBe(17)
  })

  it('maps coherenceMap to 18', () => {
    expect(COLOR_ALGORITHM_TO_INT.coherenceMap).toBe(18)
  })
})

describe('getAvailableColorAlgorithms — open quantum gating', () => {
  it('excludes open quantum algorithms when openQuantumEnabled is false', () => {
    const algos = getAvailableColorAlgorithms('harmonicOscillator', false)
    const values = algos.map((a) => a.value)

    expect(values).not.toContain('purityMap')
    expect(values).not.toContain('entropyMap')
    expect(values).not.toContain('coherenceMap')
  })

  it('includes open quantum algorithms when openQuantumEnabled is true', () => {
    const algos = getAvailableColorAlgorithms('harmonicOscillator', true)
    const values = algos.map((a) => a.value)

    expect(values).toContain('purityMap')
    expect(values).toContain('entropyMap')
    expect(values).toContain('coherenceMap')
  })

  it('excludes open quantum algorithms for freeScalarField regardless of toggle', () => {
    const algos = getAvailableColorAlgorithms('freeScalarField', true)
    const values = algos.map((a) => a.value)

    expect(values).not.toContain('purityMap')
    expect(values).not.toContain('entropyMap')
    expect(values).not.toContain('coherenceMap')
  })

  it('excludes open quantum algorithms for hydrogenND when disabled', () => {
    const algos = getAvailableColorAlgorithms('hydrogenND', false)
    const values = algos.map((a) => a.value)

    expect(values).not.toContain('purityMap')
    expect(values).not.toContain('entropyMap')
    expect(values).not.toContain('coherenceMap')
  })

  it('includes open quantum algorithms for hydrogenND when enabled', () => {
    const algos = getAvailableColorAlgorithms('hydrogenND', true)
    const values = algos.map((a) => a.value)

    expect(values).toContain('purityMap')
    expect(values).toContain('entropyMap')
    expect(values).toContain('coherenceMap')
  })

  it('defaults openQuantumEnabled to false when omitted', () => {
    const algos = getAvailableColorAlgorithms('harmonicOscillator')
    const values = algos.map((a) => a.value)

    expect(values).not.toContain('purityMap')
    expect(values).not.toContain('entropyMap')
    expect(values).not.toContain('coherenceMap')
  })
})

describe('getAvailableColorAlgorithms — phase-dependent exclusion in DM mode', () => {
  const phaseDependentAlgos = [
    'phase',
    'mixed',
    'phaseCyclicUniform',
    'phaseDiverging',
    'domainColoringPsi',
    'diverging',
    'relativePhase',
  ] as const

  const densityOnlyAlgos = ['lch', 'multiSource', 'radial', 'blackbody', 'radialDistance'] as const

  it('excludes phase-dependent algorithms when openQuantumEnabled is true', () => {
    const algos = getAvailableColorAlgorithms('harmonicOscillator', true)
    const values = algos.map((a) => a.value)

    for (const algo of phaseDependentAlgos) {
      expect(values, `expected ${algo} to be excluded`).not.toContain(algo)
    }
  })

  it('includes phase-dependent algorithms when openQuantumEnabled is false', () => {
    const algos = getAvailableColorAlgorithms('harmonicOscillator', false)
    const values = algos.map((a) => a.value)

    for (const algo of phaseDependentAlgos) {
      expect(values, `expected ${algo} to be included`).toContain(algo)
    }
  })

  it('retains density-only algorithms in both OQ modes', () => {
    const oqOff = getAvailableColorAlgorithms('harmonicOscillator', false).map((a) => a.value)
    const oqOn = getAvailableColorAlgorithms('harmonicOscillator', true).map((a) => a.value)

    for (const algo of densityOnlyAlgos) {
      expect(oqOff, `expected ${algo} included when OQ off`).toContain(algo)
      expect(oqOn, `expected ${algo} included when OQ on`).toContain(algo)
    }
  })

  it('quantumWalk uses grid-compatible algorithms (same as TDSE/BEC)', () => {
    const algos = getAvailableColorAlgorithms('quantumWalk', false)
    const values = algos.map((a) => a.value)

    // Grid-compatible algorithms should be present
    expect(values).toContain('blackbody')
    expect(values).toContain('phaseDensity')
    expect(values).toContain('viridis')
    expect(values).toContain('inferno')

    // Geometric algorithms that read world-space position should be absent
    expect(values).not.toContain('radialDistance')
    expect(values).not.toContain('lch')
    expect(values).not.toContain('radial')
    expect(values).not.toContain('multiSource')
  })

  it('excludes phase-dependent algorithms for hydrogenND in OQ mode', () => {
    const algos = getAvailableColorAlgorithms('hydrogenND', true)
    const values = algos.map((a) => a.value)

    for (const algo of phaseDependentAlgos) {
      expect(values, `expected ${algo} to be excluded`).not.toContain(algo)
    }
    // But OQ-specific should be included
    expect(values).toContain('purityMap')
    expect(values).toContain('entropyMap')
    expect(values).toContain('coherenceMap')
  })
})
