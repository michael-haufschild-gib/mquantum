/**
 * Radix-2 Cooley-Tukey FFT for complex data in interleaved format.
 *
 * Data layout: `[re0, im0, re1, im1, ..., re_{N-1}, im_{N-1}]`
 * Supports both `Float64Array` (full precision) and `Float32Array` (faster, less memory).
 * Only power-of-2 lengths are supported.
 *
 * Convention: forward DFT uses `exp(-i * 2pi * k * n / N)` (signal processing standard).
 * Inverse DFT uses `exp(+i * 2pi * k * n / N)` with 1/N normalization.
 *
 * @module
 */

import { fft1dWasm, fftNdWasm, ifft1dWasm, ifftNdWasm, isAnimationWasmReady } from '@/lib/wasm'

import { computeStrides } from './ndArray'

/** Typed array types accepted by FFT functions. */
type FFTArray = Float64Array | Float32Array

/**
 * Minimum 1D FFT size to attempt WASM acceleration.
 * Below this threshold, WASM boundary copy overhead exceeds compute savings.
 */
const WASM_1D_MIN_N = 32

/**
 * Minimum total grid sites for N-D WASM acceleration.
 */
const WASM_ND_MIN_SITES = 256

// ============================================================================
// WASM FFT Helpers
// ============================================================================

/**
 * Attempt WASM-accelerated 1D forward FFT. On success, copies result back
 * into `data` and returns true. Returns false if WASM is unavailable.
 *
 * @param data - Interleaved complex Float64Array (modified in place on success)
 * @param n - Number of complex elements
 * @returns True if WASM succeeded
 */
function tryWasmFft(data: Float64Array, n: number): boolean {
  const result = fft1dWasm(data, n)
  if (!result) return false
  data.set(result)
  return true
}

/**
 * Attempt WASM-accelerated 1D inverse FFT. On success, copies result back
 * into `data` and returns true. Returns false if WASM is unavailable.
 *
 * @param data - Interleaved complex Float64Array (modified in place on success)
 * @param n - Number of complex elements
 * @returns True if WASM succeeded
 */
function tryWasmIfft(data: Float64Array, n: number): boolean {
  const result = ifft1dWasm(data, n)
  if (!result) return false
  data.set(result)
  return true
}

/** Reusable Uint32Array for N-D grid sizes (avoids per-call allocation). */
let gridSizeScratch: Uint32Array | null = null

/**
 * Get a Uint32Array scratch buffer for grid sizes, resizing if needed.
 *
 * @param length - Required length
 * @returns Uint32Array of at least `length` elements
 */
function getGridSizeScratch(length: number): Uint32Array {
  if (!gridSizeScratch || gridSizeScratch.length < length) {
    gridSizeScratch = new Uint32Array(length)
  }
  return gridSizeScratch
}

/**
 * Attempt WASM-accelerated N-D forward FFT. On success, copies result back
 * into `data` and returns true. Returns false if WASM is unavailable.
 *
 * @param data - Interleaved complex Float64Array (modified in place on success)
 * @param gridSize - Grid sizes per dimension
 * @returns True if WASM succeeded
 */
function tryWasmFftNd(data: Float64Array, gridSize: readonly number[]): boolean {
  const gs = getGridSizeScratch(gridSize.length)
  for (let i = 0; i < gridSize.length; i++) gs[i] = gridSize[i]!
  const result = fftNdWasm(data, gs.subarray(0, gridSize.length))
  if (!result) return false
  data.set(result)
  return true
}

/**
 * Attempt WASM-accelerated N-D inverse FFT. On success, copies result back
 * into `data` and returns true. Returns false if WASM is unavailable.
 *
 * @param data - Interleaved complex Float64Array (modified in place on success)
 * @param gridSize - Grid sizes per dimension
 * @returns True if WASM succeeded
 */
function tryWasmIfftNd(data: Float64Array, gridSize: readonly number[]): boolean {
  const gs = getGridSizeScratch(gridSize.length)
  for (let i = 0; i < gridSize.length; i++) gs[i] = gridSize[i]!
  const result = ifftNdWasm(data, gs.subarray(0, gridSize.length))
  if (!result) return false
  data.set(result)
  return true
}

/**
 * Checks that n is a positive power of 2.
 *
 * @param n - Value to check
 * @throws If n is not a power of 2
 */
function assertPowerOf2(n: number): void {
  if (!Number.isInteger(n) || n < 1 || (n & (n - 1)) !== 0) {
    throw new Error(`FFT requires power-of-2 length, got ${n}`)
  }
}

/**
 * Checks that interleaved complex data contains at least n complex samples.
 *
 * @param data - Interleaved complex data buffer
 * @param n - Number of complex samples required
 * @throws If data.length < 2 * n
 */
function assertComplexDataLength(data: FFTArray, n: number): void {
  const expected = 2 * n
  if (data.length < expected) {
    throw new Error(`FFT data length too small: expected at least ${expected}, got ${data.length}`)
  }
}

/**
 * Validates N-D FFT grid dimensions (each must be a power of 2).
 *
 * @param gridSize - Grid dimensions
 * @throws If any dimension is not a positive power-of-2 integer
 */
function assertValidGridSize(gridSize: readonly number[]): void {
  for (let d = 0; d < gridSize.length; d++) {
    const n = gridSize[d]!
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`FFT dimension must be positive integer, got ${n} at axis ${d}`)
    }
    if ((n & (n - 1)) !== 0) {
      throw new Error(`FFT dimension must be power-of-2, got ${n} at axis ${d}`)
    }
  }
}

/**
 * In-place bit-reversal permutation of interleaved complex data.
 *
 * @param data - Interleaved complex array (length 2*n)
 * @param n - Number of complex elements
 */
function bitReverse(data: FFTArray, n: number): void {
  let j = 0
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      // Swap complex elements i and j
      const ri = i * 2
      const rj = j * 2
      let tmp = data[ri]!
      data[ri] = data[rj]!
      data[rj] = tmp
      tmp = data[ri + 1]!
      data[ri + 1] = data[rj + 1]!
      data[rj + 1] = tmp
    }
    let m = n >> 1
    while (m >= 1 && j >= m) {
      j -= m
      m >>= 1
    }
    j += m
  }
}

// ============================================================================
// Twiddle Factor Cache
// ============================================================================

/**
 * Cached twiddle factors for forward FFT, keyed by FFT size.
 * Each entry stores interleaved [re, im] pairs for all butterfly stages.
 * Layout per stage of length L: halfL twiddle factors = cos/sin of -2π*j/L.
 */
const twiddleCache = new Map<number, Float64Array>()

/**
 * Get or compute cached twiddle factors for a given FFT size.
 * Returns a flat Float64Array containing twiddle factors for all stages:
 *   stage L=2: 1 factor, stage L=4: 2 factors, ..., stage L=N: N/2 factors
 * Total entries: N-1 complex pairs = 2*(N-1) floats.
 */
function getTwiddleFactors(n: number): Float64Array {
  let table = twiddleCache.get(n)
  if (table) return table

  // Total twiddle entries: sum(L/2 for L=2,4,...,N) = N-1
  table = new Float64Array((n - 1) * 2)
  let offset = 0
  for (let len = 2; len <= n; len *= 2) {
    const halfLen = len / 2
    const angle = (-2 * Math.PI) / len
    for (let j = 0; j < halfLen; j++) {
      const theta = angle * j
      table[offset++] = Math.cos(theta)
      table[offset++] = Math.sin(theta)
    }
  }
  twiddleCache.set(n, table)
  return table
}

/**
 * In-place radix-2 decimation-in-time FFT (forward transform).
 *
 * Computes `X[k] = sum_{n=0}^{N-1} x[n] * exp(-i * 2pi * k * n / N)`.
 * Uses precomputed twiddle factors (cached per FFT size) to avoid
 * per-butterfly trigonometric calls.
 *
 * @param data - Interleaved complex array `[re0, im0, re1, im1, ...]` of length `2*n`
 * @param n - Number of complex elements (must be a power of 2)
 *
 * @example
 * ```ts
 * const data = new Float64Array([1, 0, 0, 0, 0, 0, 0, 0]) // delta at index 0
 * fft(data, 4) // transforms to constant [1, 0, 1, 0, 1, 0, 1, 0]
 * ```
 */
export function fft(data: FFTArray, n: number): void {
  assertPowerOf2(n)
  assertComplexDataLength(data, n)
  if (n <= 1) return

  // Try WASM acceleration for Float64Array with sufficient size
  if (n >= WASM_1D_MIN_N && data instanceof Float64Array && isAnimationWasmReady()) {
    if (tryWasmFft(data, n)) return
  }

  bitReverse(data, n)

  const twiddle = getTwiddleFactors(n)
  let twiddleOffset = 0

  for (let len = 2; len <= n; len *= 2) {
    const halfLen = len / 2

    for (let i = 0; i < n; i += len) {
      for (let j = 0; j < halfLen; j++) {
        const evenIdx = (i + j) * 2
        const oddIdx = (i + j + halfLen) * 2

        const wRe = twiddle[twiddleOffset + j * 2]!
        const wIm = twiddle[twiddleOffset + j * 2 + 1]!

        // Twiddle: w * data[odd]
        const tRe = wRe * data[oddIdx]! - wIm * data[oddIdx + 1]!
        const tIm = wRe * data[oddIdx + 1]! + wIm * data[oddIdx]!

        // Butterfly
        data[oddIdx] = data[evenIdx]! - tRe
        data[oddIdx + 1] = data[evenIdx + 1]! - tIm
        data[evenIdx] = data[evenIdx]! + tRe
        data[evenIdx + 1] = data[evenIdx + 1]! + tIm
      }
    }

    twiddleOffset += halfLen * 2
  }
}

/**
 * In-place inverse FFT with 1/N normalization.
 *
 * Computes `x[n] = (1/N) * sum_{k=0}^{N-1} X[k] * exp(+i * 2pi * k * n / N)`.
 *
 * @param data - Interleaved complex array of length `2*n`
 * @param n - Number of complex elements (must be a power of 2)
 *
 * @example
 * ```ts
 * const data = new Float64Array([1, 0, 1, 0, 1, 0, 1, 0]) // constant spectrum
 * ifft(data, 4) // transforms to delta [1, 0, 0, 0, 0, 0, 0, 0]
 * ```
 */
export function ifft(data: FFTArray, n: number): void {
  assertPowerOf2(n)
  assertComplexDataLength(data, n)

  // Try WASM acceleration for Float64Array with sufficient size
  if (n >= WASM_1D_MIN_N && data instanceof Float64Array && isAnimationWasmReady()) {
    if (tryWasmIfft(data, n)) return
  }

  // Conjugate
  for (let i = 0; i < n; i++) {
    data[i * 2 + 1] = -data[i * 2 + 1]!
  }

  // Forward FFT
  fft(data, n)

  // Conjugate and scale by 1/N
  const invN = 1 / n
  for (let i = 0; i < n; i++) {
    data[i * 2] = data[i * 2]! * invN
    data[i * 2 + 1] = data[i * 2 + 1]! * -invN
  }
}

/**
 * Shared N-dimensional transform via iterated 1D fiber decomposition.
 *
 * Applies a 1D transform function along each axis sequentially, from the
 * first dimension to the last. Data is in row-major order (last dimension
 * varies fastest).
 *
 * @param data - Interleaved complex array of length `2 * product(gridSize)`
 * @param gridSize - Array of grid sizes per dimension (each must be power of 2)
 * @param transform1d - 1D transform function (fft or ifft)
 */

/**
 * Collects dimension indices to iterate over (all except the target dimension), in reverse order.
 *
 * @param dim - Total number of dimensions
 * @param excludeDim - Dimension to exclude
 * @returns Array of dimension indices in reverse order
 */
function collectOtherDims(dim: number, excludeDim: number): number[] {
  const otherDims: number[] = []
  for (let dd = dim - 1; dd >= 0; dd--) {
    if (dd !== excludeDim) otherDims.push(dd)
  }
  return otherDims
}

/**
 * Decomposes a linear fiber index into a base offset for the N-D grid,
 * accounting for all dimensions except the target fiber dimension.
 *
 * @param fiberIndex - Linear index among all fibers
 * @param otherDims - Dimension indices to iterate (from collectOtherDims)
 * @param gridSize - Grid sizes per dimension
 * @param strides - Row-major strides per dimension
 * @returns Base flat index into the data array
 */
function computeFiberBase(
  fiberIndex: number,
  otherDims: readonly number[],
  gridSize: readonly number[],
  strides: readonly number[]
): number {
  let base = 0
  let remaining = fiberIndex
  for (const dd of otherDims) {
    const coord = remaining % gridSize[dd]!
    remaining = Math.floor(remaining / gridSize[dd]!)
    base += coord * strides[dd]!
  }
  return base
}

/**
 * Extracts a 1D fiber from N-D data, transforms it, and writes the result back.
 *
 * @param data - Interleaved complex data buffer
 * @param fiber - Scratch buffer for the extracted 1D fiber
 * @param base - Base flat index in data
 * @param fiberStride - Stride between consecutive fiber elements
 * @param n - Number of complex elements along this fiber
 * @param transform1d - 1D transform function to apply
 */
function transformFiber(
  data: FFTArray,
  fiber: FFTArray,
  base: number,
  fiberStride: number,
  n: number,
  transform1d: (data: FFTArray, n: number) => void
): void {
  // Extract fiber
  for (let i = 0; i < n; i++) {
    const flatIdx = base + i * fiberStride
    fiber[i * 2] = data[flatIdx * 2]!
    fiber[i * 2 + 1] = data[flatIdx * 2 + 1]!
  }

  transform1d(fiber, n)

  // Write back
  for (let i = 0; i < n; i++) {
    const flatIdx = base + i * fiberStride
    data[flatIdx * 2] = fiber[i * 2]!
    data[flatIdx * 2 + 1] = fiber[i * 2 + 1]!
  }
}

function ndTransform(
  data: FFTArray,
  gridSize: readonly number[],
  transform1d: (data: FFTArray, n: number) => void
): void {
  const dim = gridSize.length
  if (dim === 0) return

  assertValidGridSize(gridSize)

  const totalSites = gridSize.reduce((a, b) => a * b, 1)
  assertComplexDataLength(data, totalSites)
  if (totalSites <= 1) return

  const strides = computeStrides(gridSize)

  for (let d = 0; d < dim; d++) {
    const n = gridSize[d]!
    if (n <= 1) continue

    const fiberStride = strides[d]!
    const fiberCount = totalSites / n
    const fiber = new (data.constructor as { new (length: number): FFTArray })(2 * n)
    const otherDims = collectOtherDims(dim, d)

    for (let f = 0; f < fiberCount; f++) {
      const base = computeFiberBase(f, otherDims, gridSize, strides)
      transformFiber(data, fiber, base, fiberStride, n, transform1d)
    }
  }
}

/**
 * In-place N-dimensional inverse FFT via iterated 1D transforms.
 *
 * Applies 1D IFFT along each axis sequentially, from the first dimension
 * to the last. Data is in row-major order (last dimension varies fastest):
 * `index = coords[0] * stride[0] + coords[1] * stride[1] + ... + coords[D-1]`
 *
 * Each dimension must be a power of 2. Dimensions of size 1 are skipped.
 *
 * @param data - Interleaved complex array of length `2 * product(gridSize)`
 * @param gridSize - Array of grid sizes per dimension (each must be power of 2)
 *
 * @example
 * ```ts
 * const data = new Float64Array(2 * 4 * 4 * 4 * 4)
 * // ... fill with k-space data ...
 * ifftNd(data, [4, 4, 4, 4])
 * ```
 */
export function ifftNd(data: FFTArray, gridSize: readonly number[]): void {
  // Validate up-front so the WASM fast-path and the JS fallback share the
  // same invariants. Without this, Rust's `validate_fft_nd` rejects bad
  // input by returning an empty Vec, which the bridge silently passes
  // through as an empty Float32Array — `tryWasmIfftNd` then does a no-op
  // `data.set(empty)` and returns `true`, so the caller sees "success"
  // with unchanged data. The JS path's `assertValidGridSize` /
  // `assertComplexDataLength` (called inside `ndTransform`) would have
  // thrown loudly. Hoisting them here keeps both paths fail-fast and
  // matches what every production caller already expects.
  if (gridSize.length > 0) {
    assertValidGridSize(gridSize)
    const totalSitesValidate = gridSize.reduce((a, b) => a * b, 1)
    assertComplexDataLength(data, totalSitesValidate)
  }

  // Try N-D WASM path for Float64Array with sufficient total sites
  if (data instanceof Float64Array && isAnimationWasmReady()) {
    const totalSites = gridSize.reduce((a, b) => a * b, 1)
    if (totalSites >= WASM_ND_MIN_SITES && tryWasmIfftNd(data, gridSize)) return
  }

  ndTransform(data, gridSize, ifft)
}

/**
 * N-dimensional forward FFT (in-place).
 * Data layout: interleaved complex Float64Array [re0, im0, re1, im1, ...].
 * Applies 1D forward FFT along each dimension using row decomposition.
 *
 * @param data - Interleaved complex array of length `2 * product(gridSize)`
 * @param gridSize - Array of grid sizes per dimension (each must be power of 2)
 */
export function fftNd(data: FFTArray, gridSize: readonly number[]): void {
  // See `ifftNd` for why both paths must validate up-front: the Rust
  // `validate_fft_nd` rejects bad input with an empty Vec, the JS bridge
  // returns an empty Float32Array, and `tryWasmFftNd` reports success
  // even though the buffer was never transformed. Throwing here keeps
  // the WASM-ready branch and the JS fallback path equally fail-fast.
  if (gridSize.length > 0) {
    assertValidGridSize(gridSize)
    const totalSitesValidate = gridSize.reduce((a, b) => a * b, 1)
    assertComplexDataLength(data, totalSitesValidate)
  }

  // Try N-D WASM path for Float64Array with sufficient total sites
  if (data instanceof Float64Array && isAnimationWasmReady()) {
    const totalSites = gridSize.reduce((a, b) => a * b, 1)
    if (totalSites >= WASM_ND_MIN_SITES && tryWasmFftNd(data, gridSize)) return
  }

  ndTransform(data, gridSize, fft)
}
