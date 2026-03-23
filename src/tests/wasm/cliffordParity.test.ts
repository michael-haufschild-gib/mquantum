/**
 * Clifford Algebra: Rust ↔ TypeScript Fallback Parity Tests
 *
 * Verifies that the TS cliffordAlgebraFallback.ts produces identical results
 * to the Rust clifford.rs for all supported spatial dimensions (1-11).
 *
 * Covers:
 * - spinorSize formula agreement
 * - Clifford anticommutation relations {αᵢ, αⱼ} = 2δᵢⱼI, {αᵢ, β} = 0, β² = I
 * - Standard Dirac form: β = diag(I_{S/2}, −I_{S/2})
 * - Physical property: H² = E²·I for Dirac Hamiltonian
 * - Packed buffer format matching WASM output layout
 */

import { describe, expect, it } from 'vitest'

import {
  generateDiracMatricesFallback,
  spinorSize,
} from '@/lib/physics/dirac/cliffordAlgebraFallback'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract complex S×S matrix from packed buffer at given offset */
function extractMatrix(buf: Float32Array, s: number, offset: number): Float32Array {
  return buf.slice(offset, offset + s * s * 2)
}

/** Get complex entry (row, col) from S×S complex matrix */
function getEntry(m: Float32Array, s: number, r: number, c: number): [number, number] {
  const idx = (r * s + c) * 2
  return [m[idx]!, m[idx + 1]!]
}

/** Complex matrix multiply C = A * B for S×S matrices */
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

/** Matrix add: C = A + B */
function matAdd(a: Float32Array, b: Float32Array): Float32Array {
  const c = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) c[i] = a[i]! + b[i]!
  return c
}

/** Scale complex matrix by real scalar */
function matScale(m: Float32Array, scalar: number): Float32Array {
  const c = new Float32Array(m.length)
  for (let i = 0; i < m.length; i++) c[i] = m[i]! * scalar
  return c
}

/** Check if matrix equals scaled identity (re * I) within tolerance */
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

/** Complex identity matrix */
function complexIdentity(s: number): Float32Array {
  const m = new Float32Array(s * s * 2)
  for (let i = 0; i < s; i++) {
    m[(i * s + i) * 2] = 1.0
  }
  return m
}

// ============================================================================
// spinorSize — Rust spinor_size ↔ TS spinorSize
// ============================================================================

describe('spinorSize: Rust ↔ TS parity for dims 1-11', () => {
  // Both use: max(2, 1 << floor((N+1)/2))
  const expected: Record<number, number> = {
    1: 2,
    2: 2,
    3: 4,
    4: 4,
    5: 8,
    6: 8,
    7: 16,
    8: 16,
    9: 32,
    10: 32,
    11: 64,
  }

  for (let dim = 1; dim <= 11; dim++) {
    it(`dim=${dim} → S=${expected[dim]}`, () => {
      expect(spinorSize(dim)).toBe(expected[dim])
    })
  }

  it('matches Rust formula: max(2, 1 << floor((N+1)/2))', () => {
    for (let dim = 1; dim <= 11; dim++) {
      const rustFormula = Math.max(2, 1 << Math.floor((dim + 1) / 2))
      expect(spinorSize(dim)).toBe(rustFormula)
    }
  })
})

// ============================================================================
// Packed buffer format — matches WASM output layout
// ============================================================================

describe('generateDiracMatricesFallback: buffer format', () => {
  it('spinor size encoded as u32 bits in first f32 element', () => {
    for (let dim = 1; dim <= 11; dim++) {
      const { gammaData, spinorSize: s } = generateDiracMatricesFallback(dim)
      const u32 = new Uint32Array(gammaData.buffer, 0, 1)
      expect(u32[0]).toBe(s)
    }
  })

  it('buffer length = 1 + dim * matSize + matSize for all dims', () => {
    for (let dim = 1; dim <= 11; dim++) {
      const { gammaData, spinorSize: s } = generateDiracMatricesFallback(dim)
      const matSize = s * s * 2
      expect(gammaData.length).toBe(1 + dim * matSize + matSize)
    }
  })
})

// ============================================================================
// Clifford Algebra Verification — ALL dims 1-11
// ============================================================================

describe('Clifford algebra: anticommutation relations for all dims 1-11', () => {
  for (let dim = 1; dim <= 11; dim++) {
    describe(`N=${dim} (S=${spinorSize(dim)})`, () => {
      const { gammaData, spinorSize: s } = generateDiracMatricesFallback(dim)
      const matSize = s * s * 2

      const alphas: Float32Array[] = []
      for (let i = 0; i < dim; i++) {
        alphas.push(extractMatrix(gammaData, s, 1 + i * matSize))
      }
      const beta = extractMatrix(gammaData, s, 1 + dim * matSize)

      // Tolerance scales with matrix size due to f32 accumulation
      const tol = s <= 8 ? 1e-4 : 1e-3

      it(`αᵢ² = I for each alpha (${dim} matrices)`, () => {
        for (let i = 0; i < dim; i++) {
          const sq = matMul(alphas[i]!, alphas[i]!, s)
          expect(isScaledIdentity(sq, s, 1, tol)).toBe(true)
        }
      })

      it('{αᵢ, αⱼ} = 0 for i ≠ j', () => {
        for (let i = 0; i < dim; i++) {
          for (let j = i + 1; j < dim; j++) {
            const ab = matMul(alphas[i]!, alphas[j]!, s)
            const ba = matMul(alphas[j]!, alphas[i]!, s)
            const anticomm = matAdd(ab, ba)
            expect(isScaledIdentity(anticomm, s, 0, tol)).toBe(true)
          }
        }
      })

      it('β² = I', () => {
        const sq = matMul(beta, beta, s)
        expect(isScaledIdentity(sq, s, 1, tol)).toBe(true)
      })

      it('{αᵢ, β} = 0 for all i', () => {
        for (let i = 0; i < dim; i++) {
          const ab = matMul(alphas[i]!, beta, s)
          const ba = matMul(beta, alphas[i]!, s)
          const anticomm = matAdd(ab, ba)
          expect(isScaledIdentity(anticomm, s, 0, tol)).toBe(true)
        }
      })
    })
  }
})

// ============================================================================
// Standard Dirac Form — β = diag(I_{S/2}, −I_{S/2})
// ============================================================================

describe('β standard form: diag(I_{S/2}, −I_{S/2}) for all dims 1-11', () => {
  for (let dim = 1; dim <= 11; dim++) {
    it(`dim=${dim}: β is block diagonal`, () => {
      const { gammaData, spinorSize: s } = generateDiracMatricesFallback(dim)
      const matSize = s * s * 2
      const beta = extractMatrix(gammaData, s, 1 + dim * matSize)
      const half = s / 2

      for (let i = 0; i < s; i++) {
        for (let j = 0; j < s; j++) {
          const [re, im] = getEntry(beta, s, i, j)
          if (i === j) {
            const expected = i < half ? 1.0 : -1.0
            expect(Math.abs(re - expected)).toBeLessThan(1e-5)
            expect(Math.abs(im)).toBeLessThan(1e-5)
          } else {
            expect(Math.abs(re)).toBeLessThan(1e-5)
            expect(Math.abs(im)).toBeLessThan(1e-5)
          }
        }
      }
    })
  }
})

// ============================================================================
// Physical Property: H² = E²·I (Dirac Hamiltonian)
// ============================================================================

describe('H² = E²·I for Dirac free Hamiltonian', () => {
  // H_free = Σⱼ αⱼ·kⱼ + β·m
  // E² = Σⱼ kⱼ² + m²
  // This must hold for any k-vector and mass

  const testCases: { dim: number; k: number[]; m: number }[] = [
    { dim: 1, k: [1.0], m: 1.0 },
    { dim: 2, k: [1.0, 0.5], m: 1.0 },
    { dim: 3, k: [1.0, 0.5, -0.3], m: 1.0 },
    { dim: 3, k: [0, 0, 0], m: 2.0 }, // pure mass, k=0
    { dim: 4, k: [0.7, -0.2, 0.4, 0.1], m: 0.5 },
    { dim: 5, k: [0.3, -0.5, 0.2, 0.8, -0.1], m: 1.0 },
    { dim: 6, k: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], m: 0.3 },
    { dim: 7, k: [0.5, -0.3, 0.1, 0.2, -0.4, 0.6, -0.2], m: 1.0 },
  ]

  for (const { dim, k, m } of testCases) {
    it(`dim=${dim}, k=[${k.map((x) => x.toFixed(1)).join(',')}], m=${m}`, () => {
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

      // Compute H²
      const H2 = matMul(H, H, s)

      // Compute E²
      const k2 = k.reduce((acc, ki) => acc + ki * ki, 0)
      const E2 = k2 + m * m

      // Check H² = E²·I
      const expected = matScale(complexIdentity(s), E2)
      const tol = s <= 8 ? 1e-3 : 0.05 // larger matrices accumulate more f32 error
      for (let i = 0; i < expected.length; i++) {
        expect(Math.abs(H2[i]! - expected[i]!)).toBeLessThan(tol)
      }
    })
  }
})

// ============================================================================
// Cross-check: TS spinorSize matches WASM mock spinorSize
// ============================================================================

describe('spinorSize: TS fallback matches WASM mock', () => {
  // The WASM mock in __mocks__/mdimension-core.ts also implements spinorSize.
  // This verifies the mock wasn't written incorrectly.
  it('both implementations agree for dims 1-11', async () => {
    const mock = await import('@/tests/__mocks__/mdimension-core')
    for (let dim = 1; dim <= 11; dim++) {
      expect(mock.dirac_spinor_size_wasm(dim)).toBe(spinorSize(dim))
    }
  })
})
