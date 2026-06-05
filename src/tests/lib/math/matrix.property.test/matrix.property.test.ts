/**
 * Property-based tests for n-dimensional matrix operations.
 *
 * Uses fast-check to verify algebraic identities hold across arbitrary
 * matrices and dimensions, catching edge cases that hand-picked examples miss.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  createIdentityMatrix,
  determinant,
  multiplyMatrices,
  multiplyMatricesInto,
  multiplyMatrixVector,
  transposeMatrix,
} from '@/lib/math'
import { arbMatrix, arbVector } from '@/tests/lib/math/arbitraries'

// ---------------------------------------------------------------------------
// Derived Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary dimension for matrix tests (small for perf, 2-6) */
const arbDim = fc.integer({ min: 2, max: 6 })

/** Single matrix with its dimension */
const arbMatWithDim = arbDim.chain((dim) => arbMatrix(dim).map((M) => ({ dim, M })))

/** Pair of same-dim matrices */
const arbMatPair = arbDim.chain((dim) =>
  fc.tuple(arbMatrix(dim), arbMatrix(dim)).map(([A, B]) => ({ dim, A, B }))
)

/** Triple of same-dim matrices */
const arbMatTriple = arbDim.chain((dim) =>
  fc.tuple(arbMatrix(dim), arbMatrix(dim), arbMatrix(dim)).map(([A, B, C]) => ({ dim, A, B, C }))
)

// ---------------------------------------------------------------------------
// Identity element
// ---------------------------------------------------------------------------

describe('matrix identity — properties', () => {
  it('I * A = A', () => {
    fc.assert(
      fc.property(arbMatWithDim, ({ dim, M }) => {
        const I = createIdentityMatrix(dim)
        const result = multiplyMatrices(I, M)
        for (let i = 0; i < dim * dim; i++) {
          expect(result[i]).toBeCloseTo(M[i]!, 3)
        }
      })
    )
  })

  it('A * I = A', () => {
    fc.assert(
      fc.property(arbMatWithDim, ({ dim, M }) => {
        const I = createIdentityMatrix(dim)
        const result = multiplyMatrices(M, I)
        for (let i = 0; i < dim * dim; i++) {
          expect(result[i]).toBeCloseTo(M[i]!, 3)
        }
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Associativity
// ---------------------------------------------------------------------------

describe('matrix multiplication — properties', () => {
  it('is associative: (A*B)*C = A*(B*C)', () => {
    fc.assert(
      fc.property(arbMatTriple, ({ dim, A, B, C }) => {
        const AB = multiplyMatrices(A, B)
        const BC = multiplyMatrices(B, C)
        const lhs = multiplyMatrices(AB, C)
        const rhs = multiplyMatrices(A, BC)
        for (let i = 0; i < dim * dim; i++) {
          expect(lhs[i]).toBeCloseTo(rhs[i]!, 0)
        }
      })
    )
  })

  it('multiplyMatricesInto matches multiplyMatrices', () => {
    fc.assert(
      fc.property(arbMatPair, ({ dim, A, B }) => {
        const expected = multiplyMatrices(A, B)
        const out = new Float32Array(dim * dim)
        multiplyMatricesInto(out, A, B)
        for (let i = 0; i < dim * dim; i++) {
          expect(out[i]).toBeCloseTo(expected[i]!, 5)
        }
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Transpose
// ---------------------------------------------------------------------------

describe('transpose — properties', () => {
  it('is an involution: (A^T)^T = A', () => {
    fc.assert(
      fc.property(arbMatWithDim, ({ dim, M }) => {
        const ATT = transposeMatrix(transposeMatrix(M))
        for (let i = 0; i < dim * dim; i++) {
          expect(ATT[i]).toBeCloseTo(M[i]!, 5)
        }
      })
    )
  })

  it('(AB)^T = B^T A^T', () => {
    fc.assert(
      fc.property(arbMatPair, ({ dim, A, B }) => {
        const lhs = transposeMatrix(multiplyMatrices(A, B))
        const rhs = multiplyMatrices(transposeMatrix(B), transposeMatrix(A))
        for (let i = 0; i < dim * dim; i++) {
          expect(lhs[i]).toBeCloseTo(rhs[i]!, 2)
        }
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Determinant
// ---------------------------------------------------------------------------

describe('determinant — properties', () => {
  it('det(I) = 1', () => {
    fc.assert(
      fc.property(arbDim, (dim) => {
        expect(determinant(createIdentityMatrix(dim))).toBeCloseTo(1, 5)
      })
    )
  })

  it('det(AB) = det(A) * det(B) for small matrices', () => {
    // Restrict to dim 2-4 to keep numerical error manageable
    const smallMatPair = fc
      .integer({ min: 2, max: 4 })
      .chain((dim) => fc.tuple(arbMatrix(dim), arbMatrix(dim)).map(([A, B]) => ({ dim, A, B })))
    fc.assert(
      fc.property(smallMatPair, ({ A, B }) => {
        const detAB = determinant(multiplyMatrices(A, B))
        const detA_detB = determinant(A) * determinant(B)
        // Float32 precision limits us here
        if (Math.abs(detA_detB) < 1e-4) return // skip near-singular
        const relError = Math.abs(detAB - detA_detB) / Math.max(Math.abs(detA_detB), 1)
        expect(relError).toBeLessThan(0.1) // 10% relative for Float32
      })
    )
  })

  it('det(A^T) = det(A)', () => {
    fc.assert(
      fc.property(arbMatWithDim, ({ M }) => {
        const detA = determinant(M)
        const detAT = determinant(transposeMatrix(M))
        if (Math.abs(detA) < 1e-6) return // skip near-singular
        expect(detAT).toBeCloseTo(detA, 1)
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Matrix-vector multiplication
// ---------------------------------------------------------------------------

describe('matrix-vector multiplication — properties', () => {
  it('I * v = v', () => {
    const arb = arbDim.chain((dim) => arbVector(dim, 10).map((v) => ({ dim, v })))
    fc.assert(
      fc.property(arb, ({ dim, v }) => {
        const I = createIdentityMatrix(dim)
        const result = multiplyMatrixVector(I, v)
        for (let i = 0; i < dim; i++) {
          expect(result[i]).toBeCloseTo(v[i]!, 3)
        }
      })
    )
  })

  it('is linear: A(αu + βv) = αAu + βAv', () => {
    const scalar = fc.double({ min: -5, max: 5, noNaN: true, noDefaultInfinity: true })
    const arb = fc
      .integer({ min: 2, max: 5 })
      .chain((dim) =>
        fc
          .tuple(arbMatrix(dim), arbVector(dim, 10), arbVector(dim, 10), scalar, scalar)
          .map(([A, u, v, alpha, beta]) => ({ dim, A, u, v, alpha, beta }))
      )
    fc.assert(
      fc.property(arb, ({ dim, A, u, v, alpha, beta }) => {
        // LHS: A(αu + βv)
        const combined = u.map((ui, i) => alpha * ui + beta * v[i]!)
        const lhs = multiplyMatrixVector(A, combined)
        // RHS: αAu + βAv
        const Au = multiplyMatrixVector(A, u)
        const Av = multiplyMatrixVector(A, v)
        const rhs = Au.map((aui, i) => alpha * aui + beta * Av[i]!)
        for (let i = 0; i < dim; i++) {
          expect(lhs[i]).toBeCloseTo(rhs[i]!, 1)
        }
      })
    )
  })
})
