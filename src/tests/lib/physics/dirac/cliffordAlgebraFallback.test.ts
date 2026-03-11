import { describe, it, expect } from 'vitest'
import {
  spinorSize,
  generateDiracMatricesFallback,
} from '@/lib/physics/dirac/cliffordAlgebraFallback'

describe('spinorSize', () => {
  it('returns 2 for 1D', () => {
    expect(spinorSize(1)).toBe(2)
  })

  it('returns 2 for 2D', () => {
    expect(spinorSize(2)).toBe(2)
  })

  it('returns 4 for 3D', () => {
    expect(spinorSize(3)).toBe(4)
  })

  it('returns 4 for 4D', () => {
    expect(spinorSize(4)).toBe(4)
  })

  it('returns 8 for 5D', () => {
    expect(spinorSize(5)).toBe(8)
  })

  it('matches 2^floor((N+1)/2) for dimensions 1-11', () => {
    const expected = [2, 2, 4, 4, 8, 8, 16, 16, 32, 32, 64]
    for (let d = 1; d <= 11; d++) {
      expect(spinorSize(d)).toBe(expected[d - 1])
    }
  })
})

describe('generateDiracMatricesFallback', () => {
  // Helper: extract complex S×S matrix from packed buffer at given offset
  function extractMatrix(buf: Float32Array, s: number, offset: number): Float32Array {
    return buf.slice(offset, offset + s * s * 2)
  }

  // Helper: get complex entry (row, col) from S×S matrix
  function getEntry(m: Float32Array, s: number, r: number, c: number): [number, number] {
    const idx = (r * s + c) * 2
    return [m[idx]!, m[idx + 1]!]
  }

  // Helper: complex matrix multiply C = A * B for S×S matrices
  function matMul(a: Float32Array, b: Float32Array, s: number): Float32Array {
    const c = new Float32Array(s * s * 2)
    for (let i = 0; i < s; i++) {
      for (let j = 0; j < s; j++) {
        let re = 0, im = 0
        for (let k = 0; k < s; k++) {
          const [aR, aI] = getEntry(a, s, i, k)
          const [bR, bI] = getEntry(b, s, k, j)
          re += aR * bR - aI * bI
          im += aR * bI + aI * bR
        }
        c[(i * s + j) * 2] = re
        c[(i * s + j) * 2 + 1] = im
      }
    }
    return c
  }

  // Helper: matrix add
  function matAdd(a: Float32Array, b: Float32Array): Float32Array {
    const c = new Float32Array(a.length)
    for (let i = 0; i < a.length; i++) c[i] = a[i]! + b[i]!
    return c
  }

  // Helper: check if matrix equals scaled identity (re * I)
  function isScaledIdentity(m: Float32Array, s: number, expectedRe: number, tol: number): boolean {
    for (let i = 0; i < s; i++) {
      for (let j = 0; j < s; j++) {
        const [re, im] = getEntry(m, s, i, j)
        const expected = i === j ? expectedRe : 0
        if (Math.abs(re - expected) > tol || Math.abs(im) > tol) return false
      }
    }
    return true
  }

  it('packs spinor size as u32 bits in first element', () => {
    const { gammaData, spinorSize: s } = generateDiracMatricesFallback(3)
    const u32 = new Uint32Array(gammaData.buffer, 0, 1)
    expect(u32[0]).toBe(s)
    expect(s).toBe(4)
  })

  it('returns correct buffer length', () => {
    for (const dim of [1, 2, 3, 5]) {
      const { gammaData, spinorSize: s } = generateDiracMatricesFallback(dim)
      const matSize = s * s * 2
      const expected = 1 + dim * matSize + matSize
      expect(gammaData.length).toBe(expected)
    }
  })

  // Clifford algebra: {αᵢ, αⱼ} = 2δᵢⱼ I  and  β² = I  and  {αᵢ, β} = 0
  for (const dim of [1, 2, 3, 4, 5]) {
    describe(`N=${dim}`, () => {
      const { gammaData, spinorSize: s } = generateDiracMatricesFallback(dim)
      const matSize = s * s * 2

      // Extract alpha matrices and beta
      const alphas: Float32Array[] = []
      for (let i = 0; i < dim; i++) {
        alphas.push(extractMatrix(gammaData, s, 1 + i * matSize))
      }
      const beta = extractMatrix(gammaData, s, 1 + dim * matSize)

      it('αᵢ² = I for each alpha', () => {
        for (let i = 0; i < dim; i++) {
          const sq = matMul(alphas[i]!, alphas[i]!, s)
          expect(isScaledIdentity(sq, s, 1, 1e-6)).toBe(true)
        }
      })

      it('{αᵢ, αⱼ} = 0 for i ≠ j', () => {
        for (let i = 0; i < dim; i++) {
          for (let j = i + 1; j < dim; j++) {
            const ab = matMul(alphas[i]!, alphas[j]!, s)
            const ba = matMul(alphas[j]!, alphas[i]!, s)
            const anticomm = matAdd(ab, ba)
            expect(isScaledIdentity(anticomm, s, 0, 1e-6)).toBe(true)
          }
        }
      })

      it('β² = I', () => {
        const sq = matMul(beta, beta, s)
        expect(isScaledIdentity(sq, s, 1, 1e-6)).toBe(true)
      })

      it('{αᵢ, β} = 0 for all i', () => {
        for (let i = 0; i < dim; i++) {
          const ab = matMul(alphas[i]!, beta, s)
          const ba = matMul(beta, alphas[i]!, s)
          const anticomm = matAdd(ab, ba)
          expect(isScaledIdentity(anticomm, s, 0, 1e-6)).toBe(true)
        }
      })
    })
  }
})
