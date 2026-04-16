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
  // BEC: incompressible kinetic-energy spectrum residual math (velocity field
  // + Helmholtz projection + log-spaced shell binning). Returns a packed
  // Float64Array of length `2·NUM_SPECTRUM_BINS + 2` = 66.
  compute_incompressible_spectrum_wasm?: (
    psi_re: Float32Array,
    psi_im: Float32Array,
    grid_size: Uint32Array,
    spacing: Float64Array,
    hbar: number,
    mass: number
  ) => Float64Array
  // Phase 8: Init-loop kernels
  generate_disorder_noise_wasm?: (total_sites: number, seed: number) => Float32Array
  generate_disorder_potential_wasm?: (
    total_sites: number,
    disorder_strength: number,
    seed: number,
    distribution_code: number
  ) => Float32Array
  compute_full_collapse_wasm?: (
    grid_size: Uint32Array,
    spacing: Float64Array,
    center: Float64Array,
    sigma: number,
    compact_dims: Uint8Array
  ) => Float32Array
  compute_partial_collapse_wasm?: (
    psi_re: Float32Array,
    psi_im: Float32Array,
    grid_size: Uint32Array,
    spacing: Float64Array,
    axis: number,
    axis_position: number,
    sigma: number,
    axis_compact: number
  ) => Float32Array
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

/**
 * Compute the BEC incompressible kinetic-energy spectrum via WASM.
 *
 * Velocity-field finite differences + Helmholtz projection + log-spaced
 * shell binning. The three FFTs on velocity components run inside the
 * Rust module via the shared FFT path. Returns a packed `Float64Array`
 * of length `2 · NUM_SPECTRUM_BINS + 2 = 66` where the first
 * `NUM_SPECTRUM_BINS` entries are the spectrum, the next
 * `NUM_SPECTRUM_BINS` are the bin-center k-values, and the final two
 * entries are the total incompressible / compressible kinetic energies.
 *
 * @param psiRe     — wavefunction real part (length = product(gridSize))
 * @param psiIm     — wavefunction imaginary part
 * @param gridSize  — per-axis lattice sizes (Uint32Array)
 * @param spacing   — per-axis lattice spacing
 * @param hbar      — reduced Planck constant
 * @param mass      — particle mass
 * @returns Packed result, or null if WASM unavailable / binding missing
 */
export function computeIncompressibleSpectrumWasm(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: Uint32Array,
  spacing: Float64Array,
  hbar: number,
  mass: number
): Float64Array | null {
  if (!wasmReady || !wasmModule) {
    return null
  }

  const fn_ = wasmModule.compute_incompressible_spectrum_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    const result = fn_(psiRe, psiIm, gridSize, spacing, hbar, mass)
    if (result.length === 0) return null
    return result
  } catch (err) {
    logger.warn('[AnimationWASM] compute_incompressible_spectrum_wasm failed:', err)
    return null
  }
}

// ============================================================================
// Phase 8: Init-Loop Kernels (Disorder + Measurement Collapse)
// ============================================================================

/**
 * Uniform disorder noise in [-0.5, 0.5] via WASM.
 *
 * Bit-exact parity with `generateDisorderNoise` (shared mulberry32 seed).
 *
 * @param totalSites - Number of lattice sites
 * @param seed - Integer seed
 * @returns Float32Array of length `totalSites`, or null if WASM unavailable
 */
export function generateDisorderNoiseWasm(
  totalSites: number,
  seed: number
): Float32Array<ArrayBuffer> | null {
  if (!wasmReady || !wasmModule) return null
  const fn_ = wasmModule.generate_disorder_noise_wasm
  if (typeof fn_ !== 'function') return null
  if (!Number.isInteger(totalSites) || totalSites <= 0) return null
  try {
    const raw = fn_(totalSites, seed | 0)
    // Copy out of WASM-memory into a caller-owned ArrayBuffer — otherwise
    // the typed array stays backed by the shared WASM linear memory, which
    // can be invalidated by subsequent calls that grow it.
    const out = new Float32Array(raw.length)
    out.set(raw)
    return out
  } catch (err) {
    logger.warn('[AnimationWASM] generate_disorder_noise_wasm failed:', err)
    return null
  }
}

/**
 * Anderson disorder potential via WASM (uniform or gaussian).
 *
 * @param totalSites - Lattice site count
 * @param disorderStrength - W (uniform half-range × 2; Gaussian σ)
 * @param seed - Integer seed
 * @param distributionCode - 0 = uniform, 1 = gaussian
 * @returns Float32Array, or null if WASM unavailable / invalid distribution
 */
export function generateDisorderPotentialWasm(
  totalSites: number,
  disorderStrength: number,
  seed: number,
  distributionCode: number
): Float32Array<ArrayBuffer> | null {
  if (!wasmReady || !wasmModule) return null
  const fn_ = wasmModule.generate_disorder_potential_wasm
  if (typeof fn_ !== 'function') return null
  if (!Number.isInteger(totalSites) || totalSites <= 0) return null
  try {
    const raw = fn_(totalSites, disorderStrength, seed | 0, distributionCode)
    if (raw.length === 0) return null
    const out = new Float32Array(raw.length)
    out.set(raw)
    return out
  } catch (err) {
    logger.warn('[AnimationWASM] generate_disorder_potential_wasm failed:', err)
    return null
  }
}

/**
 * Full Gaussian measurement collapse via WASM.
 *
 * Returns `[psiRe, psiIm]` as separate Float32Array views; the WASM side packs
 * `[re..., im...]` and this helper splits without copying by constructing
 * subarrays over the shared ArrayBuffer.
 *
 * @param gridSize - Per-axis grid sizes
 * @param spacing - Per-axis spacings
 * @param center - Measurement center coordinates
 * @param sigma - Gaussian width
 * @param compactDims - Optional per-axis periodicity (0/1). Pass empty Uint8Array for open.
 * @returns `[psiRe, psiIm]` tuple, or null if WASM unavailable
 */
export function computeFullCollapseWasm(
  gridSize: Uint32Array,
  spacing: Float64Array,
  center: Float64Array,
  sigma: number,
  compactDims: Uint8Array
): [Float32Array, Float32Array] | null {
  if (!wasmReady || !wasmModule) return null
  const fn_ = wasmModule.compute_full_collapse_wasm
  if (typeof fn_ !== 'function') return null
  try {
    const packed = fn_(gridSize, spacing, center, sigma, compactDims)
    if (packed.length === 0) return null
    const total = packed.length / 2
    // Copy out into separate buffers — WASM memory is reused across calls
    // and the GPU writeBuffer path requires stable ownership.
    const psiRe = new Float32Array(total)
    const psiIm = new Float32Array(total)
    psiRe.set(packed.subarray(0, total))
    psiIm.set(packed.subarray(total, total * 2))
    return [psiRe, psiIm]
  } catch (err) {
    logger.warn('[AnimationWASM] compute_full_collapse_wasm failed:', err)
    return null
  }
}

/**
 * Partial single-axis measurement collapse via WASM.
 *
 * @param psiRe - Current ψ real part
 * @param psiIm - Current ψ imaginary part
 * @param gridSize - Per-axis grid sizes
 * @param spacing - Per-axis spacings
 * @param axis - Measured axis index
 * @param axisPosition - Measurement coordinate on `axis`
 * @param sigma - Gaussian width
 * @param axisCompact - True to wrap on the measured axis
 * @returns `[psiRe, psiIm]` tuple of new arrays, or null if WASM unavailable
 */
export function computePartialCollapseWasm(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: Uint32Array,
  spacing: Float64Array,
  axis: number,
  axisPosition: number,
  sigma: number,
  axisCompact: boolean
): [Float32Array, Float32Array] | null {
  if (!wasmReady || !wasmModule) return null
  const fn_ = wasmModule.compute_partial_collapse_wasm
  if (typeof fn_ !== 'function') return null
  try {
    const packed = fn_(
      psiRe,
      psiIm,
      gridSize,
      spacing,
      axis,
      axisPosition,
      sigma,
      axisCompact ? 1 : 0
    )
    if (packed.length === 0) return null
    const total = packed.length / 2
    const outRe = new Float32Array(total)
    const outIm = new Float32Array(total)
    outRe.set(packed.subarray(0, total))
    outIm.set(packed.subarray(total, total * 2))
    return [outRe, outIm]
  } catch (err) {
    logger.warn('[AnimationWASM] compute_partial_collapse_wasm failed:', err)
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
