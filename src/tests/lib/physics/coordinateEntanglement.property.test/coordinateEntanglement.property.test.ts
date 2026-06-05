/**
 * Property-based tests for coordinate entanglement invariants.
 *
 * Verifies mathematical invariants that must hold for ALL valid wavefunctions:
 * - Tr(ρ_d) = 1 for normalized ψ
 * - S_d ∈ [0, log(M_d)]
 * - S_d is invariant under global phase rotation
 * - I(d₁,d₂) ≥ 0 (subadditivity of entropy)
 *
 * Uses fast-check for randomized testing with 200 samples per property.
 *
 * @module tests/lib/physics/coordinateEntanglement.property
 */

import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  computeCoordinateEntanglement,
  computeJointReducedDensityMatrix,
  computeReducedDensityMatrix,
  hermitianEigenvalues,
  vonNeumannEntropy,
} from '@/lib/physics/coordinateEntanglement'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a random normalized wavefunction on a given grid. */
function randomNormalizedPsi(
  totalSites: number,
  seed: number
): { re: Float32Array; im: Float32Array } {
  const re = new Float32Array(totalSites)
  const im = new Float32Array(totalSites)
  let norm = 0
  for (let i = 0; i < totalSites; i++) {
    re[i] = Math.sin((i + 1) * seed * 7.3 + 0.1)
    im[i] = Math.cos((i + 1) * seed * 5.1 + 0.3)
    norm += re[i]! * re[i]! + im[i]! * im[i]!
  }
  const invSqrt = 1 / Math.sqrt(norm)
  for (let i = 0; i < totalSites; i++) {
    re[i]! *= invSqrt
    im[i]! *= invSqrt
  }
  return { re, im }
}

/** Apply global phase e^{iθ} to ψ. */
function applyPhase(
  re: Float32Array,
  im: Float32Array,
  theta: number
): { re: Float32Array; im: Float32Array } {
  const cosT = Math.cos(theta)
  const sinT = Math.sin(theta)
  const newRe = new Float32Array(re.length)
  const newIm = new Float32Array(im.length)
  for (let i = 0; i < re.length; i++) {
    newRe[i] = re[i]! * cosT - im[i]! * sinT
    newIm[i] = re[i]! * sinT + im[i]! * cosT
  }
  return { re: newRe, im: newIm }
}

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('coordinate entanglement invariants (property-based)', () => {
  it('Tr(ρ_d) = 1 for arbitrary normalized ψ', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), fc.constantFrom(2, 3, 4), (seed, N) => {
        const M = N <= 3 ? 8 : 4
        const gridSize = new Array<number>(N).fill(M)
        const totalSites = Math.pow(M, N)
        const { re, im } = randomNormalizedPsi(totalSites, seed)

        for (let d = 0; d < N; d++) {
          const rdm = computeReducedDensityMatrix(re, im, gridSize, d)
          let trace = 0
          for (let i = 0; i < rdm.M; i++) {
            trace += rdm.re[i * rdm.M + i]!
          }
          expect(trace).toBeCloseTo(1.0, 4)
        }
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  it('S_d ∈ [0, log(M_d)] for arbitrary ψ', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), fc.constantFrom(2, 3, 4), (seed, N) => {
        const M = N <= 3 ? 8 : 4
        const gridSize = new Array<number>(N).fill(M)
        const totalSites = Math.pow(M, N)
        const { re, im } = randomNormalizedPsi(totalSites, seed)
        const maxS = Math.log(M)

        for (let d = 0; d < N; d++) {
          const rdm = computeReducedDensityMatrix(re, im, gridSize, d)
          const eigenvalues = hermitianEigenvalues(rdm.re, rdm.im, rdm.M)
          const S = vonNeumannEntropy(eigenvalues)
          expect(S).toBeGreaterThanOrEqual(-1e-6)
          expect(S).toBeLessThanOrEqual(maxS + 1e-6)
        }
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  it('S_d is invariant under global phase rotation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
        (seed, theta) => {
          const M = 8
          const gridSize = [M, M]
          const totalSites = M * M
          const { re, im } = randomNormalizedPsi(totalSites, seed)

          // Compute entropy without phase
          const rdm1 = computeReducedDensityMatrix(re, im, gridSize, 0)
          const eigs1 = hermitianEigenvalues(rdm1.re, rdm1.im, rdm1.M)
          const S1 = vonNeumannEntropy(eigs1)

          // Compute entropy with phase
          const { re: reP, im: imP } = applyPhase(re, im, theta)
          const rdm2 = computeReducedDensityMatrix(reP, imP, gridSize, 0)
          const eigs2 = hermitianEigenvalues(rdm2.re, rdm2.im, rdm2.M)
          const S2 = vonNeumannEntropy(eigs2)

          // Should be identical (phase invariance of reduced density matrix)
          expect(Math.abs(S1 - S2)).toBeLessThan(1e-4)
        }
      ),
      { numRuns: 200, seed: 42 }
    )
  })

  it('I(d₁,d₂) ≥ 0 for arbitrary ψ (subadditivity)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (seed) => {
        const M = 8
        const gridSize = [M, M]
        const totalSites = M * M
        const { re, im } = randomNormalizedPsi(totalSites, seed)

        const rdm1 = computeReducedDensityMatrix(re, im, gridSize, 0)
        const rdm2 = computeReducedDensityMatrix(re, im, gridSize, 1)
        const S1 = vonNeumannEntropy(hermitianEigenvalues(rdm1.re, rdm1.im, rdm1.M))
        const S2 = vonNeumannEntropy(hermitianEigenvalues(rdm2.re, rdm2.im, rdm2.M))

        const joint = computeJointReducedDensityMatrix(re, im, gridSize, [0, 1])
        expect(joint).toHaveProperty('M')
        const S12 = vonNeumannEntropy(hermitianEigenvalues(joint!.re, joint!.im, joint!.M))

        const I = S1 + S2 - S12
        // Mutual information ≥ 0 (subadditivity of von Neumann entropy)
        expect(I).toBeGreaterThanOrEqual(-1e-4)
      }),
      { numRuns: 200, seed: 42 }
    )
  })

  it('entropies are non-negative for random states', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 200 }), (seed) => {
        const M = 8
        const gridSize = [M, M, M]
        const totalSites = M * M * M
        const { re, im } = randomNormalizedPsi(totalSites, seed)

        const result = computeCoordinateEntanglement(re, im, gridSize, {
          computePairwiseMI: false,
          computeBipartitions: false,
          computeWignerNegativity: false,
        })

        for (const S of result.entropies) {
          expect(S).toBeGreaterThanOrEqual(-1e-6)
        }
        expect(result.averageEntropy).toBeGreaterThanOrEqual(-1e-6)
        expect(result.normalizedEntropy).toBeGreaterThanOrEqual(-1e-6)
        expect(result.normalizedEntropy).toBeLessThanOrEqual(1 + 1e-6)
      }),
      { numRuns: 200, seed: 42 }
    )
  })
})
