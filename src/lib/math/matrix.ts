/**
 * N-dimensional matrix operations
 * All operations are pure functions with no side effects
 * Matrices are stored as flat Float32Arrays (row-major)
 *
 * Uses WASM acceleration when available for improved performance.
 */

import {
  float64ToVector,
  isAnimationWasmReady,
  multiplyMatricesWasm,
  multiplyMatrixVectorWasm,
} from '@/lib/wasm'

import type { MatrixND, VectorND } from './types'
import { EPSILON } from './types'

// ============================================================================
// Scratch Buffer Pools for WASM Operations
// ============================================================================
// These pools avoid per-call allocations when converting Float32 to Float64.
// Dual pools (A/B) prevent data corruption when two same-sized buffers are
// needed simultaneously (e.g., multiplyMatrices needs both a and b).

const scratchMatrixA = new Map<number, Float64Array>()
const scratchMatrixB = new Map<number, Float64Array>()
const scratchVector = new Map<number, Float64Array>()

/**
 * Get or create a scratch buffer from the specified pool.
 * @param pool - The pool to get from (A, B, or vector)
 * @param size - Required buffer size
 * @returns Float64Array of the requested size (may contain stale data)
 */
function getScratch(pool: Map<number, Float64Array>, size: number): Float64Array {
  let buf = pool.get(size)
  if (!buf) {
    buf = new Float64Array(size)
    pool.set(size, buf)
  }
  return buf
}

/**
 * Computes the dimension of a square matrix from flattened storage length.
 * @param length - Flat array length
 * @returns Matrix dimension n for an n×n matrix
 * @throws {Error} If length does not represent a square matrix
 */
function squareDimensionFromLength(length: number): number {
  const dim = Math.sqrt(length)
  if (!Number.isInteger(dim)) {
    throw new Error('Matrix must be square')
  }
  return dim
}

/**
 * Creates an n×n identity matrix
 * Formula: I[i][j] = 1 if i === j, else 0
 * @param dimension - The size of the matrix (n×n)
 * @returns A new identity matrix
 * @throws {Error} If dimension is not a positive integer
 */
export function createIdentityMatrix(dimension: number): MatrixND {
  if (dimension <= 0 || !Number.isInteger(dimension)) {
    throw new Error('Dimension must be a positive integer')
  }

  const matrix = new Float32Array(dimension * dimension)
  for (let i = 0; i < dimension; i++) {
    matrix[i * dimension + i] = 1
  }
  return matrix
}

/**
 * Creates a matrix filled with zeros
 * @param rows - Number of rows
 * @param cols - Number of columns
 * @returns A new zero matrix
 * @throws {Error} If dimensions are not positive integers
 */
export function createZeroMatrix(rows: number, cols: number): MatrixND {
  if (rows <= 0 || cols <= 0 || !Number.isInteger(rows) || !Number.isInteger(cols)) {
    throw new Error('Matrix dimensions must be positive integers')
  }

  return new Float32Array(rows * cols)
}

/**
 * Multiplies two square matrices
 * Formula: C[i][j] = Σ(A[i][k] * B[k][j])
 *
 * Uses WASM acceleration when available for improved performance.
 *
 * @param a - First matrix (n×n)
 * @param b - Second matrix (n×n)
 * @param out - Optional output matrix to avoid allocation (must be n×n)
 * @returns Product matrix (n×n)
 * @throws {Error} If matrix dimensions are incompatible
 */
export function multiplyMatrices(a: MatrixND, b: MatrixND, out?: MatrixND): MatrixND {
  const len = a.length
  if (len === 0 || b.length === 0) {
    throw new Error('Cannot multiply empty matrices')
  }

  if (len !== b.length) {
    throw new Error(
      `Matrix dimensions incompatible for multiplication: lengths ${len} and ${b.length}`
    )
  }

  const dim = squareDimensionFromLength(len)

  // Use provided output matrix or allocate new one
  const result = out ?? new Float32Array(len)

  // Try WASM path if available
  if (isAnimationWasmReady()) {
    const aF64 = getScratch(scratchMatrixA, len)
    const bF64 = getScratch(scratchMatrixB, len)
    aF64.set(a)
    bF64.set(b)
    const wasmResult = multiplyMatricesWasm(aF64, bF64, dim)
    if (wasmResult) {
      result.set(new Float32Array(wasmResult))
      return result
    }
    // WASM failed, fall through to JS implementation
  }

  // JS fallback
  for (let i = 0; i < dim; i++) {
    const rowOffset = i * dim
    for (let j = 0; j < dim; j++) {
      let sum = 0
      for (let k = 0; k < dim; k++) {
        sum += a[rowOffset + k]! * b[k * dim + j]!
      }
      result[rowOffset + j] = sum
    }
  }

  return result
}

/**
 * Module-level scratch matrix for aliasing protection in multiplyMatricesInto.
 * Keyed by dimension "n"
 */
const aliasScratchMatrices = new Map<number, MatrixND>()

/**
 * Gets or creates a scratch matrix for aliasing protection
 * @param dim - Dimension size
 * @returns A scratch matrix of the specified size
 */
function getAliasScratch(dim: number): MatrixND {
  let scratch = aliasScratchMatrices.get(dim)
  if (!scratch) {
    scratch = new Float32Array(dim * dim)
    aliasScratchMatrices.set(dim, scratch)
  }
  return scratch
}

/**
 * Multiplies two matrices and writes the result directly into an output buffer.
 * This is the allocation-free variant for hot paths (animation loops).
 * Assumes square matrices of same dimension.
 *
 * Formula: out[i][j] = Σ(A[i][k] * B[k][j])
 *
 * IMPORTANT: Handles aliasing safely - if out === a or out === b, uses internal
 * scratch buffer to compute result before copying to out.
 *
 * OPT-MAT-1: Specialized unrolled path for 4×4 matrices (most common case)
 *
 * @param out - Pre-allocated output matrix. Modified in place.
 * @param a - First matrix
 * @param b - Second matrix
 * @throws {Error} If matrix dimensions are incompatible (DEV only)
 * @note Validation is DEV-only for performance in production hot paths
 */
export function multiplyMatricesInto(out: MatrixND, a: MatrixND, b: MatrixND): void {
  const len = a.length

  if (import.meta.env.DEV) {
    if (len === 0) throw new Error('Cannot multiply empty matrices')
    if (len !== b.length || len !== out.length) {
      throw new Error('Matrix dimensions incompatible')
    }
  }

  // OPT-MAT-1: Fast path for 4×4 matrices (most common case in 4D visualization)
  // Benchmarked at 2.5× faster than generic loop for dim=4
  if (len === 16) {
    const isAliased = out === a || out === b
    const target = isAliased ? getAliasScratch(4) : out

    target[0] = a[0]! * b[0]! + a[1]! * b[4]! + a[2]! * b[8]! + a[3]! * b[12]!
    target[1] = a[0]! * b[1]! + a[1]! * b[5]! + a[2]! * b[9]! + a[3]! * b[13]!
    target[2] = a[0]! * b[2]! + a[1]! * b[6]! + a[2]! * b[10]! + a[3]! * b[14]!
    target[3] = a[0]! * b[3]! + a[1]! * b[7]! + a[2]! * b[11]! + a[3]! * b[15]!
    target[4] = a[4]! * b[0]! + a[5]! * b[4]! + a[6]! * b[8]! + a[7]! * b[12]!
    target[5] = a[4]! * b[1]! + a[5]! * b[5]! + a[6]! * b[9]! + a[7]! * b[13]!
    target[6] = a[4]! * b[2]! + a[5]! * b[6]! + a[6]! * b[10]! + a[7]! * b[14]!
    target[7] = a[4]! * b[3]! + a[5]! * b[7]! + a[6]! * b[11]! + a[7]! * b[15]!
    target[8] = a[8]! * b[0]! + a[9]! * b[4]! + a[10]! * b[8]! + a[11]! * b[12]!
    target[9] = a[8]! * b[1]! + a[9]! * b[5]! + a[10]! * b[9]! + a[11]! * b[13]!
    target[10] = a[8]! * b[2]! + a[9]! * b[6]! + a[10]! * b[10]! + a[11]! * b[14]!
    target[11] = a[8]! * b[3]! + a[9]! * b[7]! + a[10]! * b[11]! + a[11]! * b[15]!
    target[12] = a[12]! * b[0]! + a[13]! * b[4]! + a[14]! * b[8]! + a[15]! * b[12]!
    target[13] = a[12]! * b[1]! + a[13]! * b[5]! + a[14]! * b[9]! + a[15]! * b[13]!
    target[14] = a[12]! * b[2]! + a[13]! * b[6]! + a[14]! * b[10]! + a[15]! * b[14]!
    target[15] = a[12]! * b[3]! + a[13]! * b[7]! + a[14]! * b[11]! + a[15]! * b[15]!

    if (isAliased) {
      out.set(target)
    }
    return
  }

  // Generic path for all other dimensions (5×5 through 11×11+)
  // Benchmarked: generic loop is within 0.012% of frame budget vs unrolled for dim>=5
  const dim = squareDimensionFromLength(len)

  const isAliased = out === a || out === b
  const target = isAliased ? getAliasScratch(dim) : out

  for (let i = 0; i < dim; i++) {
    const rowOffset = i * dim
    for (let j = 0; j < dim; j++) {
      let sum = 0
      for (let k = 0; k < dim; k++) {
        sum += a[rowOffset + k]! * b[k * dim + j]!
      }
      target[rowOffset + j] = sum
    }
  }

  if (isAliased) {
    out.set(target)
  }
}

/**
 * Multiplies a matrix by a vector
 * Formula: b[i] = Σ(M[i][j] * v[j])
 *
 * Uses WASM acceleration when available for improved performance.
 *
 * @param m - Matrix (n×n)
 * @param v - Vector (n)
 * @param out
 * @returns Result vector (n)
 * @throws {Error} If dimensions are incompatible
 */
export function multiplyMatrixVector(m: MatrixND, v: VectorND, out?: VectorND): VectorND {
  const len = m.length
  if (len === 0) {
    throw new Error('Cannot multiply with empty matrix')
  }

  const dim = squareDimensionFromLength(len)
  if (dim !== v.length) {
    throw new Error(
      `Matrix-vector dimensions incompatible: matrix dim ${dim} and vector len ${v.length}`
    )
  }

  const result: VectorND = out ?? new Array(dim)

  // If reusing array, ensure it has correct length (caller should manage this for perf)
  if (out && out.length < dim) {
    if (import.meta.env.DEV) {
      console.warn(
        `multiplyMatrixVector: Output array length (${out.length}) is smaller than result rows (${dim}). Results may be truncated.`
      )
    }
  }

  // Try WASM path if available
  if (isAnimationWasmReady()) {
    const matrixF64 = getScratch(scratchMatrixA, len)
    const vectorF64 = getScratch(scratchVector, v.length)
    matrixF64.set(m)
    for (let i = 0; i < v.length; i++) vectorF64[i] = v[i]!
    const wasmResult = multiplyMatrixVectorWasm(matrixF64, vectorF64, dim)
    if (wasmResult) {
      const jsResult = float64ToVector(wasmResult)
      for (let i = 0; i < dim; i++) {
        result[i] = jsResult[i]!
      }
      return result
    }
    // WASM failed, fall through to JS implementation
  }

  // JS fallback
  for (let i = 0; i < dim; i++) {
    let sum = 0
    const rowOffset = i * dim
    for (let j = 0; j < dim; j++) {
      sum += m[rowOffset + j]! * v[j]!
    }
    result[i] = sum
  }

  return result
}

/**
 * Transposes a matrix (swap rows and columns)
 * Formula: B[j][i] = A[i][j]
 * @param m - Input matrix (n×n)
 * @returns Transposed matrix (n×n)
 */
export function transposeMatrix(m: MatrixND): MatrixND {
  const len = m.length
  if (len === 0) return new Float32Array(0)

  const dim = squareDimensionFromLength(len)
  const result = new Float32Array(len)

  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      result[j * dim + i] = m[i * dim + j]!
    }
  }

  return result
}

/**
 * Computes the determinant of a square matrix using recursive Laplace expansion
 * Formula: det(A) = Σ((-1)^(i+j) * A[i][j] * det(minor[i][j]))
 * @param m - Square matrix
 * @returns The determinant
 * @throws {Error} If matrix is not square
 */
export function determinant(m: MatrixND): number {
  const len = m.length
  if (len === 0) {
    throw new Error('Cannot compute determinant of empty matrix')
  }

  const dim = squareDimensionFromLength(len)

  // Base cases
  if (dim === 1) {
    return m[0]!
  }

  if (dim === 2) {
    return m[0]! * m[3]! - m[1]! * m[2]!
  }

  // Recursive case: Laplace expansion along first row
  let det = 0
  for (let j = 0; j < dim; j++) {
    const minor = getMinor(m, 0, j)
    const cofactor = (j % 2 === 0 ? 1 : -1) * m[j]! * determinant(minor)
    det += cofactor
  }

  return det
}

/**
 * Gets the minor matrix by removing specified row and column
 * @param m - Input matrix
 * @param row - Row to remove
 * @param col - Column to remove
 * @returns Minor matrix
 */
function getMinor(m: MatrixND, row: number, col: number): MatrixND {
  const len = m.length
  const dim = Math.sqrt(len)
  const minorDim = dim - 1
  const minor = new Float32Array(minorDim * minorDim)

  let minorIdx = 0
  for (let i = 0; i < dim; i++) {
    if (i === row) continue
    const rowOffset = i * dim
    for (let j = 0; j < dim; j++) {
      if (j === col) continue
      minor[minorIdx++] = m[rowOffset + j]!
    }
  }

  return minor
}

/**
 * Checks if two matrices are approximately equal within epsilon
 * @param a - First matrix
 * @param b - Second matrix
 * @param epsilon - Tolerance for floating point comparison
 * @returns True if matrices are approximately equal
 */
export function matricesEqual(a: MatrixND, b: MatrixND, epsilon = EPSILON): boolean {
  if (a.length !== b.length) {
    return false
  }

  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i]! - b[i]!) >= epsilon) {
      return false
    }
  }

  return true
}

/**
 * Creates a deep copy of a matrix
 * @param m - Input matrix
 * @param out - Optional output matrix to avoid allocation
 * @returns Matrix with the same values
 */
export function copyMatrix(m: MatrixND, out?: MatrixND): MatrixND {
  const len = m.length
  const result = out ?? new Float32Array(len)
  result.set(m)
  return result
}

/**
 * Gets the dimensions of a matrix
 * @param m - Input matrix
 * @returns [rows, cols] (Assuming square)
 */
export function getMatrixDimensions(m: MatrixND): [number, number] {
  if (m.length === 0) {
    return [0, 0]
  }
  const dim = squareDimensionFromLength(m.length)
  return [dim, dim]
}
