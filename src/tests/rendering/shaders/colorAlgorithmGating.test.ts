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

  it('excludes kSpaceOccupation for freeScalarField + vacuumNoise', () => {
    const algos = getAvailableColorAlgorithms(
      'freeScalarField',
      false,
      'schroedinger',
      'vacuumNoise'
    )
    const values = algos.map((a) => a.value)

    expect(values).not.toContain('kSpaceOccupation')
    // Other educational algorithms should still be available
    expect(values).toContain('hamiltonianDecomposition')
    expect(values).toContain('modeCharacter')
    expect(values).toContain('energyFlux')
  })

  it('includes kSpaceOccupation for freeScalarField + gaussianPacket', () => {
    const algos = getAvailableColorAlgorithms(
      'freeScalarField',
      false,
      'schroedinger',
      'gaussianPacket'
    )
    const values = algos.map((a) => a.value)

    expect(values).toContain('kSpaceOccupation')
  })

  it('includes kSpaceOccupation for freeScalarField when initialCondition not specified', () => {
    const algos = getAvailableColorAlgorithms('freeScalarField', false)
    const values = algos.map((a) => a.value)

    expect(values).toContain('kSpaceOccupation')
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

  it('quantumWalk excludes hsl2rgb-based phase algorithms (black output on QW pipeline)', () => {
    const algos = getAvailableColorAlgorithms('quantumWalk', false)
    const values = algos.map((a) => a.value)

    // Working algorithms should be present
    expect(values).toContain('blackbody')
    expect(values).toContain('phaseCyclicUniform')
    expect(values).toContain('viridis')
    expect(values).toContain('inferno')
    expect(values).toContain('densityContours')
    expect(values).toContain('phaseDiverging')
    expect(values).toContain('diverging')

    // hsl2rgb-based phase algorithms produce black in QW pipeline
    expect(values).not.toContain('domainColoringPsi')
    expect(values).not.toContain('phaseDensity')

    // Geometric algorithms that read world-space position should be absent
    expect(values).not.toContain('radialDistance')
    expect(values).not.toContain('lch')
    expect(values).not.toContain('radial')
    expect(values).not.toContain('multiSource')
  })

  it('TDSE/BEC retain domainColoringPsi and phaseDensity', () => {
    for (const mode of ['tdseDynamics', 'becDynamics'] as const) {
      const algos = getAvailableColorAlgorithms(mode, false)
      const values = algos.map((a) => a.value)
      expect(values, `${mode} should include domainColoringPsi`).toContain('domainColoringPsi')
      expect(values, `${mode} should include phaseDensity`).toContain('phaseDensity')
    }
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

describe('getAvailableColorAlgorithms — density-grid availability for analytic modes', () => {
  // Round 1 review fix: quantumPotential and vortexDensity require a bound
  // density grid texture. AnalyticModeStrategy binds one for HO / hydrogenND
  // whenever dimension >= 3, isosurface is off, and representation is not
  // Wigner. The selector must expose the algorithms in that configuration and
  // hide them otherwise.

  it('exposes quantumPotential for 3D volumetric harmonicOscillator', () => {
    const algos = getAvailableColorAlgorithms(
      'harmonicOscillator',
      false,
      'schroedinger',
      undefined,
      { dimension: 3, isosurface: false, representation: 'position' }
    )
    const values = algos.map((a) => a.value)
    expect(values).toContain('quantumPotential')
    expect(values).toContain('vortexDensity')
  })

  it('exposes quantumPotential for 5D volumetric hydrogenND', () => {
    const algos = getAvailableColorAlgorithms('hydrogenND', false, 'schroedinger', undefined, {
      dimension: 5,
      isosurface: false,
      representation: 'position',
    })
    const values = algos.map((a) => a.value)
    expect(values).toContain('quantumPotential')
    expect(values).toContain('vortexDensity')
  })

  it('hides quantumPotential for 2D harmonicOscillator', () => {
    const algos = getAvailableColorAlgorithms(
      'harmonicOscillator',
      false,
      'schroedinger',
      undefined,
      { dimension: 2, isosurface: false, representation: 'position' }
    )
    const values = algos.map((a) => a.value)
    expect(values).not.toContain('quantumPotential')
    expect(values).not.toContain('vortexDensity')
  })

  it('hides quantumPotential when isosurface rendering is on (HO)', () => {
    const algos = getAvailableColorAlgorithms(
      'harmonicOscillator',
      false,
      'schroedinger',
      undefined,
      { dimension: 3, isosurface: true, representation: 'position' }
    )
    const values = algos.map((a) => a.value)
    expect(values).not.toContain('quantumPotential')
    expect(values).not.toContain('vortexDensity')
  })

  it('hides quantumPotential for Wigner phase-space representation', () => {
    const algos = getAvailableColorAlgorithms(
      'harmonicOscillator',
      false,
      'schroedinger',
      undefined,
      { dimension: 3, isosurface: false, representation: 'wigner' }
    )
    const values = algos.map((a) => a.value)
    expect(values).not.toContain('quantumPotential')
    expect(values).not.toContain('vortexDensity')
  })

  it('defaults (no availability options) behave like 3D volumetric — exposes quantumPotential', () => {
    // Callers that have not yet been upgraded to pass availability options get
    // the most permissive behaviour (3D volumetric non-Wigner) so the feature
    // is visible wherever it could reasonably work.
    const algos = getAvailableColorAlgorithms('harmonicOscillator', false)
    const values = algos.map((a) => a.value)
    expect(values).toContain('quantumPotential')
    expect(values).toContain('vortexDensity')
  })
})
