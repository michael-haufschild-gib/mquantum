/**
 * WASM Animation Service
 *
 * Provides high-performance WASM functions for the animation loop.
 * Initializes asynchronously and falls back to JS implementations
 * if WASM is not yet ready.
 *
 * Functions:
 * - composeRotationsIndexedWasm: Compose rotation matrices from precomputed axis index pairs
 * - multiplyMatrixVectorWasm: Matrix-vector multiplication
 * - multiplyMatricesWasm: Matrix-matrix multiplication
 * - dotProductWasm: Vector dot product
 * - magnitudeWasm: Vector magnitude
 * - normalizeVectorWasm: Normalize vector to unit length
 * - subtractVectorsWasm: Vector subtraction
 */

import { logger } from '@/lib/logger'
import type { VectorND } from '@/lib/math/types'

// WASM module types
interface WasmModule {
  // Phase 1: Animation operations
  compose_rotations_indexed_wasm?: (
    dimension: number,
    plane_indices: Uint32Array,
    angles: Float64Array,
    rotation_count: number
  ) => Float64Array
  multiply_matrix_vector_wasm: (
    matrix: Float64Array,
    vector: Float64Array,
    dimension: number
  ) => Float64Array
  // Phase 2: Matrix and vector operations
  multiply_matrices_wasm: (a: Float64Array, b: Float64Array, dimension: number) => Float64Array
  dot_product_wasm: (a: Float64Array, b: Float64Array) => number
  magnitude_wasm: (v: Float64Array) => number
  normalize_vector_wasm: (v: Float64Array) => Float64Array
  subtract_vectors_wasm: (a: Float64Array, b: Float64Array) => Float64Array
  // Phase 4: FFT operations
  fft_1d_wasm: (data: Float64Array, n: number) => Float64Array
  ifft_1d_wasm: (data: Float64Array, n: number) => Float64Array
  fft_nd_wasm: (data: Float64Array, grid_size: Uint32Array) => Float64Array
  ifft_nd_wasm: (data: Float64Array, grid_size: Uint32Array) => Float64Array
  // Phase 5: Coordinate entanglement operations
  compute_rdm_wasm?: (
    psi_re: Float32Array,
    psi_im: Float32Array,
    grid_size: Uint32Array,
    dim_index: number
  ) => Float64Array
  compute_joint_rdm_wasm?: (
    psi_re: Float32Array,
    psi_im: Float32Array,
    grid_size: Uint32Array,
    kept_dims: Uint32Array
  ) => Float64Array
  hermitian_eigenvalues_wasm?: (re: Float64Array, im: Float64Array, n: number) => Float64Array
  von_neumann_entropy_wasm?: (eigenvalues: Float64Array) => number
  // Phase 6: Complex matrix exponential operations
  matrix_exponential_pade_wasm?: (a_re: Float64Array, a_im: Float64Array, n: number) => Float64Array
  complex_mat_mul_wasm?: (
    a_re: Float64Array,
    a_im: Float64Array,
    b_re: Float64Array,
    b_im: Float64Array,
    n: number
  ) => Float64Array
  // Phase 7: TDSE diagnostics operations
  compute_scar_correlation_wasm?: (
    density_re: Float32Array,
    density_im: Float32Array,
    grid_sizes: Uint32Array,
    spacings: Float64Array,
    orbit_points_flat: Float64Array,
    orbit_lengths: Uint32Array,
    sigma: number,
    dim: number
  ) => Float64Array
  compute_level_spacing_wasm?: (energies: Float64Array) => Float64Array
}

// ============================================================================
// WASM Service State
// ============================================================================

let wasmModule: WasmModule | null = null
let wasmInitPromise: Promise<void> | null = null
let wasmReady = false

/**
 * Initialize the WASM module for animation operations.
 * Call this once at app startup to enable WASM acceleration.
 * Safe to call multiple times - subsequent calls are no-ops.
 *
 * @returns Promise that resolves when WASM is ready
 */
export async function initAnimationWasm(): Promise<void> {
  // Already initialized
  if (wasmReady) {
    return
  }

  // Already initializing
  if (wasmInitPromise) {
    return wasmInitPromise
  }

  wasmInitPromise = (async () => {
    // Skip WASM loading in test environments. Web workers lack `window`
    // but should still load WASM — use `globalThis` as the universal check.
    if (import.meta.env.MODE === 'test' || typeof globalThis === 'undefined') {
      return
    }

    try {
      // Dynamic import - the module path must be a literal for Vite's analysis
      const wasm = await import('@/wasm/mdimension_core/pkg/mdimension_core.js')

      await wasm.default()

      // Store the module for synchronous access
      wasmModule = wasm as unknown as WasmModule
      wasmReady = true

      logger.log('[AnimationWASM] Initialized successfully')
    } catch (err) {
      const wasmError = err instanceof Error ? err : new Error(String(err))
      logger.warn('[AnimationWASM] Initialization failed, using JS fallback:', wasmError.message)
    }
  })()

  return wasmInitPromise
}

/**
 * Check if WASM is ready for use.
 * @returns true if WASM is initialized and ready
 */
export function isAnimationWasmReady(): boolean {
  return wasmReady
}

// ============================================================================
// WASM-Accelerated Functions
// ============================================================================

/**
 * Compose multiple rotations using index pairs and preallocated typed arrays.
 * Falls back to null if the indexed ABI is unavailable.
 *
 * @param dimension - The dimensionality of the space (must be >= 2)
 * @param planeIndices - Flattened plane index pairs [i0, j0, i1, j1, ...]
 * @param angles - Rotation angles in radians (pooled buffer)
 * @param rotationCount - Number of active rotations inside the provided buffers
 * @returns Flat rotation matrix as Float64Array, or null if WASM not ready/invalid/unavailable
 */
export function composeRotationsIndexedWasm(
  dimension: number,
  planeIndices: Uint32Array,
  angles: Float64Array,
  rotationCount: number
): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  if (!Number.isInteger(dimension) || dimension < 2) {
    return null
  }
  if (!Number.isInteger(rotationCount) || rotationCount < 0) {
    return null
  }
  if (planeIndices.length < rotationCount * 2 || angles.length < rotationCount) {
    return null
  }

  const indexedFn = wasmModule.compose_rotations_indexed_wasm
  if (typeof indexedFn !== 'function') {
    return null
  }

  try {
    return indexedFn(dimension, planeIndices, angles, rotationCount)
  } catch (err) {
    logger.warn('[AnimationWASM] compose_rotations_indexed_wasm failed:', err)
    return null
  }
}

/**
 * Multiply matrix by vector using WASM if available.
 *
 * @param matrix - Flat n×n matrix (row-major) as Float64Array
 * @param vector - Input vector as Float64Array
 * @param dimension - Matrix/vector dimension (must be > 0)
 * @returns Result vector as Float64Array, or null if WASM not ready or invalid input
 */
export function multiplyMatrixVectorWasm(
  matrix: Float64Array,
  vector: Float64Array,
  dimension: number
): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  if (!Number.isInteger(dimension) || dimension < 1) {
    return null
  }
  if (matrix.length < dimension * dimension) {
    return null
  }
  if (vector.length < dimension) {
    return null
  }

  try {
    return wasmModule.multiply_matrix_vector_wasm(matrix, vector, dimension)
  } catch (err) {
    logger.warn('[AnimationWASM] multiply_matrix_vector_wasm failed:', err)
    return null
  }
}

// ============================================================================
// Phase 2: Matrix and Vector WASM Functions
// ============================================================================

/**
 * Multiply two matrices using WASM if available.
 *
 * @param a - First matrix (n×n, row-major) as Float64Array
 * @param b - Second matrix (n×n, row-major) as Float64Array
 * @param dimension - Matrix dimension (must be > 0)
 * @returns Result matrix as Float64Array, or null if WASM not ready or invalid input
 */
export function multiplyMatricesWasm(
  a: Float64Array,
  b: Float64Array,
  dimension: number
): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  if (!Number.isInteger(dimension) || dimension < 1) {
    return null
  }
  const expectedSize = dimension * dimension
  if (a.length < expectedSize || b.length < expectedSize) {
    return null
  }

  try {
    return wasmModule.multiply_matrices_wasm(a, b, dimension)
  } catch (err) {
    logger.warn('[AnimationWASM] multiply_matrices_wasm failed:', err)
    return null
  }
}

/**
 * Compute dot product using WASM if available.
 *
 * @param a - First vector as Float64Array
 * @param b - Second vector as Float64Array
 * @returns Dot product value, or null if WASM not ready
 */
export function dotProductWasm(a: Float64Array, b: Float64Array): number | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  try {
    return wasmModule.dot_product_wasm(a, b)
  } catch (err) {
    logger.warn('[AnimationWASM] dot_product_wasm failed:', err)
    return null
  }
}

/**
 * Compute magnitude using WASM if available.
 *
 * @param v - Input vector as Float64Array
 * @returns Magnitude value, or null if WASM not ready
 */
export function magnitudeWasm(v: Float64Array): number | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  try {
    return wasmModule.magnitude_wasm(v)
  } catch (err) {
    logger.warn('[AnimationWASM] magnitude_wasm failed:', err)
    return null
  }
}

/**
 * Normalize vector using WASM if available.
 *
 * @param v - Input vector as Float64Array
 * @returns Normalized vector as Float64Array, or null if WASM not ready
 */
export function normalizeVectorWasm(v: Float64Array): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  try {
    return wasmModule.normalize_vector_wasm(v)
  } catch (err) {
    logger.warn('[AnimationWASM] normalize_vector_wasm failed:', err)
    return null
  }
}

/**
 * Subtract vectors using WASM if available.
 *
 * @param a - First vector as Float64Array
 * @param b - Second vector as Float64Array
 * @returns Difference vector as Float64Array, or null if WASM not ready
 */
export function subtractVectorsWasm(a: Float64Array, b: Float64Array): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  try {
    return wasmModule.subtract_vectors_wasm(a, b)
  } catch (err) {
    logger.warn('[AnimationWASM] subtract_vectors_wasm failed:', err)
    return null
  }
}

// ============================================================================
// Phase 4: FFT WASM Functions
// ============================================================================

/**
 * 1D forward FFT via WASM.
 *
 * @param data - Interleaved complex data `[re0, im0, re1, im1, ...]`
 * @param n - Number of complex elements (power of 2, >= 2)
 * @returns Transformed data as Float64Array, or null if WASM not ready
 */
export function fft1dWasm(data: Float64Array, n: number): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  try {
    return wasmModule.fft_1d_wasm(data, n)
  } catch (err) {
    logger.warn('[AnimationWASM] fft_1d_wasm failed:', err)
    return null
  }
}

/**
 * 1D inverse FFT via WASM (with 1/N normalization).
 *
 * @param data - Interleaved complex data `[re0, im0, re1, im1, ...]`
 * @param n - Number of complex elements (power of 2)
 * @returns Transformed data as Float64Array, or null if WASM not ready
 */
export function ifft1dWasm(data: Float64Array, n: number): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  try {
    return wasmModule.ifft_1d_wasm(data, n)
  } catch (err) {
    logger.warn('[AnimationWASM] ifft_1d_wasm failed:', err)
    return null
  }
}

/**
 * N-dimensional forward FFT via WASM.
 *
 * @param data - Interleaved complex data
 * @param gridSize - Grid sizes per dimension as Uint32Array
 * @returns Transformed data as Float64Array, or null if WASM not ready
 */
export function fftNdWasm(data: Float64Array, gridSize: Uint32Array): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  try {
    return wasmModule.fft_nd_wasm(data, gridSize)
  } catch (err) {
    logger.warn('[AnimationWASM] fft_nd_wasm failed:', err)
    return null
  }
}

/**
 * N-dimensional inverse FFT via WASM.
 *
 * @param data - Interleaved complex data
 * @param gridSize - Grid sizes per dimension as Uint32Array
 * @returns Transformed data as Float64Array, or null if WASM not ready
 */
export function ifftNdWasm(data: Float64Array, gridSize: Uint32Array): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  try {
    return wasmModule.ifft_nd_wasm(data, gridSize)
  } catch (err) {
    logger.warn('[AnimationWASM] ifft_nd_wasm failed:', err)
    return null
  }
}

// ============================================================================
// Phase 5: Coordinate Entanglement WASM Functions
// ============================================================================

/**
 * Compute reduced density matrix for a single dimension via WASM.
 *
 * @param psiRe - Real part of wavefunction (Float32Array from GPU readback)
 * @param psiIm - Imaginary part of wavefunction (Float32Array)
 * @param gridSize - Grid dimensions as Uint32Array
 * @param dimIndex - Which dimension to keep (0-based)
 * @returns Packed Float64Array `[re_flat(M*M), im_flat(M*M)]`, or null if WASM not ready
 */
export function computeRdmWasm(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: Uint32Array,
  dimIndex: number
): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  const fn_ = wasmModule.compute_rdm_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    return fn_(psiRe, psiIm, gridSize, dimIndex)
  } catch (err) {
    logger.warn('[AnimationWASM] compute_rdm_wasm failed:', err)
    return null
  }
}

/**
 * Compute joint reduced density matrix for multiple dimensions via WASM.
 *
 * @param psiRe - Real part of wavefunction (Float32Array)
 * @param psiIm - Imaginary part of wavefunction (Float32Array)
 * @param gridSize - Grid dimensions as Uint32Array
 * @param keptDims - Indices of dimensions to keep (sorted ascending) as Uint32Array
 * @returns Packed Float64Array `[re_flat(M*M), im_flat(M*M)]`, or null/empty if WASM not ready or M > 1024
 */
export function computeJointRdmWasm(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: Uint32Array,
  keptDims: Uint32Array
): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  const fn_ = wasmModule.compute_joint_rdm_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    return fn_(psiRe, psiIm, gridSize, keptDims)
  } catch (err) {
    logger.warn('[AnimationWASM] compute_joint_rdm_wasm failed:', err)
    return null
  }
}

/**
 * Hermitian eigendecomposition via Jacobi iteration (WASM-accelerated).
 *
 * @param re - Real part of Hermitian matrix (row-major, n×n)
 * @param im - Imaginary part of Hermitian matrix (row-major, n×n)
 * @param n - Matrix dimension
 * @returns Eigenvalues sorted descending as Float64Array, or null if WASM not ready
 */
export function hermitianEigenvaluesWasm(
  re: Float64Array,
  im: Float64Array,
  n: number
): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  const fn_ = wasmModule.hermitian_eigenvalues_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    return fn_(re, im, n)
  } catch (err) {
    logger.warn('[AnimationWASM] hermitian_eigenvalues_wasm failed:', err)
    return null
  }
}

/**
 * Von Neumann entropy from eigenvalues via WASM.
 *
 * @param eigenvalues - Eigenvalues of a density matrix
 * @returns Entropy value (nats), or null if WASM not ready
 */
export function vonNeumannEntropyWasm(eigenvalues: Float64Array): number | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  const fn_ = wasmModule.von_neumann_entropy_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    return fn_(eigenvalues)
  } catch (err) {
    logger.warn('[AnimationWASM] von_neumann_entropy_wasm failed:', err)
    return null
  }
}

// ============================================================================
// Phase 6: Complex Matrix Exponential WASM Functions
// ============================================================================

/**
 * Matrix exponential via Padé(13,13) with scaling-and-squaring (WASM-accelerated).
 *
 * @param aRe - Real part of input matrix (N×N, row-major)
 * @param aIm - Imaginary part of input matrix (N×N, row-major)
 * @param n - Matrix dimension
 * @returns Packed Float64Array `[re_flat(N*N), im_flat(N*N)]`, or null if WASM not ready
 */
export function matrixExponentialPadeWasm(
  aRe: Float64Array,
  aIm: Float64Array,
  n: number
): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  const fn_ = wasmModule.matrix_exponential_pade_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    return fn_(aRe, aIm, n)
  } catch (err) {
    logger.warn('[AnimationWASM] matrix_exponential_pade_wasm failed:', err)
    return null
  }
}

/**
 * Complex matrix multiply C = A × B via WASM.
 *
 * @param aRe - Real part of left matrix (N×N, row-major)
 * @param aIm - Imaginary part of left matrix (N×N, row-major)
 * @param bRe - Real part of right matrix (N×N, row-major)
 * @param bIm - Imaginary part of right matrix (N×N, row-major)
 * @param n - Matrix dimension
 * @returns Packed Float64Array `[re_flat(N*N), im_flat(N*N)]`, or null if WASM not ready
 */
export function complexMatMulWasm(
  aRe: Float64Array,
  aIm: Float64Array,
  bRe: Float64Array,
  bIm: Float64Array,
  n: number
): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  const fn_ = wasmModule.complex_mat_mul_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    return fn_(aRe, aIm, bRe, bIm, n)
  } catch (err) {
    logger.warn('[AnimationWASM] complex_mat_mul_wasm failed:', err)
    return null
  }
}

// ============================================================================
// Phase 7: TDSE Diagnostics WASM Functions
// ============================================================================

/**
 * Compute scar correlation between eigenstate density and classical orbits via WASM.
 *
 * @param densityRe - Eigenstate ψ_re on the lattice (Float32Array from GPU readback)
 * @param densityIm - Eigenstate ψ_im on the lattice (Float32Array)
 * @param gridSizes - Per-dimension grid sizes as Uint32Array
 * @param spacings - Per-dimension lattice spacings as Float64Array
 * @param orbitPointsFlat - Flattened orbit positions as Float64Array
 * @param orbitLengths - Number of points per orbit as Uint32Array
 * @param sigma - Gaussian tube width ε
 * @param dim - Number of spatial dimensions
 * @returns Packed Float64Array `[corr_0, ..., corr_N, max, mean, orbit_correlation, strongest_idx]`, or null
 */
export function computeScarCorrelationWasm(
  densityRe: Float32Array,
  densityIm: Float32Array,
  gridSizes: Uint32Array,
  spacings: Float64Array,
  orbitPointsFlat: Float64Array,
  orbitLengths: Uint32Array,
  sigma: number,
  dim: number
): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  const fn_ = wasmModule.compute_scar_correlation_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    return fn_(densityRe, densityIm, gridSizes, spacings, orbitPointsFlat, orbitLengths, sigma, dim)
  } catch (err) {
    logger.warn('[AnimationWASM] compute_scar_correlation_wasm failed:', err)
    return null
  }
}

/**
 * Compute level spacing statistics from energy eigenvalues via WASM.
 *
 * @param energies - Eigenvalue array as Float64Array
 * @returns Packed Float64Array `[spacings..., brody_beta, mean_spacing, classification_code]`, or null
 */
export function computeLevelSpacingWasm(energies: Float64Array): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  const fn_ = wasmModule.compute_level_spacing_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    return fn_(energies)
  } catch (err) {
    logger.warn('[AnimationWASM] compute_level_spacing_wasm failed:', err)
    return null
  }
}

// ============================================================================
// Helper Functions for Data Conversion
// ============================================================================

/**
 * Convert Float64Array result back to VectorND (number[]).
 * @param vector - Input vector as Float64Array
 * @returns Vector as number[]
 */
export function float64ToVector(vector: Float64Array): VectorND {
  return Array.from(vector)
}
