/**
 * Tests for color algorithm gating — open quantum algorithms 16-18.
 */
import { describe, expect, it } from 'vitest'
import {
  getAvailableColorAlgorithms,
  COLOR_ALGORITHM_TO_INT,
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
