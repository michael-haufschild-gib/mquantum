import { describe, expect, it } from 'vitest'
import {
  getAvailableColorAlgorithms,
  COLOR_ALGORITHM_OPTIONS,
} from '@/rendering/shaders/palette/types'

describe('getAvailableColorAlgorithms', () => {
  it('excludes relativePhase for freeScalarField mode', () => {
    const options = getAvailableColorAlgorithms('freeScalarField')
    const values = options.map((o) => o.value)
    expect(values).not.toContain('relativePhase')
  })

  it('returns fewer options for freeScalarField than full set', () => {
    const fsOptions = getAvailableColorAlgorithms('freeScalarField')
    expect(fsOptions.length).toBe(COLOR_ALGORITHM_OPTIONS.length - 1)
  })

  it('includes all 12 algorithms for harmonicOscillator', () => {
    const options = getAvailableColorAlgorithms('harmonicOscillator')
    expect(options.length).toBe(COLOR_ALGORITHM_OPTIONS.length)
    expect(options).toEqual(COLOR_ALGORITHM_OPTIONS)
  })

  it('includes all 12 algorithms for hydrogenND', () => {
    const options = getAvailableColorAlgorithms('hydrogenND')
    expect(options.length).toBe(COLOR_ALGORITHM_OPTIONS.length)
    expect(options).toEqual(COLOR_ALGORITHM_OPTIONS)
  })

  it('includes diverging for freeScalarField (sign-as-phase works)', () => {
    const options = getAvailableColorAlgorithms('freeScalarField')
    const values = options.map((o) => o.value)
    expect(values).toContain('diverging')
    expect(values).toContain('phaseDiverging')
    expect(values).toContain('domainColoringPsi')
  })
})
