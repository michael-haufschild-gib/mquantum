/**
 * Property-based tests for n-dimensional vector operations.
 *
 * Uses fast-check to verify algebraic identities hold across arbitrary
 * vectors and dimensions, catching edge cases that hand-picked examples miss.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  addVectors,
  crossProduct3D,
  dotProduct,
  magnitude,
  normalize,
  scaleVector,
  subtractVectors,
} from '@/lib/math'

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary vector of a given dimension with finite, non-extreme components */
function arbVector(dim: number) {
  return fc.array(fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }), {
    minLength: dim,
    maxLength: dim,
  })
}

/** Arbitrary dimension in the project's supported range */
const arbDim = fc.integer({ min: 2, max: 11 })

/** Arbitrary scalar with finite, non-extreme values */
const arbScalar = fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true })

/** Pair of same-dim vectors */
const arbVecPair = arbDim.chain((dim) =>
  fc.tuple(arbVector(dim), arbVector(dim)).map(([a, b]) => ({ dim, a, b }))
)

/** Single vector with its dimension */
const arbVecWithDim = arbDim.chain((dim) => arbVector(dim).map((v) => ({ dim, v })))

/** Arbitrary 3D vector */
const arbVec3 = arbVector(3)

// ---------------------------------------------------------------------------
// Vector addition properties
// ---------------------------------------------------------------------------

describe('vector addition — properties', () => {
  it('is commutative: a + b = b + a', () => {
    fc.assert(
      fc.property(arbVecPair, ({ dim, a, b }) => {
        const ab = addVectors(a, b)
        const ba = addVectors(b, a)
        for (let i = 0; i < dim; i++) {
          expect(ab[i]).toBeCloseTo(ba[i]!, 10)
        }
      })
    )
  })

  it('has zero as identity: a + 0 = a', () => {
    fc.assert(
      fc.property(arbVecWithDim, ({ dim, v }) => {
        const zero = Array.from<number>({ length: dim }).fill(0)
        const result = addVectors(v, zero)
        for (let i = 0; i < dim; i++) {
          expect(result[i]).toBeCloseTo(v[i]!, 10)
        }
      })
    )
  })

  it('a - a = 0', () => {
    fc.assert(
      fc.property(arbVecWithDim, ({ dim, v }) => {
        const result = subtractVectors(v, v)
        for (let i = 0; i < dim; i++) {
          expect(result[i]).toBeCloseTo(0, 10)
        }
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Scalar multiplication properties
// ---------------------------------------------------------------------------

describe('scalar multiplication — properties', () => {
  it('distributes over vector addition: α(a + b) = αa + αb', () => {
    const arb = arbDim.chain((dim) =>
      fc
        .tuple(arbVector(dim), arbVector(dim), arbScalar)
        .map(([a, b, alpha]) => ({ dim, a, b, alpha }))
    )
    fc.assert(
      fc.property(arb, ({ dim, a, b, alpha }) => {
        const lhs = scaleVector(addVectors(a, b), alpha)
        const rhs = addVectors(scaleVector(a, alpha), scaleVector(b, alpha))
        for (let i = 0; i < dim; i++) {
          expect(lhs[i]).toBeCloseTo(rhs[i]!, 5)
        }
      })
    )
  })

  it('is associative: α(βv) = (αβ)v', () => {
    const arb = arbDim.chain((dim) =>
      fc
        .tuple(arbVector(dim), arbScalar, arbScalar)
        .map(([v, alpha, beta]) => ({ dim, v, alpha, beta }))
    )
    fc.assert(
      fc.property(arb, ({ dim, v, alpha, beta }) => {
        const lhs = scaleVector(scaleVector(v, beta), alpha)
        const rhs = scaleVector(v, alpha * beta)
        for (let i = 0; i < dim; i++) {
          expect(lhs[i]).toBeCloseTo(rhs[i]!, 4)
        }
      })
    )
  })

  it('scaling by 0 gives zero vector', () => {
    fc.assert(
      fc.property(arbVecWithDim, ({ dim, v }) => {
        const result = scaleVector(v, 0)
        for (let i = 0; i < dim; i++) {
          expect(result[i]).toBeCloseTo(0, 15) // handles -0
        }
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Dot product properties
// ---------------------------------------------------------------------------

describe('dot product — properties', () => {
  it('is commutative: ⟨a, b⟩ = ⟨b, a⟩', () => {
    fc.assert(
      fc.property(arbVecPair, ({ a, b }) => {
        expect(dotProduct(a, b)).toBeCloseTo(dotProduct(b, a), 8)
      })
    )
  })

  it('is linear in first argument: ⟨αa + βb, c⟩ = α⟨a,c⟩ + β⟨b,c⟩', () => {
    const arb = arbDim.chain((dim) =>
      fc
        .tuple(arbVector(dim), arbVector(dim), arbVector(dim), arbScalar, arbScalar)
        .map(([a, b, c, alpha, beta]) => ({ a, b, c, alpha, beta }))
    )
    fc.assert(
      fc.property(arb, ({ a, b, c, alpha, beta }) => {
        const lhs = dotProduct(addVectors(scaleVector(a, alpha), scaleVector(b, beta)), c)
        const rhs = alpha * dotProduct(a, c) + beta * dotProduct(b, c)
        expect(lhs).toBeCloseTo(rhs, 2)
      })
    )
  })

  it('is non-negative for self: ⟨v, v⟩ >= 0', () => {
    fc.assert(
      fc.property(arbVecWithDim, ({ v }) => {
        expect(dotProduct(v, v)).toBeGreaterThanOrEqual(-1e-10)
      })
    )
  })

  it('|v|² = ⟨v, v⟩', () => {
    fc.assert(
      fc.property(arbVecWithDim, ({ v }) => {
        const mag = magnitude(v)
        expect(mag * mag).toBeCloseTo(dotProduct(v, v), 5)
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Magnitude and normalize properties
// ---------------------------------------------------------------------------

describe('normalize — properties', () => {
  it('produces unit vector: |normalize(v)| = 1', () => {
    fc.assert(
      fc.property(arbVecWithDim, ({ v }) => {
        const mag = magnitude(v)
        if (mag < 1e-7) return // skip near-zero vectors
        const n = normalize(v)
        expect(magnitude(n)).toBeCloseTo(1, 5)
      })
    )
  })

  it('preserves direction: normalize(αv) = ±normalize(v) for α ≠ 0', () => {
    const arb = arbDim.chain((dim) =>
      fc.tuple(arbVector(dim), arbScalar).map(([v, alpha]) => ({ dim, v, alpha }))
    )
    fc.assert(
      fc.property(arb, ({ dim, v, alpha }) => {
        const mag = magnitude(v)
        const scaled = scaleVector(v, alpha)
        const scaledMag = magnitude(scaled)
        // Skip when either vector is too small for stable normalization
        if (mag < 1e-6 || Math.abs(alpha) < 1e-6 || scaledMag < 1e-6) return
        const n1 = normalize(v)
        const n2 = normalize(scaled)
        const sign = Math.sign(alpha)
        for (let i = 0; i < dim; i++) {
          expect(n2[i]).toBeCloseTo(sign * n1[i]!, 5)
        }
      })
    )
  })
})

// ---------------------------------------------------------------------------
// Cross product properties (3D only)
// ---------------------------------------------------------------------------

describe('cross product — properties', () => {
  it('is anti-commutative: a × b = -(b × a)', () => {
    fc.assert(
      fc.property(arbVec3, arbVec3, (a, b) => {
        const axb = crossProduct3D(a, b)
        const bxa = crossProduct3D(b, a)
        for (let i = 0; i < 3; i++) {
          expect(axb[i]).toBeCloseTo(-bxa[i]!, 8)
        }
      })
    )
  })

  it('result is perpendicular to both inputs: ⟨a×b, a⟩ = 0 and ⟨a×b, b⟩ = 0', () => {
    fc.assert(
      fc.property(arbVec3, arbVec3, (a, b) => {
        const cross = crossProduct3D(a, b)
        expect(dotProduct(cross, a)).toBeCloseTo(0, 5)
        expect(dotProduct(cross, b)).toBeCloseTo(0, 5)
      })
    )
  })

  it('self cross product is zero: a × a = 0', () => {
    fc.assert(
      fc.property(arbVec3, (a) => {
        const result = crossProduct3D(a, a)
        for (let i = 0; i < 3; i++) {
          expect(result[i]).toBeCloseTo(0, 8)
        }
      })
    )
  })

  it('Lagrange identity: |a×b|² = |a|²|b|² - ⟨a,b⟩²', () => {
    fc.assert(
      fc.property(arbVec3, arbVec3, (a, b) => {
        const cross = crossProduct3D(a, b)
        const lhs = dotProduct(cross, cross)
        const rhs = dotProduct(a, a) * dotProduct(b, b) - dotProduct(a, b) ** 2
        expect(lhs).toBeCloseTo(rhs, 2)
      })
    )
  })
})
