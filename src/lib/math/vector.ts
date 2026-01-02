/**
 * N-dimensional vector operations
 * All operations are pure functions with no side effects
 *
 * Uses WASM acceleration when available for improved performance.
 */

import type { VectorND } from './types'
import { EPSILON } from './types'
import {
  isAnimationWasmReady,
  dotProductWasm,
  magnitudeWasm,
  normalizeVectorWasm,
  subtractVectorsWasm,
  float64ToVector,
} from '@/lib/wasm'

// ============================================================================
// Scratch Buffer Pools for WASM Operations
// ============================================================================
// Dual pools (A/B) prevent data corruption when two same-sized buffers are
// needed simultaneously (e.g., dotProduct needs both a and b vectors).

const scratchVectorA = new Map<number, Float64Array>()
const scratchVectorB = new Map<number, Float64Array>()

/**
 * Get or create a scratch buffer from the specified pool.
 * @param pool - The pool to get from (A or B)
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
 * Creates an n-dimensional vector initialized with a fill value
 * @param dimension - The dimensionality of the vector
 * @param fill - Optional fill value (defaults to 0)
 * @returns A new vector filled with the specified value
 * @throws {Error} If dimension is not a positive integer
 */
export function createVector(dimension: number, fill = 0): VectorND {
  if (dimension <= 0 || !Number.isInteger(dimension)) {
    throw new Error('Dimension must be a positive integer')
  }
  return new Array(dimension).fill(fill)
}

/**
 * Adds two vectors element-wise
 * Formula: c[i] = a[i] + b[i]
 * @param a - First vector
 * @param b - Second vector
 * @param out
 * @returns New vector containing the sum
 * @throws {Error} If vectors have different dimensions (DEV only)
 * @note Validation is DEV-only for performance in production hot paths
 */
export function addVectors(a: VectorND, b: VectorND, out?: VectorND): VectorND {
  if (import.meta.env.DEV && a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} !== ${b.length}`)
  }

  const result = out ?? new Array(a.length)
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i]! + b[i]!
  }
  return result
}

/**
 * Subtracts vector b from vector a element-wise
 * Formula: c[i] = a[i] - b[i]
 *
 * Uses WASM acceleration when available for improved performance.
 *
 * @param a - First vector
 * @param b - Second vector (subtracted from first)
 * @param out - Optional output vector to avoid allocation
 * @returns Vector containing the difference
 * @throws {Error} If vectors have different dimensions (DEV only)
 * @note Validation is DEV-only for performance in production hot paths
 */
export function subtractVectors(a: VectorND, b: VectorND, out?: VectorND): VectorND {
  if (import.meta.env.DEV && a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} !== ${b.length}`)
  }

  // Try WASM path if available (only when no out buffer, as WASM allocates)
  if (isAnimationWasmReady() && !out) {
    const aF64 = getScratch(scratchVectorA, a.length)
    const bF64 = getScratch(scratchVectorB, b.length)
    for (let i = 0; i < a.length; i++) aF64[i] = a[i]!
    for (let i = 0; i < b.length; i++) bF64[i] = b[i]!
    const wasmResult = subtractVectorsWasm(aF64, bF64)
    if (wasmResult) {
      return float64ToVector(wasmResult)
    }
    // WASM failed, fall through to JS implementation
  }

  // JS fallback
  const result = out ?? new Array(a.length)
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i]! - b[i]!
  }
  return result
}

/**
 * Multiplies a vector by a scalar value
 * Formula: b[i] = a[i] * scalar
 * @param v - Input vector
 * @param scalar - Scalar multiplier
 * @param out - Optional output vector to avoid allocation
 * @returns Vector scaled by the scalar
 */
export function scaleVector(v: VectorND, scalar: number, out?: VectorND): VectorND {
  const result = out ?? new Array(v.length)
  for (let i = 0; i < v.length; i++) {
    result[i] = v[i]! * scalar
  }
  return result
}

/**
 * Computes the dot product of two vectors
 * Formula: a · b = Σ(a[i] * b[i])
 *
 * Uses WASM acceleration when available for improved performance.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns The scalar dot product
 * @throws {Error} If vectors have different dimensions (DEV only)
 * @note Validation is DEV-only for performance in production hot paths
 */
export function dotProduct(a: VectorND, b: VectorND): number {
  if (import.meta.env.DEV && a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} !== ${b.length}`)
  }

  // Try WASM path if available
  if (isAnimationWasmReady()) {
    const aF64 = getScratch(scratchVectorA, a.length)
    const bF64 = getScratch(scratchVectorB, b.length)
    for (let i = 0; i < a.length; i++) aF64[i] = a[i]!
    for (let i = 0; i < b.length; i++) bF64[i] = b[i]!
    const wasmResult = dotProductWasm(aF64, bF64)
    if (wasmResult !== null) {
      return wasmResult
    }
    // WASM failed, fall through to JS implementation
  }

  // JS fallback
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += a[i]! * b[i]!
  }
  return sum
}

/**
 * Computes the magnitude (length) of a vector
 * Formula: ||v|| = √(Σ(v[i]²))
 *
 * Uses WASM acceleration when available for improved performance.
 *
 * @param v - Input vector
 * @returns The magnitude of the vector
 */
export function magnitude(v: VectorND): number {
  // Try WASM path if available
  if (isAnimationWasmReady()) {
    const vF64 = getScratch(scratchVectorA, v.length)
    for (let i = 0; i < v.length; i++) vF64[i] = v[i]!
    const wasmResult = magnitudeWasm(vF64)
    if (wasmResult !== null) {
      return wasmResult
    }
    // WASM failed, fall through to JS implementation
  }

  // JS fallback
  let sumSquares = 0
  for (let i = 0; i < v.length; i++) {
    sumSquares += v[i]! * v[i]!
  }
  return Math.sqrt(sumSquares)
}

/**
 * Normalizes a vector to unit length
 * Formula: v̂ = v / ||v||
 *
 * Uses WASM acceleration when available for improved performance.
 *
 * @param v - Input vector
 * @param out - Optional output vector to avoid allocation
 * @returns Unit vector in the same direction
 * @throws {Error} If the vector has zero magnitude
 */
export function normalize(v: VectorND, out?: VectorND): VectorND {
  // Try WASM path if available (only when no out buffer, as WASM allocates)
  if (isAnimationWasmReady() && !out) {
    const vF64 = getScratch(scratchVectorA, v.length)
    for (let i = 0; i < v.length; i++) vF64[i] = v[i]!
    const wasmResult = normalizeVectorWasm(vF64)
    if (wasmResult) {
      return float64ToVector(wasmResult)
    }
    // WASM failed, fall through to JS implementation
  }

  // JS fallback
  const mag = magnitude(v)

  if (mag < EPSILON) {
    throw new Error('Cannot normalize zero vector')
  }

  return scaleVector(v, 1 / mag, out)
}

/**
 * Checks if two vectors are approximately equal within epsilon
 * @param a - First vector
 * @param b - Second vector
 * @param epsilon - Tolerance for floating point comparison
 * @returns True if vectors are approximately equal
 */
export function vectorsEqual(a: VectorND, b: VectorND, epsilon = EPSILON): boolean {
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
 * Creates a copy of a vector
 * @param v - Input vector
 * @param out - Optional output vector to avoid allocation
 * @returns Vector with the same values
 */
export function copyVector(v: VectorND, out?: VectorND): VectorND {
  const result = out ?? new Array(v.length)
  for (let i = 0; i < v.length; i++) {
    result[i] = v[i]!
  }
  return result
}

/**
 * Computes the cross product of two 3D vectors
 * Formula: a × b = (a_y*b_z - a_z*b_y, a_z*b_x - a_x*b_z, a_x*b_y - a_y*b_x)
 * @param a - First 3D vector
 * @param b - Second 3D vector
 * @param out - Optional output vector to avoid allocation
 * @returns The cross product vector (perpendicular to both inputs)
 * @throws {Error} If vectors don't have exactly 3 components (DEV only)
 * @note Only defined for 3D vectors
 */
export function crossProduct3D(a: VectorND, b: VectorND, out?: VectorND): VectorND {
  if (import.meta.env.DEV && (a.length !== 3 || b.length !== 3)) {
    throw new Error(`Cross product requires 3D vectors: got ${a.length}D and ${b.length}D`)
  }

  const result = out ?? new Array(3)
  result[0] = a[1]! * b[2]! - a[2]! * b[1]!
  result[1] = a[2]! * b[0]! - a[0]! * b[2]!
  result[2] = a[0]! * b[1]! - a[1]! * b[0]!
  return result
}
