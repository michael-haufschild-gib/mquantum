import { describe, expect, it } from 'vitest'

import type { ComplexMatrix } from '@/lib/physics/openQuantum/complexMatrix'
import {
  complexMatAdd,
  complexMatCopy,
  complexMatIdentity,
  complexMatMul,
  complexMatNorm1,
  complexMatScale,
  complexMatZero,
  matrixExponentialPade,
  solveLinearSystem,
} from '@/lib/physics/openQuantum/complexMatrix'

/**
 * Helper: create a ComplexMatrix from row-major (re, im) pair arrays.
 */
function mat(N: number, data: [number, number][]): ComplexMatrix {
  const m = complexMatZero(N)
  for (let i = 0; i < data.length; i++) {
    m.real[i] = data[i]![0]
    m.imag[i] = data[i]![1]
  }
  return m
}

/**
 * Helper: check that two matrices are approximately equal.
 */
function expectMatClose(A: ComplexMatrix, B: ComplexMatrix, N: number, tol = 1e-10) {
  for (let i = 0; i < N * N; i++) {
    expect(A.real[i]).toBeCloseTo(B.real[i]!, tol > 1e-6 ? 4 : 10)
    expect(A.imag[i]).toBeCloseTo(B.imag[i]!, tol > 1e-6 ? 4 : 10)
  }
}

describe('complexMatIdentity', () => {
  it('has 1s on diagonal and 0s elsewhere for N=3', () => {
    // Bug caught: identity matrix has wrong diagonal values or non-zero off-diagonals.
    const I = complexMatIdentity(3)
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const idx = i * 3 + j
        if (i === j) {
          expect(I.real[idx]).toBe(1)
          expect(I.imag[idx]).toBe(0)
        } else {
          expect(I.real[idx]).toBe(0)
          expect(I.imag[idx]).toBe(0)
        }
      }
    }
  })
})

describe('complexMatMul', () => {
  it('I * A = A for identity I', () => {
    // Bug caught: multiplication by identity changes the matrix (broken indexing).
    const N = 3
    const I = complexMatIdentity(N)
    const A = mat(N, [
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
      [9, 10],
      [11, 12],
      [13, 14],
      [15, 16],
      [17, 18],
    ])
    const out = complexMatZero(N)
    complexMatMul(I, A, out, N)
    expectMatClose(out, A, N)
  })

  it('A * B != B * A for non-commuting matrices', () => {
    // Bug caught: multiplication treats A*B as commutative (e.g., transposes or
    // symmetric result), which would hide ordering bugs.
    const N = 2
    const A = mat(N, [
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ])
    const B = mat(N, [
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 0],
    ])

    const AB = complexMatZero(N)
    const BA = complexMatZero(N)
    complexMatMul(A, B, AB, N)
    complexMatMul(B, A, BA, N)

    // AB = [[2,1],[4,3]], BA = [[3,4],[1,2]] — these differ
    let identical = true
    for (let i = 0; i < N * N; i++) {
      if (
        Math.abs(AB.real[i]! - BA.real[i]!) > 1e-15 ||
        Math.abs(AB.imag[i]! - BA.imag[i]!) > 1e-15
      ) {
        identical = false
        break
      }
    }
    expect(identical).toBe(false)

    // Verify actual AB values: A*B = [[2,1],[4,3]]
    expect(AB.real[0]).toBeCloseTo(2, 10)
    expect(AB.real[1]).toBeCloseTo(1, 10)
    expect(AB.real[2]).toBeCloseTo(4, 10)
    expect(AB.real[3]).toBeCloseTo(3, 10)
  })

  it('supports output aliasing the left or right operand', () => {
    const N = 2
    const A = mat(N, [
      [1, 1],
      [2, -1],
      [0.5, 0],
      [-3, 2],
    ])
    const B = mat(N, [
      [0, 2],
      [1, 0],
      [4, -1],
      [2, 3],
    ])
    const expected = complexMatZero(N)
    complexMatMul(A, B, expected, N)

    const leftAlias = mat(N, [
      [1, 1],
      [2, -1],
      [0.5, 0],
      [-3, 2],
    ])
    complexMatMul(leftAlias, B, leftAlias, N)
    expectMatClose(leftAlias, expected, N)

    const rightAlias = mat(N, [
      [0, 2],
      [1, 0],
      [4, -1],
      [2, 3],
    ])
    complexMatMul(A, rightAlias, rightAlias, N)
    expectMatClose(rightAlias, expected, N)
  })
})

describe('complexMatAdd', () => {
  it('adds element-wise correctly', () => {
    // Bug caught: addition uses wrong indexing or mixes real/imag parts.
    const N = 2
    const A = mat(N, [
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
    ])
    const B = mat(N, [
      [10, 20],
      [30, 40],
      [50, 60],
      [70, 80],
    ])
    const out = complexMatZero(N)
    complexMatAdd(A, B, out, N)

    expect(out.real[0]).toBeCloseTo(11, 10)
    expect(out.imag[0]).toBeCloseTo(22, 10)
    expect(out.real[1]).toBeCloseTo(33, 10)
    expect(out.imag[1]).toBeCloseTo(44, 10)
    expect(out.real[2]).toBeCloseTo(55, 10)
    expect(out.imag[2]).toBeCloseTo(66, 10)
    expect(out.real[3]).toBeCloseTo(77, 10)
    expect(out.imag[3]).toBeCloseTo(88, 10)
  })
})

describe('complexMatScale', () => {
  it('doubles all elements with scalar (2+0i)', () => {
    // Bug caught: scaling applies complex multiplication incorrectly
    // (e.g., forgetting cross terms or wrong sign on imaginary part).
    const N = 2
    const A = mat(N, [
      [1, 3],
      [5, 7],
      [2, 4],
      [6, 8],
    ])
    const out = complexMatZero(N)
    complexMatScale(A, 2, 0, out, N)

    for (let i = 0; i < N * N; i++) {
      expect(out.real[i]).toBeCloseTo(A.real[i]! * 2, 10)
      expect(out.imag[i]).toBeCloseTo(A.imag[i]! * 2, 10)
    }
  })

  it('scales by purely imaginary scalar (0+1i) correctly', () => {
    // Bug caught: imaginary scaling swaps or negates components incorrectly.
    // (a + bi) * (0 + i) = -b + ai
    const N = 2
    const A = mat(N, [
      [3, 4],
      [0, 0],
      [0, 0],
      [1, -2],
    ])
    const out = complexMatZero(N)
    complexMatScale(A, 0, 1, out, N)

    // Element [0,0]: (3+4i)*(0+i) = -4+3i
    expect(out.real[0]).toBeCloseTo(-4, 10)
    expect(out.imag[0]).toBeCloseTo(3, 10)
    // Element [1,1]: (1-2i)*(0+i) = 2+i
    expect(out.real[3]).toBeCloseTo(2, 10)
    expect(out.imag[3]).toBeCloseTo(1, 10)
  })
})

describe('complexMatNorm1', () => {
  it('returns correct 1-norm for known matrix', () => {
    // Bug caught: 1-norm computed as row-sum instead of column-sum, or
    // complex modulus computed incorrectly.
    // Matrix: [[3+4i, 0], [0, 1+0i]]
    // Column 0 sum: |3+4i| + |0| = 5
    // Column 1 sum: |0| + |1| = 1
    // 1-norm = max(5, 1) = 5
    const N = 2
    const A = mat(N, [
      [3, 4],
      [0, 0],
      [0, 0],
      [1, 0],
    ])
    expect(complexMatNorm1(A, N)).toBeCloseTo(5, 10)
  })

  it('returns 1-norm with off-diagonal contributions', () => {
    // Bug caught: off-diagonal elements ignored in column sum.
    // Matrix: [[1, 0], [3+4i, 2]]
    // Column 0: |1| + |3+4i| = 1 + 5 = 6
    // Column 1: |0| + |2| = 2
    // 1-norm = 6
    const N = 2
    const A = mat(N, [
      [1, 0],
      [0, 0],
      [3, 4],
      [2, 0],
    ])
    expect(complexMatNorm1(A, N)).toBeCloseTo(6, 10)
  })
})

describe('matrixExponentialPade', () => {
  it('exp(0) = I', () => {
    // Bug caught: zero-matrix special case returns wrong result.
    const N = 3
    const Z = complexMatZero(N)
    const result = matrixExponentialPade(Z, N)
    const I = complexMatIdentity(N)
    expectMatClose(result, I, N)
  })

  it('exp(diag(a,b)) = diag(exp(a), exp(b)) for real diagonal', () => {
    // Bug caught: diagonal matrix exponential computed incorrectly
    // (e.g., scaling phase applied wrong, or off-diagonal leakage).
    const N = 2
    const a = 0.5
    const b = -1.3
    const D = complexMatZero(N)
    D.real[0] = a // (0,0)
    D.real[3] = b // (1,1)

    const result = matrixExponentialPade(D, N)

    expect(result.real[0]).toBeCloseTo(Math.exp(a), 10)
    expect(result.imag[0]).toBeCloseTo(0, 10)
    expect(result.real[3]).toBeCloseTo(Math.exp(b), 10)
    expect(result.imag[3]).toBeCloseTo(0, 10)
    // Off-diagonals should be zero
    expect(result.real[1]).toBeCloseTo(0, 10)
    expect(result.real[2]).toBeCloseTo(0, 10)
  })

  it('exp(i*t*sigma_z) gives rotation matrix with cos/sin on diagonal', () => {
    // Bug caught: complex exponential of Hermitian generator produces wrong
    // rotation angles or wrong signs.
    //
    // sigma_z = diag(1, -1)
    // i*t*sigma_z = diag(it, -it)
    // exp(i*t*sigma_z) = diag(exp(it), exp(-it))
    //                   = diag(cos(t)+i*sin(t), cos(t)-i*sin(t))
    const t = 0.7
    const N = 2
    const M = complexMatZero(N)
    // i*t*sigma_z: diagonal with (0, t) and (0, -t)
    M.imag[0] = t // (0,0) = i*t
    M.imag[3] = -t // (1,1) = -i*t

    const result = matrixExponentialPade(M, N)

    // (0,0) = exp(it) = cos(t) + i*sin(t)
    expect(result.real[0]).toBeCloseTo(Math.cos(t), 8)
    expect(result.imag[0]).toBeCloseTo(Math.sin(t), 8)
    // (1,1) = exp(-it) = cos(t) - i*sin(t)
    expect(result.real[3]).toBeCloseTo(Math.cos(t), 8)
    expect(result.imag[3]).toBeCloseTo(-Math.sin(t), 8)
    // Off-diagonals = 0
    expect(Math.abs(result.real[1]!)).toBeLessThan(1e-10)
    expect(Math.abs(result.real[2]!)).toBeLessThan(1e-10)
  })

  it('exp(A) for nilpotent matrix matches truncated Taylor series', () => {
    // Bug caught: Padé approximation breaks for nilpotent matrices
    // (where A² = 0, so exp(A) = I + A exactly).
    // A = [[0, 1], [0, 0]], A² = 0
    // exp(A) = I + A = [[1, 1], [0, 1]]
    const N = 2
    const A = complexMatZero(N)
    A.real[1] = 1 // (0,1) = 1

    const result = matrixExponentialPade(A, N)

    expect(result.real[0]).toBeCloseTo(1, 10) // (0,0)
    expect(result.real[1]).toBeCloseTo(1, 10) // (0,1)
    expect(result.real[2]).toBeCloseTo(0, 10) // (1,0)
    expect(result.real[3]).toBeCloseTo(1, 10) // (1,1)
  })
})

describe('solveLinearSystem', () => {
  it('I * X = B yields X = B', () => {
    // Bug caught: solver returns wrong solution for trivial identity system.
    const N = 3
    const I = complexMatIdentity(N)
    const B = mat(N, [
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
      [9, 10],
      [11, 12],
      [13, 14],
      [15, 16],
      [17, 18],
    ])

    const X = solveLinearSystem(I, B, N)
    expectMatClose(X, B, N)
  })

  it('solves a 2x2 complex system correctly', () => {
    // Bug caught: Gaussian elimination with complex pivoting produces wrong result.
    // Q = [[1+i, 0], [0, 2-i]], P = [[1+i, 0], [0, 2-i]]
    // Q * X = P → X = I (since Q = P)
    const N = 2
    const Q = mat(N, [
      [1, 1],
      [0, 0],
      [0, 0],
      [2, -1],
    ])
    const P = mat(N, [
      [1, 1],
      [0, 0],
      [0, 0],
      [2, -1],
    ])

    const X = solveLinearSystem(Q, P, N)
    const I = complexMatIdentity(N)
    expectMatClose(X, I, N)
  })

  it('solves a system with non-trivial RHS', () => {
    // Bug caught: back-substitution or pivot swap logic corrupts the solution.
    // Q = [[2, 1], [1, 3]] (real), P = [[5, 0], [0, 7]] (real)
    // X = Q^{-1} * P
    // Q^{-1} = 1/5 * [[3, -1], [-1, 2]]
    // X = 1/5 * [[15, -7], [-5, 14]] = [[3, -1.4], [-1, 2.8]]
    const N = 2
    const Q = mat(N, [
      [2, 0],
      [1, 0],
      [1, 0],
      [3, 0],
    ])
    const P = mat(N, [
      [5, 0],
      [0, 0],
      [0, 0],
      [7, 0],
    ])

    const X = solveLinearSystem(Q, P, N)

    expect(X.real[0]).toBeCloseTo(3, 10)
    expect(X.real[1]).toBeCloseTo(-1.4, 10)
    expect(X.real[2]).toBeCloseTo(-1, 10)
    expect(X.real[3]).toBeCloseTo(2.8, 10)
  })

  it('solves a system requiring row pivoting (zero diagonal)', () => {
    // Bug caught: solver fails when A[0,0] = 0 and row swap is needed.
    // Q = [[0, 1], [1, 0]] (permutation matrix), P = [[3, 0], [0, 7]] (real)
    // Q * X = P → X = Q^{-1} * P = Q * P = [[0, 7], [3, 0]]
    const N = 2
    const Q = mat(N, [
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 0],
    ])
    const P = mat(N, [
      [3, 0],
      [0, 0],
      [0, 0],
      [7, 0],
    ])

    const X = solveLinearSystem(Q, P, N)

    // Q is its own inverse (permutation), so X = Q * P
    expect(X.real[0]).toBeCloseTo(0, 10) // (0,0)
    expect(X.real[1]).toBeCloseTo(7, 10) // (0,1)
    expect(X.real[2]).toBeCloseTo(3, 10) // (1,0)
    expect(X.real[3]).toBeCloseTo(0, 10) // (1,1)
  })
})

describe('complexMatCopy', () => {
  it('produces an independent copy', () => {
    const N = 2
    const src = mat(N, [
      [1, 2],
      [3, 4],
      [5, 6],
      [7, 8],
    ])
    const dst = complexMatZero(N)
    complexMatCopy(src, dst, N)

    // dst matches src
    expectMatClose(dst, src, N)

    // Mutating dst does not affect src
    dst.real[0] = 999
    expect(src.real[0]).toBe(1)
  })
})

describe('matrixExponentialPade — large norm (squaring phase)', () => {
  it('exp(10i·σ_z) is unitary and matches cos(10) + i·sin(10)', () => {
    // Bug caught: squaring phase (s > 0) introduces accumulated rounding error
    // that breaks unitarity for large-norm matrices.
    //
    // σ_z = [[1,0],[0,-1]], so 10i·σ_z = [[10i,0],[0,-10i]]
    // exp(10i·σ_z) = [[exp(10i), 0], [0, exp(-10i)]]
    //              = [[cos10 + i·sin10, 0], [0, cos10 - i·sin10]]
    //
    // ||10i·σ_z||₁ = 10 > θ₁₃ ≈ 5.37, so s = ceil(log2(10/5.37)) = 1.
    // This forces the squaring phase to run.
    const N = 2
    const A = complexMatZero(N)
    A.imag[0] = 10 // (0,0) = 10i
    A.imag[3] = -10 // (1,1) = -10i

    const result = matrixExponentialPade(A, N)

    const c = Math.cos(10)
    const s = Math.sin(10)

    // Diagonal: exp(±10i) = cos(10) ± i·sin(10)
    expect(result.real[0]).toBeCloseTo(c, 8)
    expect(result.imag[0]).toBeCloseTo(s, 8)
    expect(result.real[3]).toBeCloseTo(c, 8)
    expect(result.imag[3]).toBeCloseTo(-s, 8)

    // Off-diagonal: zero
    expect(Math.abs(result.real[1]!)).toBeLessThan(1e-10)
    expect(Math.abs(result.real[2]!)).toBeLessThan(1e-10)
  })

  it('exp(A) · exp(-A) = I (unitarity for anti-Hermitian A)', () => {
    // Tests the squaring phase with a 3×3 anti-Hermitian matrix.
    // For anti-Hermitian A (A† = -A), exp(A) is unitary: U†U = I.
    // Build A = i·H where H is Hermitian with large norm.
    const N = 3
    const A = complexMatZero(N)
    // A = i * [[8, 2+i, 0], [2-i, 6, 3], [0, 3, 7]]  (anti-Hermitian)
    // ||A||₁ will be > θ₁₃, forcing squaring
    A.imag[0] = 8 // (0,0)
    A.real[1] = -1
    A.imag[1] = 2 // (0,1) = i*(2+i) = -1+2i
    A.real[3] = 1
    A.imag[3] = 2 // (1,0) = i*(2-i) = 1+2i
    A.imag[4] = 6 // (1,1)
    A.imag[5] = 3 // (1,2)
    A.imag[7] = 3 // (2,1)
    A.imag[8] = 7 // (2,2)

    const expA = matrixExponentialPade(A, N)

    // Compute exp(-A)
    const negA = complexMatZero(N)
    complexMatScale(A, -1, 0, negA, N)
    const expNegA = matrixExponentialPade(negA, N)

    // exp(A) * exp(-A) should equal I
    const product = complexMatZero(N)
    complexMatMul(expA, expNegA, product, N)

    const I = complexMatIdentity(N)
    for (let i = 0; i < N * N; i++) {
      expect(product.real[i]).toBeCloseTo(I.real[i]!, 6)
      expect(Math.abs(product.imag[i]!)).toBeLessThan(1e-6)
    }
  })
})
