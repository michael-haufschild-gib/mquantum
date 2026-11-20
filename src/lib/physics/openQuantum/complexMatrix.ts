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

function matrixEntryCount(N: number, caller: string, allowZero = false): number {
  const min = allowZero ? 0 : 1
  if (!Number.isSafeInteger(N) || N < min) {
    throw new RangeError(`${caller}: matrix dimension must be a safe integer >= ${min}`)
  }

  const size = N * N
  if (!Number.isSafeInteger(size)) {
    throw new RangeError(`${caller}: matrix dimension ${N} overflows safe element count`)
  }
  return size
}

function validateMatrixBuffer(m: ComplexMatrix, size: number, name: string, caller: string): void {
  if (!(m?.real instanceof Float64Array) || !(m?.imag instanceof Float64Array)) {
    throw new TypeError(`${caller}: ${name} must contain Float64Array real and imag buffers`)
  }
  if (m.real.length < size || m.imag.length < size) {
    throw new RangeError(`${caller}: ${name} buffers are shorter than N*N=${size}`)
  }
}

function assertFiniteMatrix(m: ComplexMatrix, size: number, name: string, caller: string): void {
  for (let i = 0; i < size; i++) {
    if (!Number.isFinite(m.real[i]!) || !Number.isFinite(m.imag[i]!)) {
      throw new RangeError(`${caller}: ${name} contains a non-finite entry at index ${i}`)
    }
  }
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
  const size = matrixEntryCount(N, 'complexMatZero', true)
  return {
    real: new Float64Array(size),
    imag: new Float64Array(size),
  }
}

/**
 * Create an N×N complex identity matrix.
 *
 * @param N - Matrix dimension
 * @returns Identity complex matrix
 */
export function complexMatIdentity(N: number): ComplexMatrix {
  matrixEntryCount(N, 'complexMatIdentity', true)
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

function overlaps(a: Float64Array, b: Float64Array, size: number): boolean {
  return a.buffer === b.buffer && Math.abs(a.byteOffset - b.byteOffset) < size * a.BYTES_PER_ELEMENT
}

function sharesEntries(a: ComplexMatrix, b: ComplexMatrix, size: number): boolean {
  return (
    overlaps(a.real, b.real, size) ||
    overlaps(a.imag, b.imag, size) ||
    overlaps(a.real, b.imag, size) ||
    overlaps(a.imag, b.real, size)
  )
}

function copyEntries(a: ComplexMatrix, size: number): ComplexMatrix {
  return { real: a.real.slice(0, size), imag: a.imag.slice(0, size) }
}

function elementwiseInput(a: ComplexMatrix, out: ComplexMatrix, size: number): ComplexMatrix {
  if (a.real === out.real && a.imag === out.imag) return a
  return sharesEntries(a, out, size) ? copyEntries(a, size) : a
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
  const size = matrixEntryCount(N, 'complexMatMul', true)
  validateMatrixBuffer(A, size, 'A', 'complexMatMul')
  validateMatrixBuffer(B, size, 'B', 'complexMatMul')
  validateMatrixBuffer(out, size, 'out', 'complexMatMul')

  if (sharesEntries(A, out, size) || sharesEntries(B, out, size)) {
    const temp = complexMatZero(N)
    complexMatMul(A, B, temp, N)
    complexMatCopy(temp, out, N)
    return
  }

  // ── WASM fast path ──────────────────────────────────────────────────
  if (N >= WASM_MATMUL_MIN_N && isAnimationWasmReady()) {
    const packed = complexMatMulWasm(A.real, A.imag, B.real, B.imag, N)
    if (packed && packed.length === 2 * size) {
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

  Or.fill(0, 0, size)
  Oi.fill(0, 0, size)

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
  const size = matrixEntryCount(N, 'complexMatAdd', true)
  validateMatrixBuffer(A, size, 'A', 'complexMatAdd')
  validateMatrixBuffer(B, size, 'B', 'complexMatAdd')
  validateMatrixBuffer(out, size, 'out', 'complexMatAdd')

  A = elementwiseInput(A, out, size)
  B = elementwiseInput(B, out, size)
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
  const size = matrixEntryCount(N, 'complexMatScale', true)
  validateMatrixBuffer(A, size, 'A', 'complexMatScale')
  validateMatrixBuffer(out, size, 'out', 'complexMatScale')
  if (!Number.isFinite(scalarRe) || !Number.isFinite(scalarIm)) {
    throw new RangeError('complexMatScale: scalar must be finite')
  }

  A = elementwiseInput(A, out, size)
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
  const size = matrixEntryCount(N, 'complexMatCopy', true)
  validateMatrixBuffer(src, size, 'src', 'complexMatCopy')
  validateMatrixBuffer(dst, size, 'dst', 'complexMatCopy')

  src = elementwiseInput(src, dst, size)
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
  const size = matrixEntryCount(N, 'complexMatNorm1', true)
  validateMatrixBuffer(A, size, 'A', 'complexMatNorm1')

  let maxCol = 0
  for (let j = 0; j < N; j++) {
    let colSum = 0
    for (let i = 0; i < N; i++) {
      const idx = i * N + j
      colSum += Math.hypot(A.real[idx]!, A.imag[idx]!)
    }
    maxCol = Math.max(maxCol, colSum)
  }
  return maxCol
}

// ---------------------------------------------------------------------------
// Linear system solver
// ---------------------------------------------------------------------------

/** Maximum N for pre-allocated scratch pools. Covers K=14 → N=196. */
const MAX_PADE_N = 196

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
  const size = matrixEntryCount(N, 'solveLinearSystem')
  validateMatrixBuffer(Q, size, 'Q', 'solveLinearSystem')
  validateMatrixBuffer(P, size, 'P', 'solveLinearSystem')
  assertFiniteMatrix(Q, size, 'Q', 'solveLinearSystem')
  assertFiniteMatrix(P, size, 'P', 'solveLinearSystem')

  return solveInPlace(copyEntries(Q, size), copyEntries(P, size), N)
}

function solveInPlace(Q: ComplexMatrix, P: ComplexMatrix, N: number): ComplexMatrix {
  const { real: Ar, imag: Ai } = Q
  const { real: Br, imag: Bi } = P

  // Row permutation (physical row swaps instead of virtual pivoting)
  for (let col = 0; col < N; col++) {
    // Find pivot row
    let maxMag = 0
    let maxRow = col
    for (let row = col; row < N; row++) {
      const idx = row * N + col
      const mag = Math.max(Math.abs(Ar[idx]!), Math.abs(Ai[idx]!))
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

    if (maxMag === 0) throw new Error(`solveLinearSystem: singular matrix at pivot ${col}`)
    const pivot = col * N + col
    const pr = Ar[pivot]! / maxMag
    const pi = Ai[pivot]! / maxMag
    const denom = pr * pr + pi * pi
    const wr = pr / denom
    const wi = pi / denom

    // Normalize the pivot row. Scaling first avoids squaring a tiny or large pivot.
    for (let j = 0; j < N; j++) {
      const idx = col * N + j
      if (j > col) {
        const re = Ar[idx]! / maxMag
        const im = Ai[idx]! / maxMag
        Ar[idx] = re * wr + im * wi
        Ai[idx] = im * wr - re * wi
      }
      const re = Br[idx]! / maxMag
      const im = Bi[idx]! / maxMag
      Br[idx] = re * wr + im * wi
      Bi[idx] = im * wr - re * wi
    }

    for (let row = col + 1; row < N; row++) {
      const idx = row * N + col
      const fRe = Ar[idx]!
      const fIm = Ai[idx]!

      for (let j = col + 1; j < N; j++) {
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

      result.real[row * N + j] = sumRe
      result.imag[row * N + j] = sumIm
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
// Padé workspace
// ---------------------------------------------------------------------------

type PadeScratch = Record<'As' | 'A2' | 'A4' | 'A6' | 'temp1' | 'temp2' | 'U' | 'V', ComplexMatrix>

function createPadeScratch(N: number): PadeScratch {
  return {
    As: complexMatZero(N),
    A2: complexMatZero(N),
    A4: complexMatZero(N),
    A6: complexMatZero(N),
    temp1: complexMatZero(N),
    temp2: complexMatZero(N),
    U: complexMatZero(N),
    V: complexMatZero(N),
  }
}

let padeScratch: PadeScratch | undefined

function getPadeScratch(N: number): PadeScratch {
  if (N > MAX_PADE_N) return createPadeScratch(N)
  if (!padeScratch || padeScratch.As.real.length < N * N) padeScratch = createPadeScratch(N)
  return padeScratch
}

/**
 * Matrix exponential via scaling-and-squaring with Padé(13,13) approximation.
 *
 * Computes exp(A) for an N×N complex matrix. Standard algorithm from
 * Al-Mohy & Higham (2009), same as MATLAB's expm / scipy's expm.
 *
 * Reuses a lazily allocated workspace for N ≤ 196 to eliminate GC pressure.
 * Delegates to WASM when available for ~2-3x speedup on large matrices.
 *
 * @param A - Input matrix (not modified)
 * @param N - Matrix dimension
 * @returns exp(A)
 */
export function matrixExponentialPade(A: ComplexMatrix, N: number): ComplexMatrix {
  const size = matrixEntryCount(N, 'matrixExponentialPade')
  validateMatrixBuffer(A, size, 'A', 'matrixExponentialPade')
  assertFiniteMatrix(A, size, 'A', 'matrixExponentialPade')

  // ── WASM fast path ──────────────────────────────────────────────────
  if (isAnimationWasmReady()) {
    const packed = matrixExponentialPadeWasm(A.real, A.imag, N)
    if (packed && packed.length === 2 * size) {
      return {
        real: packed.subarray(0, size),
        imag: packed.subarray(size),
      }
    }
  }

  // ── JS fallback ─────────────────────────────────────────────────────
  const norm = complexMatNorm1(A, N)
  if (!Number.isFinite(norm)) {
    throw new RangeError('matrixExponentialPade: matrix 1-norm exceeds finite range')
  }

  // Handle zero matrix
  if (norm === 0) return complexMatIdentity(N)

  // Scaling: s = max(0, ceil(log2(||A||_1 / θ_13)))
  const theta13 = 5.371920351148152
  const s = Math.max(0, Math.ceil(Math.log2(norm / theta13)))

  const { As, A2, A4, A6, temp1, temp2, U, V } = getPadeScratch(N)

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

  const X = solveInPlace(temp2, temp1, N)
  for (let i = 0; i < s; i++) {
    if (i % 2 === 0) complexMatMul(X, X, temp1, N)
    else complexMatMul(temp1, temp1, X, N)
  }
  if (s % 2 === 1) complexMatCopy(temp1, X, N)
  return X
}
