/**
 * Property-based tests for n-dimensional rotation matrices (SO(n)).
 *
 * Uses fast-check to verify SO(n) group invariants hold across arbitrary
 * dimensions, plane indices, and angles — catching the numerical boundary
 * cases that fixed-example tests miss.
 *
 * Note: This project uses a fast trig approximation (~1.2% max error),
 * so tolerances are looser than exact-trig would allow.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  createIdentityMatrix,
  createRotationMatrix,
  determinant,
  magnitude,
  multiplyMatrices,
  multiplyMatrixVector,
  transposeMatrix,
} from '@/lib/math'

// Fast trig compounds errors; 0.15 tolerance per element
const FAST_TRIG_TOL = 0.15

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary dimension in the project's full range 3-11 */
const arbDim = fc.integer({ min: 3, max: 11 })

/** Arbitrary angle in [-2π, 2π] */
const arbAngle = fc.double({
  min: -2 * Math.PI,
  max: 2 * Math.PI,
  noNaN: true,
  noDefaultInfinity: true,
})

/** Arbitrary valid (dim, i, j) rotation plane spec */
const arbPlane = arbDim.chain((dim) => {
  const maxIdx = dim - 1
  return fc
    .tuple(fc.integer({ min: 0, max: maxIdx }), fc.integer({ min: 0, max: maxIdx }))
    .filter(([i, j]) => i !== j)
    .map(([i, j]) => ({ dim, i: Math.min(i, j), j: Math.max(i, j) }))
})

/** Arbitrary (dim, i, j, angle) for a single rotation */
const arbRotation = arbPlane.chain(({ dim, i, j }) =>
  arbAngle.map((angle) => ({ dim, i, j, angle }))
)

/** Arbitrary vector of a given dimension */
function arbVector(dim: number) {
  return fc.array(fc.double({ min: -10, max: 10, noNaN: true, noDefaultInfinity: true }), {
    minLength: dim,
    maxLength: dim,
  })
}

// Helper: Frobenius distance from identity
function orthoError(M: Float32Array, dim: number): number {
  const MT = transposeMatrix(M)
  const product = multiplyMatrices(M, MT)
  const I = createIdentityMatrix(dim)
  let maxDiff = 0
  for (let k = 0; k < dim * dim; k++) {
    maxDiff = Math.max(maxDiff, Math.abs(product[k]! - I[k]!))
  }
  return maxDiff
}

// ---------------------------------------------------------------------------
// SO(n) invariants
// ---------------------------------------------------------------------------

describe('rotation matrix SO(n) — properties', () => {
  it('R * R^T ≈ I (orthogonality)', () => {
    fc.assert(
      fc.property(arbRotation, ({ dim, i, j, angle }) => {
        const R = createRotationMatrix(dim, i, j, angle)
        expect(orthoError(R, dim)).toBeLessThan(FAST_TRIG_TOL)
      }),
      { numRuns: 200 }
    )
  })

  it('det(R) ≈ +1', () => {
    // Restrict to dim ≤ 7: determinant() uses cofactor expansion (O(n!)),
    // so dims 8-11 are prohibitively slow for property tests
    const arbSmallRotation = fc.integer({ min: 3, max: 7 }).chain((dim) => {
      const maxIdx = dim - 1
      return fc
        .tuple(fc.integer({ min: 0, max: maxIdx }), fc.integer({ min: 0, max: maxIdx }))
        .filter(([a, b]) => a !== b)
        .chain(([a, b]) =>
          arbAngle.map((angle) => ({ dim, i: Math.min(a, b), j: Math.max(a, b), angle }))
        )
    })
    fc.assert(
      fc.property(arbSmallRotation, ({ dim, i, j, angle }) => {
        const R = createRotationMatrix(dim, i, j, angle)
        expect(Math.abs(determinant(R) - 1)).toBeLessThan(FAST_TRIG_TOL)
      }),
      { numRuns: 100 }
    )
  })

  it('preserves vector magnitude: |Rv| ≈ |v|', () => {
    const arb = arbRotation.chain(({ dim, i, j, angle }) =>
      arbVector(dim).map((v) => ({ dim, i, j, angle, v }))
    )
    fc.assert(
      fc.property(arb, ({ dim, i, j, angle, v }) => {
        const R = createRotationMatrix(dim, i, j, angle)
        const rv = multiplyMatrixVector(R, v)
        const origMag = magnitude(v)
        if (origMag < 1e-8) return // skip near-zero
        const rotMag = magnitude(rv)
        const relError = Math.abs(rotMag - origMag) / origMag
        expect(relError).toBeLessThan(FAST_TRIG_TOL)
      }),
      { numRuns: 200 }
    )
  })

  it('R(-θ) ≈ R(θ)^T (inverse = transpose)', () => {
    fc.assert(
      fc.property(arbRotation, ({ dim, i, j, angle }) => {
        const R = createRotationMatrix(dim, i, j, angle)
        const Rinv = createRotationMatrix(dim, i, j, -angle)
        const RT = transposeMatrix(R)
        for (let k = 0; k < dim * dim; k++) {
          expect(Rinv[k]).toBeCloseTo(RT[k]!, 0)
        }
      }),
      { numRuns: 200 }
    )
  })

  it('R(θ) * R(-θ) ≈ I', () => {
    fc.assert(
      fc.property(arbRotation, ({ dim, i, j, angle }) => {
        const R = createRotationMatrix(dim, i, j, angle)
        const Rinv = createRotationMatrix(dim, i, j, -angle)
        const product = multiplyMatrices(R, Rinv)
        const I = createIdentityMatrix(dim)
        for (let k = 0; k < dim * dim; k++) {
          expect(Math.abs(product[k]! - I[k]!)).toBeLessThan(FAST_TRIG_TOL)
        }
      }),
      { numRuns: 200 }
    )
  })

  it('R(0) = I', () => {
    fc.assert(
      fc.property(arbPlane, ({ dim, i, j }) => {
        const R = createRotationMatrix(dim, i, j, 0)
        const I = createIdentityMatrix(dim)
        for (let k = 0; k < dim * dim; k++) {
          expect(R[k]).toBeCloseTo(I[k]!, 5)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('rotation only affects the two axes in the plane', () => {
    fc.assert(
      fc.property(arbRotation, ({ dim, i, j, angle }) => {
        const R = createRotationMatrix(dim, i, j, angle)
        // For axes NOT in the rotation plane, the column should be a basis vector
        for (let col = 0; col < dim; col++) {
          if (col === i || col === j) continue
          for (let row = 0; row < dim; row++) {
            const expected = row === col ? 1 : 0
            expect(Math.abs(R[row * dim + col]! - expected)).toBeLessThan(1e-5)
          }
        }
      }),
      { numRuns: 200 }
    )
  })
})

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

describe('rotation composition — properties', () => {
  it('is associative: (R1 R2) R3 = R1 (R2 R3)', () => {
    const arbThreeRotations = arbDim.chain((dim) => {
      const maxIdx = dim - 1
      const arbSinglePlane = fc
        .tuple(fc.integer({ min: 0, max: maxIdx }), fc.integer({ min: 0, max: maxIdx }))
        .filter(([a, b]) => a !== b)
        .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as const)
      return fc
        .tuple(arbSinglePlane, arbSinglePlane, arbSinglePlane, arbAngle, arbAngle, arbAngle)
        .map(([p1, p2, p3, a1, a2, a3]) => ({
          dim,
          R1: createRotationMatrix(dim, p1[0], p1[1], a1),
          R2: createRotationMatrix(dim, p2[0], p2[1], a2),
          R3: createRotationMatrix(dim, p3[0], p3[1], a3),
        }))
    })

    fc.assert(
      fc.property(arbThreeRotations, ({ dim, R1, R2, R3 }) => {
        const lhs = multiplyMatrices(multiplyMatrices(R1, R2), R3)
        const rhs = multiplyMatrices(R1, multiplyMatrices(R2, R3))
        for (let k = 0; k < dim * dim; k++) {
          expect(lhs[k]).toBeCloseTo(rhs[k]!, 0)
        }
      }),
      { numRuns: 100 }
    )
  })

  it('orthogonal planes commute: R_{ij} R_{kl} = R_{kl} R_{ij} when {i,j} ∩ {k,l} = ∅', () => {
    // Need dim >= 4 to have two orthogonal planes
    const arbOrthogonalPair = fc.integer({ min: 4, max: 8 }).chain((dim) =>
      fc.tuple(arbAngle, arbAngle).map(([a1, a2]) => ({
        dim,
        // Use first two axes and last two axes — guaranteed disjoint
        R1: createRotationMatrix(dim, 0, 1, a1),
        R2: createRotationMatrix(dim, dim - 2, dim - 1, a2),
      }))
    )

    fc.assert(
      fc.property(arbOrthogonalPair, ({ dim, R1, R2 }) => {
        const AB = multiplyMatrices(R1, R2)
        const BA = multiplyMatrices(R2, R1)
        for (let k = 0; k < dim * dim; k++) {
          expect(AB[k]).toBeCloseTo(BA[k]!, 0)
        }
      }),
      { numRuns: 100 }
    )
  })
})
