/**
 * Tests for open quantum metrics: purity, entropy, coherence, etc.
 */
import { describe, expect, it } from 'vitest'

import {
  createDensityMatrix,
  densityMatrixFromCoefficients,
} from '@/lib/physics/openQuantum/integrator'
import {
  coherenceMagnitude,
  computeMetrics,
  groundPopulation,
  purity,
  vonNeumannEntropy,
} from '@/lib/physics/openQuantum/metrics'

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

  it('returns consistent metrics for an equal superposition', () => {
    const c = 1 / Math.sqrt(2)
    const rho = densityMatrixFromCoefficients([c, c], [0, 0], 2)
    const m = computeMetrics(rho, true)

    // Equal superposition is a pure state: purity = 1, entropy = 0
    expect(m.purity).toBeCloseTo(1.0, 10)
    expect(m.vonNeumannEntropy).toBeCloseTo(0, 6)
    // Ground population = |c_0|^2 = 0.5
    expect(m.groundPopulation).toBeCloseTo(0.5, 6)
    // Coherence magnitude = sum of |rho_{kl}| for k != l = 2 * 0.5 = 1.0
    expect(m.coherenceMagnitude).toBeCloseTo(1.0, 6)
  })
})

describe('purity and entropy relationship', () => {
  it('pure states have zero entropy and purity 1', () => {
    // Test across K=2,3,4
    for (const K of [2, 3, 4]) {
      const coeffsRe = Array(K).fill(0)
      const coeffsIm = Array(K).fill(0)
      coeffsRe[0] = 1 // |0> state
      const rho = densityMatrixFromCoefficients(coeffsRe, coeffsIm, K)
      expect(purity(rho)).toBeCloseTo(1.0, 10)
      expect(vonNeumannEntropy(rho)).toBeCloseTo(0, 6)
    }
  })

  it('maximally mixed states have maximum entropy for each K', () => {
    for (const K of [2, 3, 4, 5]) {
      const rho = createDensityMatrix(K)
      for (let k = 0; k < K; k++) {
        rho.elements[2 * (k * K + k)] = 1 / K
      }
      expect(purity(rho)).toBeCloseTo(1 / K, 10)
      expect(vonNeumannEntropy(rho)).toBeCloseTo(Math.log(K), 4)
    }
  })

  it('entropy is always non-negative', () => {
    // Test with various states
    const states = [
      { re: [1, 0], im: [0, 0] },
      { re: [0.6, 0], im: [0, 0.8] },
      { re: [0.5, 0.5], im: [0.5, -0.5] },
    ]
    for (const s of states) {
      const rho = densityMatrixFromCoefficients(s.re, s.im, 2)
      expect(vonNeumannEntropy(rho)).toBeGreaterThanOrEqual(-1e-10)
    }
  })
})
