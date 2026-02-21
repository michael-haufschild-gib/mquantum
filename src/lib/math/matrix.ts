/**
 * N-dimensional matrix operations
 * All operations are pure functions with no side effects
 * Matrices are stored as flat Float32Arrays (row-major)
 *
 * Uses WASM acceleration when available for improved performance.
 */

import type { MatrixND, VectorND } from './types'
import { EPSILON } from './types'
import {
  isAnimationWasmReady,
  multiplyMatrixVectorWasm,
  multiplyMatricesWasm,
  float64ToVector,
} from '@/lib/wasm'

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
  if (len === 16) {
    // Handle aliasing: if out is the same reference as a or b, we need a temp buffer
    const isAliased = out === a || out === b
    const target = isAliased ? getAliasScratch(4) : out

    // Fully unrolled 4×4 matrix multiplication (no loops)
    // Type assertions safe: we verified len === 16 above
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

  // OPT-MAT-2: Fast path for 5×5 matrices (5D visualization)
  if (len === 25) {
    const isAliased = out === a || out === b
    const target = isAliased ? getAliasScratch(5) : out

    // Row 0
    target[0] = a[0]! * b[0]! + a[1]! * b[5]! + a[2]! * b[10]! + a[3]! * b[15]! + a[4]! * b[20]!
    target[1] = a[0]! * b[1]! + a[1]! * b[6]! + a[2]! * b[11]! + a[3]! * b[16]! + a[4]! * b[21]!
    target[2] = a[0]! * b[2]! + a[1]! * b[7]! + a[2]! * b[12]! + a[3]! * b[17]! + a[4]! * b[22]!
    target[3] = a[0]! * b[3]! + a[1]! * b[8]! + a[2]! * b[13]! + a[3]! * b[18]! + a[4]! * b[23]!
    target[4] = a[0]! * b[4]! + a[1]! * b[9]! + a[2]! * b[14]! + a[3]! * b[19]! + a[4]! * b[24]!
    // Row 1
    target[5] = a[5]! * b[0]! + a[6]! * b[5]! + a[7]! * b[10]! + a[8]! * b[15]! + a[9]! * b[20]!
    target[6] = a[5]! * b[1]! + a[6]! * b[6]! + a[7]! * b[11]! + a[8]! * b[16]! + a[9]! * b[21]!
    target[7] = a[5]! * b[2]! + a[6]! * b[7]! + a[7]! * b[12]! + a[8]! * b[17]! + a[9]! * b[22]!
    target[8] = a[5]! * b[3]! + a[6]! * b[8]! + a[7]! * b[13]! + a[8]! * b[18]! + a[9]! * b[23]!
    target[9] = a[5]! * b[4]! + a[6]! * b[9]! + a[7]! * b[14]! + a[8]! * b[19]! + a[9]! * b[24]!
    // Row 2
    target[10] =
      a[10]! * b[0]! + a[11]! * b[5]! + a[12]! * b[10]! + a[13]! * b[15]! + a[14]! * b[20]!
    target[11] =
      a[10]! * b[1]! + a[11]! * b[6]! + a[12]! * b[11]! + a[13]! * b[16]! + a[14]! * b[21]!
    target[12] =
      a[10]! * b[2]! + a[11]! * b[7]! + a[12]! * b[12]! + a[13]! * b[17]! + a[14]! * b[22]!
    target[13] =
      a[10]! * b[3]! + a[11]! * b[8]! + a[12]! * b[13]! + a[13]! * b[18]! + a[14]! * b[23]!
    target[14] =
      a[10]! * b[4]! + a[11]! * b[9]! + a[12]! * b[14]! + a[13]! * b[19]! + a[14]! * b[24]!
    // Row 3
    target[15] =
      a[15]! * b[0]! + a[16]! * b[5]! + a[17]! * b[10]! + a[18]! * b[15]! + a[19]! * b[20]!
    target[16] =
      a[15]! * b[1]! + a[16]! * b[6]! + a[17]! * b[11]! + a[18]! * b[16]! + a[19]! * b[21]!
    target[17] =
      a[15]! * b[2]! + a[16]! * b[7]! + a[17]! * b[12]! + a[18]! * b[17]! + a[19]! * b[22]!
    target[18] =
      a[15]! * b[3]! + a[16]! * b[8]! + a[17]! * b[13]! + a[18]! * b[18]! + a[19]! * b[23]!
    target[19] =
      a[15]! * b[4]! + a[16]! * b[9]! + a[17]! * b[14]! + a[18]! * b[19]! + a[19]! * b[24]!
    // Row 4
    target[20] =
      a[20]! * b[0]! + a[21]! * b[5]! + a[22]! * b[10]! + a[23]! * b[15]! + a[24]! * b[20]!
    target[21] =
      a[20]! * b[1]! + a[21]! * b[6]! + a[22]! * b[11]! + a[23]! * b[16]! + a[24]! * b[21]!
    target[22] =
      a[20]! * b[2]! + a[21]! * b[7]! + a[22]! * b[12]! + a[23]! * b[17]! + a[24]! * b[22]!
    target[23] =
      a[20]! * b[3]! + a[21]! * b[8]! + a[22]! * b[13]! + a[23]! * b[18]! + a[24]! * b[23]!
    target[24] =
      a[20]! * b[4]! + a[21]! * b[9]! + a[22]! * b[14]! + a[23]! * b[19]! + a[24]! * b[24]!

    if (isAliased) {
      out.set(target)
    }
    return
  }

  // OPT-MAT: Fully unrolled 6x6 matrix multiplication
  if (len === 36) {
    const isAliased = out === a || out === b
    const target = isAliased ? getAliasScratch(6) : out
    target[0] =
      a[0]! * b[0]! +
      a[1]! * b[6]! +
      a[2]! * b[12]! +
      a[3]! * b[18]! +
      a[4]! * b[24]! +
      a[5]! * b[30]!
    target[1] =
      a[0]! * b[1]! +
      a[1]! * b[7]! +
      a[2]! * b[13]! +
      a[3]! * b[19]! +
      a[4]! * b[25]! +
      a[5]! * b[31]!
    target[2] =
      a[0]! * b[2]! +
      a[1]! * b[8]! +
      a[2]! * b[14]! +
      a[3]! * b[20]! +
      a[4]! * b[26]! +
      a[5]! * b[32]!
    target[3] =
      a[0]! * b[3]! +
      a[1]! * b[9]! +
      a[2]! * b[15]! +
      a[3]! * b[21]! +
      a[4]! * b[27]! +
      a[5]! * b[33]!
    target[4] =
      a[0]! * b[4]! +
      a[1]! * b[10]! +
      a[2]! * b[16]! +
      a[3]! * b[22]! +
      a[4]! * b[28]! +
      a[5]! * b[34]!
    target[5] =
      a[0]! * b[5]! +
      a[1]! * b[11]! +
      a[2]! * b[17]! +
      a[3]! * b[23]! +
      a[4]! * b[29]! +
      a[5]! * b[35]!
    target[6] =
      a[6]! * b[0]! +
      a[7]! * b[6]! +
      a[8]! * b[12]! +
      a[9]! * b[18]! +
      a[10]! * b[24]! +
      a[11]! * b[30]!
    target[7] =
      a[6]! * b[1]! +
      a[7]! * b[7]! +
      a[8]! * b[13]! +
      a[9]! * b[19]! +
      a[10]! * b[25]! +
      a[11]! * b[31]!
    target[8] =
      a[6]! * b[2]! +
      a[7]! * b[8]! +
      a[8]! * b[14]! +
      a[9]! * b[20]! +
      a[10]! * b[26]! +
      a[11]! * b[32]!
    target[9] =
      a[6]! * b[3]! +
      a[7]! * b[9]! +
      a[8]! * b[15]! +
      a[9]! * b[21]! +
      a[10]! * b[27]! +
      a[11]! * b[33]!
    target[10] =
      a[6]! * b[4]! +
      a[7]! * b[10]! +
      a[8]! * b[16]! +
      a[9]! * b[22]! +
      a[10]! * b[28]! +
      a[11]! * b[34]!
    target[11] =
      a[6]! * b[5]! +
      a[7]! * b[11]! +
      a[8]! * b[17]! +
      a[9]! * b[23]! +
      a[10]! * b[29]! +
      a[11]! * b[35]!
    target[12] =
      a[12]! * b[0]! +
      a[13]! * b[6]! +
      a[14]! * b[12]! +
      a[15]! * b[18]! +
      a[16]! * b[24]! +
      a[17]! * b[30]!
    target[13] =
      a[12]! * b[1]! +
      a[13]! * b[7]! +
      a[14]! * b[13]! +
      a[15]! * b[19]! +
      a[16]! * b[25]! +
      a[17]! * b[31]!
    target[14] =
      a[12]! * b[2]! +
      a[13]! * b[8]! +
      a[14]! * b[14]! +
      a[15]! * b[20]! +
      a[16]! * b[26]! +
      a[17]! * b[32]!
    target[15] =
      a[12]! * b[3]! +
      a[13]! * b[9]! +
      a[14]! * b[15]! +
      a[15]! * b[21]! +
      a[16]! * b[27]! +
      a[17]! * b[33]!
    target[16] =
      a[12]! * b[4]! +
      a[13]! * b[10]! +
      a[14]! * b[16]! +
      a[15]! * b[22]! +
      a[16]! * b[28]! +
      a[17]! * b[34]!
    target[17] =
      a[12]! * b[5]! +
      a[13]! * b[11]! +
      a[14]! * b[17]! +
      a[15]! * b[23]! +
      a[16]! * b[29]! +
      a[17]! * b[35]!
    target[18] =
      a[18]! * b[0]! +
      a[19]! * b[6]! +
      a[20]! * b[12]! +
      a[21]! * b[18]! +
      a[22]! * b[24]! +
      a[23]! * b[30]!
    target[19] =
      a[18]! * b[1]! +
      a[19]! * b[7]! +
      a[20]! * b[13]! +
      a[21]! * b[19]! +
      a[22]! * b[25]! +
      a[23]! * b[31]!
    target[20] =
      a[18]! * b[2]! +
      a[19]! * b[8]! +
      a[20]! * b[14]! +
      a[21]! * b[20]! +
      a[22]! * b[26]! +
      a[23]! * b[32]!
    target[21] =
      a[18]! * b[3]! +
      a[19]! * b[9]! +
      a[20]! * b[15]! +
      a[21]! * b[21]! +
      a[22]! * b[27]! +
      a[23]! * b[33]!
    target[22] =
      a[18]! * b[4]! +
      a[19]! * b[10]! +
      a[20]! * b[16]! +
      a[21]! * b[22]! +
      a[22]! * b[28]! +
      a[23]! * b[34]!
    target[23] =
      a[18]! * b[5]! +
      a[19]! * b[11]! +
      a[20]! * b[17]! +
      a[21]! * b[23]! +
      a[22]! * b[29]! +
      a[23]! * b[35]!
    target[24] =
      a[24]! * b[0]! +
      a[25]! * b[6]! +
      a[26]! * b[12]! +
      a[27]! * b[18]! +
      a[28]! * b[24]! +
      a[29]! * b[30]!
    target[25] =
      a[24]! * b[1]! +
      a[25]! * b[7]! +
      a[26]! * b[13]! +
      a[27]! * b[19]! +
      a[28]! * b[25]! +
      a[29]! * b[31]!
    target[26] =
      a[24]! * b[2]! +
      a[25]! * b[8]! +
      a[26]! * b[14]! +
      a[27]! * b[20]! +
      a[28]! * b[26]! +
      a[29]! * b[32]!
    target[27] =
      a[24]! * b[3]! +
      a[25]! * b[9]! +
      a[26]! * b[15]! +
      a[27]! * b[21]! +
      a[28]! * b[27]! +
      a[29]! * b[33]!
    target[28] =
      a[24]! * b[4]! +
      a[25]! * b[10]! +
      a[26]! * b[16]! +
      a[27]! * b[22]! +
      a[28]! * b[28]! +
      a[29]! * b[34]!
    target[29] =
      a[24]! * b[5]! +
      a[25]! * b[11]! +
      a[26]! * b[17]! +
      a[27]! * b[23]! +
      a[28]! * b[29]! +
      a[29]! * b[35]!
    target[30] =
      a[30]! * b[0]! +
      a[31]! * b[6]! +
      a[32]! * b[12]! +
      a[33]! * b[18]! +
      a[34]! * b[24]! +
      a[35]! * b[30]!
    target[31] =
      a[30]! * b[1]! +
      a[31]! * b[7]! +
      a[32]! * b[13]! +
      a[33]! * b[19]! +
      a[34]! * b[25]! +
      a[35]! * b[31]!
    target[32] =
      a[30]! * b[2]! +
      a[31]! * b[8]! +
      a[32]! * b[14]! +
      a[33]! * b[20]! +
      a[34]! * b[26]! +
      a[35]! * b[32]!
    target[33] =
      a[30]! * b[3]! +
      a[31]! * b[9]! +
      a[32]! * b[15]! +
      a[33]! * b[21]! +
      a[34]! * b[27]! +
      a[35]! * b[33]!
    target[34] =
      a[30]! * b[4]! +
      a[31]! * b[10]! +
      a[32]! * b[16]! +
      a[33]! * b[22]! +
      a[34]! * b[28]! +
      a[35]! * b[34]!
    target[35] =
      a[30]! * b[5]! +
      a[31]! * b[11]! +
      a[32]! * b[17]! +
      a[33]! * b[23]! +
      a[34]! * b[29]! +
      a[35]! * b[35]!
    if (isAliased) out.set(target)
    return
  }

  // OPT-MAT: Fully unrolled 7x7 matrix multiplication
  if (len === 49) {
    const isAliased = out === a || out === b
    const target = isAliased ? getAliasScratch(7) : out
    target[0] =
      a[0]! * b[0]! +
      a[1]! * b[7]! +
      a[2]! * b[14]! +
      a[3]! * b[21]! +
      a[4]! * b[28]! +
      a[5]! * b[35]! +
      a[6]! * b[42]!
    target[1] =
      a[0]! * b[1]! +
      a[1]! * b[8]! +
      a[2]! * b[15]! +
      a[3]! * b[22]! +
      a[4]! * b[29]! +
      a[5]! * b[36]! +
      a[6]! * b[43]!
    target[2] =
      a[0]! * b[2]! +
      a[1]! * b[9]! +
      a[2]! * b[16]! +
      a[3]! * b[23]! +
      a[4]! * b[30]! +
      a[5]! * b[37]! +
      a[6]! * b[44]!
    target[3] =
      a[0]! * b[3]! +
      a[1]! * b[10]! +
      a[2]! * b[17]! +
      a[3]! * b[24]! +
      a[4]! * b[31]! +
      a[5]! * b[38]! +
      a[6]! * b[45]!
    target[4] =
      a[0]! * b[4]! +
      a[1]! * b[11]! +
      a[2]! * b[18]! +
      a[3]! * b[25]! +
      a[4]! * b[32]! +
      a[5]! * b[39]! +
      a[6]! * b[46]!
    target[5] =
      a[0]! * b[5]! +
      a[1]! * b[12]! +
      a[2]! * b[19]! +
      a[3]! * b[26]! +
      a[4]! * b[33]! +
      a[5]! * b[40]! +
      a[6]! * b[47]!
    target[6] =
      a[0]! * b[6]! +
      a[1]! * b[13]! +
      a[2]! * b[20]! +
      a[3]! * b[27]! +
      a[4]! * b[34]! +
      a[5]! * b[41]! +
      a[6]! * b[48]!
    target[7] =
      a[7]! * b[0]! +
      a[8]! * b[7]! +
      a[9]! * b[14]! +
      a[10]! * b[21]! +
      a[11]! * b[28]! +
      a[12]! * b[35]! +
      a[13]! * b[42]!
    target[8] =
      a[7]! * b[1]! +
      a[8]! * b[8]! +
      a[9]! * b[15]! +
      a[10]! * b[22]! +
      a[11]! * b[29]! +
      a[12]! * b[36]! +
      a[13]! * b[43]!
    target[9] =
      a[7]! * b[2]! +
      a[8]! * b[9]! +
      a[9]! * b[16]! +
      a[10]! * b[23]! +
      a[11]! * b[30]! +
      a[12]! * b[37]! +
      a[13]! * b[44]!
    target[10] =
      a[7]! * b[3]! +
      a[8]! * b[10]! +
      a[9]! * b[17]! +
      a[10]! * b[24]! +
      a[11]! * b[31]! +
      a[12]! * b[38]! +
      a[13]! * b[45]!
    target[11] =
      a[7]! * b[4]! +
      a[8]! * b[11]! +
      a[9]! * b[18]! +
      a[10]! * b[25]! +
      a[11]! * b[32]! +
      a[12]! * b[39]! +
      a[13]! * b[46]!
    target[12] =
      a[7]! * b[5]! +
      a[8]! * b[12]! +
      a[9]! * b[19]! +
      a[10]! * b[26]! +
      a[11]! * b[33]! +
      a[12]! * b[40]! +
      a[13]! * b[47]!
    target[13] =
      a[7]! * b[6]! +
      a[8]! * b[13]! +
      a[9]! * b[20]! +
      a[10]! * b[27]! +
      a[11]! * b[34]! +
      a[12]! * b[41]! +
      a[13]! * b[48]!
    target[14] =
      a[14]! * b[0]! +
      a[15]! * b[7]! +
      a[16]! * b[14]! +
      a[17]! * b[21]! +
      a[18]! * b[28]! +
      a[19]! * b[35]! +
      a[20]! * b[42]!
    target[15] =
      a[14]! * b[1]! +
      a[15]! * b[8]! +
      a[16]! * b[15]! +
      a[17]! * b[22]! +
      a[18]! * b[29]! +
      a[19]! * b[36]! +
      a[20]! * b[43]!
    target[16] =
      a[14]! * b[2]! +
      a[15]! * b[9]! +
      a[16]! * b[16]! +
      a[17]! * b[23]! +
      a[18]! * b[30]! +
      a[19]! * b[37]! +
      a[20]! * b[44]!
    target[17] =
      a[14]! * b[3]! +
      a[15]! * b[10]! +
      a[16]! * b[17]! +
      a[17]! * b[24]! +
      a[18]! * b[31]! +
      a[19]! * b[38]! +
      a[20]! * b[45]!
    target[18] =
      a[14]! * b[4]! +
      a[15]! * b[11]! +
      a[16]! * b[18]! +
      a[17]! * b[25]! +
      a[18]! * b[32]! +
      a[19]! * b[39]! +
      a[20]! * b[46]!
    target[19] =
      a[14]! * b[5]! +
      a[15]! * b[12]! +
      a[16]! * b[19]! +
      a[17]! * b[26]! +
      a[18]! * b[33]! +
      a[19]! * b[40]! +
      a[20]! * b[47]!
    target[20] =
      a[14]! * b[6]! +
      a[15]! * b[13]! +
      a[16]! * b[20]! +
      a[17]! * b[27]! +
      a[18]! * b[34]! +
      a[19]! * b[41]! +
      a[20]! * b[48]!
    target[21] =
      a[21]! * b[0]! +
      a[22]! * b[7]! +
      a[23]! * b[14]! +
      a[24]! * b[21]! +
      a[25]! * b[28]! +
      a[26]! * b[35]! +
      a[27]! * b[42]!
    target[22] =
      a[21]! * b[1]! +
      a[22]! * b[8]! +
      a[23]! * b[15]! +
      a[24]! * b[22]! +
      a[25]! * b[29]! +
      a[26]! * b[36]! +
      a[27]! * b[43]!
    target[23] =
      a[21]! * b[2]! +
      a[22]! * b[9]! +
      a[23]! * b[16]! +
      a[24]! * b[23]! +
      a[25]! * b[30]! +
      a[26]! * b[37]! +
      a[27]! * b[44]!
    target[24] =
      a[21]! * b[3]! +
      a[22]! * b[10]! +
      a[23]! * b[17]! +
      a[24]! * b[24]! +
      a[25]! * b[31]! +
      a[26]! * b[38]! +
      a[27]! * b[45]!
    target[25] =
      a[21]! * b[4]! +
      a[22]! * b[11]! +
      a[23]! * b[18]! +
      a[24]! * b[25]! +
      a[25]! * b[32]! +
      a[26]! * b[39]! +
      a[27]! * b[46]!
    target[26] =
      a[21]! * b[5]! +
      a[22]! * b[12]! +
      a[23]! * b[19]! +
      a[24]! * b[26]! +
      a[25]! * b[33]! +
      a[26]! * b[40]! +
      a[27]! * b[47]!
    target[27] =
      a[21]! * b[6]! +
      a[22]! * b[13]! +
      a[23]! * b[20]! +
      a[24]! * b[27]! +
      a[25]! * b[34]! +
      a[26]! * b[41]! +
      a[27]! * b[48]!
    target[28] =
      a[28]! * b[0]! +
      a[29]! * b[7]! +
      a[30]! * b[14]! +
      a[31]! * b[21]! +
      a[32]! * b[28]! +
      a[33]! * b[35]! +
      a[34]! * b[42]!
    target[29] =
      a[28]! * b[1]! +
      a[29]! * b[8]! +
      a[30]! * b[15]! +
      a[31]! * b[22]! +
      a[32]! * b[29]! +
      a[33]! * b[36]! +
      a[34]! * b[43]!
    target[30] =
      a[28]! * b[2]! +
      a[29]! * b[9]! +
      a[30]! * b[16]! +
      a[31]! * b[23]! +
      a[32]! * b[30]! +
      a[33]! * b[37]! +
      a[34]! * b[44]!
    target[31] =
      a[28]! * b[3]! +
      a[29]! * b[10]! +
      a[30]! * b[17]! +
      a[31]! * b[24]! +
      a[32]! * b[31]! +
      a[33]! * b[38]! +
      a[34]! * b[45]!
    target[32] =
      a[28]! * b[4]! +
      a[29]! * b[11]! +
      a[30]! * b[18]! +
      a[31]! * b[25]! +
      a[32]! * b[32]! +
      a[33]! * b[39]! +
      a[34]! * b[46]!
    target[33] =
      a[28]! * b[5]! +
      a[29]! * b[12]! +
      a[30]! * b[19]! +
      a[31]! * b[26]! +
      a[32]! * b[33]! +
      a[33]! * b[40]! +
      a[34]! * b[47]!
    target[34] =
      a[28]! * b[6]! +
      a[29]! * b[13]! +
      a[30]! * b[20]! +
      a[31]! * b[27]! +
      a[32]! * b[34]! +
      a[33]! * b[41]! +
      a[34]! * b[48]!
    target[35] =
      a[35]! * b[0]! +
      a[36]! * b[7]! +
      a[37]! * b[14]! +
      a[38]! * b[21]! +
      a[39]! * b[28]! +
      a[40]! * b[35]! +
      a[41]! * b[42]!
    target[36] =
      a[35]! * b[1]! +
      a[36]! * b[8]! +
      a[37]! * b[15]! +
      a[38]! * b[22]! +
      a[39]! * b[29]! +
      a[40]! * b[36]! +
      a[41]! * b[43]!
    target[37] =
      a[35]! * b[2]! +
      a[36]! * b[9]! +
      a[37]! * b[16]! +
      a[38]! * b[23]! +
      a[39]! * b[30]! +
      a[40]! * b[37]! +
      a[41]! * b[44]!
    target[38] =
      a[35]! * b[3]! +
      a[36]! * b[10]! +
      a[37]! * b[17]! +
      a[38]! * b[24]! +
      a[39]! * b[31]! +
      a[40]! * b[38]! +
      a[41]! * b[45]!
    target[39] =
      a[35]! * b[4]! +
      a[36]! * b[11]! +
      a[37]! * b[18]! +
      a[38]! * b[25]! +
      a[39]! * b[32]! +
      a[40]! * b[39]! +
      a[41]! * b[46]!
    target[40] =
      a[35]! * b[5]! +
      a[36]! * b[12]! +
      a[37]! * b[19]! +
      a[38]! * b[26]! +
      a[39]! * b[33]! +
      a[40]! * b[40]! +
      a[41]! * b[47]!
    target[41] =
      a[35]! * b[6]! +
      a[36]! * b[13]! +
      a[37]! * b[20]! +
      a[38]! * b[27]! +
      a[39]! * b[34]! +
      a[40]! * b[41]! +
      a[41]! * b[48]!
    target[42] =
      a[42]! * b[0]! +
      a[43]! * b[7]! +
      a[44]! * b[14]! +
      a[45]! * b[21]! +
      a[46]! * b[28]! +
      a[47]! * b[35]! +
      a[48]! * b[42]!
    target[43] =
      a[42]! * b[1]! +
      a[43]! * b[8]! +
      a[44]! * b[15]! +
      a[45]! * b[22]! +
      a[46]! * b[29]! +
      a[47]! * b[36]! +
      a[48]! * b[43]!
    target[44] =
      a[42]! * b[2]! +
      a[43]! * b[9]! +
      a[44]! * b[16]! +
      a[45]! * b[23]! +
      a[46]! * b[30]! +
      a[47]! * b[37]! +
      a[48]! * b[44]!
    target[45] =
      a[42]! * b[3]! +
      a[43]! * b[10]! +
      a[44]! * b[17]! +
      a[45]! * b[24]! +
      a[46]! * b[31]! +
      a[47]! * b[38]! +
      a[48]! * b[45]!
    target[46] =
      a[42]! * b[4]! +
      a[43]! * b[11]! +
      a[44]! * b[18]! +
      a[45]! * b[25]! +
      a[46]! * b[32]! +
      a[47]! * b[39]! +
      a[48]! * b[46]!
    target[47] =
      a[42]! * b[5]! +
      a[43]! * b[12]! +
      a[44]! * b[19]! +
      a[45]! * b[26]! +
      a[46]! * b[33]! +
      a[47]! * b[40]! +
      a[48]! * b[47]!
    target[48] =
      a[42]! * b[6]! +
      a[43]! * b[13]! +
      a[44]! * b[20]! +
      a[45]! * b[27]! +
      a[46]! * b[34]! +
      a[47]! * b[41]! +
      a[48]! * b[48]!
    if (isAliased) out.set(target)
    return
  }

  // OPT-MAT: Fully unrolled 8x8 matrix multiplication
  if (len === 64) {
    const isAliased = out === a || out === b
    const target = isAliased ? getAliasScratch(8) : out
    target[0] =
      a[0]! * b[0]! +
      a[1]! * b[8]! +
      a[2]! * b[16]! +
      a[3]! * b[24]! +
      a[4]! * b[32]! +
      a[5]! * b[40]! +
      a[6]! * b[48]! +
      a[7]! * b[56]!
    target[1] =
      a[0]! * b[1]! +
      a[1]! * b[9]! +
      a[2]! * b[17]! +
      a[3]! * b[25]! +
      a[4]! * b[33]! +
      a[5]! * b[41]! +
      a[6]! * b[49]! +
      a[7]! * b[57]!
    target[2] =
      a[0]! * b[2]! +
      a[1]! * b[10]! +
      a[2]! * b[18]! +
      a[3]! * b[26]! +
      a[4]! * b[34]! +
      a[5]! * b[42]! +
      a[6]! * b[50]! +
      a[7]! * b[58]!
    target[3] =
      a[0]! * b[3]! +
      a[1]! * b[11]! +
      a[2]! * b[19]! +
      a[3]! * b[27]! +
      a[4]! * b[35]! +
      a[5]! * b[43]! +
      a[6]! * b[51]! +
      a[7]! * b[59]!
    target[4] =
      a[0]! * b[4]! +
      a[1]! * b[12]! +
      a[2]! * b[20]! +
      a[3]! * b[28]! +
      a[4]! * b[36]! +
      a[5]! * b[44]! +
      a[6]! * b[52]! +
      a[7]! * b[60]!
    target[5] =
      a[0]! * b[5]! +
      a[1]! * b[13]! +
      a[2]! * b[21]! +
      a[3]! * b[29]! +
      a[4]! * b[37]! +
      a[5]! * b[45]! +
      a[6]! * b[53]! +
      a[7]! * b[61]!
    target[6] =
      a[0]! * b[6]! +
      a[1]! * b[14]! +
      a[2]! * b[22]! +
      a[3]! * b[30]! +
      a[4]! * b[38]! +
      a[5]! * b[46]! +
      a[6]! * b[54]! +
      a[7]! * b[62]!
    target[7] =
      a[0]! * b[7]! +
      a[1]! * b[15]! +
      a[2]! * b[23]! +
      a[3]! * b[31]! +
      a[4]! * b[39]! +
      a[5]! * b[47]! +
      a[6]! * b[55]! +
      a[7]! * b[63]!
    target[8] =
      a[8]! * b[0]! +
      a[9]! * b[8]! +
      a[10]! * b[16]! +
      a[11]! * b[24]! +
      a[12]! * b[32]! +
      a[13]! * b[40]! +
      a[14]! * b[48]! +
      a[15]! * b[56]!
    target[9] =
      a[8]! * b[1]! +
      a[9]! * b[9]! +
      a[10]! * b[17]! +
      a[11]! * b[25]! +
      a[12]! * b[33]! +
      a[13]! * b[41]! +
      a[14]! * b[49]! +
      a[15]! * b[57]!
    target[10] =
      a[8]! * b[2]! +
      a[9]! * b[10]! +
      a[10]! * b[18]! +
      a[11]! * b[26]! +
      a[12]! * b[34]! +
      a[13]! * b[42]! +
      a[14]! * b[50]! +
      a[15]! * b[58]!
    target[11] =
      a[8]! * b[3]! +
      a[9]! * b[11]! +
      a[10]! * b[19]! +
      a[11]! * b[27]! +
      a[12]! * b[35]! +
      a[13]! * b[43]! +
      a[14]! * b[51]! +
      a[15]! * b[59]!
    target[12] =
      a[8]! * b[4]! +
      a[9]! * b[12]! +
      a[10]! * b[20]! +
      a[11]! * b[28]! +
      a[12]! * b[36]! +
      a[13]! * b[44]! +
      a[14]! * b[52]! +
      a[15]! * b[60]!
    target[13] =
      a[8]! * b[5]! +
      a[9]! * b[13]! +
      a[10]! * b[21]! +
      a[11]! * b[29]! +
      a[12]! * b[37]! +
      a[13]! * b[45]! +
      a[14]! * b[53]! +
      a[15]! * b[61]!
    target[14] =
      a[8]! * b[6]! +
      a[9]! * b[14]! +
      a[10]! * b[22]! +
      a[11]! * b[30]! +
      a[12]! * b[38]! +
      a[13]! * b[46]! +
      a[14]! * b[54]! +
      a[15]! * b[62]!
    target[15] =
      a[8]! * b[7]! +
      a[9]! * b[15]! +
      a[10]! * b[23]! +
      a[11]! * b[31]! +
      a[12]! * b[39]! +
      a[13]! * b[47]! +
      a[14]! * b[55]! +
      a[15]! * b[63]!
    target[16] =
      a[16]! * b[0]! +
      a[17]! * b[8]! +
      a[18]! * b[16]! +
      a[19]! * b[24]! +
      a[20]! * b[32]! +
      a[21]! * b[40]! +
      a[22]! * b[48]! +
      a[23]! * b[56]!
    target[17] =
      a[16]! * b[1]! +
      a[17]! * b[9]! +
      a[18]! * b[17]! +
      a[19]! * b[25]! +
      a[20]! * b[33]! +
      a[21]! * b[41]! +
      a[22]! * b[49]! +
      a[23]! * b[57]!
    target[18] =
      a[16]! * b[2]! +
      a[17]! * b[10]! +
      a[18]! * b[18]! +
      a[19]! * b[26]! +
      a[20]! * b[34]! +
      a[21]! * b[42]! +
      a[22]! * b[50]! +
      a[23]! * b[58]!
    target[19] =
      a[16]! * b[3]! +
      a[17]! * b[11]! +
      a[18]! * b[19]! +
      a[19]! * b[27]! +
      a[20]! * b[35]! +
      a[21]! * b[43]! +
      a[22]! * b[51]! +
      a[23]! * b[59]!
    target[20] =
      a[16]! * b[4]! +
      a[17]! * b[12]! +
      a[18]! * b[20]! +
      a[19]! * b[28]! +
      a[20]! * b[36]! +
      a[21]! * b[44]! +
      a[22]! * b[52]! +
      a[23]! * b[60]!
    target[21] =
      a[16]! * b[5]! +
      a[17]! * b[13]! +
      a[18]! * b[21]! +
      a[19]! * b[29]! +
      a[20]! * b[37]! +
      a[21]! * b[45]! +
      a[22]! * b[53]! +
      a[23]! * b[61]!
    target[22] =
      a[16]! * b[6]! +
      a[17]! * b[14]! +
      a[18]! * b[22]! +
      a[19]! * b[30]! +
      a[20]! * b[38]! +
      a[21]! * b[46]! +
      a[22]! * b[54]! +
      a[23]! * b[62]!
    target[23] =
      a[16]! * b[7]! +
      a[17]! * b[15]! +
      a[18]! * b[23]! +
      a[19]! * b[31]! +
      a[20]! * b[39]! +
      a[21]! * b[47]! +
      a[22]! * b[55]! +
      a[23]! * b[63]!
    target[24] =
      a[24]! * b[0]! +
      a[25]! * b[8]! +
      a[26]! * b[16]! +
      a[27]! * b[24]! +
      a[28]! * b[32]! +
      a[29]! * b[40]! +
      a[30]! * b[48]! +
      a[31]! * b[56]!
    target[25] =
      a[24]! * b[1]! +
      a[25]! * b[9]! +
      a[26]! * b[17]! +
      a[27]! * b[25]! +
      a[28]! * b[33]! +
      a[29]! * b[41]! +
      a[30]! * b[49]! +
      a[31]! * b[57]!
    target[26] =
      a[24]! * b[2]! +
      a[25]! * b[10]! +
      a[26]! * b[18]! +
      a[27]! * b[26]! +
      a[28]! * b[34]! +
      a[29]! * b[42]! +
      a[30]! * b[50]! +
      a[31]! * b[58]!
    target[27] =
      a[24]! * b[3]! +
      a[25]! * b[11]! +
      a[26]! * b[19]! +
      a[27]! * b[27]! +
      a[28]! * b[35]! +
      a[29]! * b[43]! +
      a[30]! * b[51]! +
      a[31]! * b[59]!
    target[28] =
      a[24]! * b[4]! +
      a[25]! * b[12]! +
      a[26]! * b[20]! +
      a[27]! * b[28]! +
      a[28]! * b[36]! +
      a[29]! * b[44]! +
      a[30]! * b[52]! +
      a[31]! * b[60]!
    target[29] =
      a[24]! * b[5]! +
      a[25]! * b[13]! +
      a[26]! * b[21]! +
      a[27]! * b[29]! +
      a[28]! * b[37]! +
      a[29]! * b[45]! +
      a[30]! * b[53]! +
      a[31]! * b[61]!
    target[30] =
      a[24]! * b[6]! +
      a[25]! * b[14]! +
      a[26]! * b[22]! +
      a[27]! * b[30]! +
      a[28]! * b[38]! +
      a[29]! * b[46]! +
      a[30]! * b[54]! +
      a[31]! * b[62]!
    target[31] =
      a[24]! * b[7]! +
      a[25]! * b[15]! +
      a[26]! * b[23]! +
      a[27]! * b[31]! +
      a[28]! * b[39]! +
      a[29]! * b[47]! +
      a[30]! * b[55]! +
      a[31]! * b[63]!
    target[32] =
      a[32]! * b[0]! +
      a[33]! * b[8]! +
      a[34]! * b[16]! +
      a[35]! * b[24]! +
      a[36]! * b[32]! +
      a[37]! * b[40]! +
      a[38]! * b[48]! +
      a[39]! * b[56]!
    target[33] =
      a[32]! * b[1]! +
      a[33]! * b[9]! +
      a[34]! * b[17]! +
      a[35]! * b[25]! +
      a[36]! * b[33]! +
      a[37]! * b[41]! +
      a[38]! * b[49]! +
      a[39]! * b[57]!
    target[34] =
      a[32]! * b[2]! +
      a[33]! * b[10]! +
      a[34]! * b[18]! +
      a[35]! * b[26]! +
      a[36]! * b[34]! +
      a[37]! * b[42]! +
      a[38]! * b[50]! +
      a[39]! * b[58]!
    target[35] =
      a[32]! * b[3]! +
      a[33]! * b[11]! +
      a[34]! * b[19]! +
      a[35]! * b[27]! +
      a[36]! * b[35]! +
      a[37]! * b[43]! +
      a[38]! * b[51]! +
      a[39]! * b[59]!
    target[36] =
      a[32]! * b[4]! +
      a[33]! * b[12]! +
      a[34]! * b[20]! +
      a[35]! * b[28]! +
      a[36]! * b[36]! +
      a[37]! * b[44]! +
      a[38]! * b[52]! +
      a[39]! * b[60]!
    target[37] =
      a[32]! * b[5]! +
      a[33]! * b[13]! +
      a[34]! * b[21]! +
      a[35]! * b[29]! +
      a[36]! * b[37]! +
      a[37]! * b[45]! +
      a[38]! * b[53]! +
      a[39]! * b[61]!
    target[38] =
      a[32]! * b[6]! +
      a[33]! * b[14]! +
      a[34]! * b[22]! +
      a[35]! * b[30]! +
      a[36]! * b[38]! +
      a[37]! * b[46]! +
      a[38]! * b[54]! +
      a[39]! * b[62]!
    target[39] =
      a[32]! * b[7]! +
      a[33]! * b[15]! +
      a[34]! * b[23]! +
      a[35]! * b[31]! +
      a[36]! * b[39]! +
      a[37]! * b[47]! +
      a[38]! * b[55]! +
      a[39]! * b[63]!
    target[40] =
      a[40]! * b[0]! +
      a[41]! * b[8]! +
      a[42]! * b[16]! +
      a[43]! * b[24]! +
      a[44]! * b[32]! +
      a[45]! * b[40]! +
      a[46]! * b[48]! +
      a[47]! * b[56]!
    target[41] =
      a[40]! * b[1]! +
      a[41]! * b[9]! +
      a[42]! * b[17]! +
      a[43]! * b[25]! +
      a[44]! * b[33]! +
      a[45]! * b[41]! +
      a[46]! * b[49]! +
      a[47]! * b[57]!
    target[42] =
      a[40]! * b[2]! +
      a[41]! * b[10]! +
      a[42]! * b[18]! +
      a[43]! * b[26]! +
      a[44]! * b[34]! +
      a[45]! * b[42]! +
      a[46]! * b[50]! +
      a[47]! * b[58]!
    target[43] =
      a[40]! * b[3]! +
      a[41]! * b[11]! +
      a[42]! * b[19]! +
      a[43]! * b[27]! +
      a[44]! * b[35]! +
      a[45]! * b[43]! +
      a[46]! * b[51]! +
      a[47]! * b[59]!
    target[44] =
      a[40]! * b[4]! +
      a[41]! * b[12]! +
      a[42]! * b[20]! +
      a[43]! * b[28]! +
      a[44]! * b[36]! +
      a[45]! * b[44]! +
      a[46]! * b[52]! +
      a[47]! * b[60]!
    target[45] =
      a[40]! * b[5]! +
      a[41]! * b[13]! +
      a[42]! * b[21]! +
      a[43]! * b[29]! +
      a[44]! * b[37]! +
      a[45]! * b[45]! +
      a[46]! * b[53]! +
      a[47]! * b[61]!
    target[46] =
      a[40]! * b[6]! +
      a[41]! * b[14]! +
      a[42]! * b[22]! +
      a[43]! * b[30]! +
      a[44]! * b[38]! +
      a[45]! * b[46]! +
      a[46]! * b[54]! +
      a[47]! * b[62]!
    target[47] =
      a[40]! * b[7]! +
      a[41]! * b[15]! +
      a[42]! * b[23]! +
      a[43]! * b[31]! +
      a[44]! * b[39]! +
      a[45]! * b[47]! +
      a[46]! * b[55]! +
      a[47]! * b[63]!
    target[48] =
      a[48]! * b[0]! +
      a[49]! * b[8]! +
      a[50]! * b[16]! +
      a[51]! * b[24]! +
      a[52]! * b[32]! +
      a[53]! * b[40]! +
      a[54]! * b[48]! +
      a[55]! * b[56]!
    target[49] =
      a[48]! * b[1]! +
      a[49]! * b[9]! +
      a[50]! * b[17]! +
      a[51]! * b[25]! +
      a[52]! * b[33]! +
      a[53]! * b[41]! +
      a[54]! * b[49]! +
      a[55]! * b[57]!
    target[50] =
      a[48]! * b[2]! +
      a[49]! * b[10]! +
      a[50]! * b[18]! +
      a[51]! * b[26]! +
      a[52]! * b[34]! +
      a[53]! * b[42]! +
      a[54]! * b[50]! +
      a[55]! * b[58]!
    target[51] =
      a[48]! * b[3]! +
      a[49]! * b[11]! +
      a[50]! * b[19]! +
      a[51]! * b[27]! +
      a[52]! * b[35]! +
      a[53]! * b[43]! +
      a[54]! * b[51]! +
      a[55]! * b[59]!
    target[52] =
      a[48]! * b[4]! +
      a[49]! * b[12]! +
      a[50]! * b[20]! +
      a[51]! * b[28]! +
      a[52]! * b[36]! +
      a[53]! * b[44]! +
      a[54]! * b[52]! +
      a[55]! * b[60]!
    target[53] =
      a[48]! * b[5]! +
      a[49]! * b[13]! +
      a[50]! * b[21]! +
      a[51]! * b[29]! +
      a[52]! * b[37]! +
      a[53]! * b[45]! +
      a[54]! * b[53]! +
      a[55]! * b[61]!
    target[54] =
      a[48]! * b[6]! +
      a[49]! * b[14]! +
      a[50]! * b[22]! +
      a[51]! * b[30]! +
      a[52]! * b[38]! +
      a[53]! * b[46]! +
      a[54]! * b[54]! +
      a[55]! * b[62]!
    target[55] =
      a[48]! * b[7]! +
      a[49]! * b[15]! +
      a[50]! * b[23]! +
      a[51]! * b[31]! +
      a[52]! * b[39]! +
      a[53]! * b[47]! +
      a[54]! * b[55]! +
      a[55]! * b[63]!
    target[56] =
      a[56]! * b[0]! +
      a[57]! * b[8]! +
      a[58]! * b[16]! +
      a[59]! * b[24]! +
      a[60]! * b[32]! +
      a[61]! * b[40]! +
      a[62]! * b[48]! +
      a[63]! * b[56]!
    target[57] =
      a[56]! * b[1]! +
      a[57]! * b[9]! +
      a[58]! * b[17]! +
      a[59]! * b[25]! +
      a[60]! * b[33]! +
      a[61]! * b[41]! +
      a[62]! * b[49]! +
      a[63]! * b[57]!
    target[58] =
      a[56]! * b[2]! +
      a[57]! * b[10]! +
      a[58]! * b[18]! +
      a[59]! * b[26]! +
      a[60]! * b[34]! +
      a[61]! * b[42]! +
      a[62]! * b[50]! +
      a[63]! * b[58]!
    target[59] =
      a[56]! * b[3]! +
      a[57]! * b[11]! +
      a[58]! * b[19]! +
      a[59]! * b[27]! +
      a[60]! * b[35]! +
      a[61]! * b[43]! +
      a[62]! * b[51]! +
      a[63]! * b[59]!
    target[60] =
      a[56]! * b[4]! +
      a[57]! * b[12]! +
      a[58]! * b[20]! +
      a[59]! * b[28]! +
      a[60]! * b[36]! +
      a[61]! * b[44]! +
      a[62]! * b[52]! +
      a[63]! * b[60]!
    target[61] =
      a[56]! * b[5]! +
      a[57]! * b[13]! +
      a[58]! * b[21]! +
      a[59]! * b[29]! +
      a[60]! * b[37]! +
      a[61]! * b[45]! +
      a[62]! * b[53]! +
      a[63]! * b[61]!
    target[62] =
      a[56]! * b[6]! +
      a[57]! * b[14]! +
      a[58]! * b[22]! +
      a[59]! * b[30]! +
      a[60]! * b[38]! +
      a[61]! * b[46]! +
      a[62]! * b[54]! +
      a[63]! * b[62]!
    target[63] =
      a[56]! * b[7]! +
      a[57]! * b[15]! +
      a[58]! * b[23]! +
      a[59]! * b[31]! +
      a[60]! * b[39]! +
      a[61]! * b[47]! +
      a[62]! * b[55]! +
      a[63]! * b[63]!
    if (isAliased) out.set(target)
    return
  }

  // OPT-MAT: Fully unrolled 9x9 matrix multiplication
  if (len === 81) {
    const isAliased = out === a || out === b
    const target = isAliased ? getAliasScratch(9) : out
    target[0] =
      a[0]! * b[0]! +
      a[1]! * b[9]! +
      a[2]! * b[18]! +
      a[3]! * b[27]! +
      a[4]! * b[36]! +
      a[5]! * b[45]! +
      a[6]! * b[54]! +
      a[7]! * b[63]! +
      a[8]! * b[72]!
    target[1] =
      a[0]! * b[1]! +
      a[1]! * b[10]! +
      a[2]! * b[19]! +
      a[3]! * b[28]! +
      a[4]! * b[37]! +
      a[5]! * b[46]! +
      a[6]! * b[55]! +
      a[7]! * b[64]! +
      a[8]! * b[73]!
    target[2] =
      a[0]! * b[2]! +
      a[1]! * b[11]! +
      a[2]! * b[20]! +
      a[3]! * b[29]! +
      a[4]! * b[38]! +
      a[5]! * b[47]! +
      a[6]! * b[56]! +
      a[7]! * b[65]! +
      a[8]! * b[74]!
    target[3] =
      a[0]! * b[3]! +
      a[1]! * b[12]! +
      a[2]! * b[21]! +
      a[3]! * b[30]! +
      a[4]! * b[39]! +
      a[5]! * b[48]! +
      a[6]! * b[57]! +
      a[7]! * b[66]! +
      a[8]! * b[75]!
    target[4] =
      a[0]! * b[4]! +
      a[1]! * b[13]! +
      a[2]! * b[22]! +
      a[3]! * b[31]! +
      a[4]! * b[40]! +
      a[5]! * b[49]! +
      a[6]! * b[58]! +
      a[7]! * b[67]! +
      a[8]! * b[76]!
    target[5] =
      a[0]! * b[5]! +
      a[1]! * b[14]! +
      a[2]! * b[23]! +
      a[3]! * b[32]! +
      a[4]! * b[41]! +
      a[5]! * b[50]! +
      a[6]! * b[59]! +
      a[7]! * b[68]! +
      a[8]! * b[77]!
    target[6] =
      a[0]! * b[6]! +
      a[1]! * b[15]! +
      a[2]! * b[24]! +
      a[3]! * b[33]! +
      a[4]! * b[42]! +
      a[5]! * b[51]! +
      a[6]! * b[60]! +
      a[7]! * b[69]! +
      a[8]! * b[78]!
    target[7] =
      a[0]! * b[7]! +
      a[1]! * b[16]! +
      a[2]! * b[25]! +
      a[3]! * b[34]! +
      a[4]! * b[43]! +
      a[5]! * b[52]! +
      a[6]! * b[61]! +
      a[7]! * b[70]! +
      a[8]! * b[79]!
    target[8] =
      a[0]! * b[8]! +
      a[1]! * b[17]! +
      a[2]! * b[26]! +
      a[3]! * b[35]! +
      a[4]! * b[44]! +
      a[5]! * b[53]! +
      a[6]! * b[62]! +
      a[7]! * b[71]! +
      a[8]! * b[80]!
    target[9] =
      a[9]! * b[0]! +
      a[10]! * b[9]! +
      a[11]! * b[18]! +
      a[12]! * b[27]! +
      a[13]! * b[36]! +
      a[14]! * b[45]! +
      a[15]! * b[54]! +
      a[16]! * b[63]! +
      a[17]! * b[72]!
    target[10] =
      a[9]! * b[1]! +
      a[10]! * b[10]! +
      a[11]! * b[19]! +
      a[12]! * b[28]! +
      a[13]! * b[37]! +
      a[14]! * b[46]! +
      a[15]! * b[55]! +
      a[16]! * b[64]! +
      a[17]! * b[73]!
    target[11] =
      a[9]! * b[2]! +
      a[10]! * b[11]! +
      a[11]! * b[20]! +
      a[12]! * b[29]! +
      a[13]! * b[38]! +
      a[14]! * b[47]! +
      a[15]! * b[56]! +
      a[16]! * b[65]! +
      a[17]! * b[74]!
    target[12] =
      a[9]! * b[3]! +
      a[10]! * b[12]! +
      a[11]! * b[21]! +
      a[12]! * b[30]! +
      a[13]! * b[39]! +
      a[14]! * b[48]! +
      a[15]! * b[57]! +
      a[16]! * b[66]! +
      a[17]! * b[75]!
    target[13] =
      a[9]! * b[4]! +
      a[10]! * b[13]! +
      a[11]! * b[22]! +
      a[12]! * b[31]! +
      a[13]! * b[40]! +
      a[14]! * b[49]! +
      a[15]! * b[58]! +
      a[16]! * b[67]! +
      a[17]! * b[76]!
    target[14] =
      a[9]! * b[5]! +
      a[10]! * b[14]! +
      a[11]! * b[23]! +
      a[12]! * b[32]! +
      a[13]! * b[41]! +
      a[14]! * b[50]! +
      a[15]! * b[59]! +
      a[16]! * b[68]! +
      a[17]! * b[77]!
    target[15] =
      a[9]! * b[6]! +
      a[10]! * b[15]! +
      a[11]! * b[24]! +
      a[12]! * b[33]! +
      a[13]! * b[42]! +
      a[14]! * b[51]! +
      a[15]! * b[60]! +
      a[16]! * b[69]! +
      a[17]! * b[78]!
    target[16] =
      a[9]! * b[7]! +
      a[10]! * b[16]! +
      a[11]! * b[25]! +
      a[12]! * b[34]! +
      a[13]! * b[43]! +
      a[14]! * b[52]! +
      a[15]! * b[61]! +
      a[16]! * b[70]! +
      a[17]! * b[79]!
    target[17] =
      a[9]! * b[8]! +
      a[10]! * b[17]! +
      a[11]! * b[26]! +
      a[12]! * b[35]! +
      a[13]! * b[44]! +
      a[14]! * b[53]! +
      a[15]! * b[62]! +
      a[16]! * b[71]! +
      a[17]! * b[80]!
    target[18] =
      a[18]! * b[0]! +
      a[19]! * b[9]! +
      a[20]! * b[18]! +
      a[21]! * b[27]! +
      a[22]! * b[36]! +
      a[23]! * b[45]! +
      a[24]! * b[54]! +
      a[25]! * b[63]! +
      a[26]! * b[72]!
    target[19] =
      a[18]! * b[1]! +
      a[19]! * b[10]! +
      a[20]! * b[19]! +
      a[21]! * b[28]! +
      a[22]! * b[37]! +
      a[23]! * b[46]! +
      a[24]! * b[55]! +
      a[25]! * b[64]! +
      a[26]! * b[73]!
    target[20] =
      a[18]! * b[2]! +
      a[19]! * b[11]! +
      a[20]! * b[20]! +
      a[21]! * b[29]! +
      a[22]! * b[38]! +
      a[23]! * b[47]! +
      a[24]! * b[56]! +
      a[25]! * b[65]! +
      a[26]! * b[74]!
    target[21] =
      a[18]! * b[3]! +
      a[19]! * b[12]! +
      a[20]! * b[21]! +
      a[21]! * b[30]! +
      a[22]! * b[39]! +
      a[23]! * b[48]! +
      a[24]! * b[57]! +
      a[25]! * b[66]! +
      a[26]! * b[75]!
    target[22] =
      a[18]! * b[4]! +
      a[19]! * b[13]! +
      a[20]! * b[22]! +
      a[21]! * b[31]! +
      a[22]! * b[40]! +
      a[23]! * b[49]! +
      a[24]! * b[58]! +
      a[25]! * b[67]! +
      a[26]! * b[76]!
    target[23] =
      a[18]! * b[5]! +
      a[19]! * b[14]! +
      a[20]! * b[23]! +
      a[21]! * b[32]! +
      a[22]! * b[41]! +
      a[23]! * b[50]! +
      a[24]! * b[59]! +
      a[25]! * b[68]! +
      a[26]! * b[77]!
    target[24] =
      a[18]! * b[6]! +
      a[19]! * b[15]! +
      a[20]! * b[24]! +
      a[21]! * b[33]! +
      a[22]! * b[42]! +
      a[23]! * b[51]! +
      a[24]! * b[60]! +
      a[25]! * b[69]! +
      a[26]! * b[78]!
    target[25] =
      a[18]! * b[7]! +
      a[19]! * b[16]! +
      a[20]! * b[25]! +
      a[21]! * b[34]! +
      a[22]! * b[43]! +
      a[23]! * b[52]! +
      a[24]! * b[61]! +
      a[25]! * b[70]! +
      a[26]! * b[79]!
    target[26] =
      a[18]! * b[8]! +
      a[19]! * b[17]! +
      a[20]! * b[26]! +
      a[21]! * b[35]! +
      a[22]! * b[44]! +
      a[23]! * b[53]! +
      a[24]! * b[62]! +
      a[25]! * b[71]! +
      a[26]! * b[80]!
    target[27] =
      a[27]! * b[0]! +
      a[28]! * b[9]! +
      a[29]! * b[18]! +
      a[30]! * b[27]! +
      a[31]! * b[36]! +
      a[32]! * b[45]! +
      a[33]! * b[54]! +
      a[34]! * b[63]! +
      a[35]! * b[72]!
    target[28] =
      a[27]! * b[1]! +
      a[28]! * b[10]! +
      a[29]! * b[19]! +
      a[30]! * b[28]! +
      a[31]! * b[37]! +
      a[32]! * b[46]! +
      a[33]! * b[55]! +
      a[34]! * b[64]! +
      a[35]! * b[73]!
    target[29] =
      a[27]! * b[2]! +
      a[28]! * b[11]! +
      a[29]! * b[20]! +
      a[30]! * b[29]! +
      a[31]! * b[38]! +
      a[32]! * b[47]! +
      a[33]! * b[56]! +
      a[34]! * b[65]! +
      a[35]! * b[74]!
    target[30] =
      a[27]! * b[3]! +
      a[28]! * b[12]! +
      a[29]! * b[21]! +
      a[30]! * b[30]! +
      a[31]! * b[39]! +
      a[32]! * b[48]! +
      a[33]! * b[57]! +
      a[34]! * b[66]! +
      a[35]! * b[75]!
    target[31] =
      a[27]! * b[4]! +
      a[28]! * b[13]! +
      a[29]! * b[22]! +
      a[30]! * b[31]! +
      a[31]! * b[40]! +
      a[32]! * b[49]! +
      a[33]! * b[58]! +
      a[34]! * b[67]! +
      a[35]! * b[76]!
    target[32] =
      a[27]! * b[5]! +
      a[28]! * b[14]! +
      a[29]! * b[23]! +
      a[30]! * b[32]! +
      a[31]! * b[41]! +
      a[32]! * b[50]! +
      a[33]! * b[59]! +
      a[34]! * b[68]! +
      a[35]! * b[77]!
    target[33] =
      a[27]! * b[6]! +
      a[28]! * b[15]! +
      a[29]! * b[24]! +
      a[30]! * b[33]! +
      a[31]! * b[42]! +
      a[32]! * b[51]! +
      a[33]! * b[60]! +
      a[34]! * b[69]! +
      a[35]! * b[78]!
    target[34] =
      a[27]! * b[7]! +
      a[28]! * b[16]! +
      a[29]! * b[25]! +
      a[30]! * b[34]! +
      a[31]! * b[43]! +
      a[32]! * b[52]! +
      a[33]! * b[61]! +
      a[34]! * b[70]! +
      a[35]! * b[79]!
    target[35] =
      a[27]! * b[8]! +
      a[28]! * b[17]! +
      a[29]! * b[26]! +
      a[30]! * b[35]! +
      a[31]! * b[44]! +
      a[32]! * b[53]! +
      a[33]! * b[62]! +
      a[34]! * b[71]! +
      a[35]! * b[80]!
    target[36] =
      a[36]! * b[0]! +
      a[37]! * b[9]! +
      a[38]! * b[18]! +
      a[39]! * b[27]! +
      a[40]! * b[36]! +
      a[41]! * b[45]! +
      a[42]! * b[54]! +
      a[43]! * b[63]! +
      a[44]! * b[72]!
    target[37] =
      a[36]! * b[1]! +
      a[37]! * b[10]! +
      a[38]! * b[19]! +
      a[39]! * b[28]! +
      a[40]! * b[37]! +
      a[41]! * b[46]! +
      a[42]! * b[55]! +
      a[43]! * b[64]! +
      a[44]! * b[73]!
    target[38] =
      a[36]! * b[2]! +
      a[37]! * b[11]! +
      a[38]! * b[20]! +
      a[39]! * b[29]! +
      a[40]! * b[38]! +
      a[41]! * b[47]! +
      a[42]! * b[56]! +
      a[43]! * b[65]! +
      a[44]! * b[74]!
    target[39] =
      a[36]! * b[3]! +
      a[37]! * b[12]! +
      a[38]! * b[21]! +
      a[39]! * b[30]! +
      a[40]! * b[39]! +
      a[41]! * b[48]! +
      a[42]! * b[57]! +
      a[43]! * b[66]! +
      a[44]! * b[75]!
    target[40] =
      a[36]! * b[4]! +
      a[37]! * b[13]! +
      a[38]! * b[22]! +
      a[39]! * b[31]! +
      a[40]! * b[40]! +
      a[41]! * b[49]! +
      a[42]! * b[58]! +
      a[43]! * b[67]! +
      a[44]! * b[76]!
    target[41] =
      a[36]! * b[5]! +
      a[37]! * b[14]! +
      a[38]! * b[23]! +
      a[39]! * b[32]! +
      a[40]! * b[41]! +
      a[41]! * b[50]! +
      a[42]! * b[59]! +
      a[43]! * b[68]! +
      a[44]! * b[77]!
    target[42] =
      a[36]! * b[6]! +
      a[37]! * b[15]! +
      a[38]! * b[24]! +
      a[39]! * b[33]! +
      a[40]! * b[42]! +
      a[41]! * b[51]! +
      a[42]! * b[60]! +
      a[43]! * b[69]! +
      a[44]! * b[78]!
    target[43] =
      a[36]! * b[7]! +
      a[37]! * b[16]! +
      a[38]! * b[25]! +
      a[39]! * b[34]! +
      a[40]! * b[43]! +
      a[41]! * b[52]! +
      a[42]! * b[61]! +
      a[43]! * b[70]! +
      a[44]! * b[79]!
    target[44] =
      a[36]! * b[8]! +
      a[37]! * b[17]! +
      a[38]! * b[26]! +
      a[39]! * b[35]! +
      a[40]! * b[44]! +
      a[41]! * b[53]! +
      a[42]! * b[62]! +
      a[43]! * b[71]! +
      a[44]! * b[80]!
    target[45] =
      a[45]! * b[0]! +
      a[46]! * b[9]! +
      a[47]! * b[18]! +
      a[48]! * b[27]! +
      a[49]! * b[36]! +
      a[50]! * b[45]! +
      a[51]! * b[54]! +
      a[52]! * b[63]! +
      a[53]! * b[72]!
    target[46] =
      a[45]! * b[1]! +
      a[46]! * b[10]! +
      a[47]! * b[19]! +
      a[48]! * b[28]! +
      a[49]! * b[37]! +
      a[50]! * b[46]! +
      a[51]! * b[55]! +
      a[52]! * b[64]! +
      a[53]! * b[73]!
    target[47] =
      a[45]! * b[2]! +
      a[46]! * b[11]! +
      a[47]! * b[20]! +
      a[48]! * b[29]! +
      a[49]! * b[38]! +
      a[50]! * b[47]! +
      a[51]! * b[56]! +
      a[52]! * b[65]! +
      a[53]! * b[74]!
    target[48] =
      a[45]! * b[3]! +
      a[46]! * b[12]! +
      a[47]! * b[21]! +
      a[48]! * b[30]! +
      a[49]! * b[39]! +
      a[50]! * b[48]! +
      a[51]! * b[57]! +
      a[52]! * b[66]! +
      a[53]! * b[75]!
    target[49] =
      a[45]! * b[4]! +
      a[46]! * b[13]! +
      a[47]! * b[22]! +
      a[48]! * b[31]! +
      a[49]! * b[40]! +
      a[50]! * b[49]! +
      a[51]! * b[58]! +
      a[52]! * b[67]! +
      a[53]! * b[76]!
    target[50] =
      a[45]! * b[5]! +
      a[46]! * b[14]! +
      a[47]! * b[23]! +
      a[48]! * b[32]! +
      a[49]! * b[41]! +
      a[50]! * b[50]! +
      a[51]! * b[59]! +
      a[52]! * b[68]! +
      a[53]! * b[77]!
    target[51] =
      a[45]! * b[6]! +
      a[46]! * b[15]! +
      a[47]! * b[24]! +
      a[48]! * b[33]! +
      a[49]! * b[42]! +
      a[50]! * b[51]! +
      a[51]! * b[60]! +
      a[52]! * b[69]! +
      a[53]! * b[78]!
    target[52] =
      a[45]! * b[7]! +
      a[46]! * b[16]! +
      a[47]! * b[25]! +
      a[48]! * b[34]! +
      a[49]! * b[43]! +
      a[50]! * b[52]! +
      a[51]! * b[61]! +
      a[52]! * b[70]! +
      a[53]! * b[79]!
    target[53] =
      a[45]! * b[8]! +
      a[46]! * b[17]! +
      a[47]! * b[26]! +
      a[48]! * b[35]! +
      a[49]! * b[44]! +
      a[50]! * b[53]! +
      a[51]! * b[62]! +
      a[52]! * b[71]! +
      a[53]! * b[80]!
    target[54] =
      a[54]! * b[0]! +
      a[55]! * b[9]! +
      a[56]! * b[18]! +
      a[57]! * b[27]! +
      a[58]! * b[36]! +
      a[59]! * b[45]! +
      a[60]! * b[54]! +
      a[61]! * b[63]! +
      a[62]! * b[72]!
    target[55] =
      a[54]! * b[1]! +
      a[55]! * b[10]! +
      a[56]! * b[19]! +
      a[57]! * b[28]! +
      a[58]! * b[37]! +
      a[59]! * b[46]! +
      a[60]! * b[55]! +
      a[61]! * b[64]! +
      a[62]! * b[73]!
    target[56] =
      a[54]! * b[2]! +
      a[55]! * b[11]! +
      a[56]! * b[20]! +
      a[57]! * b[29]! +
      a[58]! * b[38]! +
      a[59]! * b[47]! +
      a[60]! * b[56]! +
      a[61]! * b[65]! +
      a[62]! * b[74]!
    target[57] =
      a[54]! * b[3]! +
      a[55]! * b[12]! +
      a[56]! * b[21]! +
      a[57]! * b[30]! +
      a[58]! * b[39]! +
      a[59]! * b[48]! +
      a[60]! * b[57]! +
      a[61]! * b[66]! +
      a[62]! * b[75]!
    target[58] =
      a[54]! * b[4]! +
      a[55]! * b[13]! +
      a[56]! * b[22]! +
      a[57]! * b[31]! +
      a[58]! * b[40]! +
      a[59]! * b[49]! +
      a[60]! * b[58]! +
      a[61]! * b[67]! +
      a[62]! * b[76]!
    target[59] =
      a[54]! * b[5]! +
      a[55]! * b[14]! +
      a[56]! * b[23]! +
      a[57]! * b[32]! +
      a[58]! * b[41]! +
      a[59]! * b[50]! +
      a[60]! * b[59]! +
      a[61]! * b[68]! +
      a[62]! * b[77]!
    target[60] =
      a[54]! * b[6]! +
      a[55]! * b[15]! +
      a[56]! * b[24]! +
      a[57]! * b[33]! +
      a[58]! * b[42]! +
      a[59]! * b[51]! +
      a[60]! * b[60]! +
      a[61]! * b[69]! +
      a[62]! * b[78]!
    target[61] =
      a[54]! * b[7]! +
      a[55]! * b[16]! +
      a[56]! * b[25]! +
      a[57]! * b[34]! +
      a[58]! * b[43]! +
      a[59]! * b[52]! +
      a[60]! * b[61]! +
      a[61]! * b[70]! +
      a[62]! * b[79]!
    target[62] =
      a[54]! * b[8]! +
      a[55]! * b[17]! +
      a[56]! * b[26]! +
      a[57]! * b[35]! +
      a[58]! * b[44]! +
      a[59]! * b[53]! +
      a[60]! * b[62]! +
      a[61]! * b[71]! +
      a[62]! * b[80]!
    target[63] =
      a[63]! * b[0]! +
      a[64]! * b[9]! +
      a[65]! * b[18]! +
      a[66]! * b[27]! +
      a[67]! * b[36]! +
      a[68]! * b[45]! +
      a[69]! * b[54]! +
      a[70]! * b[63]! +
      a[71]! * b[72]!
    target[64] =
      a[63]! * b[1]! +
      a[64]! * b[10]! +
      a[65]! * b[19]! +
      a[66]! * b[28]! +
      a[67]! * b[37]! +
      a[68]! * b[46]! +
      a[69]! * b[55]! +
      a[70]! * b[64]! +
      a[71]! * b[73]!
    target[65] =
      a[63]! * b[2]! +
      a[64]! * b[11]! +
      a[65]! * b[20]! +
      a[66]! * b[29]! +
      a[67]! * b[38]! +
      a[68]! * b[47]! +
      a[69]! * b[56]! +
      a[70]! * b[65]! +
      a[71]! * b[74]!
    target[66] =
      a[63]! * b[3]! +
      a[64]! * b[12]! +
      a[65]! * b[21]! +
      a[66]! * b[30]! +
      a[67]! * b[39]! +
      a[68]! * b[48]! +
      a[69]! * b[57]! +
      a[70]! * b[66]! +
      a[71]! * b[75]!
    target[67] =
      a[63]! * b[4]! +
      a[64]! * b[13]! +
      a[65]! * b[22]! +
      a[66]! * b[31]! +
      a[67]! * b[40]! +
      a[68]! * b[49]! +
      a[69]! * b[58]! +
      a[70]! * b[67]! +
      a[71]! * b[76]!
    target[68] =
      a[63]! * b[5]! +
      a[64]! * b[14]! +
      a[65]! * b[23]! +
      a[66]! * b[32]! +
      a[67]! * b[41]! +
      a[68]! * b[50]! +
      a[69]! * b[59]! +
      a[70]! * b[68]! +
      a[71]! * b[77]!
    target[69] =
      a[63]! * b[6]! +
      a[64]! * b[15]! +
      a[65]! * b[24]! +
      a[66]! * b[33]! +
      a[67]! * b[42]! +
      a[68]! * b[51]! +
      a[69]! * b[60]! +
      a[70]! * b[69]! +
      a[71]! * b[78]!
    target[70] =
      a[63]! * b[7]! +
      a[64]! * b[16]! +
      a[65]! * b[25]! +
      a[66]! * b[34]! +
      a[67]! * b[43]! +
      a[68]! * b[52]! +
      a[69]! * b[61]! +
      a[70]! * b[70]! +
      a[71]! * b[79]!
    target[71] =
      a[63]! * b[8]! +
      a[64]! * b[17]! +
      a[65]! * b[26]! +
      a[66]! * b[35]! +
      a[67]! * b[44]! +
      a[68]! * b[53]! +
      a[69]! * b[62]! +
      a[70]! * b[71]! +
      a[71]! * b[80]!
    target[72] =
      a[72]! * b[0]! +
      a[73]! * b[9]! +
      a[74]! * b[18]! +
      a[75]! * b[27]! +
      a[76]! * b[36]! +
      a[77]! * b[45]! +
      a[78]! * b[54]! +
      a[79]! * b[63]! +
      a[80]! * b[72]!
    target[73] =
      a[72]! * b[1]! +
      a[73]! * b[10]! +
      a[74]! * b[19]! +
      a[75]! * b[28]! +
      a[76]! * b[37]! +
      a[77]! * b[46]! +
      a[78]! * b[55]! +
      a[79]! * b[64]! +
      a[80]! * b[73]!
    target[74] =
      a[72]! * b[2]! +
      a[73]! * b[11]! +
      a[74]! * b[20]! +
      a[75]! * b[29]! +
      a[76]! * b[38]! +
      a[77]! * b[47]! +
      a[78]! * b[56]! +
      a[79]! * b[65]! +
      a[80]! * b[74]!
    target[75] =
      a[72]! * b[3]! +
      a[73]! * b[12]! +
      a[74]! * b[21]! +
      a[75]! * b[30]! +
      a[76]! * b[39]! +
      a[77]! * b[48]! +
      a[78]! * b[57]! +
      a[79]! * b[66]! +
      a[80]! * b[75]!
    target[76] =
      a[72]! * b[4]! +
      a[73]! * b[13]! +
      a[74]! * b[22]! +
      a[75]! * b[31]! +
      a[76]! * b[40]! +
      a[77]! * b[49]! +
      a[78]! * b[58]! +
      a[79]! * b[67]! +
      a[80]! * b[76]!
    target[77] =
      a[72]! * b[5]! +
      a[73]! * b[14]! +
      a[74]! * b[23]! +
      a[75]! * b[32]! +
      a[76]! * b[41]! +
      a[77]! * b[50]! +
      a[78]! * b[59]! +
      a[79]! * b[68]! +
      a[80]! * b[77]!
    target[78] =
      a[72]! * b[6]! +
      a[73]! * b[15]! +
      a[74]! * b[24]! +
      a[75]! * b[33]! +
      a[76]! * b[42]! +
      a[77]! * b[51]! +
      a[78]! * b[60]! +
      a[79]! * b[69]! +
      a[80]! * b[78]!
    target[79] =
      a[72]! * b[7]! +
      a[73]! * b[16]! +
      a[74]! * b[25]! +
      a[75]! * b[34]! +
      a[76]! * b[43]! +
      a[77]! * b[52]! +
      a[78]! * b[61]! +
      a[79]! * b[70]! +
      a[80]! * b[79]!
    target[80] =
      a[72]! * b[8]! +
      a[73]! * b[17]! +
      a[74]! * b[26]! +
      a[75]! * b[35]! +
      a[76]! * b[44]! +
      a[77]! * b[53]! +
      a[78]! * b[62]! +
      a[79]! * b[71]! +
      a[80]! * b[80]!
    if (isAliased) out.set(target)
    return
  }

  // OPT-MAT: Fully unrolled 10x10 matrix multiplication
  if (len === 100) {
    const isAliased = out === a || out === b
    const target = isAliased ? getAliasScratch(10) : out
    target[0] =
      a[0]! * b[0]! +
      a[1]! * b[10]! +
      a[2]! * b[20]! +
      a[3]! * b[30]! +
      a[4]! * b[40]! +
      a[5]! * b[50]! +
      a[6]! * b[60]! +
      a[7]! * b[70]! +
      a[8]! * b[80]! +
      a[9]! * b[90]!
    target[1] =
      a[0]! * b[1]! +
      a[1]! * b[11]! +
      a[2]! * b[21]! +
      a[3]! * b[31]! +
      a[4]! * b[41]! +
      a[5]! * b[51]! +
      a[6]! * b[61]! +
      a[7]! * b[71]! +
      a[8]! * b[81]! +
      a[9]! * b[91]!
    target[2] =
      a[0]! * b[2]! +
      a[1]! * b[12]! +
      a[2]! * b[22]! +
      a[3]! * b[32]! +
      a[4]! * b[42]! +
      a[5]! * b[52]! +
      a[6]! * b[62]! +
      a[7]! * b[72]! +
      a[8]! * b[82]! +
      a[9]! * b[92]!
    target[3] =
      a[0]! * b[3]! +
      a[1]! * b[13]! +
      a[2]! * b[23]! +
      a[3]! * b[33]! +
      a[4]! * b[43]! +
      a[5]! * b[53]! +
      a[6]! * b[63]! +
      a[7]! * b[73]! +
      a[8]! * b[83]! +
      a[9]! * b[93]!
    target[4] =
      a[0]! * b[4]! +
      a[1]! * b[14]! +
      a[2]! * b[24]! +
      a[3]! * b[34]! +
      a[4]! * b[44]! +
      a[5]! * b[54]! +
      a[6]! * b[64]! +
      a[7]! * b[74]! +
      a[8]! * b[84]! +
      a[9]! * b[94]!
    target[5] =
      a[0]! * b[5]! +
      a[1]! * b[15]! +
      a[2]! * b[25]! +
      a[3]! * b[35]! +
      a[4]! * b[45]! +
      a[5]! * b[55]! +
      a[6]! * b[65]! +
      a[7]! * b[75]! +
      a[8]! * b[85]! +
      a[9]! * b[95]!
    target[6] =
      a[0]! * b[6]! +
      a[1]! * b[16]! +
      a[2]! * b[26]! +
      a[3]! * b[36]! +
      a[4]! * b[46]! +
      a[5]! * b[56]! +
      a[6]! * b[66]! +
      a[7]! * b[76]! +
      a[8]! * b[86]! +
      a[9]! * b[96]!
    target[7] =
      a[0]! * b[7]! +
      a[1]! * b[17]! +
      a[2]! * b[27]! +
      a[3]! * b[37]! +
      a[4]! * b[47]! +
      a[5]! * b[57]! +
      a[6]! * b[67]! +
      a[7]! * b[77]! +
      a[8]! * b[87]! +
      a[9]! * b[97]!
    target[8] =
      a[0]! * b[8]! +
      a[1]! * b[18]! +
      a[2]! * b[28]! +
      a[3]! * b[38]! +
      a[4]! * b[48]! +
      a[5]! * b[58]! +
      a[6]! * b[68]! +
      a[7]! * b[78]! +
      a[8]! * b[88]! +
      a[9]! * b[98]!
    target[9] =
      a[0]! * b[9]! +
      a[1]! * b[19]! +
      a[2]! * b[29]! +
      a[3]! * b[39]! +
      a[4]! * b[49]! +
      a[5]! * b[59]! +
      a[6]! * b[69]! +
      a[7]! * b[79]! +
      a[8]! * b[89]! +
      a[9]! * b[99]!
    target[10] =
      a[10]! * b[0]! +
      a[11]! * b[10]! +
      a[12]! * b[20]! +
      a[13]! * b[30]! +
      a[14]! * b[40]! +
      a[15]! * b[50]! +
      a[16]! * b[60]! +
      a[17]! * b[70]! +
      a[18]! * b[80]! +
      a[19]! * b[90]!
    target[11] =
      a[10]! * b[1]! +
      a[11]! * b[11]! +
      a[12]! * b[21]! +
      a[13]! * b[31]! +
      a[14]! * b[41]! +
      a[15]! * b[51]! +
      a[16]! * b[61]! +
      a[17]! * b[71]! +
      a[18]! * b[81]! +
      a[19]! * b[91]!
    target[12] =
      a[10]! * b[2]! +
      a[11]! * b[12]! +
      a[12]! * b[22]! +
      a[13]! * b[32]! +
      a[14]! * b[42]! +
      a[15]! * b[52]! +
      a[16]! * b[62]! +
      a[17]! * b[72]! +
      a[18]! * b[82]! +
      a[19]! * b[92]!
    target[13] =
      a[10]! * b[3]! +
      a[11]! * b[13]! +
      a[12]! * b[23]! +
      a[13]! * b[33]! +
      a[14]! * b[43]! +
      a[15]! * b[53]! +
      a[16]! * b[63]! +
      a[17]! * b[73]! +
      a[18]! * b[83]! +
      a[19]! * b[93]!
    target[14] =
      a[10]! * b[4]! +
      a[11]! * b[14]! +
      a[12]! * b[24]! +
      a[13]! * b[34]! +
      a[14]! * b[44]! +
      a[15]! * b[54]! +
      a[16]! * b[64]! +
      a[17]! * b[74]! +
      a[18]! * b[84]! +
      a[19]! * b[94]!
    target[15] =
      a[10]! * b[5]! +
      a[11]! * b[15]! +
      a[12]! * b[25]! +
      a[13]! * b[35]! +
      a[14]! * b[45]! +
      a[15]! * b[55]! +
      a[16]! * b[65]! +
      a[17]! * b[75]! +
      a[18]! * b[85]! +
      a[19]! * b[95]!
    target[16] =
      a[10]! * b[6]! +
      a[11]! * b[16]! +
      a[12]! * b[26]! +
      a[13]! * b[36]! +
      a[14]! * b[46]! +
      a[15]! * b[56]! +
      a[16]! * b[66]! +
      a[17]! * b[76]! +
      a[18]! * b[86]! +
      a[19]! * b[96]!
    target[17] =
      a[10]! * b[7]! +
      a[11]! * b[17]! +
      a[12]! * b[27]! +
      a[13]! * b[37]! +
      a[14]! * b[47]! +
      a[15]! * b[57]! +
      a[16]! * b[67]! +
      a[17]! * b[77]! +
      a[18]! * b[87]! +
      a[19]! * b[97]!
    target[18] =
      a[10]! * b[8]! +
      a[11]! * b[18]! +
      a[12]! * b[28]! +
      a[13]! * b[38]! +
      a[14]! * b[48]! +
      a[15]! * b[58]! +
      a[16]! * b[68]! +
      a[17]! * b[78]! +
      a[18]! * b[88]! +
      a[19]! * b[98]!
    target[19] =
      a[10]! * b[9]! +
      a[11]! * b[19]! +
      a[12]! * b[29]! +
      a[13]! * b[39]! +
      a[14]! * b[49]! +
      a[15]! * b[59]! +
      a[16]! * b[69]! +
      a[17]! * b[79]! +
      a[18]! * b[89]! +
      a[19]! * b[99]!
    target[20] =
      a[20]! * b[0]! +
      a[21]! * b[10]! +
      a[22]! * b[20]! +
      a[23]! * b[30]! +
      a[24]! * b[40]! +
      a[25]! * b[50]! +
      a[26]! * b[60]! +
      a[27]! * b[70]! +
      a[28]! * b[80]! +
      a[29]! * b[90]!
    target[21] =
      a[20]! * b[1]! +
      a[21]! * b[11]! +
      a[22]! * b[21]! +
      a[23]! * b[31]! +
      a[24]! * b[41]! +
      a[25]! * b[51]! +
      a[26]! * b[61]! +
      a[27]! * b[71]! +
      a[28]! * b[81]! +
      a[29]! * b[91]!
    target[22] =
      a[20]! * b[2]! +
      a[21]! * b[12]! +
      a[22]! * b[22]! +
      a[23]! * b[32]! +
      a[24]! * b[42]! +
      a[25]! * b[52]! +
      a[26]! * b[62]! +
      a[27]! * b[72]! +
      a[28]! * b[82]! +
      a[29]! * b[92]!
    target[23] =
      a[20]! * b[3]! +
      a[21]! * b[13]! +
      a[22]! * b[23]! +
      a[23]! * b[33]! +
      a[24]! * b[43]! +
      a[25]! * b[53]! +
      a[26]! * b[63]! +
      a[27]! * b[73]! +
      a[28]! * b[83]! +
      a[29]! * b[93]!
    target[24] =
      a[20]! * b[4]! +
      a[21]! * b[14]! +
      a[22]! * b[24]! +
      a[23]! * b[34]! +
      a[24]! * b[44]! +
      a[25]! * b[54]! +
      a[26]! * b[64]! +
      a[27]! * b[74]! +
      a[28]! * b[84]! +
      a[29]! * b[94]!
    target[25] =
      a[20]! * b[5]! +
      a[21]! * b[15]! +
      a[22]! * b[25]! +
      a[23]! * b[35]! +
      a[24]! * b[45]! +
      a[25]! * b[55]! +
      a[26]! * b[65]! +
      a[27]! * b[75]! +
      a[28]! * b[85]! +
      a[29]! * b[95]!
    target[26] =
      a[20]! * b[6]! +
      a[21]! * b[16]! +
      a[22]! * b[26]! +
      a[23]! * b[36]! +
      a[24]! * b[46]! +
      a[25]! * b[56]! +
      a[26]! * b[66]! +
      a[27]! * b[76]! +
      a[28]! * b[86]! +
      a[29]! * b[96]!
    target[27] =
      a[20]! * b[7]! +
      a[21]! * b[17]! +
      a[22]! * b[27]! +
      a[23]! * b[37]! +
      a[24]! * b[47]! +
      a[25]! * b[57]! +
      a[26]! * b[67]! +
      a[27]! * b[77]! +
      a[28]! * b[87]! +
      a[29]! * b[97]!
    target[28] =
      a[20]! * b[8]! +
      a[21]! * b[18]! +
      a[22]! * b[28]! +
      a[23]! * b[38]! +
      a[24]! * b[48]! +
      a[25]! * b[58]! +
      a[26]! * b[68]! +
      a[27]! * b[78]! +
      a[28]! * b[88]! +
      a[29]! * b[98]!
    target[29] =
      a[20]! * b[9]! +
      a[21]! * b[19]! +
      a[22]! * b[29]! +
      a[23]! * b[39]! +
      a[24]! * b[49]! +
      a[25]! * b[59]! +
      a[26]! * b[69]! +
      a[27]! * b[79]! +
      a[28]! * b[89]! +
      a[29]! * b[99]!
    target[30] =
      a[30]! * b[0]! +
      a[31]! * b[10]! +
      a[32]! * b[20]! +
      a[33]! * b[30]! +
      a[34]! * b[40]! +
      a[35]! * b[50]! +
      a[36]! * b[60]! +
      a[37]! * b[70]! +
      a[38]! * b[80]! +
      a[39]! * b[90]!
    target[31] =
      a[30]! * b[1]! +
      a[31]! * b[11]! +
      a[32]! * b[21]! +
      a[33]! * b[31]! +
      a[34]! * b[41]! +
      a[35]! * b[51]! +
      a[36]! * b[61]! +
      a[37]! * b[71]! +
      a[38]! * b[81]! +
      a[39]! * b[91]!
    target[32] =
      a[30]! * b[2]! +
      a[31]! * b[12]! +
      a[32]! * b[22]! +
      a[33]! * b[32]! +
      a[34]! * b[42]! +
      a[35]! * b[52]! +
      a[36]! * b[62]! +
      a[37]! * b[72]! +
      a[38]! * b[82]! +
      a[39]! * b[92]!
    target[33] =
      a[30]! * b[3]! +
      a[31]! * b[13]! +
      a[32]! * b[23]! +
      a[33]! * b[33]! +
      a[34]! * b[43]! +
      a[35]! * b[53]! +
      a[36]! * b[63]! +
      a[37]! * b[73]! +
      a[38]! * b[83]! +
      a[39]! * b[93]!
    target[34] =
      a[30]! * b[4]! +
      a[31]! * b[14]! +
      a[32]! * b[24]! +
      a[33]! * b[34]! +
      a[34]! * b[44]! +
      a[35]! * b[54]! +
      a[36]! * b[64]! +
      a[37]! * b[74]! +
      a[38]! * b[84]! +
      a[39]! * b[94]!
    target[35] =
      a[30]! * b[5]! +
      a[31]! * b[15]! +
      a[32]! * b[25]! +
      a[33]! * b[35]! +
      a[34]! * b[45]! +
      a[35]! * b[55]! +
      a[36]! * b[65]! +
      a[37]! * b[75]! +
      a[38]! * b[85]! +
      a[39]! * b[95]!
    target[36] =
      a[30]! * b[6]! +
      a[31]! * b[16]! +
      a[32]! * b[26]! +
      a[33]! * b[36]! +
      a[34]! * b[46]! +
      a[35]! * b[56]! +
      a[36]! * b[66]! +
      a[37]! * b[76]! +
      a[38]! * b[86]! +
      a[39]! * b[96]!
    target[37] =
      a[30]! * b[7]! +
      a[31]! * b[17]! +
      a[32]! * b[27]! +
      a[33]! * b[37]! +
      a[34]! * b[47]! +
      a[35]! * b[57]! +
      a[36]! * b[67]! +
      a[37]! * b[77]! +
      a[38]! * b[87]! +
      a[39]! * b[97]!
    target[38] =
      a[30]! * b[8]! +
      a[31]! * b[18]! +
      a[32]! * b[28]! +
      a[33]! * b[38]! +
      a[34]! * b[48]! +
      a[35]! * b[58]! +
      a[36]! * b[68]! +
      a[37]! * b[78]! +
      a[38]! * b[88]! +
      a[39]! * b[98]!
    target[39] =
      a[30]! * b[9]! +
      a[31]! * b[19]! +
      a[32]! * b[29]! +
      a[33]! * b[39]! +
      a[34]! * b[49]! +
      a[35]! * b[59]! +
      a[36]! * b[69]! +
      a[37]! * b[79]! +
      a[38]! * b[89]! +
      a[39]! * b[99]!
    target[40] =
      a[40]! * b[0]! +
      a[41]! * b[10]! +
      a[42]! * b[20]! +
      a[43]! * b[30]! +
      a[44]! * b[40]! +
      a[45]! * b[50]! +
      a[46]! * b[60]! +
      a[47]! * b[70]! +
      a[48]! * b[80]! +
      a[49]! * b[90]!
    target[41] =
      a[40]! * b[1]! +
      a[41]! * b[11]! +
      a[42]! * b[21]! +
      a[43]! * b[31]! +
      a[44]! * b[41]! +
      a[45]! * b[51]! +
      a[46]! * b[61]! +
      a[47]! * b[71]! +
      a[48]! * b[81]! +
      a[49]! * b[91]!
    target[42] =
      a[40]! * b[2]! +
      a[41]! * b[12]! +
      a[42]! * b[22]! +
      a[43]! * b[32]! +
      a[44]! * b[42]! +
      a[45]! * b[52]! +
      a[46]! * b[62]! +
      a[47]! * b[72]! +
      a[48]! * b[82]! +
      a[49]! * b[92]!
    target[43] =
      a[40]! * b[3]! +
      a[41]! * b[13]! +
      a[42]! * b[23]! +
      a[43]! * b[33]! +
      a[44]! * b[43]! +
      a[45]! * b[53]! +
      a[46]! * b[63]! +
      a[47]! * b[73]! +
      a[48]! * b[83]! +
      a[49]! * b[93]!
    target[44] =
      a[40]! * b[4]! +
      a[41]! * b[14]! +
      a[42]! * b[24]! +
      a[43]! * b[34]! +
      a[44]! * b[44]! +
      a[45]! * b[54]! +
      a[46]! * b[64]! +
      a[47]! * b[74]! +
      a[48]! * b[84]! +
      a[49]! * b[94]!
    target[45] =
      a[40]! * b[5]! +
      a[41]! * b[15]! +
      a[42]! * b[25]! +
      a[43]! * b[35]! +
      a[44]! * b[45]! +
      a[45]! * b[55]! +
      a[46]! * b[65]! +
      a[47]! * b[75]! +
      a[48]! * b[85]! +
      a[49]! * b[95]!
    target[46] =
      a[40]! * b[6]! +
      a[41]! * b[16]! +
      a[42]! * b[26]! +
      a[43]! * b[36]! +
      a[44]! * b[46]! +
      a[45]! * b[56]! +
      a[46]! * b[66]! +
      a[47]! * b[76]! +
      a[48]! * b[86]! +
      a[49]! * b[96]!
    target[47] =
      a[40]! * b[7]! +
      a[41]! * b[17]! +
      a[42]! * b[27]! +
      a[43]! * b[37]! +
      a[44]! * b[47]! +
      a[45]! * b[57]! +
      a[46]! * b[67]! +
      a[47]! * b[77]! +
      a[48]! * b[87]! +
      a[49]! * b[97]!
    target[48] =
      a[40]! * b[8]! +
      a[41]! * b[18]! +
      a[42]! * b[28]! +
      a[43]! * b[38]! +
      a[44]! * b[48]! +
      a[45]! * b[58]! +
      a[46]! * b[68]! +
      a[47]! * b[78]! +
      a[48]! * b[88]! +
      a[49]! * b[98]!
    target[49] =
      a[40]! * b[9]! +
      a[41]! * b[19]! +
      a[42]! * b[29]! +
      a[43]! * b[39]! +
      a[44]! * b[49]! +
      a[45]! * b[59]! +
      a[46]! * b[69]! +
      a[47]! * b[79]! +
      a[48]! * b[89]! +
      a[49]! * b[99]!
    target[50] =
      a[50]! * b[0]! +
      a[51]! * b[10]! +
      a[52]! * b[20]! +
      a[53]! * b[30]! +
      a[54]! * b[40]! +
      a[55]! * b[50]! +
      a[56]! * b[60]! +
      a[57]! * b[70]! +
      a[58]! * b[80]! +
      a[59]! * b[90]!
    target[51] =
      a[50]! * b[1]! +
      a[51]! * b[11]! +
      a[52]! * b[21]! +
      a[53]! * b[31]! +
      a[54]! * b[41]! +
      a[55]! * b[51]! +
      a[56]! * b[61]! +
      a[57]! * b[71]! +
      a[58]! * b[81]! +
      a[59]! * b[91]!
    target[52] =
      a[50]! * b[2]! +
      a[51]! * b[12]! +
      a[52]! * b[22]! +
      a[53]! * b[32]! +
      a[54]! * b[42]! +
      a[55]! * b[52]! +
      a[56]! * b[62]! +
      a[57]! * b[72]! +
      a[58]! * b[82]! +
      a[59]! * b[92]!
    target[53] =
      a[50]! * b[3]! +
      a[51]! * b[13]! +
      a[52]! * b[23]! +
      a[53]! * b[33]! +
      a[54]! * b[43]! +
      a[55]! * b[53]! +
      a[56]! * b[63]! +
      a[57]! * b[73]! +
      a[58]! * b[83]! +
      a[59]! * b[93]!
    target[54] =
      a[50]! * b[4]! +
      a[51]! * b[14]! +
      a[52]! * b[24]! +
      a[53]! * b[34]! +
      a[54]! * b[44]! +
      a[55]! * b[54]! +
      a[56]! * b[64]! +
      a[57]! * b[74]! +
      a[58]! * b[84]! +
      a[59]! * b[94]!
    target[55] =
      a[50]! * b[5]! +
      a[51]! * b[15]! +
      a[52]! * b[25]! +
      a[53]! * b[35]! +
      a[54]! * b[45]! +
      a[55]! * b[55]! +
      a[56]! * b[65]! +
      a[57]! * b[75]! +
      a[58]! * b[85]! +
      a[59]! * b[95]!
    target[56] =
      a[50]! * b[6]! +
      a[51]! * b[16]! +
      a[52]! * b[26]! +
      a[53]! * b[36]! +
      a[54]! * b[46]! +
      a[55]! * b[56]! +
      a[56]! * b[66]! +
      a[57]! * b[76]! +
      a[58]! * b[86]! +
      a[59]! * b[96]!
    target[57] =
      a[50]! * b[7]! +
      a[51]! * b[17]! +
      a[52]! * b[27]! +
      a[53]! * b[37]! +
      a[54]! * b[47]! +
      a[55]! * b[57]! +
      a[56]! * b[67]! +
      a[57]! * b[77]! +
      a[58]! * b[87]! +
      a[59]! * b[97]!
    target[58] =
      a[50]! * b[8]! +
      a[51]! * b[18]! +
      a[52]! * b[28]! +
      a[53]! * b[38]! +
      a[54]! * b[48]! +
      a[55]! * b[58]! +
      a[56]! * b[68]! +
      a[57]! * b[78]! +
      a[58]! * b[88]! +
      a[59]! * b[98]!
    target[59] =
      a[50]! * b[9]! +
      a[51]! * b[19]! +
      a[52]! * b[29]! +
      a[53]! * b[39]! +
      a[54]! * b[49]! +
      a[55]! * b[59]! +
      a[56]! * b[69]! +
      a[57]! * b[79]! +
      a[58]! * b[89]! +
      a[59]! * b[99]!
    target[60] =
      a[60]! * b[0]! +
      a[61]! * b[10]! +
      a[62]! * b[20]! +
      a[63]! * b[30]! +
      a[64]! * b[40]! +
      a[65]! * b[50]! +
      a[66]! * b[60]! +
      a[67]! * b[70]! +
      a[68]! * b[80]! +
      a[69]! * b[90]!
    target[61] =
      a[60]! * b[1]! +
      a[61]! * b[11]! +
      a[62]! * b[21]! +
      a[63]! * b[31]! +
      a[64]! * b[41]! +
      a[65]! * b[51]! +
      a[66]! * b[61]! +
      a[67]! * b[71]! +
      a[68]! * b[81]! +
      a[69]! * b[91]!
    target[62] =
      a[60]! * b[2]! +
      a[61]! * b[12]! +
      a[62]! * b[22]! +
      a[63]! * b[32]! +
      a[64]! * b[42]! +
      a[65]! * b[52]! +
      a[66]! * b[62]! +
      a[67]! * b[72]! +
      a[68]! * b[82]! +
      a[69]! * b[92]!
    target[63] =
      a[60]! * b[3]! +
      a[61]! * b[13]! +
      a[62]! * b[23]! +
      a[63]! * b[33]! +
      a[64]! * b[43]! +
      a[65]! * b[53]! +
      a[66]! * b[63]! +
      a[67]! * b[73]! +
      a[68]! * b[83]! +
      a[69]! * b[93]!
    target[64] =
      a[60]! * b[4]! +
      a[61]! * b[14]! +
      a[62]! * b[24]! +
      a[63]! * b[34]! +
      a[64]! * b[44]! +
      a[65]! * b[54]! +
      a[66]! * b[64]! +
      a[67]! * b[74]! +
      a[68]! * b[84]! +
      a[69]! * b[94]!
    target[65] =
      a[60]! * b[5]! +
      a[61]! * b[15]! +
      a[62]! * b[25]! +
      a[63]! * b[35]! +
      a[64]! * b[45]! +
      a[65]! * b[55]! +
      a[66]! * b[65]! +
      a[67]! * b[75]! +
      a[68]! * b[85]! +
      a[69]! * b[95]!
    target[66] =
      a[60]! * b[6]! +
      a[61]! * b[16]! +
      a[62]! * b[26]! +
      a[63]! * b[36]! +
      a[64]! * b[46]! +
      a[65]! * b[56]! +
      a[66]! * b[66]! +
      a[67]! * b[76]! +
      a[68]! * b[86]! +
      a[69]! * b[96]!
    target[67] =
      a[60]! * b[7]! +
      a[61]! * b[17]! +
      a[62]! * b[27]! +
      a[63]! * b[37]! +
      a[64]! * b[47]! +
      a[65]! * b[57]! +
      a[66]! * b[67]! +
      a[67]! * b[77]! +
      a[68]! * b[87]! +
      a[69]! * b[97]!
    target[68] =
      a[60]! * b[8]! +
      a[61]! * b[18]! +
      a[62]! * b[28]! +
      a[63]! * b[38]! +
      a[64]! * b[48]! +
      a[65]! * b[58]! +
      a[66]! * b[68]! +
      a[67]! * b[78]! +
      a[68]! * b[88]! +
      a[69]! * b[98]!
    target[69] =
      a[60]! * b[9]! +
      a[61]! * b[19]! +
      a[62]! * b[29]! +
      a[63]! * b[39]! +
      a[64]! * b[49]! +
      a[65]! * b[59]! +
      a[66]! * b[69]! +
      a[67]! * b[79]! +
      a[68]! * b[89]! +
      a[69]! * b[99]!
    target[70] =
      a[70]! * b[0]! +
      a[71]! * b[10]! +
      a[72]! * b[20]! +
      a[73]! * b[30]! +
      a[74]! * b[40]! +
      a[75]! * b[50]! +
      a[76]! * b[60]! +
      a[77]! * b[70]! +
      a[78]! * b[80]! +
      a[79]! * b[90]!
    target[71] =
      a[70]! * b[1]! +
      a[71]! * b[11]! +
      a[72]! * b[21]! +
      a[73]! * b[31]! +
      a[74]! * b[41]! +
      a[75]! * b[51]! +
      a[76]! * b[61]! +
      a[77]! * b[71]! +
      a[78]! * b[81]! +
      a[79]! * b[91]!
    target[72] =
      a[70]! * b[2]! +
      a[71]! * b[12]! +
      a[72]! * b[22]! +
      a[73]! * b[32]! +
      a[74]! * b[42]! +
      a[75]! * b[52]! +
      a[76]! * b[62]! +
      a[77]! * b[72]! +
      a[78]! * b[82]! +
      a[79]! * b[92]!
    target[73] =
      a[70]! * b[3]! +
      a[71]! * b[13]! +
      a[72]! * b[23]! +
      a[73]! * b[33]! +
      a[74]! * b[43]! +
      a[75]! * b[53]! +
      a[76]! * b[63]! +
      a[77]! * b[73]! +
      a[78]! * b[83]! +
      a[79]! * b[93]!
    target[74] =
      a[70]! * b[4]! +
      a[71]! * b[14]! +
      a[72]! * b[24]! +
      a[73]! * b[34]! +
      a[74]! * b[44]! +
      a[75]! * b[54]! +
      a[76]! * b[64]! +
      a[77]! * b[74]! +
      a[78]! * b[84]! +
      a[79]! * b[94]!
    target[75] =
      a[70]! * b[5]! +
      a[71]! * b[15]! +
      a[72]! * b[25]! +
      a[73]! * b[35]! +
      a[74]! * b[45]! +
      a[75]! * b[55]! +
      a[76]! * b[65]! +
      a[77]! * b[75]! +
      a[78]! * b[85]! +
      a[79]! * b[95]!
    target[76] =
      a[70]! * b[6]! +
      a[71]! * b[16]! +
      a[72]! * b[26]! +
      a[73]! * b[36]! +
      a[74]! * b[46]! +
      a[75]! * b[56]! +
      a[76]! * b[66]! +
      a[77]! * b[76]! +
      a[78]! * b[86]! +
      a[79]! * b[96]!
    target[77] =
      a[70]! * b[7]! +
      a[71]! * b[17]! +
      a[72]! * b[27]! +
      a[73]! * b[37]! +
      a[74]! * b[47]! +
      a[75]! * b[57]! +
      a[76]! * b[67]! +
      a[77]! * b[77]! +
      a[78]! * b[87]! +
      a[79]! * b[97]!
    target[78] =
      a[70]! * b[8]! +
      a[71]! * b[18]! +
      a[72]! * b[28]! +
      a[73]! * b[38]! +
      a[74]! * b[48]! +
      a[75]! * b[58]! +
      a[76]! * b[68]! +
      a[77]! * b[78]! +
      a[78]! * b[88]! +
      a[79]! * b[98]!
    target[79] =
      a[70]! * b[9]! +
      a[71]! * b[19]! +
      a[72]! * b[29]! +
      a[73]! * b[39]! +
      a[74]! * b[49]! +
      a[75]! * b[59]! +
      a[76]! * b[69]! +
      a[77]! * b[79]! +
      a[78]! * b[89]! +
      a[79]! * b[99]!
    target[80] =
      a[80]! * b[0]! +
      a[81]! * b[10]! +
      a[82]! * b[20]! +
      a[83]! * b[30]! +
      a[84]! * b[40]! +
      a[85]! * b[50]! +
      a[86]! * b[60]! +
      a[87]! * b[70]! +
      a[88]! * b[80]! +
      a[89]! * b[90]!
    target[81] =
      a[80]! * b[1]! +
      a[81]! * b[11]! +
      a[82]! * b[21]! +
      a[83]! * b[31]! +
      a[84]! * b[41]! +
      a[85]! * b[51]! +
      a[86]! * b[61]! +
      a[87]! * b[71]! +
      a[88]! * b[81]! +
      a[89]! * b[91]!
    target[82] =
      a[80]! * b[2]! +
      a[81]! * b[12]! +
      a[82]! * b[22]! +
      a[83]! * b[32]! +
      a[84]! * b[42]! +
      a[85]! * b[52]! +
      a[86]! * b[62]! +
      a[87]! * b[72]! +
      a[88]! * b[82]! +
      a[89]! * b[92]!
    target[83] =
      a[80]! * b[3]! +
      a[81]! * b[13]! +
      a[82]! * b[23]! +
      a[83]! * b[33]! +
      a[84]! * b[43]! +
      a[85]! * b[53]! +
      a[86]! * b[63]! +
      a[87]! * b[73]! +
      a[88]! * b[83]! +
      a[89]! * b[93]!
    target[84] =
      a[80]! * b[4]! +
      a[81]! * b[14]! +
      a[82]! * b[24]! +
      a[83]! * b[34]! +
      a[84]! * b[44]! +
      a[85]! * b[54]! +
      a[86]! * b[64]! +
      a[87]! * b[74]! +
      a[88]! * b[84]! +
      a[89]! * b[94]!
    target[85] =
      a[80]! * b[5]! +
      a[81]! * b[15]! +
      a[82]! * b[25]! +
      a[83]! * b[35]! +
      a[84]! * b[45]! +
      a[85]! * b[55]! +
      a[86]! * b[65]! +
      a[87]! * b[75]! +
      a[88]! * b[85]! +
      a[89]! * b[95]!
    target[86] =
      a[80]! * b[6]! +
      a[81]! * b[16]! +
      a[82]! * b[26]! +
      a[83]! * b[36]! +
      a[84]! * b[46]! +
      a[85]! * b[56]! +
      a[86]! * b[66]! +
      a[87]! * b[76]! +
      a[88]! * b[86]! +
      a[89]! * b[96]!
    target[87] =
      a[80]! * b[7]! +
      a[81]! * b[17]! +
      a[82]! * b[27]! +
      a[83]! * b[37]! +
      a[84]! * b[47]! +
      a[85]! * b[57]! +
      a[86]! * b[67]! +
      a[87]! * b[77]! +
      a[88]! * b[87]! +
      a[89]! * b[97]!
    target[88] =
      a[80]! * b[8]! +
      a[81]! * b[18]! +
      a[82]! * b[28]! +
      a[83]! * b[38]! +
      a[84]! * b[48]! +
      a[85]! * b[58]! +
      a[86]! * b[68]! +
      a[87]! * b[78]! +
      a[88]! * b[88]! +
      a[89]! * b[98]!
    target[89] =
      a[80]! * b[9]! +
      a[81]! * b[19]! +
      a[82]! * b[29]! +
      a[83]! * b[39]! +
      a[84]! * b[49]! +
      a[85]! * b[59]! +
      a[86]! * b[69]! +
      a[87]! * b[79]! +
      a[88]! * b[89]! +
      a[89]! * b[99]!
    target[90] =
      a[90]! * b[0]! +
      a[91]! * b[10]! +
      a[92]! * b[20]! +
      a[93]! * b[30]! +
      a[94]! * b[40]! +
      a[95]! * b[50]! +
      a[96]! * b[60]! +
      a[97]! * b[70]! +
      a[98]! * b[80]! +
      a[99]! * b[90]!
    target[91] =
      a[90]! * b[1]! +
      a[91]! * b[11]! +
      a[92]! * b[21]! +
      a[93]! * b[31]! +
      a[94]! * b[41]! +
      a[95]! * b[51]! +
      a[96]! * b[61]! +
      a[97]! * b[71]! +
      a[98]! * b[81]! +
      a[99]! * b[91]!
    target[92] =
      a[90]! * b[2]! +
      a[91]! * b[12]! +
      a[92]! * b[22]! +
      a[93]! * b[32]! +
      a[94]! * b[42]! +
      a[95]! * b[52]! +
      a[96]! * b[62]! +
      a[97]! * b[72]! +
      a[98]! * b[82]! +
      a[99]! * b[92]!
    target[93] =
      a[90]! * b[3]! +
      a[91]! * b[13]! +
      a[92]! * b[23]! +
      a[93]! * b[33]! +
      a[94]! * b[43]! +
      a[95]! * b[53]! +
      a[96]! * b[63]! +
      a[97]! * b[73]! +
      a[98]! * b[83]! +
      a[99]! * b[93]!
    target[94] =
      a[90]! * b[4]! +
      a[91]! * b[14]! +
      a[92]! * b[24]! +
      a[93]! * b[34]! +
      a[94]! * b[44]! +
      a[95]! * b[54]! +
      a[96]! * b[64]! +
      a[97]! * b[74]! +
      a[98]! * b[84]! +
      a[99]! * b[94]!
    target[95] =
      a[90]! * b[5]! +
      a[91]! * b[15]! +
      a[92]! * b[25]! +
      a[93]! * b[35]! +
      a[94]! * b[45]! +
      a[95]! * b[55]! +
      a[96]! * b[65]! +
      a[97]! * b[75]! +
      a[98]! * b[85]! +
      a[99]! * b[95]!
    target[96] =
      a[90]! * b[6]! +
      a[91]! * b[16]! +
      a[92]! * b[26]! +
      a[93]! * b[36]! +
      a[94]! * b[46]! +
      a[95]! * b[56]! +
      a[96]! * b[66]! +
      a[97]! * b[76]! +
      a[98]! * b[86]! +
      a[99]! * b[96]!
    target[97] =
      a[90]! * b[7]! +
      a[91]! * b[17]! +
      a[92]! * b[27]! +
      a[93]! * b[37]! +
      a[94]! * b[47]! +
      a[95]! * b[57]! +
      a[96]! * b[67]! +
      a[97]! * b[77]! +
      a[98]! * b[87]! +
      a[99]! * b[97]!
    target[98] =
      a[90]! * b[8]! +
      a[91]! * b[18]! +
      a[92]! * b[28]! +
      a[93]! * b[38]! +
      a[94]! * b[48]! +
      a[95]! * b[58]! +
      a[96]! * b[68]! +
      a[97]! * b[78]! +
      a[98]! * b[88]! +
      a[99]! * b[98]!
    target[99] =
      a[90]! * b[9]! +
      a[91]! * b[19]! +
      a[92]! * b[29]! +
      a[93]! * b[39]! +
      a[94]! * b[49]! +
      a[95]! * b[59]! +
      a[96]! * b[69]! +
      a[97]! * b[79]! +
      a[98]! * b[89]! +
      a[99]! * b[99]!
    if (isAliased) out.set(target)
    return
  }

  // OPT-MAT: Fully unrolled 11x11 matrix multiplication
  if (len === 121) {
    const isAliased = out === a || out === b
    const target = isAliased ? getAliasScratch(11) : out
    target[0] =
      a[0]! * b[0]! +
      a[1]! * b[11]! +
      a[2]! * b[22]! +
      a[3]! * b[33]! +
      a[4]! * b[44]! +
      a[5]! * b[55]! +
      a[6]! * b[66]! +
      a[7]! * b[77]! +
      a[8]! * b[88]! +
      a[9]! * b[99]! +
      a[10]! * b[110]!
    target[1] =
      a[0]! * b[1]! +
      a[1]! * b[12]! +
      a[2]! * b[23]! +
      a[3]! * b[34]! +
      a[4]! * b[45]! +
      a[5]! * b[56]! +
      a[6]! * b[67]! +
      a[7]! * b[78]! +
      a[8]! * b[89]! +
      a[9]! * b[100]! +
      a[10]! * b[111]!
    target[2] =
      a[0]! * b[2]! +
      a[1]! * b[13]! +
      a[2]! * b[24]! +
      a[3]! * b[35]! +
      a[4]! * b[46]! +
      a[5]! * b[57]! +
      a[6]! * b[68]! +
      a[7]! * b[79]! +
      a[8]! * b[90]! +
      a[9]! * b[101]! +
      a[10]! * b[112]!
    target[3] =
      a[0]! * b[3]! +
      a[1]! * b[14]! +
      a[2]! * b[25]! +
      a[3]! * b[36]! +
      a[4]! * b[47]! +
      a[5]! * b[58]! +
      a[6]! * b[69]! +
      a[7]! * b[80]! +
      a[8]! * b[91]! +
      a[9]! * b[102]! +
      a[10]! * b[113]!
    target[4] =
      a[0]! * b[4]! +
      a[1]! * b[15]! +
      a[2]! * b[26]! +
      a[3]! * b[37]! +
      a[4]! * b[48]! +
      a[5]! * b[59]! +
      a[6]! * b[70]! +
      a[7]! * b[81]! +
      a[8]! * b[92]! +
      a[9]! * b[103]! +
      a[10]! * b[114]!
    target[5] =
      a[0]! * b[5]! +
      a[1]! * b[16]! +
      a[2]! * b[27]! +
      a[3]! * b[38]! +
      a[4]! * b[49]! +
      a[5]! * b[60]! +
      a[6]! * b[71]! +
      a[7]! * b[82]! +
      a[8]! * b[93]! +
      a[9]! * b[104]! +
      a[10]! * b[115]!
    target[6] =
      a[0]! * b[6]! +
      a[1]! * b[17]! +
      a[2]! * b[28]! +
      a[3]! * b[39]! +
      a[4]! * b[50]! +
      a[5]! * b[61]! +
      a[6]! * b[72]! +
      a[7]! * b[83]! +
      a[8]! * b[94]! +
      a[9]! * b[105]! +
      a[10]! * b[116]!
    target[7] =
      a[0]! * b[7]! +
      a[1]! * b[18]! +
      a[2]! * b[29]! +
      a[3]! * b[40]! +
      a[4]! * b[51]! +
      a[5]! * b[62]! +
      a[6]! * b[73]! +
      a[7]! * b[84]! +
      a[8]! * b[95]! +
      a[9]! * b[106]! +
      a[10]! * b[117]!
    target[8] =
      a[0]! * b[8]! +
      a[1]! * b[19]! +
      a[2]! * b[30]! +
      a[3]! * b[41]! +
      a[4]! * b[52]! +
      a[5]! * b[63]! +
      a[6]! * b[74]! +
      a[7]! * b[85]! +
      a[8]! * b[96]! +
      a[9]! * b[107]! +
      a[10]! * b[118]!
    target[9] =
      a[0]! * b[9]! +
      a[1]! * b[20]! +
      a[2]! * b[31]! +
      a[3]! * b[42]! +
      a[4]! * b[53]! +
      a[5]! * b[64]! +
      a[6]! * b[75]! +
      a[7]! * b[86]! +
      a[8]! * b[97]! +
      a[9]! * b[108]! +
      a[10]! * b[119]!
    target[10] =
      a[0]! * b[10]! +
      a[1]! * b[21]! +
      a[2]! * b[32]! +
      a[3]! * b[43]! +
      a[4]! * b[54]! +
      a[5]! * b[65]! +
      a[6]! * b[76]! +
      a[7]! * b[87]! +
      a[8]! * b[98]! +
      a[9]! * b[109]! +
      a[10]! * b[120]!
    target[11] =
      a[11]! * b[0]! +
      a[12]! * b[11]! +
      a[13]! * b[22]! +
      a[14]! * b[33]! +
      a[15]! * b[44]! +
      a[16]! * b[55]! +
      a[17]! * b[66]! +
      a[18]! * b[77]! +
      a[19]! * b[88]! +
      a[20]! * b[99]! +
      a[21]! * b[110]!
    target[12] =
      a[11]! * b[1]! +
      a[12]! * b[12]! +
      a[13]! * b[23]! +
      a[14]! * b[34]! +
      a[15]! * b[45]! +
      a[16]! * b[56]! +
      a[17]! * b[67]! +
      a[18]! * b[78]! +
      a[19]! * b[89]! +
      a[20]! * b[100]! +
      a[21]! * b[111]!
    target[13] =
      a[11]! * b[2]! +
      a[12]! * b[13]! +
      a[13]! * b[24]! +
      a[14]! * b[35]! +
      a[15]! * b[46]! +
      a[16]! * b[57]! +
      a[17]! * b[68]! +
      a[18]! * b[79]! +
      a[19]! * b[90]! +
      a[20]! * b[101]! +
      a[21]! * b[112]!
    target[14] =
      a[11]! * b[3]! +
      a[12]! * b[14]! +
      a[13]! * b[25]! +
      a[14]! * b[36]! +
      a[15]! * b[47]! +
      a[16]! * b[58]! +
      a[17]! * b[69]! +
      a[18]! * b[80]! +
      a[19]! * b[91]! +
      a[20]! * b[102]! +
      a[21]! * b[113]!
    target[15] =
      a[11]! * b[4]! +
      a[12]! * b[15]! +
      a[13]! * b[26]! +
      a[14]! * b[37]! +
      a[15]! * b[48]! +
      a[16]! * b[59]! +
      a[17]! * b[70]! +
      a[18]! * b[81]! +
      a[19]! * b[92]! +
      a[20]! * b[103]! +
      a[21]! * b[114]!
    target[16] =
      a[11]! * b[5]! +
      a[12]! * b[16]! +
      a[13]! * b[27]! +
      a[14]! * b[38]! +
      a[15]! * b[49]! +
      a[16]! * b[60]! +
      a[17]! * b[71]! +
      a[18]! * b[82]! +
      a[19]! * b[93]! +
      a[20]! * b[104]! +
      a[21]! * b[115]!
    target[17] =
      a[11]! * b[6]! +
      a[12]! * b[17]! +
      a[13]! * b[28]! +
      a[14]! * b[39]! +
      a[15]! * b[50]! +
      a[16]! * b[61]! +
      a[17]! * b[72]! +
      a[18]! * b[83]! +
      a[19]! * b[94]! +
      a[20]! * b[105]! +
      a[21]! * b[116]!
    target[18] =
      a[11]! * b[7]! +
      a[12]! * b[18]! +
      a[13]! * b[29]! +
      a[14]! * b[40]! +
      a[15]! * b[51]! +
      a[16]! * b[62]! +
      a[17]! * b[73]! +
      a[18]! * b[84]! +
      a[19]! * b[95]! +
      a[20]! * b[106]! +
      a[21]! * b[117]!
    target[19] =
      a[11]! * b[8]! +
      a[12]! * b[19]! +
      a[13]! * b[30]! +
      a[14]! * b[41]! +
      a[15]! * b[52]! +
      a[16]! * b[63]! +
      a[17]! * b[74]! +
      a[18]! * b[85]! +
      a[19]! * b[96]! +
      a[20]! * b[107]! +
      a[21]! * b[118]!
    target[20] =
      a[11]! * b[9]! +
      a[12]! * b[20]! +
      a[13]! * b[31]! +
      a[14]! * b[42]! +
      a[15]! * b[53]! +
      a[16]! * b[64]! +
      a[17]! * b[75]! +
      a[18]! * b[86]! +
      a[19]! * b[97]! +
      a[20]! * b[108]! +
      a[21]! * b[119]!
    target[21] =
      a[11]! * b[10]! +
      a[12]! * b[21]! +
      a[13]! * b[32]! +
      a[14]! * b[43]! +
      a[15]! * b[54]! +
      a[16]! * b[65]! +
      a[17]! * b[76]! +
      a[18]! * b[87]! +
      a[19]! * b[98]! +
      a[20]! * b[109]! +
      a[21]! * b[120]!
    target[22] =
      a[22]! * b[0]! +
      a[23]! * b[11]! +
      a[24]! * b[22]! +
      a[25]! * b[33]! +
      a[26]! * b[44]! +
      a[27]! * b[55]! +
      a[28]! * b[66]! +
      a[29]! * b[77]! +
      a[30]! * b[88]! +
      a[31]! * b[99]! +
      a[32]! * b[110]!
    target[23] =
      a[22]! * b[1]! +
      a[23]! * b[12]! +
      a[24]! * b[23]! +
      a[25]! * b[34]! +
      a[26]! * b[45]! +
      a[27]! * b[56]! +
      a[28]! * b[67]! +
      a[29]! * b[78]! +
      a[30]! * b[89]! +
      a[31]! * b[100]! +
      a[32]! * b[111]!
    target[24] =
      a[22]! * b[2]! +
      a[23]! * b[13]! +
      a[24]! * b[24]! +
      a[25]! * b[35]! +
      a[26]! * b[46]! +
      a[27]! * b[57]! +
      a[28]! * b[68]! +
      a[29]! * b[79]! +
      a[30]! * b[90]! +
      a[31]! * b[101]! +
      a[32]! * b[112]!
    target[25] =
      a[22]! * b[3]! +
      a[23]! * b[14]! +
      a[24]! * b[25]! +
      a[25]! * b[36]! +
      a[26]! * b[47]! +
      a[27]! * b[58]! +
      a[28]! * b[69]! +
      a[29]! * b[80]! +
      a[30]! * b[91]! +
      a[31]! * b[102]! +
      a[32]! * b[113]!
    target[26] =
      a[22]! * b[4]! +
      a[23]! * b[15]! +
      a[24]! * b[26]! +
      a[25]! * b[37]! +
      a[26]! * b[48]! +
      a[27]! * b[59]! +
      a[28]! * b[70]! +
      a[29]! * b[81]! +
      a[30]! * b[92]! +
      a[31]! * b[103]! +
      a[32]! * b[114]!
    target[27] =
      a[22]! * b[5]! +
      a[23]! * b[16]! +
      a[24]! * b[27]! +
      a[25]! * b[38]! +
      a[26]! * b[49]! +
      a[27]! * b[60]! +
      a[28]! * b[71]! +
      a[29]! * b[82]! +
      a[30]! * b[93]! +
      a[31]! * b[104]! +
      a[32]! * b[115]!
    target[28] =
      a[22]! * b[6]! +
      a[23]! * b[17]! +
      a[24]! * b[28]! +
      a[25]! * b[39]! +
      a[26]! * b[50]! +
      a[27]! * b[61]! +
      a[28]! * b[72]! +
      a[29]! * b[83]! +
      a[30]! * b[94]! +
      a[31]! * b[105]! +
      a[32]! * b[116]!
    target[29] =
      a[22]! * b[7]! +
      a[23]! * b[18]! +
      a[24]! * b[29]! +
      a[25]! * b[40]! +
      a[26]! * b[51]! +
      a[27]! * b[62]! +
      a[28]! * b[73]! +
      a[29]! * b[84]! +
      a[30]! * b[95]! +
      a[31]! * b[106]! +
      a[32]! * b[117]!
    target[30] =
      a[22]! * b[8]! +
      a[23]! * b[19]! +
      a[24]! * b[30]! +
      a[25]! * b[41]! +
      a[26]! * b[52]! +
      a[27]! * b[63]! +
      a[28]! * b[74]! +
      a[29]! * b[85]! +
      a[30]! * b[96]! +
      a[31]! * b[107]! +
      a[32]! * b[118]!
    target[31] =
      a[22]! * b[9]! +
      a[23]! * b[20]! +
      a[24]! * b[31]! +
      a[25]! * b[42]! +
      a[26]! * b[53]! +
      a[27]! * b[64]! +
      a[28]! * b[75]! +
      a[29]! * b[86]! +
      a[30]! * b[97]! +
      a[31]! * b[108]! +
      a[32]! * b[119]!
    target[32] =
      a[22]! * b[10]! +
      a[23]! * b[21]! +
      a[24]! * b[32]! +
      a[25]! * b[43]! +
      a[26]! * b[54]! +
      a[27]! * b[65]! +
      a[28]! * b[76]! +
      a[29]! * b[87]! +
      a[30]! * b[98]! +
      a[31]! * b[109]! +
      a[32]! * b[120]!
    target[33] =
      a[33]! * b[0]! +
      a[34]! * b[11]! +
      a[35]! * b[22]! +
      a[36]! * b[33]! +
      a[37]! * b[44]! +
      a[38]! * b[55]! +
      a[39]! * b[66]! +
      a[40]! * b[77]! +
      a[41]! * b[88]! +
      a[42]! * b[99]! +
      a[43]! * b[110]!
    target[34] =
      a[33]! * b[1]! +
      a[34]! * b[12]! +
      a[35]! * b[23]! +
      a[36]! * b[34]! +
      a[37]! * b[45]! +
      a[38]! * b[56]! +
      a[39]! * b[67]! +
      a[40]! * b[78]! +
      a[41]! * b[89]! +
      a[42]! * b[100]! +
      a[43]! * b[111]!
    target[35] =
      a[33]! * b[2]! +
      a[34]! * b[13]! +
      a[35]! * b[24]! +
      a[36]! * b[35]! +
      a[37]! * b[46]! +
      a[38]! * b[57]! +
      a[39]! * b[68]! +
      a[40]! * b[79]! +
      a[41]! * b[90]! +
      a[42]! * b[101]! +
      a[43]! * b[112]!
    target[36] =
      a[33]! * b[3]! +
      a[34]! * b[14]! +
      a[35]! * b[25]! +
      a[36]! * b[36]! +
      a[37]! * b[47]! +
      a[38]! * b[58]! +
      a[39]! * b[69]! +
      a[40]! * b[80]! +
      a[41]! * b[91]! +
      a[42]! * b[102]! +
      a[43]! * b[113]!
    target[37] =
      a[33]! * b[4]! +
      a[34]! * b[15]! +
      a[35]! * b[26]! +
      a[36]! * b[37]! +
      a[37]! * b[48]! +
      a[38]! * b[59]! +
      a[39]! * b[70]! +
      a[40]! * b[81]! +
      a[41]! * b[92]! +
      a[42]! * b[103]! +
      a[43]! * b[114]!
    target[38] =
      a[33]! * b[5]! +
      a[34]! * b[16]! +
      a[35]! * b[27]! +
      a[36]! * b[38]! +
      a[37]! * b[49]! +
      a[38]! * b[60]! +
      a[39]! * b[71]! +
      a[40]! * b[82]! +
      a[41]! * b[93]! +
      a[42]! * b[104]! +
      a[43]! * b[115]!
    target[39] =
      a[33]! * b[6]! +
      a[34]! * b[17]! +
      a[35]! * b[28]! +
      a[36]! * b[39]! +
      a[37]! * b[50]! +
      a[38]! * b[61]! +
      a[39]! * b[72]! +
      a[40]! * b[83]! +
      a[41]! * b[94]! +
      a[42]! * b[105]! +
      a[43]! * b[116]!
    target[40] =
      a[33]! * b[7]! +
      a[34]! * b[18]! +
      a[35]! * b[29]! +
      a[36]! * b[40]! +
      a[37]! * b[51]! +
      a[38]! * b[62]! +
      a[39]! * b[73]! +
      a[40]! * b[84]! +
      a[41]! * b[95]! +
      a[42]! * b[106]! +
      a[43]! * b[117]!
    target[41] =
      a[33]! * b[8]! +
      a[34]! * b[19]! +
      a[35]! * b[30]! +
      a[36]! * b[41]! +
      a[37]! * b[52]! +
      a[38]! * b[63]! +
      a[39]! * b[74]! +
      a[40]! * b[85]! +
      a[41]! * b[96]! +
      a[42]! * b[107]! +
      a[43]! * b[118]!
    target[42] =
      a[33]! * b[9]! +
      a[34]! * b[20]! +
      a[35]! * b[31]! +
      a[36]! * b[42]! +
      a[37]! * b[53]! +
      a[38]! * b[64]! +
      a[39]! * b[75]! +
      a[40]! * b[86]! +
      a[41]! * b[97]! +
      a[42]! * b[108]! +
      a[43]! * b[119]!
    target[43] =
      a[33]! * b[10]! +
      a[34]! * b[21]! +
      a[35]! * b[32]! +
      a[36]! * b[43]! +
      a[37]! * b[54]! +
      a[38]! * b[65]! +
      a[39]! * b[76]! +
      a[40]! * b[87]! +
      a[41]! * b[98]! +
      a[42]! * b[109]! +
      a[43]! * b[120]!
    target[44] =
      a[44]! * b[0]! +
      a[45]! * b[11]! +
      a[46]! * b[22]! +
      a[47]! * b[33]! +
      a[48]! * b[44]! +
      a[49]! * b[55]! +
      a[50]! * b[66]! +
      a[51]! * b[77]! +
      a[52]! * b[88]! +
      a[53]! * b[99]! +
      a[54]! * b[110]!
    target[45] =
      a[44]! * b[1]! +
      a[45]! * b[12]! +
      a[46]! * b[23]! +
      a[47]! * b[34]! +
      a[48]! * b[45]! +
      a[49]! * b[56]! +
      a[50]! * b[67]! +
      a[51]! * b[78]! +
      a[52]! * b[89]! +
      a[53]! * b[100]! +
      a[54]! * b[111]!
    target[46] =
      a[44]! * b[2]! +
      a[45]! * b[13]! +
      a[46]! * b[24]! +
      a[47]! * b[35]! +
      a[48]! * b[46]! +
      a[49]! * b[57]! +
      a[50]! * b[68]! +
      a[51]! * b[79]! +
      a[52]! * b[90]! +
      a[53]! * b[101]! +
      a[54]! * b[112]!
    target[47] =
      a[44]! * b[3]! +
      a[45]! * b[14]! +
      a[46]! * b[25]! +
      a[47]! * b[36]! +
      a[48]! * b[47]! +
      a[49]! * b[58]! +
      a[50]! * b[69]! +
      a[51]! * b[80]! +
      a[52]! * b[91]! +
      a[53]! * b[102]! +
      a[54]! * b[113]!
    target[48] =
      a[44]! * b[4]! +
      a[45]! * b[15]! +
      a[46]! * b[26]! +
      a[47]! * b[37]! +
      a[48]! * b[48]! +
      a[49]! * b[59]! +
      a[50]! * b[70]! +
      a[51]! * b[81]! +
      a[52]! * b[92]! +
      a[53]! * b[103]! +
      a[54]! * b[114]!
    target[49] =
      a[44]! * b[5]! +
      a[45]! * b[16]! +
      a[46]! * b[27]! +
      a[47]! * b[38]! +
      a[48]! * b[49]! +
      a[49]! * b[60]! +
      a[50]! * b[71]! +
      a[51]! * b[82]! +
      a[52]! * b[93]! +
      a[53]! * b[104]! +
      a[54]! * b[115]!
    target[50] =
      a[44]! * b[6]! +
      a[45]! * b[17]! +
      a[46]! * b[28]! +
      a[47]! * b[39]! +
      a[48]! * b[50]! +
      a[49]! * b[61]! +
      a[50]! * b[72]! +
      a[51]! * b[83]! +
      a[52]! * b[94]! +
      a[53]! * b[105]! +
      a[54]! * b[116]!
    target[51] =
      a[44]! * b[7]! +
      a[45]! * b[18]! +
      a[46]! * b[29]! +
      a[47]! * b[40]! +
      a[48]! * b[51]! +
      a[49]! * b[62]! +
      a[50]! * b[73]! +
      a[51]! * b[84]! +
      a[52]! * b[95]! +
      a[53]! * b[106]! +
      a[54]! * b[117]!
    target[52] =
      a[44]! * b[8]! +
      a[45]! * b[19]! +
      a[46]! * b[30]! +
      a[47]! * b[41]! +
      a[48]! * b[52]! +
      a[49]! * b[63]! +
      a[50]! * b[74]! +
      a[51]! * b[85]! +
      a[52]! * b[96]! +
      a[53]! * b[107]! +
      a[54]! * b[118]!
    target[53] =
      a[44]! * b[9]! +
      a[45]! * b[20]! +
      a[46]! * b[31]! +
      a[47]! * b[42]! +
      a[48]! * b[53]! +
      a[49]! * b[64]! +
      a[50]! * b[75]! +
      a[51]! * b[86]! +
      a[52]! * b[97]! +
      a[53]! * b[108]! +
      a[54]! * b[119]!
    target[54] =
      a[44]! * b[10]! +
      a[45]! * b[21]! +
      a[46]! * b[32]! +
      a[47]! * b[43]! +
      a[48]! * b[54]! +
      a[49]! * b[65]! +
      a[50]! * b[76]! +
      a[51]! * b[87]! +
      a[52]! * b[98]! +
      a[53]! * b[109]! +
      a[54]! * b[120]!
    target[55] =
      a[55]! * b[0]! +
      a[56]! * b[11]! +
      a[57]! * b[22]! +
      a[58]! * b[33]! +
      a[59]! * b[44]! +
      a[60]! * b[55]! +
      a[61]! * b[66]! +
      a[62]! * b[77]! +
      a[63]! * b[88]! +
      a[64]! * b[99]! +
      a[65]! * b[110]!
    target[56] =
      a[55]! * b[1]! +
      a[56]! * b[12]! +
      a[57]! * b[23]! +
      a[58]! * b[34]! +
      a[59]! * b[45]! +
      a[60]! * b[56]! +
      a[61]! * b[67]! +
      a[62]! * b[78]! +
      a[63]! * b[89]! +
      a[64]! * b[100]! +
      a[65]! * b[111]!
    target[57] =
      a[55]! * b[2]! +
      a[56]! * b[13]! +
      a[57]! * b[24]! +
      a[58]! * b[35]! +
      a[59]! * b[46]! +
      a[60]! * b[57]! +
      a[61]! * b[68]! +
      a[62]! * b[79]! +
      a[63]! * b[90]! +
      a[64]! * b[101]! +
      a[65]! * b[112]!
    target[58] =
      a[55]! * b[3]! +
      a[56]! * b[14]! +
      a[57]! * b[25]! +
      a[58]! * b[36]! +
      a[59]! * b[47]! +
      a[60]! * b[58]! +
      a[61]! * b[69]! +
      a[62]! * b[80]! +
      a[63]! * b[91]! +
      a[64]! * b[102]! +
      a[65]! * b[113]!
    target[59] =
      a[55]! * b[4]! +
      a[56]! * b[15]! +
      a[57]! * b[26]! +
      a[58]! * b[37]! +
      a[59]! * b[48]! +
      a[60]! * b[59]! +
      a[61]! * b[70]! +
      a[62]! * b[81]! +
      a[63]! * b[92]! +
      a[64]! * b[103]! +
      a[65]! * b[114]!
    target[60] =
      a[55]! * b[5]! +
      a[56]! * b[16]! +
      a[57]! * b[27]! +
      a[58]! * b[38]! +
      a[59]! * b[49]! +
      a[60]! * b[60]! +
      a[61]! * b[71]! +
      a[62]! * b[82]! +
      a[63]! * b[93]! +
      a[64]! * b[104]! +
      a[65]! * b[115]!
    target[61] =
      a[55]! * b[6]! +
      a[56]! * b[17]! +
      a[57]! * b[28]! +
      a[58]! * b[39]! +
      a[59]! * b[50]! +
      a[60]! * b[61]! +
      a[61]! * b[72]! +
      a[62]! * b[83]! +
      a[63]! * b[94]! +
      a[64]! * b[105]! +
      a[65]! * b[116]!
    target[62] =
      a[55]! * b[7]! +
      a[56]! * b[18]! +
      a[57]! * b[29]! +
      a[58]! * b[40]! +
      a[59]! * b[51]! +
      a[60]! * b[62]! +
      a[61]! * b[73]! +
      a[62]! * b[84]! +
      a[63]! * b[95]! +
      a[64]! * b[106]! +
      a[65]! * b[117]!
    target[63] =
      a[55]! * b[8]! +
      a[56]! * b[19]! +
      a[57]! * b[30]! +
      a[58]! * b[41]! +
      a[59]! * b[52]! +
      a[60]! * b[63]! +
      a[61]! * b[74]! +
      a[62]! * b[85]! +
      a[63]! * b[96]! +
      a[64]! * b[107]! +
      a[65]! * b[118]!
    target[64] =
      a[55]! * b[9]! +
      a[56]! * b[20]! +
      a[57]! * b[31]! +
      a[58]! * b[42]! +
      a[59]! * b[53]! +
      a[60]! * b[64]! +
      a[61]! * b[75]! +
      a[62]! * b[86]! +
      a[63]! * b[97]! +
      a[64]! * b[108]! +
      a[65]! * b[119]!
    target[65] =
      a[55]! * b[10]! +
      a[56]! * b[21]! +
      a[57]! * b[32]! +
      a[58]! * b[43]! +
      a[59]! * b[54]! +
      a[60]! * b[65]! +
      a[61]! * b[76]! +
      a[62]! * b[87]! +
      a[63]! * b[98]! +
      a[64]! * b[109]! +
      a[65]! * b[120]!
    target[66] =
      a[66]! * b[0]! +
      a[67]! * b[11]! +
      a[68]! * b[22]! +
      a[69]! * b[33]! +
      a[70]! * b[44]! +
      a[71]! * b[55]! +
      a[72]! * b[66]! +
      a[73]! * b[77]! +
      a[74]! * b[88]! +
      a[75]! * b[99]! +
      a[76]! * b[110]!
    target[67] =
      a[66]! * b[1]! +
      a[67]! * b[12]! +
      a[68]! * b[23]! +
      a[69]! * b[34]! +
      a[70]! * b[45]! +
      a[71]! * b[56]! +
      a[72]! * b[67]! +
      a[73]! * b[78]! +
      a[74]! * b[89]! +
      a[75]! * b[100]! +
      a[76]! * b[111]!
    target[68] =
      a[66]! * b[2]! +
      a[67]! * b[13]! +
      a[68]! * b[24]! +
      a[69]! * b[35]! +
      a[70]! * b[46]! +
      a[71]! * b[57]! +
      a[72]! * b[68]! +
      a[73]! * b[79]! +
      a[74]! * b[90]! +
      a[75]! * b[101]! +
      a[76]! * b[112]!
    target[69] =
      a[66]! * b[3]! +
      a[67]! * b[14]! +
      a[68]! * b[25]! +
      a[69]! * b[36]! +
      a[70]! * b[47]! +
      a[71]! * b[58]! +
      a[72]! * b[69]! +
      a[73]! * b[80]! +
      a[74]! * b[91]! +
      a[75]! * b[102]! +
      a[76]! * b[113]!
    target[70] =
      a[66]! * b[4]! +
      a[67]! * b[15]! +
      a[68]! * b[26]! +
      a[69]! * b[37]! +
      a[70]! * b[48]! +
      a[71]! * b[59]! +
      a[72]! * b[70]! +
      a[73]! * b[81]! +
      a[74]! * b[92]! +
      a[75]! * b[103]! +
      a[76]! * b[114]!
    target[71] =
      a[66]! * b[5]! +
      a[67]! * b[16]! +
      a[68]! * b[27]! +
      a[69]! * b[38]! +
      a[70]! * b[49]! +
      a[71]! * b[60]! +
      a[72]! * b[71]! +
      a[73]! * b[82]! +
      a[74]! * b[93]! +
      a[75]! * b[104]! +
      a[76]! * b[115]!
    target[72] =
      a[66]! * b[6]! +
      a[67]! * b[17]! +
      a[68]! * b[28]! +
      a[69]! * b[39]! +
      a[70]! * b[50]! +
      a[71]! * b[61]! +
      a[72]! * b[72]! +
      a[73]! * b[83]! +
      a[74]! * b[94]! +
      a[75]! * b[105]! +
      a[76]! * b[116]!
    target[73] =
      a[66]! * b[7]! +
      a[67]! * b[18]! +
      a[68]! * b[29]! +
      a[69]! * b[40]! +
      a[70]! * b[51]! +
      a[71]! * b[62]! +
      a[72]! * b[73]! +
      a[73]! * b[84]! +
      a[74]! * b[95]! +
      a[75]! * b[106]! +
      a[76]! * b[117]!
    target[74] =
      a[66]! * b[8]! +
      a[67]! * b[19]! +
      a[68]! * b[30]! +
      a[69]! * b[41]! +
      a[70]! * b[52]! +
      a[71]! * b[63]! +
      a[72]! * b[74]! +
      a[73]! * b[85]! +
      a[74]! * b[96]! +
      a[75]! * b[107]! +
      a[76]! * b[118]!
    target[75] =
      a[66]! * b[9]! +
      a[67]! * b[20]! +
      a[68]! * b[31]! +
      a[69]! * b[42]! +
      a[70]! * b[53]! +
      a[71]! * b[64]! +
      a[72]! * b[75]! +
      a[73]! * b[86]! +
      a[74]! * b[97]! +
      a[75]! * b[108]! +
      a[76]! * b[119]!
    target[76] =
      a[66]! * b[10]! +
      a[67]! * b[21]! +
      a[68]! * b[32]! +
      a[69]! * b[43]! +
      a[70]! * b[54]! +
      a[71]! * b[65]! +
      a[72]! * b[76]! +
      a[73]! * b[87]! +
      a[74]! * b[98]! +
      a[75]! * b[109]! +
      a[76]! * b[120]!
    target[77] =
      a[77]! * b[0]! +
      a[78]! * b[11]! +
      a[79]! * b[22]! +
      a[80]! * b[33]! +
      a[81]! * b[44]! +
      a[82]! * b[55]! +
      a[83]! * b[66]! +
      a[84]! * b[77]! +
      a[85]! * b[88]! +
      a[86]! * b[99]! +
      a[87]! * b[110]!
    target[78] =
      a[77]! * b[1]! +
      a[78]! * b[12]! +
      a[79]! * b[23]! +
      a[80]! * b[34]! +
      a[81]! * b[45]! +
      a[82]! * b[56]! +
      a[83]! * b[67]! +
      a[84]! * b[78]! +
      a[85]! * b[89]! +
      a[86]! * b[100]! +
      a[87]! * b[111]!
    target[79] =
      a[77]! * b[2]! +
      a[78]! * b[13]! +
      a[79]! * b[24]! +
      a[80]! * b[35]! +
      a[81]! * b[46]! +
      a[82]! * b[57]! +
      a[83]! * b[68]! +
      a[84]! * b[79]! +
      a[85]! * b[90]! +
      a[86]! * b[101]! +
      a[87]! * b[112]!
    target[80] =
      a[77]! * b[3]! +
      a[78]! * b[14]! +
      a[79]! * b[25]! +
      a[80]! * b[36]! +
      a[81]! * b[47]! +
      a[82]! * b[58]! +
      a[83]! * b[69]! +
      a[84]! * b[80]! +
      a[85]! * b[91]! +
      a[86]! * b[102]! +
      a[87]! * b[113]!
    target[81] =
      a[77]! * b[4]! +
      a[78]! * b[15]! +
      a[79]! * b[26]! +
      a[80]! * b[37]! +
      a[81]! * b[48]! +
      a[82]! * b[59]! +
      a[83]! * b[70]! +
      a[84]! * b[81]! +
      a[85]! * b[92]! +
      a[86]! * b[103]! +
      a[87]! * b[114]!
    target[82] =
      a[77]! * b[5]! +
      a[78]! * b[16]! +
      a[79]! * b[27]! +
      a[80]! * b[38]! +
      a[81]! * b[49]! +
      a[82]! * b[60]! +
      a[83]! * b[71]! +
      a[84]! * b[82]! +
      a[85]! * b[93]! +
      a[86]! * b[104]! +
      a[87]! * b[115]!
    target[83] =
      a[77]! * b[6]! +
      a[78]! * b[17]! +
      a[79]! * b[28]! +
      a[80]! * b[39]! +
      a[81]! * b[50]! +
      a[82]! * b[61]! +
      a[83]! * b[72]! +
      a[84]! * b[83]! +
      a[85]! * b[94]! +
      a[86]! * b[105]! +
      a[87]! * b[116]!
    target[84] =
      a[77]! * b[7]! +
      a[78]! * b[18]! +
      a[79]! * b[29]! +
      a[80]! * b[40]! +
      a[81]! * b[51]! +
      a[82]! * b[62]! +
      a[83]! * b[73]! +
      a[84]! * b[84]! +
      a[85]! * b[95]! +
      a[86]! * b[106]! +
      a[87]! * b[117]!
    target[85] =
      a[77]! * b[8]! +
      a[78]! * b[19]! +
      a[79]! * b[30]! +
      a[80]! * b[41]! +
      a[81]! * b[52]! +
      a[82]! * b[63]! +
      a[83]! * b[74]! +
      a[84]! * b[85]! +
      a[85]! * b[96]! +
      a[86]! * b[107]! +
      a[87]! * b[118]!
    target[86] =
      a[77]! * b[9]! +
      a[78]! * b[20]! +
      a[79]! * b[31]! +
      a[80]! * b[42]! +
      a[81]! * b[53]! +
      a[82]! * b[64]! +
      a[83]! * b[75]! +
      a[84]! * b[86]! +
      a[85]! * b[97]! +
      a[86]! * b[108]! +
      a[87]! * b[119]!
    target[87] =
      a[77]! * b[10]! +
      a[78]! * b[21]! +
      a[79]! * b[32]! +
      a[80]! * b[43]! +
      a[81]! * b[54]! +
      a[82]! * b[65]! +
      a[83]! * b[76]! +
      a[84]! * b[87]! +
      a[85]! * b[98]! +
      a[86]! * b[109]! +
      a[87]! * b[120]!
    target[88] =
      a[88]! * b[0]! +
      a[89]! * b[11]! +
      a[90]! * b[22]! +
      a[91]! * b[33]! +
      a[92]! * b[44]! +
      a[93]! * b[55]! +
      a[94]! * b[66]! +
      a[95]! * b[77]! +
      a[96]! * b[88]! +
      a[97]! * b[99]! +
      a[98]! * b[110]!
    target[89] =
      a[88]! * b[1]! +
      a[89]! * b[12]! +
      a[90]! * b[23]! +
      a[91]! * b[34]! +
      a[92]! * b[45]! +
      a[93]! * b[56]! +
      a[94]! * b[67]! +
      a[95]! * b[78]! +
      a[96]! * b[89]! +
      a[97]! * b[100]! +
      a[98]! * b[111]!
    target[90] =
      a[88]! * b[2]! +
      a[89]! * b[13]! +
      a[90]! * b[24]! +
      a[91]! * b[35]! +
      a[92]! * b[46]! +
      a[93]! * b[57]! +
      a[94]! * b[68]! +
      a[95]! * b[79]! +
      a[96]! * b[90]! +
      a[97]! * b[101]! +
      a[98]! * b[112]!
    target[91] =
      a[88]! * b[3]! +
      a[89]! * b[14]! +
      a[90]! * b[25]! +
      a[91]! * b[36]! +
      a[92]! * b[47]! +
      a[93]! * b[58]! +
      a[94]! * b[69]! +
      a[95]! * b[80]! +
      a[96]! * b[91]! +
      a[97]! * b[102]! +
      a[98]! * b[113]!
    target[92] =
      a[88]! * b[4]! +
      a[89]! * b[15]! +
      a[90]! * b[26]! +
      a[91]! * b[37]! +
      a[92]! * b[48]! +
      a[93]! * b[59]! +
      a[94]! * b[70]! +
      a[95]! * b[81]! +
      a[96]! * b[92]! +
      a[97]! * b[103]! +
      a[98]! * b[114]!
    target[93] =
      a[88]! * b[5]! +
      a[89]! * b[16]! +
      a[90]! * b[27]! +
      a[91]! * b[38]! +
      a[92]! * b[49]! +
      a[93]! * b[60]! +
      a[94]! * b[71]! +
      a[95]! * b[82]! +
      a[96]! * b[93]! +
      a[97]! * b[104]! +
      a[98]! * b[115]!
    target[94] =
      a[88]! * b[6]! +
      a[89]! * b[17]! +
      a[90]! * b[28]! +
      a[91]! * b[39]! +
      a[92]! * b[50]! +
      a[93]! * b[61]! +
      a[94]! * b[72]! +
      a[95]! * b[83]! +
      a[96]! * b[94]! +
      a[97]! * b[105]! +
      a[98]! * b[116]!
    target[95] =
      a[88]! * b[7]! +
      a[89]! * b[18]! +
      a[90]! * b[29]! +
      a[91]! * b[40]! +
      a[92]! * b[51]! +
      a[93]! * b[62]! +
      a[94]! * b[73]! +
      a[95]! * b[84]! +
      a[96]! * b[95]! +
      a[97]! * b[106]! +
      a[98]! * b[117]!
    target[96] =
      a[88]! * b[8]! +
      a[89]! * b[19]! +
      a[90]! * b[30]! +
      a[91]! * b[41]! +
      a[92]! * b[52]! +
      a[93]! * b[63]! +
      a[94]! * b[74]! +
      a[95]! * b[85]! +
      a[96]! * b[96]! +
      a[97]! * b[107]! +
      a[98]! * b[118]!
    target[97] =
      a[88]! * b[9]! +
      a[89]! * b[20]! +
      a[90]! * b[31]! +
      a[91]! * b[42]! +
      a[92]! * b[53]! +
      a[93]! * b[64]! +
      a[94]! * b[75]! +
      a[95]! * b[86]! +
      a[96]! * b[97]! +
      a[97]! * b[108]! +
      a[98]! * b[119]!
    target[98] =
      a[88]! * b[10]! +
      a[89]! * b[21]! +
      a[90]! * b[32]! +
      a[91]! * b[43]! +
      a[92]! * b[54]! +
      a[93]! * b[65]! +
      a[94]! * b[76]! +
      a[95]! * b[87]! +
      a[96]! * b[98]! +
      a[97]! * b[109]! +
      a[98]! * b[120]!
    target[99] =
      a[99]! * b[0]! +
      a[100]! * b[11]! +
      a[101]! * b[22]! +
      a[102]! * b[33]! +
      a[103]! * b[44]! +
      a[104]! * b[55]! +
      a[105]! * b[66]! +
      a[106]! * b[77]! +
      a[107]! * b[88]! +
      a[108]! * b[99]! +
      a[109]! * b[110]!
    target[100] =
      a[99]! * b[1]! +
      a[100]! * b[12]! +
      a[101]! * b[23]! +
      a[102]! * b[34]! +
      a[103]! * b[45]! +
      a[104]! * b[56]! +
      a[105]! * b[67]! +
      a[106]! * b[78]! +
      a[107]! * b[89]! +
      a[108]! * b[100]! +
      a[109]! * b[111]!
    target[101] =
      a[99]! * b[2]! +
      a[100]! * b[13]! +
      a[101]! * b[24]! +
      a[102]! * b[35]! +
      a[103]! * b[46]! +
      a[104]! * b[57]! +
      a[105]! * b[68]! +
      a[106]! * b[79]! +
      a[107]! * b[90]! +
      a[108]! * b[101]! +
      a[109]! * b[112]!
    target[102] =
      a[99]! * b[3]! +
      a[100]! * b[14]! +
      a[101]! * b[25]! +
      a[102]! * b[36]! +
      a[103]! * b[47]! +
      a[104]! * b[58]! +
      a[105]! * b[69]! +
      a[106]! * b[80]! +
      a[107]! * b[91]! +
      a[108]! * b[102]! +
      a[109]! * b[113]!
    target[103] =
      a[99]! * b[4]! +
      a[100]! * b[15]! +
      a[101]! * b[26]! +
      a[102]! * b[37]! +
      a[103]! * b[48]! +
      a[104]! * b[59]! +
      a[105]! * b[70]! +
      a[106]! * b[81]! +
      a[107]! * b[92]! +
      a[108]! * b[103]! +
      a[109]! * b[114]!
    target[104] =
      a[99]! * b[5]! +
      a[100]! * b[16]! +
      a[101]! * b[27]! +
      a[102]! * b[38]! +
      a[103]! * b[49]! +
      a[104]! * b[60]! +
      a[105]! * b[71]! +
      a[106]! * b[82]! +
      a[107]! * b[93]! +
      a[108]! * b[104]! +
      a[109]! * b[115]!
    target[105] =
      a[99]! * b[6]! +
      a[100]! * b[17]! +
      a[101]! * b[28]! +
      a[102]! * b[39]! +
      a[103]! * b[50]! +
      a[104]! * b[61]! +
      a[105]! * b[72]! +
      a[106]! * b[83]! +
      a[107]! * b[94]! +
      a[108]! * b[105]! +
      a[109]! * b[116]!
    target[106] =
      a[99]! * b[7]! +
      a[100]! * b[18]! +
      a[101]! * b[29]! +
      a[102]! * b[40]! +
      a[103]! * b[51]! +
      a[104]! * b[62]! +
      a[105]! * b[73]! +
      a[106]! * b[84]! +
      a[107]! * b[95]! +
      a[108]! * b[106]! +
      a[109]! * b[117]!
    target[107] =
      a[99]! * b[8]! +
      a[100]! * b[19]! +
      a[101]! * b[30]! +
      a[102]! * b[41]! +
      a[103]! * b[52]! +
      a[104]! * b[63]! +
      a[105]! * b[74]! +
      a[106]! * b[85]! +
      a[107]! * b[96]! +
      a[108]! * b[107]! +
      a[109]! * b[118]!
    target[108] =
      a[99]! * b[9]! +
      a[100]! * b[20]! +
      a[101]! * b[31]! +
      a[102]! * b[42]! +
      a[103]! * b[53]! +
      a[104]! * b[64]! +
      a[105]! * b[75]! +
      a[106]! * b[86]! +
      a[107]! * b[97]! +
      a[108]! * b[108]! +
      a[109]! * b[119]!
    target[109] =
      a[99]! * b[10]! +
      a[100]! * b[21]! +
      a[101]! * b[32]! +
      a[102]! * b[43]! +
      a[103]! * b[54]! +
      a[104]! * b[65]! +
      a[105]! * b[76]! +
      a[106]! * b[87]! +
      a[107]! * b[98]! +
      a[108]! * b[109]! +
      a[109]! * b[120]!
    target[110] =
      a[110]! * b[0]! +
      a[111]! * b[11]! +
      a[112]! * b[22]! +
      a[113]! * b[33]! +
      a[114]! * b[44]! +
      a[115]! * b[55]! +
      a[116]! * b[66]! +
      a[117]! * b[77]! +
      a[118]! * b[88]! +
      a[119]! * b[99]! +
      a[120]! * b[110]!
    target[111] =
      a[110]! * b[1]! +
      a[111]! * b[12]! +
      a[112]! * b[23]! +
      a[113]! * b[34]! +
      a[114]! * b[45]! +
      a[115]! * b[56]! +
      a[116]! * b[67]! +
      a[117]! * b[78]! +
      a[118]! * b[89]! +
      a[119]! * b[100]! +
      a[120]! * b[111]!
    target[112] =
      a[110]! * b[2]! +
      a[111]! * b[13]! +
      a[112]! * b[24]! +
      a[113]! * b[35]! +
      a[114]! * b[46]! +
      a[115]! * b[57]! +
      a[116]! * b[68]! +
      a[117]! * b[79]! +
      a[118]! * b[90]! +
      a[119]! * b[101]! +
      a[120]! * b[112]!
    target[113] =
      a[110]! * b[3]! +
      a[111]! * b[14]! +
      a[112]! * b[25]! +
      a[113]! * b[36]! +
      a[114]! * b[47]! +
      a[115]! * b[58]! +
      a[116]! * b[69]! +
      a[117]! * b[80]! +
      a[118]! * b[91]! +
      a[119]! * b[102]! +
      a[120]! * b[113]!
    target[114] =
      a[110]! * b[4]! +
      a[111]! * b[15]! +
      a[112]! * b[26]! +
      a[113]! * b[37]! +
      a[114]! * b[48]! +
      a[115]! * b[59]! +
      a[116]! * b[70]! +
      a[117]! * b[81]! +
      a[118]! * b[92]! +
      a[119]! * b[103]! +
      a[120]! * b[114]!
    target[115] =
      a[110]! * b[5]! +
      a[111]! * b[16]! +
      a[112]! * b[27]! +
      a[113]! * b[38]! +
      a[114]! * b[49]! +
      a[115]! * b[60]! +
      a[116]! * b[71]! +
      a[117]! * b[82]! +
      a[118]! * b[93]! +
      a[119]! * b[104]! +
      a[120]! * b[115]!
    target[116] =
      a[110]! * b[6]! +
      a[111]! * b[17]! +
      a[112]! * b[28]! +
      a[113]! * b[39]! +
      a[114]! * b[50]! +
      a[115]! * b[61]! +
      a[116]! * b[72]! +
      a[117]! * b[83]! +
      a[118]! * b[94]! +
      a[119]! * b[105]! +
      a[120]! * b[116]!
    target[117] =
      a[110]! * b[7]! +
      a[111]! * b[18]! +
      a[112]! * b[29]! +
      a[113]! * b[40]! +
      a[114]! * b[51]! +
      a[115]! * b[62]! +
      a[116]! * b[73]! +
      a[117]! * b[84]! +
      a[118]! * b[95]! +
      a[119]! * b[106]! +
      a[120]! * b[117]!
    target[118] =
      a[110]! * b[8]! +
      a[111]! * b[19]! +
      a[112]! * b[30]! +
      a[113]! * b[41]! +
      a[114]! * b[52]! +
      a[115]! * b[63]! +
      a[116]! * b[74]! +
      a[117]! * b[85]! +
      a[118]! * b[96]! +
      a[119]! * b[107]! +
      a[120]! * b[118]!
    target[119] =
      a[110]! * b[9]! +
      a[111]! * b[20]! +
      a[112]! * b[31]! +
      a[113]! * b[42]! +
      a[114]! * b[53]! +
      a[115]! * b[64]! +
      a[116]! * b[75]! +
      a[117]! * b[86]! +
      a[118]! * b[97]! +
      a[119]! * b[108]! +
      a[120]! * b[119]!
    target[120] =
      a[110]! * b[10]! +
      a[111]! * b[21]! +
      a[112]! * b[32]! +
      a[113]! * b[43]! +
      a[114]! * b[54]! +
      a[115]! * b[65]! +
      a[116]! * b[76]! +
      a[117]! * b[87]! +
      a[118]! * b[98]! +
      a[119]! * b[109]! +
      a[120]! * b[120]!
    if (isAliased) out.set(target)
    return
  }

  const dim = squareDimensionFromLength(len)

  // Handle aliasing: if out is the same reference as a or b, we need a temp buffer
  const isAliased = out === a || out === b
  const target = isAliased ? getAliasScratch(dim) : out

  // Generic path for other dimensions
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

  // Copy from scratch to out if we used aliasing protection
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
