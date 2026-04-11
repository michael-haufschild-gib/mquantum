import { describe, expect, it } from 'vitest'

import {
  generateDiracMatricesFallback,
  spinorSize,
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
        let re = 0,
          im = 0
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
  for (const dim of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
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

      it('tr(αᵢ) = 0 for all alpha matrices (traceless generators)', () => {
        for (let i = 0; i < dim; i++) {
          let trRe = 0
          let trIm = 0
          for (let k = 0; k < s; k++) {
            const [re, im] = getEntry(alphas[i]!, s, k, k)
            trRe += re
            trIm += im
          }
          expect(Math.abs(trRe)).toBeLessThan(1e-6)
          expect(Math.abs(trIm)).toBeLessThan(1e-6)
        }
      })

      it('tr(β) = 0 (traceless)', () => {
        let trRe = 0
        let trIm = 0
        for (let k = 0; k < s; k++) {
          const [re, im] = getEntry(beta, s, k, k)
          trRe += re
          trIm += im
        }
        expect(Math.abs(trRe)).toBeLessThan(1e-6)
        expect(Math.abs(trIm)).toBeLessThan(1e-6)
      })

      it('β = diag(I_{S/2}, −I_{S/2}) in standard Dirac form', () => {
        const halfS = s / 2
        for (let i = 0; i < s; i++) {
          for (let j = 0; j < s; j++) {
            const [re, im] = getEntry(beta, s, i, j)
            if (i === j && i < halfS) {
              // Upper-left block: +1
              expect(re).toBeCloseTo(1, 5)
            } else if (i === j && i >= halfS) {
              // Lower-right block: -1
              expect(re).toBeCloseTo(-1, 5)
            } else {
              // Off-diagonal: 0
              expect(Math.abs(re)).toBeLessThan(1e-6)
            }
            expect(Math.abs(im)).toBeLessThan(1e-6)
          }
        }
      })
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Physical property: H² = E²·I for the Dirac free Hamiltonian.
//
//   H_free = Σⱼ αⱼ·kⱼ + β·m
//   E²     = Σⱼ kⱼ² + m²
//
// If any αᵢ anticommutation relation is subtly wrong (e.g., a permutation
// error that preserves individual αᵢ² = I but breaks cross-anticommutation),
// the direct checks above can still pass while H²≠E²I. This is the
// higher-level physical invariant the Dirac compute pass actually relies on.
// ═══════════════════════════════════════════════════════════════════════════

describe('Dirac free Hamiltonian: H² = E²·I', () => {
  /** Complex S×S identity matrix. */
  function complexIdentity(s: number): Float32Array {
    const m = new Float32Array(s * s * 2)
    for (let i = 0; i < s; i++) m[(i * s + i) * 2] = 1.0
    return m
  }

  /** Get complex entry (row, col) from an S×S matrix. */
  function getEntry(m: Float32Array, s: number, r: number, c: number): [number, number] {
    const idx = (r * s + c) * 2
    return [m[idx]!, m[idx + 1]!]
  }

  /** Extract complex S×S matrix from packed buffer at given offset. */
  function extractMatrix(buf: Float32Array, s: number, offset: number): Float32Array {
    return buf.slice(offset, offset + s * s * 2)
  }

  /** Complex matrix multiply C = A · B. */
  function matMul(a: Float32Array, b: Float32Array, s: number): Float32Array {
    const c = new Float32Array(s * s * 2)
    for (let i = 0; i < s; i++) {
      for (let j = 0; j < s; j++) {
        let re = 0
        let im = 0
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

  /** Add two complex matrices: C = A + B. */
  function matAdd(a: Float32Array, b: Float32Array): Float32Array {
    const c = new Float32Array(a.length)
    for (let i = 0; i < a.length; i++) c[i] = a[i]! + b[i]!
    return c
  }

  /** Scale a complex matrix by a real scalar. */
  function matScale(m: Float32Array, scalar: number): Float32Array {
    const c = new Float32Array(m.length)
    for (let i = 0; i < m.length; i++) c[i] = m[i]! * scalar
    return c
  }

  const cases: { dim: number; k: number[]; m: number }[] = [
    { dim: 1, k: [1.0], m: 1.0 },
    { dim: 2, k: [1.0, 0.5], m: 1.0 },
    { dim: 3, k: [1.0, 0.5, -0.3], m: 1.0 },
    { dim: 3, k: [0, 0, 0], m: 2.0 }, // pure mass, zero momentum
    { dim: 4, k: [0.7, -0.2, 0.4, 0.1], m: 0.5 },
    { dim: 5, k: [0.3, -0.5, 0.2, 0.8, -0.1], m: 1.0 },
    { dim: 6, k: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], m: 0.3 },
    { dim: 7, k: [0.5, -0.3, 0.1, 0.2, -0.4, 0.6, -0.2], m: 1.0 },
  ]

  for (const { dim, k, m } of cases) {
    it(`dim=${dim}, m=${m}, k=[${k.map((x) => x.toFixed(1)).join(',')}]`, () => {
      const s = spinorSize(dim)
      const { gammaData } = generateDiracMatricesFallback(dim)
      const matSize = s * s * 2

      const alphas: Float32Array[] = []
      for (let i = 0; i < dim; i++) {
        alphas.push(extractMatrix(gammaData, s, 1 + i * matSize))
      }
      const beta = extractMatrix(gammaData, s, 1 + dim * matSize)

      // Build H = Σ αⱼ·kⱼ + β·m
      let H = matScale(beta, m)
      for (let j = 0; j < dim; j++) {
        H = matAdd(H, matScale(alphas[j]!, k[j]!))
      }

      const H2 = matMul(H, H, s)
      const k2 = k.reduce((acc, ki) => acc + ki * ki, 0)
      const expected = matScale(complexIdentity(s), k2 + m * m)

      // f32 error accumulates with S — looser bound for S>8.
      const tol = s <= 8 ? 1e-3 : 0.05
      for (let i = 0; i < expected.length; i++) {
        expect(Math.abs(H2[i]! - expected[i]!)).toBeLessThan(tol)
      }
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════════
// Test-env sanity: the vitest mock of `mdimension-core` re-implements
// `dirac_spinor_size_wasm` in JS. Regressions in the mock (off-by-one in the
// `max(2, 1 << floor((N+1)/2))` formula) would go unnoticed because the real
// Clifford generation path falls back to the JS `cliffordAlgebraFallback`.
// This assertion keeps the mock honest.
// ═══════════════════════════════════════════════════════════════════════════

describe('test mock: dirac_spinor_size_wasm matches fallback', () => {
  it('agrees for dims 1..=11', async () => {
    const mock = await import('@/tests/__mocks__/mdimension-core')
    for (let dim = 1; dim <= 11; dim++) {
      expect(mock.dirac_spinor_size_wasm(dim)).toBe(spinorSize(dim))
    }
  })
})
