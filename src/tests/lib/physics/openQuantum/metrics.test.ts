/**
 * Tests for open quantum metrics: purity, entropy, coherence, etc.
 */
import { describe, expect, it } from 'vitest'
import {
  purity,
  linearEntropy,
  vonNeumannEntropy,
  coherenceMagnitude,
  groundPopulation,
  computeMetrics,
} from '@/lib/physics/openQuantum/metrics'
import { densityMatrixFromCoefficients, createDensityMatrix } from '@/lib/physics/openQuantum/integrator'

describe('purity', () => {
  it('returns 1 for a pure state', () => {
    const rho = densityMatrixFromCoefficients([1, 0], [0, 0], 2)
    expect(purity(rho)).toBeCloseTo(1.0, 10)
  })

  it('returns 1/K for maximally mixed state', () => {
    const K = 3
    const rho = createDensityMatrix(K)
    // Diagonal: 1/K
    for (let k = 0; k < K; k++) {
      rho.elements[2 * (k * K + k)] = 1 / K
    }
    expect(purity(rho)).toBeCloseTo(1 / K, 10)
  })

  it('returns value in [1/K, 1] for a mixed state', () => {
    // 70% |0> + 30% |1> (classical mixture)
    const K = 2
    const rho = createDensityMatrix(K)
    rho.elements[0] = 0.7 // rho_{00}
    rho.elements[2 * 3] = 0.3 // rho_{11}
    const p = purity(rho)
    expect(p).toBeGreaterThanOrEqual(1 / K - 1e-10)
    expect(p).toBeLessThanOrEqual(1 + 1e-10)
  })
})

describe('vonNeumannEntropy', () => {
  it('returns 0 for a pure state', () => {
    const rho = densityMatrixFromCoefficients([1, 0], [0, 0], 2)
    expect(vonNeumannEntropy(rho)).toBeCloseTo(0, 6)
  })

  it('returns ln(K) for maximally mixed state', () => {
    const K = 4
    const rho = createDensityMatrix(K)
    for (let k = 0; k < K; k++) {
      rho.elements[2 * (k * K + k)] = 1 / K
    }
    expect(vonNeumannEntropy(rho)).toBeCloseTo(Math.log(K), 4)
  })
})

describe('coherenceMagnitude', () => {
  it('returns 0 for a diagonal state', () => {
    const K = 2
    const rho = createDensityMatrix(K)
    rho.elements[0] = 0.5
    rho.elements[2 * 3] = 0.5
    expect(coherenceMagnitude(rho)).toBeCloseTo(0, 10)
  })

  it('returns positive value for coherent superposition', () => {
    const c = 1 / Math.sqrt(2)
    const rho = densityMatrixFromCoefficients([c, c], [0, 0], 2)
    expect(coherenceMagnitude(rho)).toBeGreaterThan(0.4)
  })
})

describe('groundPopulation', () => {
  it('returns 1 when in ground state', () => {
    const rho = densityMatrixFromCoefficients([1, 0], [0, 0], 2)
    expect(groundPopulation(rho)).toBeCloseTo(1.0, 10)
  })

  it('returns 0 when in excited state', () => {
    const rho = densityMatrixFromCoefficients([0, 1], [0, 0], 2)
    expect(groundPopulation(rho)).toBeCloseTo(0.0, 10)
  })
})

describe('computeMetrics', () => {
  it('returns consistent metrics for a pure state', () => {
    const rho = densityMatrixFromCoefficients([1, 0], [0, 0], 2)
    const m = computeMetrics(rho, true)
    expect(m.purity).toBeCloseTo(1.0, 10)
    expect(m.linearEntropy).toBeCloseTo(0, 10)
    expect(m.vonNeumannEntropy).toBeCloseTo(0, 6)
    expect(m.groundPopulation).toBeCloseTo(1.0, 10)
    expect(m.trace).toBeCloseTo(1.0, 10)
  })

  it('skips von Neumann when includeVonNeumann is false', () => {
    const rho = densityMatrixFromCoefficients([1, 0], [0, 0], 2)
    const m = computeMetrics(rho, false, 42.0)
    expect(m.vonNeumannEntropy).toBe(42.0)
  })
})
