/**
 * Property-based tests for complex matrix operations.
 *
 * Uses fast-check to verify algebraic identities (associativity, identity
 * element, linearity, norm properties) across arbitrary complex matrices.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type { ComplexMatrix } from '@/lib/physics/openQuantum/complexMatrix'
import {
  complexMatAdd,
  complexMatIdentity,
  complexMatMul,
  complexMatNorm1,
  complexMatScale,
  complexMatZero,
} from '@/lib/physics/openQuantum/complexMatrix'

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary dimension 2-5 (keep small for O(n³) mul) */
const arbN = fc.integer({ min: 2, max: 5 })

/** Arbitrary complex matrix of given dimension */
function arbMatrix(N: number): fc.Arbitrary<ComplexMatrix> {
  return fc
    .array(fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }), {
      minLength: N * N * 2,
      maxLength: N * N * 2,
    })
    .map((arr) => {
      const m = complexMatZero(N)
      for (let i = 0; i < N * N; i++) {
        m.real[i] = arr[2 * i]!
        m.imag[i] = arr[2 * i + 1]!
      }
      return m
    })
}

/** Arbitrary complex scalar */
const arbComplex = fc.tuple(
  fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }),
  fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true })
)

/** Single matrix with its dimension */
const arbMatWithN = arbN.chain((N) => arbMatrix(N).map((A) => ({ N, A })))

/** Pair of same-dim matrices */
const arbMatPair = arbN.chain((N) =>
  fc.tuple(arbMatrix(N), arbMatrix(N)).map(([A, B]) => ({ N, A, B }))
)

/** Triple of same-dim matrices */
const arbMatTriple = arbN.chain((N) =>
  fc.tuple(arbMatrix(N), arbMatrix(N), arbMatrix(N)).map(([A, B, C]) => ({ N, A, B, C }))
)

// Helper: max element-wise difference
function maxDiff(A: ComplexMatrix, B: ComplexMatrix, N: number): number {
  let max = 0
  for (let i = 0; i < N * N; i++) {
    max = Math.max(max, Math.abs(A.real[i]! - B.real[i]!), Math.abs(A.imag[i]! - B.imag[i]!))
  }
  return max
}

// ---------------------------------------------------------------------------
// Identity element
// ---------------------------------------------------------------------------

describe('complex matrix identity — properties', () => {
  it('I * A = A', () => {
    fc.assert(
      fc.property(arbMatWithN, ({ N, A }) => {
        const I = complexMatIdentity(N)
        const out = complexMatZero(N)
        complexMatMul(I, A, out, N)
        expect(maxDiff(out, A, N)).toBeLessThan(1e-8)
      }),
      { numRuns: 200 }
    )
  })

  it('A * I = A', () => {
    fc.assert(
      fc.property(arbMatWithN, ({ N, A }) => {
        const I = complexMatIdentity(N)
        const out = complexMatZero(N)
        complexMatMul(A, I, out, N)
        expect(maxDiff(out, A, N)).toBeLessThan(1e-8)
      }),
      { numRuns: 200 }
    )
  })
})

// ---------------------------------------------------------------------------
// Associativity
// ---------------------------------------------------------------------------

describe('complex matrix multiplication — properties', () => {
  it('(A*B)*C = A*(B*C) (associativity)', () => {
    fc.assert(
      fc.property(arbMatTriple, ({ N, A, B, C }) => {
        const AB = complexMatZero(N)
        const BC = complexMatZero(N)
        const lhs = complexMatZero(N)
        const rhs = complexMatZero(N)

        complexMatMul(A, B, AB, N)
        complexMatMul(B, C, BC, N)
        complexMatMul(AB, C, lhs, N)
        complexMatMul(A, BC, rhs, N)

        expect(maxDiff(lhs, rhs, N)).toBeLessThan(1e-6)
      }),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Addition
// ---------------------------------------------------------------------------

describe('complex matrix addition — properties', () => {
  it('A + 0 = A', () => {
    fc.assert(
      fc.property(arbMatWithN, ({ N, A }) => {
        const Z = complexMatZero(N)
        const out = complexMatZero(N)
        complexMatAdd(A, Z, out, N)
        expect(maxDiff(out, A, N)).toBeLessThan(1e-15)
      }),
      { numRuns: 200 }
    )
  })

  it('is commutative: A + B = B + A', () => {
    fc.assert(
      fc.property(arbMatPair, ({ N, A, B }) => {
        const AB = complexMatZero(N)
        const BA = complexMatZero(N)
        complexMatAdd(A, B, AB, N)
        complexMatAdd(B, A, BA, N)
        expect(maxDiff(AB, BA, N)).toBeLessThan(1e-15)
      }),
      { numRuns: 200 }
    )
  })
})

// ---------------------------------------------------------------------------
// Scalar multiplication
// ---------------------------------------------------------------------------

describe('complex matrix scale — properties', () => {
  it('1 * A = A', () => {
    fc.assert(
      fc.property(arbMatWithN, ({ N, A }) => {
        const out = complexMatZero(N)
        complexMatScale(A, 1, 0, out, N)
        expect(maxDiff(out, A, N)).toBeLessThan(1e-15)
      }),
      { numRuns: 200 }
    )
  })

  it('0 * A = 0', () => {
    fc.assert(
      fc.property(arbMatWithN, ({ N, A }) => {
        const out = complexMatZero(N)
        complexMatScale(A, 0, 0, out, N)
        const Z = complexMatZero(N)
        expect(maxDiff(out, Z, N)).toBeLessThan(1e-15)
      }),
      { numRuns: 200 }
    )
  })

  it('distributes over addition: α(A + B) = αA + αB', () => {
    const arb = arbN.chain((N) =>
      fc
        .tuple(arbMatrix(N), arbMatrix(N), arbComplex)
        .map(([A, B, [alphaRe, alphaIm]]) => ({ N, A, B, alphaRe, alphaIm }))
    )
    fc.assert(
      fc.property(arb, ({ N, A, B, alphaRe, alphaIm }) => {
        const sum = complexMatZero(N)
        complexMatAdd(A, B, sum, N)
        const lhs = complexMatZero(N)
        complexMatScale(sum, alphaRe, alphaIm, lhs, N)

        const scaledA = complexMatZero(N)
        const scaledB = complexMatZero(N)
        complexMatScale(A, alphaRe, alphaIm, scaledA, N)
        complexMatScale(B, alphaRe, alphaIm, scaledB, N)
        const rhs = complexMatZero(N)
        complexMatAdd(scaledA, scaledB, rhs, N)

        expect(maxDiff(lhs, rhs, N)).toBeLessThan(1e-8)
      }),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// 1-norm
// ---------------------------------------------------------------------------

describe('complex matrix 1-norm — properties', () => {
  it('‖A‖₁ ≥ 0', () => {
    fc.assert(
      fc.property(arbMatWithN, ({ N, A }) => {
        expect(complexMatNorm1(A, N)).toBeGreaterThanOrEqual(0)
      }),
      { numRuns: 200 }
    )
  })

  it('‖0‖₁ = 0', () => {
    fc.assert(
      fc.property(arbN, (N) => {
        expect(complexMatNorm1(complexMatZero(N), N)).toBe(0)
      })
    )
  })

  it('‖αA‖₁ = |α| ‖A‖₁ (absolute homogeneity)', () => {
    const arb = arbN.chain((N) =>
      fc
        .tuple(arbMatrix(N), arbComplex)
        .map(([A, [alphaRe, alphaIm]]) => ({ N, A, alphaRe, alphaIm }))
    )
    fc.assert(
      fc.property(arb, ({ N, A, alphaRe, alphaIm }) => {
        const absAlpha = Math.sqrt(alphaRe * alphaRe + alphaIm * alphaIm)
        const scaled = complexMatZero(N)
        complexMatScale(A, alphaRe, alphaIm, scaled, N)
        const normScaled = complexMatNorm1(scaled, N)
        const expected = absAlpha * complexMatNorm1(A, N)
        if (expected < 1e-12) {
          expect(normScaled).toBeLessThan(1e-8)
        } else {
          expect(normScaled).toBeCloseTo(expected, 4)
        }
      }),
      { numRuns: 200 }
    )
  })

  it('‖A + B‖₁ ≤ ‖A‖₁ + ‖B‖₁ (triangle inequality)', () => {
    fc.assert(
      fc.property(arbMatPair, ({ N, A, B }) => {
        const sum = complexMatZero(N)
        complexMatAdd(A, B, sum, N)
        const normSum = complexMatNorm1(sum, N)
        const normA = complexMatNorm1(A, N)
        const normB = complexMatNorm1(B, N)
        expect(normSum).toBeLessThanOrEqual(normA + normB + 1e-10)
      }),
      { numRuns: 200 }
    )
  })
})
