import { describe, expect, it } from 'vitest'

import { sampleJointOutcome, sampleJointOutcomesBatch } from '@/lib/physics/bell/bornSample'
import { PCG32 } from '@/lib/physics/bell/pcg32'
import { azimuthalVec, jointOutcomeProbabilities } from '@/lib/physics/bell/projectors'
import { bellState, pureDensityMatrix, wernerDensityMatrix } from '@/lib/physics/bell/state'
import type { JointProbabilities } from '@/lib/physics/bell/types'

describe('sampleJointOutcome', () => {
  it('always returns ±1 in each slot', () => {
    const rng = new PCG32(1n)
    const probs: JointProbabilities = { pPP: 0.25, pPM: 0.25, pMP: 0.25, pMM: 0.25 }
    for (let k = 0; k < 200; k++) {
      const [a, b] = sampleJointOutcome(probs, rng)
      expect(a === 1 || a === -1).toBe(true)
      expect(b === 1 || b === -1).toBe(true)
    }
  })

  it('empirical frequencies match input probabilities (1k samples per bin)', () => {
    const probs: JointProbabilities = { pPP: 0.1, pPM: 0.3, pMP: 0.4, pMM: 0.2 }
    const rng = new PCG32(42n)
    const counts = { pp: 0, pm: 0, mp: 0, mm: 0 }
    const N = 50_000
    for (let k = 0; k < N; k++) {
      const [a, b] = sampleJointOutcome(probs, rng)
      if (a === 1 && b === 1) counts.pp++
      else if (a === 1 && b === -1) counts.pm++
      else if (a === -1 && b === 1) counts.mp++
      else counts.mm++
    }
    expect(counts.pp / N).toBeCloseTo(0.1, 2)
    expect(counts.pm / N).toBeCloseTo(0.3, 2)
    expect(counts.mp / N).toBeCloseTo(0.4, 2)
    expect(counts.mm / N).toBeCloseTo(0.2, 2)
  })

  it('singlet a=b only produces anti-correlated outcomes', () => {
    const rho = pureDensityMatrix(bellState('psiMinus'))
    const probs = jointOutcomeProbabilities(rho, azimuthalVec(0), azimuthalVec(0))
    const rng = new PCG32(9999n)
    for (let k = 0; k < 500; k++) {
      const [a, b] = sampleJointOutcome(probs, rng)
      expect(a).not.toBe(b) // perfect anti-correlation at θ=0
    }
  })

  it('I/4 (maximally mixed) gives uniform distribution over four outcomes', () => {
    const rho = wernerDensityMatrix(0)
    const probs = jointOutcomeProbabilities(rho, azimuthalVec(0), azimuthalVec(Math.PI / 3))
    expect(probs.pPP).toBeCloseTo(0.25, 12)
    expect(probs.pPM).toBeCloseTo(0.25, 12)
    expect(probs.pMP).toBeCloseTo(0.25, 12)
    expect(probs.pMM).toBeCloseTo(0.25, 12)
  })
})

describe('sampleJointOutcomesBatch', () => {
  it('matches single-trial sampling for the same seed and probabilities', () => {
    const probs: JointProbabilities = { pPP: 0.2, pPM: 0.3, pMP: 0.4, pMM: 0.1 }
    const rngA = new PCG32(100n)
    const rngB = new PCG32(100n)
    const N = 50
    const buf = sampleJointOutcomesBatch(probs, rngA, N)
    for (let k = 0; k < N; k++) {
      const [a, b] = sampleJointOutcome(probs, rngB)
      expect(buf[2 * k]).toBe(a)
      expect(buf[2 * k + 1]).toBe(b)
    }
  })

  it('returns the provided buffer when supplied', () => {
    const probs: JointProbabilities = { pPP: 0.25, pPM: 0.25, pMP: 0.25, pMM: 0.25 }
    const rng = new PCG32(2n)
    const buf = new Int8Array(20)
    const result = sampleJointOutcomesBatch(probs, rng, 10, buf)
    expect(result).toBe(buf)
  })
})
