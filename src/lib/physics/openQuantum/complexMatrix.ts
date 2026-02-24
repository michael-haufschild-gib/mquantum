/**
 * Complex Matrix Utilities
 *
 * Dense complex matrix operations for the Liouvillian superoperator
 * and matrix exponential propagator. Matrices are stored as paired
 * Float64Arrays {real, imag} in row-major order.
 *
 * For K=14 hydrogen basis, the Liouvillian is 196×196 complex.
 *
 * @module lib/physics/openQuantum/complexMatrix
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Dense complex matrix stored as separate real and imaginary arrays */
export interface ComplexMatrix {
  /** Real parts, row-major, N×N */
  real: Float64Array
  /** Imaginary parts, row-major, N×N */
  imag: Float64Array
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a zero-initialized N×N complex matrix.
 *
 * @param N - Matrix dimension
 * @returns Zero complex matrix
 */
export function complexMatZero(N: number): ComplexMatrix {
  return {
    real: new Float64Array(N * N),
    imag: new Float64Array(N * N),
  }
}

/**
 * Create an N×N complex identity matrix.
 *
 * @param N - Matrix dimension
 * @returns Identity complex matrix
 */
export function complexMatIdentity(N: number): ComplexMatrix {
  const m = complexMatZero(N)
  for (let i = 0; i < N; i++) {
    m.real[i * N + i] = 1
  }
  return m
}

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

/**
 * Complex matrix multiply: C = A × B for N×N matrices.
 * Output must not alias A or B.
 *
 * @param A - Left matrix
 * @param B - Right matrix
 * @param out - Output matrix
 * @param N - Matrix dimension
 */
export function complexMatMul(
  A: ComplexMatrix,
  B: ComplexMatrix,
  out: ComplexMatrix,
  N: number,
): void {
  const Ar = A.real, Ai = A.imag
  const Br = B.real, Bi = B.imag
  const Or = out.real, Oi = out.imag

  Or.fill(0)
  Oi.fill(0)

  for (let i = 0; i < N; i++) {
    const iN = i * N
    for (let k = 0; k < N; k++) {
      const aRe = Ar[iN + k]!
      const aIm = Ai[iN + k]!
      if (aRe === 0 && aIm === 0) continue
      const kN = k * N
      for (let j = 0; j < N; j++) {
        const bRe = Br[kN + j]!
        const bIm = Bi[kN + j]!
        Or[iN + j] = Or[iN + j]! + (aRe * bRe - aIm * bIm)
        Oi[iN + j] = Oi[iN + j]! + (aRe * bIm + aIm * bRe)
      }
    }
  }
}

/**
 * Complex matrix add: C = A + B.
 *
 * @param A - First matrix
 * @param B - Second matrix
 * @param out - Output matrix (may alias A or B)
 * @param N - Matrix dimension
 */
export function complexMatAdd(
  A: ComplexMatrix,
  B: ComplexMatrix,
  out: ComplexMatrix,
  N: number,
): void {
  const size = N * N
  for (let i = 0; i < size; i++) {
    out.real[i] = A.real[i]! + B.real[i]!
    out.imag[i] = A.imag[i]! + B.imag[i]!
  }
}

/**
 * Complex matrix scale: B = scalar × A.
 *
 * @param A - Input matrix
 * @param scalarRe - Real part of scalar
 * @param scalarIm - Imaginary part of scalar
 * @param out - Output matrix (may alias A)
 * @param N - Matrix dimension
 */
export function complexMatScale(
  A: ComplexMatrix,
  scalarRe: number,
  scalarIm: number,
  out: ComplexMatrix,
  N: number,
): void {
  const size = N * N
  for (let i = 0; i < size; i++) {
    const re = A.real[i]!
    const im = A.imag[i]!
    out.real[i] = re * scalarRe - im * scalarIm
    out.imag[i] = re * scalarIm + im * scalarRe
  }
}

/**
 * Copy complex matrix: dst = src.
 *
 * @param src - Source matrix
 * @param dst - Destination matrix
 * @param N - Matrix dimension
 */
export function complexMatCopy(
  src: ComplexMatrix,
  dst: ComplexMatrix,
  N: number,
): void {
  const size = N * N
  dst.real.set(src.real.subarray(0, size))
  dst.imag.set(src.imag.subarray(0, size))
}

/**
 * Compute the 1-norm of a complex matrix: max column sum of |a_{ij}|.
 *
 * @param A - Input matrix
 * @param N - Matrix dimension
 * @returns 1-norm
 */
export function complexMatNorm1(A: ComplexMatrix, N: number): number {
  let maxCol = 0
  for (let j = 0; j < N; j++) {
    let colSum = 0
    for (let i = 0; i < N; i++) {
      const idx = i * N + j
      colSum += Math.sqrt(A.real[idx]! * A.real[idx]! + A.imag[idx]! * A.imag[idx]!)
    }
    if (colSum > maxCol) maxCol = colSum
  }
  return maxCol
}

// ---------------------------------------------------------------------------
// Linear system solver
// ---------------------------------------------------------------------------

/**
 * Solve Q · X = P via Gaussian elimination with partial pivoting.
 * Solves for the full N×N right-hand side simultaneously.
 *
 * @param Q - Coefficient matrix (not modified)
 * @param P - Right-hand side matrix (not modified)
 * @param N - System dimension
 * @returns Solution matrix X
 */
export function solveLinearSystem(
  Q: ComplexMatrix,
  P: ComplexMatrix,
  N: number,
): ComplexMatrix {
  // Augmented matrix: [A | B] where A = Q, B = P
  // Work on copies
  const Ar = new Float64Array(Q.real)
  const Ai = new Float64Array(Q.imag)
  const Br = new Float64Array(P.real)
  const Bi = new Float64Array(P.imag)

  // Row permutation (physical row swaps instead of virtual pivoting)
  for (let col = 0; col < N; col++) {
    // Find pivot row
    let maxMag = 0
    let maxRow = col
    for (let row = col; row < N; row++) {
      const idx = row * N + col
      const mag = Ar[idx]! * Ar[idx]! + Ai[idx]! * Ai[idx]!
      if (mag > maxMag) {
        maxMag = mag
        maxRow = row
      }
    }

    // Swap rows col and maxRow in both A and B
    if (maxRow !== col) {
      for (let j = 0; j < N; j++) {
        const c = col * N + j
        const m = maxRow * N + j
        let tmp: number

        tmp = Ar[c]!; Ar[c] = Ar[m]!; Ar[m] = tmp
        tmp = Ai[c]!; Ai[c] = Ai[m]!; Ai[m] = tmp
        tmp = Br[c]!; Br[c] = Br[m]!; Br[m] = tmp
        tmp = Bi[c]!; Bi[c] = Bi[m]!; Bi[m] = tmp
      }
    }

    const pivRe = Ar[col * N + col]!
    const pivIm = Ai[col * N + col]!
    const pivMag2 = pivRe * pivRe + pivIm * pivIm
    if (pivMag2 < 1e-30) continue

    // Eliminate rows below
    for (let row = col + 1; row < N; row++) {
      const idx = row * N + col
      const aRe = Ar[idx]!
      const aIm = Ai[idx]!

      // factor = A[row][col] / A[col][col]
      const fRe = (aRe * pivRe + aIm * pivIm) / pivMag2
      const fIm = (aIm * pivRe - aRe * pivIm) / pivMag2

      for (let j = col; j < N; j++) {
        const pj = col * N + j
        const rj = row * N + j
        Ar[rj] = Ar[rj]! - (fRe * Ar[pj]! - fIm * Ai[pj]!)
        Ai[rj] = Ai[rj]! - (fRe * Ai[pj]! + fIm * Ar[pj]!)
      }

      for (let j = 0; j < N; j++) {
        const pj = col * N + j
        const rj = row * N + j
        Br[rj] = Br[rj]! - (fRe * Br[pj]! - fIm * Bi[pj]!)
        Bi[rj] = Bi[rj]! - (fRe * Bi[pj]! + fIm * Br[pj]!)
      }
    }
  }

  // Back substitution: solve for each RHS column
  const result = complexMatZero(N)
  for (let j = 0; j < N; j++) {
    for (let row = N - 1; row >= 0; row--) {
      let sumRe = Br[row * N + j]!
      let sumIm = Bi[row * N + j]!

      for (let k = row + 1; k < N; k++) {
        const aRe = Ar[row * N + k]!
        const aIm = Ai[row * N + k]!
        const xRe = result.real[k * N + j]!
        const xIm = result.imag[k * N + j]!
        sumRe -= aRe * xRe - aIm * xIm
        sumIm -= aRe * xIm + aIm * xRe
      }

      const pivRe = Ar[row * N + row]!
      const pivIm = Ai[row * N + row]!
      const pivMag2 = pivRe * pivRe + pivIm * pivIm
      if (pivMag2 < 1e-30) continue

      result.real[row * N + j] = (sumRe * pivRe + sumIm * pivIm) / pivMag2
      result.imag[row * N + j] = (sumIm * pivRe - sumRe * pivIm) / pivMag2
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Matrix exponential via Padé approximation
// ---------------------------------------------------------------------------

/** Padé(13,13) coefficients b_k */
const PADE_COEFFS_13 = [
  64764752532480000, 32382376266240000, 7771770303897600, 1187353796428800,
  129060195264000, 10559470521600, 670442572800, 33522128640,
  1323241920, 40840800, 960960, 16380, 182, 1,
]

/**
 * Matrix exponential via scaling-and-squaring with Padé(13,13) approximation.
 *
 * Computes exp(A) for an N×N complex matrix. Standard algorithm from
 * Al-Mohy & Higham (2009), same as MATLAB's expm / scipy's expm.
 *
 * @param A - Input matrix (not modified)
 * @param N - Matrix dimension
 * @returns exp(A)
 */
export function matrixExponentialPade(A: ComplexMatrix, N: number): ComplexMatrix {
  const norm = complexMatNorm1(A, N)

  // Handle zero matrix
  if (norm < 1e-30) return complexMatIdentity(N)

  // Scaling: s = max(0, ceil(log2(||A||_1 / θ_13)))
  const theta13 = 5.371920351148152
  const s = Math.max(0, Math.ceil(Math.log2(norm / theta13)))

  // Scale: A_s = A / 2^s
  const scaleFactor = Math.pow(2, -s)
  const As = complexMatZero(N)
  complexMatScale(A, scaleFactor, 0, As, N)

  // Matrix powers: A², A⁴, A⁶
  const A2 = complexMatZero(N)
  const A4 = complexMatZero(N)
  const A6 = complexMatZero(N)
  complexMatMul(As, As, A2, N)
  complexMatMul(A2, A2, A4, N)
  complexMatMul(A2, A4, A6, N)

  const b = PADE_COEFFS_13
  const size = N * N
  const I = complexMatIdentity(N)

  // Compute U and V for Padé(13,13):
  // U = A_s · (A6·(b13·A6 + b11·A4 + b9·A2) + b7·A6 + b5·A4 + b3·A2 + b1·I)
  // V = A6·(b12·A6 + b10·A4 + b8·A2) + b6·A6 + b4·A4 + b2·A2 + b0·I

  // W_u = b13·A6 + b11·A4 + b9·A2
  const Wu = complexMatZero(N)
  for (let i = 0; i < size; i++) {
    Wu.real[i] = b[13]! * A6.real[i]! + b[11]! * A4.real[i]! + b[9]! * A2.real[i]!
    Wu.imag[i] = b[13]! * A6.imag[i]! + b[11]! * A4.imag[i]! + b[9]! * A2.imag[i]!
  }

  const A6Wu = complexMatZero(N)
  complexMatMul(A6, Wu, A6Wu, N)

  // Uinner = A6Wu + b7·A6 + b5·A4 + b3·A2 + b1·I
  const Uinner = complexMatZero(N)
  for (let i = 0; i < size; i++) {
    Uinner.real[i] =
      A6Wu.real[i]! + b[7]! * A6.real[i]! + b[5]! * A4.real[i]! +
      b[3]! * A2.real[i]! + b[1]! * I.real[i]!
    Uinner.imag[i] =
      A6Wu.imag[i]! + b[7]! * A6.imag[i]! + b[5]! * A4.imag[i]! +
      b[3]! * A2.imag[i]! + b[1]! * I.imag[i]!
  }

  const U = complexMatZero(N)
  complexMatMul(As, Uinner, U, N)

  // W_v = b12·A6 + b10·A4 + b8·A2
  const Wv = complexMatZero(N)
  for (let i = 0; i < size; i++) {
    Wv.real[i] = b[12]! * A6.real[i]! + b[10]! * A4.real[i]! + b[8]! * A2.real[i]!
    Wv.imag[i] = b[12]! * A6.imag[i]! + b[10]! * A4.imag[i]! + b[8]! * A2.imag[i]!
  }

  const A6Wv = complexMatZero(N)
  complexMatMul(A6, Wv, A6Wv, N)

  // V = A6Wv + b6·A6 + b4·A4 + b2·A2 + b0·I
  const V = complexMatZero(N)
  for (let i = 0; i < size; i++) {
    V.real[i] =
      A6Wv.real[i]! + b[6]! * A6.real[i]! + b[4]! * A4.real[i]! +
      b[2]! * A2.real[i]! + b[0]! * I.real[i]!
    V.imag[i] =
      A6Wv.imag[i]! + b[6]! * A6.imag[i]! + b[4]! * A4.imag[i]! +
      b[2]! * A2.imag[i]! + b[0]! * I.imag[i]!
  }

  // Solve (V - U) · X = (V + U)
  const Pmat = complexMatZero(N)
  const Qmat = complexMatZero(N)
  for (let i = 0; i < size; i++) {
    Pmat.real[i] = V.real[i]! + U.real[i]!
    Pmat.imag[i] = V.imag[i]! + U.imag[i]!
    Qmat.real[i] = V.real[i]! - U.real[i]!
    Qmat.imag[i] = V.imag[i]! - U.imag[i]!
  }

  let X = solveLinearSystem(Qmat, Pmat, N)

  // Squaring phase: exp(A) = X^{2^s}
  for (let i = 0; i < s; i++) {
    const next = complexMatZero(N)
    complexMatMul(X, X, next, N)
    X = next
  }

  return X
}
