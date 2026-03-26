/**
 * Tests for Clifford algebra fallback — gamma matrix generation.
 *
 * Verifies:
 * - Spinor size formula: S = 2^(⌊(N+1)/2⌋)
 * - JS fallback produces correct gamma matrices for spatial dimensions 1-7
 * - Clifford algebra anticommutation relation: {γ^i, γ^j} = 2δ_{ij}I
 * - Beta matrix has standard Dirac form: diag(I_{S/2}, -I_{S/2})
 */

import { describe, expect, it } from 'vitest'

import {
  generateDiracMatricesFallback,
  spinorSize,
} from '@/lib/physics/dirac/cliffordAlgebraFallback'

describe('spinorSize', () => {
  it('returns minimum 2 for spatialDim=1', () => {
    expect(spinorSize(1)).toBe(2)
  })

  it('follows S = 2^(⌊(N+1)/2⌋) for dimensions 1-11', () => {
    const expected = [2, 2, 4, 4, 8, 8, 16, 16, 32, 32, 64]
    for (let dim = 1; dim <= 11; dim++) {
      expect(spinorSize(dim)).toBe(expected[dim - 1])
    }
  })
})

describe('generateDiracMatricesFallback', () => {
  it('returns correct packed gammaData size for 3D', () => {
    const { gammaData, spinorSize: S } = generateDiracMatricesFallback(3)
    expect(S).toBe(4)
    const matSize = S * S * 2
    // Format: 1 header + N alpha matrices + 1 beta matrix
    expect(gammaData.length).toBe(1 + (3 + 1) * matSize)
  })

  it('returns correct spinor size for dimensions 1-7', () => {
    for (let dim = 1; dim <= 7; dim++) {
      const { spinorSize: S } = generateDiracMatricesFallback(dim)
      expect(S).toBe(spinorSize(dim))
    }
  })

  /** Extract the i-th matrix from the packed gammaData (skipping the 1-element header). */
  function extractMatrix(gammaData: Float32Array, S: number, index: number): Float32Array {
    const matSize = S * S * 2
    const offset = 1 + index * matSize
    return gammaData.slice(offset, offset + matSize)
  }

  /** Complex S×S matrix multiply: C = A * B */
  function complexMatMul(a: Float32Array, b: Float32Array, S: number): Float32Array {
    const c = new Float32Array(S * S * 2)
    for (let i = 0; i < S; i++) {
      for (let j = 0; j < S; j++) {
        let re = 0
        let im = 0
        for (let k = 0; k < S; k++) {
          const aRe = a[(i * S + k) * 2]!
          const aIm = a[(i * S + k) * 2 + 1]!
          const bRe = b[(k * S + j) * 2]!
          const bIm = b[(k * S + j) * 2 + 1]!
          re += aRe * bRe - aIm * bIm
          im += aRe * bIm + aIm * bRe
        }
        c[(i * S + j) * 2] = re
        c[(i * S + j) * 2 + 1] = im
      }
    }
    return c
  }

  it('beta matrix has standard Dirac form: diag(I_{S/2}, -I_{S/2}) for 3D', () => {
    const N = 3
    const { gammaData, spinorSize: S } = generateDiracMatricesFallback(N)
    const beta = extractMatrix(gammaData, S, N) // beta is after N alpha matrices

    for (let r = 0; r < S; r++) {
      for (let c = 0; c < S; c++) {
        const re = beta[(r * S + c) * 2]!
        const im = beta[(r * S + c) * 2 + 1]!
        if (r === c) {
          // diag: +1 for first S/2, -1 for last S/2
          const expected = r < S / 2 ? 1 : -1
          expect(re).toBeCloseTo(expected, 4)
        } else {
          expect(re).toBeCloseTo(0, 4)
        }
        expect(im).toBeCloseTo(0, 4)
      }
    }
  })

  it('satisfies anticommutation {γ^i, γ^j} = 2δ_{ij}I for 1D', () => {
    verifyAnticommutation(1)
  })

  it('satisfies anticommutation {γ^i, γ^j} = 2δ_{ij}I for 2D', () => {
    verifyAnticommutation(2)
  })

  it('satisfies anticommutation {γ^i, γ^j} = 2δ_{ij}I for 3D', () => {
    verifyAnticommutation(3)
  })

  it('satisfies anticommutation {γ^i, γ^j} = 2δ_{ij}I for 5D', () => {
    verifyAnticommutation(5)
  })

  function verifyAnticommutation(N: number) {
    const { gammaData, spinorSize: S } = generateDiracMatricesFallback(N)
    const numMatrices = N + 1 // N alphas + 1 beta
    const matSize = S * S * 2

    // Check {γ^i, γ^j} = γ^i γ^j + γ^j γ^i = 2δ_{ij} I
    for (let i = 0; i < numMatrices; i++) {
      for (let j = i; j < numMatrices; j++) {
        const gi = extractMatrix(gammaData, S, i)
        const gj = extractMatrix(gammaData, S, j)
        const gij = complexMatMul(gi, gj, S)
        const gji = complexMatMul(gj, gi, S)

        // Anticommutator {γ^i, γ^j}
        const anticomm = new Float32Array(matSize)
        for (let idx = 0; idx < matSize; idx++) {
          anticomm[idx] = gij[idx]! + gji[idx]!
        }

        for (let r = 0; r < S; r++) {
          for (let c = 0; c < S; c++) {
            const re = anticomm[(r * S + c) * 2]!
            const im = anticomm[(r * S + c) * 2 + 1]!
            if (i === j && r === c) {
              expect(re).toBeCloseTo(2, 3)
            } else {
              expect(re).toBeCloseTo(0, 3)
            }
            expect(im).toBeCloseTo(0, 3)
          }
        }
      }
    }
  }
})
