import { describe, expect, it } from 'vitest'
import {
  getAvailableColorAlgorithms,
  COLOR_ALGORITHM_OPTIONS,
  COLOR_ALGORITHM_TO_INT,
} from '@/rendering/shaders/palette/types'
import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'

/** Algorithms requiring continuous complex phase (unavailable for freeScalarField) */
const PHASE_DEPENDENT = [
  'phase',
  'mixed',
  'phaseCyclicUniform',
  'domainColoringPsi',
  'relativePhase',
]

/** Educational analysis algorithms (only available for freeScalarField) */
const EDUCATIONAL_ALGOS = [
  'hamiltonianDecomposition',
  'modeCharacter',
  'energyFlux',
  'kSpaceOccupation',
]

describe('getAvailableColorAlgorithms', () => {
  it('excludes phase-dependent algorithms for freeScalarField mode', () => {
    const options = getAvailableColorAlgorithms('freeScalarField')
    const values = options.map((o) => o.value)
    for (const excluded of PHASE_DEPENDENT) {
      expect(values).not.toContain(excluded)
    }
  })

  it('includes educational algorithms for freeScalarField mode', () => {
    const options = getAvailableColorAlgorithms('freeScalarField')
    const values = options.map((o) => o.value)
    for (const edu of EDUCATIONAL_ALGOS) {
      expect(values).toContain(edu)
    }
  })

  it('returns correct count for freeScalarField (total minus phase-dependent)', () => {
    const fsOptions = getAvailableColorAlgorithms('freeScalarField')
    expect(fsOptions.length).toBe(
      COLOR_ALGORITHM_OPTIONS.length - PHASE_DEPENDENT.length
    )
  })

  it('includes density-based and sign-compatible algorithms for freeScalarField', () => {
    const options = getAvailableColorAlgorithms('freeScalarField')
    const values = options.map((o) => o.value)
    expect(values).toContain('lch')
    expect(values).toContain('multiSource')
    expect(values).toContain('radial')
    expect(values).toContain('blackbody')
    expect(values).toContain('phaseDiverging')
    expect(values).toContain('diverging')
    expect(values).toContain('radialDistance')
  })

  it('excludes educational algorithms for harmonicOscillator', () => {
    const options = getAvailableColorAlgorithms('harmonicOscillator')
    const values = options.map((o) => o.value)
    for (const edu of EDUCATIONAL_ALGOS) {
      expect(values).not.toContain(edu)
    }
  })

  it('excludes educational algorithms for hydrogenND', () => {
    const options = getAvailableColorAlgorithms('hydrogenND')
    const values = options.map((o) => o.value)
    for (const edu of EDUCATIONAL_ALGOS) {
      expect(values).not.toContain(edu)
    }
  })

  it('returns correct count for harmonicOscillator (total minus educational)', () => {
    const options = getAvailableColorAlgorithms('harmonicOscillator')
    expect(options.length).toBe(
      COLOR_ALGORITHM_OPTIONS.length - EDUCATIONAL_ALGOS.length
    )
  })

  it('returns correct count for hydrogenND (total minus educational)', () => {
    const options = getAvailableColorAlgorithms('hydrogenND')
    expect(options.length).toBe(
      COLOR_ALGORITHM_OPTIONS.length - EDUCATIONAL_ALGOS.length
    )
  })
})

describe('educational color algorithms in COLOR_ALGORITHM_TO_INT', () => {
  it('maps hamiltonianDecomposition to 12', () => {
    expect(COLOR_ALGORITHM_TO_INT.hamiltonianDecomposition).toBe(12)
  })

  it('maps modeCharacter to 13', () => {
    expect(COLOR_ALGORITHM_TO_INT.modeCharacter).toBe(13)
  })

  it('maps energyFlux to 14', () => {
    expect(COLOR_ALGORITHM_TO_INT.energyFlux).toBe(14)
  })

  it('maps kSpaceOccupation to 15', () => {
    expect(COLOR_ALGORITHM_TO_INT.kSpaceOccupation).toBe(15)
  })
})

describe('educational algorithms in COLOR_ALGORITHM_OPTIONS', () => {
  it('includes hamiltonianDecomposition with correct label', () => {
    const opt = COLOR_ALGORITHM_OPTIONS.find((o) => o.value === 'hamiltonianDecomposition')
    expect(opt).toBeDefined()
    expect(opt!.label).toBe('Hamiltonian Decomposition')
  })

  it('includes modeCharacter with correct label', () => {
    const opt = COLOR_ALGORITHM_OPTIONS.find((o) => o.value === 'modeCharacter')
    expect(opt).toBeDefined()
    expect(opt!.label).toBe('Mode Character Map')
  })

  it('includes energyFlux with correct label', () => {
    const opt = COLOR_ALGORITHM_OPTIONS.find((o) => o.value === 'energyFlux')
    expect(opt).toBeDefined()
    expect(opt!.label).toBe('Energy Flux Map')
  })

  it('includes kSpaceOccupation with correct label', () => {
    const opt = COLOR_ALGORITHM_OPTIONS.find((o) => o.value === 'kSpaceOccupation')
    expect(opt).toBeDefined()
    expect(opt!.label).toBe('k-Space Occupation Map')
  })
})

describe('composeSchroedingerShader: analysis texture stub in 2D mode', () => {
  it('emits sampleAnalysisFromGrid stub even for 2D HO with educational color algorithm', () => {
    // This verifies Fix 1: the Analysis Texture Sampling block is no longer gated by !is2D,
    // so educational color algorithms (12-14) that call sampleAnalysisFromGrid don't cause
    // WGSL compilation failures in 2D mode.
    const result = composeSchroedingerShader({
      dimension: 2,
      quantumMode: 'harmonicOscillator',
      colorAlgorithm: 12, // hamiltonianDecomposition
      termCount: 1,
    })
    expect(result.wgsl).toContain('sampleAnalysisFromGrid')
  })

  it('emits sampleAnalysisFromGrid stub for 3D HO without free scalar analysis', () => {
    const result = composeSchroedingerShader({
      dimension: 3,
      quantumMode: 'harmonicOscillator',
      colorAlgorithm: 13, // modeCharacter
      termCount: 1,
    })
    expect(result.wgsl).toContain('sampleAnalysisFromGrid')
  })
})
