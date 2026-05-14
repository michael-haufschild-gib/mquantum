/**
 * Complex Matrix Utilities
 *
 * Dense complex matrix operations for the Liouvillian superoperator
 * and matrix exponential propagator. Matrices are stored as paired
 * Float64Arrays {real, imag} in row-major order.
 *
 * For K=14 hydrogen basis, the Liouvillian is 196×196 complex.
 *
 * WASM acceleration: matrixExponentialPade and complexMatMul delegate to
 * Rust/WASM when available, falling back to the TypeScript implementations.
 *
 * @module lib/physics/openQuantum/complexMatrix
 */

import { complexMatMulWasm, isAnimationWasmReady, matrixExponentialPadeWasm } from '@/lib/wasm'

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

/** Minimum N for WASM complex matmul — below this, FFI overhead dominates. */
const WASM_MATMUL_MIN_N = 64

function outputAliasesInput(A: ComplexMatrix, B: ComplexMatrix, out: ComplexMatrix): boolean {
  return (
    out.real === A.real ||
    out.real === A.imag ||
    out.real === B.real ||
    out.real === B.imag ||
    out.imag === A.real ||
    out.imag === A.imag ||
    out.imag === B.real ||
    out.imag === B.imag
  )
}

/**
 * Complex matrix multiply: C = A × B for N×N matrices.
 * Supports output aliasing A or B via a temporary buffer.
 *
 * Uses i-k-j loop order for optimal row-major cache access. The inner j-loop
 * accesses B[k,:] and out[i,:] sequentially (~3KB working set for N=196),
 * fitting comfortably in L1 cache.
 *
 * Delegates to WASM for N >= 64 when available.
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
  N: number
): void {
  if (outputAliasesInput(A, B, out)) {
    const temp = complexMatZero(N)
    complexMatMul(A, B, temp, N)
    complexMatCopy(temp, out, N)
    return
  }

  // ── WASM fast path ──────────────────────────────────────────────────
  if (N >= WASM_MATMUL_MIN_N && isAnimationWasmReady()) {
    const packed = complexMatMulWasm(A.real, A.imag, B.real, B.imag, N)
    if (packed && packed.length === 2 * N * N) {
      const size = N * N
      out.real.set(packed.subarray(0, size))
      out.imag.set(packed.subarray(size))
      return
    }
  }

  // ── JS fallback ─────────────────────────────────────────────────────
  const Ar = A.real,
    Ai = A.imag
  const Br = B.real,
    Bi = B.imag
  const Or = out.real,
    Oi = out.imag

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
  N: number
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
  N: number
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
export function complexMatCopy(src: ComplexMatrix, dst: ComplexMatrix, N: number): void {
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

/** Maximum N for pre-allocated scratch pools. Covers K=14 → N=196. */
const MAX_PADE_N = 196

// Pre-allocated scratch buffers for solveLinearSystem (N ≤ MAX_PADE_N)
const solveScratch = {
  Ar: new Float64Array(MAX_PADE_N * MAX_PADE_N),
  Ai: new Float64Array(MAX_PADE_N * MAX_PADE_N),
  Br: new Float64Array(MAX_PADE_N * MAX_PADE_N),
  Bi: new Float64Array(MAX_PADE_N * MAX_PADE_N),
}

/**
 * Solve Q · X = P via Gaussian elimination with partial pivoting.
 * Solves for the full N×N right-hand side simultaneously.
 *
 * @param Q - Coefficient matrix (not modified)
 * @param P - Right-hand side matrix (not modified)
 * @param N - System dimension
 * @returns Solution matrix X
 */
export function solveLinearSystem(Q: ComplexMatrix, P: ComplexMatrix, N: number): ComplexMatrix {
  // Augmented matrix: [A | B] where A = Q, B = P
  // Work on copies (use pre-allocated buffers for N ≤ MAX_PADE_N)
  const size = N * N
  let Ar: Float64Array
  let Ai: Float64Array
  let Br: Float64Array
  let Bi: Float64Array
  if (N <= MAX_PADE_N) {
    Ar = solveScratch.Ar
    Ai = solveScratch.Ai
    Br = solveScratch.Br
    Bi = solveScratch.Bi
    Ar.set(Q.real.subarray(0, size))
    Ai.set(Q.imag.subarray(0, size))
    Br.set(P.real.subarray(0, size))
    Bi.set(P.imag.subarray(0, size))
  } else {
    Ar = new Float64Array(Q.real)
    Ai = new Float64Array(Q.imag)
    Br = new Float64Array(P.real)
    Bi = new Float64Array(P.imag)
  }

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

        tmp = Ar[c]!
        Ar[c] = Ar[m]!
        Ar[m] = tmp
        tmp = Ai[c]!
        Ai[c] = Ai[m]!
        Ai[m] = tmp
        tmp = Br[c]!
        Br[c] = Br[m]!
        Br[m] = tmp
        tmp = Bi[c]!
        Bi[c] = Bi[m]!
        Bi[m] = tmp
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
  64764752532480000, 32382376266240000, 7771770303897600, 1187353796428800, 129060195264000,
  10559470521600, 670442572800, 33522128640, 1323241920, 40840800, 960960, 16380, 182, 1,
]

// ---------------------------------------------------------------------------
// Padé scratch pool — reusable buffers sized for MAX_PADE_N
// ---------------------------------------------------------------------------

/** Scratch matrices for matrixExponentialPade (avoids 12+ allocations per call) */
const padeScratch = {
  As: {
    real: new Float64Array(MAX_PADE_N * MAX_PADE_N),
    imag: new Float64Array(MAX_PADE_N * MAX_PADE_N),
  } as ComplexMatrix,
  A2: {
    real: new Float64Array(MAX_PADE_N * MAX_PADE_N),
    imag: new Float64Array(MAX_PADE_N * MAX_PADE_N),
  } as ComplexMatrix,
  A4: {
    real: new Float64Array(MAX_PADE_N * MAX_PADE_N),
    imag: new Float64Array(MAX_PADE_N * MAX_PADE_N),
  } as ComplexMatrix,
  A6: {
    real: new Float64Array(MAX_PADE_N * MAX_PADE_N),
    imag: new Float64Array(MAX_PADE_N * MAX_PADE_N),
  } as ComplexMatrix,
  // temp1/temp2 are reused across multiple intermediate steps
  temp1: {
    real: new Float64Array(MAX_PADE_N * MAX_PADE_N),
    imag: new Float64Array(MAX_PADE_N * MAX_PADE_N),
  } as ComplexMatrix,
  temp2: {
    real: new Float64Array(MAX_PADE_N * MAX_PADE_N),
    imag: new Float64Array(MAX_PADE_N * MAX_PADE_N),
  } as ComplexMatrix,
  U: {
    real: new Float64Array(MAX_PADE_N * MAX_PADE_N),
    imag: new Float64Array(MAX_PADE_N * MAX_PADE_N),
  } as ComplexMatrix,
  V: {
    real: new Float64Array(MAX_PADE_N * MAX_PADE_N),
    imag: new Float64Array(MAX_PADE_N * MAX_PADE_N),
  } as ComplexMatrix,
  sq: {
    real: new Float64Array(MAX_PADE_N * MAX_PADE_N),
    imag: new Float64Array(MAX_PADE_N * MAX_PADE_N),
  } as ComplexMatrix,
}

/** Zero the first N*N elements of a scratch matrix. */
function zeroScratch(m: ComplexMatrix, N: number): void {
  const size = N * N
  m.real.fill(0, 0, size)
  m.imag.fill(0, 0, size)
}

/**
 * Matrix exponential via scaling-and-squaring with Padé(13,13) approximation.
 *
 * Computes exp(A) for an N×N complex matrix. Standard algorithm from
 * Al-Mohy & Higham (2009), same as MATLAB's expm / scipy's expm.
 *
 * Uses pre-allocated scratch pool for N ≤ 196 to eliminate GC pressure.
 * Delegates to WASM when available for ~2-3x speedup on large matrices.
 *
 * @param A - Input matrix (not modified)
 * @param N - Matrix dimension
 * @returns exp(A)
 */
export function matrixExponentialPade(A: ComplexMatrix, N: number): ComplexMatrix {
  // ── WASM fast path ──────────────────────────────────────────────────
  if (isAnimationWasmReady()) {
    const packed = matrixExponentialPadeWasm(A.real, A.imag, N)
    if (packed && packed.length === 2 * N * N) {
      const size = N * N
      return {
        real: packed.slice(0, size),
        imag: packed.slice(size),
      }
    }
  }

  // ── JS fallback ─────────────────────────────────────────────────────
  const norm = complexMatNorm1(A, N)

  // Handle zero matrix
  if (norm < 1e-30) return complexMatIdentity(N)

  // Scaling: s = max(0, ceil(log2(||A||_1 / θ_13)))
  const theta13 = 5.371920351148152
  const s = Math.max(0, Math.ceil(Math.log2(norm / theta13)))

  const useScratch = N <= MAX_PADE_N
  const size = N * N

  // Allocate or reuse scratch matrices
  const As = useScratch ? (zeroScratch(padeScratch.As, N), padeScratch.As) : complexMatZero(N)
  const A2 = useScratch ? (zeroScratch(padeScratch.A2, N), padeScratch.A2) : complexMatZero(N)
  const A4 = useScratch ? (zeroScratch(padeScratch.A4, N), padeScratch.A4) : complexMatZero(N)
  const A6 = useScratch ? (zeroScratch(padeScratch.A6, N), padeScratch.A6) : complexMatZero(N)
  const temp1 = useScratch
    ? (zeroScratch(padeScratch.temp1, N), padeScratch.temp1)
    : complexMatZero(N)
  const temp2 = useScratch
    ? (zeroScratch(padeScratch.temp2, N), padeScratch.temp2)
    : complexMatZero(N)
  const U = useScratch ? (zeroScratch(padeScratch.U, N), padeScratch.U) : complexMatZero(N)
  const V = useScratch ? (zeroScratch(padeScratch.V, N), padeScratch.V) : complexMatZero(N)

  // Scale: A_s = A / 2^s
  const scaleFactor = Math.pow(2, -s)
  complexMatScale(A, scaleFactor, 0, As, N)

  // Matrix powers: A², A⁴, A⁶
  complexMatMul(As, As, A2, N)
  complexMatMul(A2, A2, A4, N)
  complexMatMul(A2, A4, A6, N)

  const b = PADE_COEFFS_13

  // Compute U and V for Padé(13,13), reusing temp1/temp2:
  // Wu = b13·A6 + b11·A4 + b9·A2  (stored in temp1)
  for (let i = 0; i < size; i++) {
    temp1.real[i] = b[13]! * A6.real[i]! + b[11]! * A4.real[i]! + b[9]! * A2.real[i]!
    temp1.imag[i] = b[13]! * A6.imag[i]! + b[11]! * A4.imag[i]! + b[9]! * A2.imag[i]!
  }

  // A6Wu = A6 · Wu  (stored in temp2)
  complexMatMul(A6, temp1, temp2, N)

  // Uinner = A6Wu + b7·A6 + b5·A4 + b3·A2 + b1·I  (stored in temp1, reusing it)
  for (let i = 0; i < size; i++) {
    temp1.real[i] = temp2.real[i]! + b[7]! * A6.real[i]! + b[5]! * A4.real[i]! + b[3]! * A2.real[i]!
    temp1.imag[i] = temp2.imag[i]! + b[7]! * A6.imag[i]! + b[5]! * A4.imag[i]! + b[3]! * A2.imag[i]!
  }
  // Add b1·I (only diagonal)
  for (let i = 0; i < N; i++) {
    temp1.real[i * N + i] = temp1.real[i * N + i]! + b[1]!
  }

  // U = As · Uinner
  complexMatMul(As, temp1, U, N)

  // Wv = b12·A6 + b10·A4 + b8·A2  (stored in temp1, reusing it)
  for (let i = 0; i < size; i++) {
    temp1.real[i] = b[12]! * A6.real[i]! + b[10]! * A4.real[i]! + b[8]! * A2.real[i]!
    temp1.imag[i] = b[12]! * A6.imag[i]! + b[10]! * A4.imag[i]! + b[8]! * A2.imag[i]!
  }

  // A6Wv = A6 · Wv  (stored in temp2, reusing it)
  complexMatMul(A6, temp1, temp2, N)

  // V = A6Wv + b6·A6 + b4·A4 + b2·A2 + b0·I
  for (let i = 0; i < size; i++) {
    V.real[i] = temp2.real[i]! + b[6]! * A6.real[i]! + b[4]! * A4.real[i]! + b[2]! * A2.real[i]!
    V.imag[i] = temp2.imag[i]! + b[6]! * A6.imag[i]! + b[4]! * A4.imag[i]! + b[2]! * A2.imag[i]!
  }
  // Add b0·I (only diagonal)
  for (let i = 0; i < N; i++) {
    V.real[i * N + i] = V.real[i * N + i]! + b[0]!
  }

  // Solve (V - U) · X = (V + U), reusing temp1 for P and temp2 for Q
  for (let i = 0; i < size; i++) {
    temp1.real[i] = V.real[i]! + U.real[i]! // P = V + U
    temp1.imag[i] = V.imag[i]! + U.imag[i]!
    temp2.real[i] = V.real[i]! - U.real[i]! // Q = V - U
    temp2.imag[i] = V.imag[i]! - U.imag[i]!
  }

  let X = solveLinearSystem(temp2, temp1, N)

  // Squaring phase: exp(A) = X^{2^s}
  // Alternate between X and a scratch buffer to avoid allocation per squaring step
  if (s > 0) {
    const sq = useScratch ? (zeroScratch(padeScratch.sq, N), padeScratch.sq) : complexMatZero(N)
    for (let i = 0; i < s; i++) {
      if (i % 2 === 0) {
        complexMatMul(X, X, sq, N)
      } else {
        complexMatMul(sq, sq, X, N)
      }
    }
    // Ensure the result is in the correct buffer
    if (s % 2 === 1) {
      // Result is in sq — copy to a new matrix (can't return scratch)
      const result = complexMatZero(N)
      result.real.set(sq.real.subarray(0, size))
      result.imag.set(sq.imag.subarray(0, size))
      return result
    }
  }

  return X
}
