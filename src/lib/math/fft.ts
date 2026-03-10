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

/** Typed array types accepted by FFT functions. */
type FFTArray = Float64Array | Float32Array

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
 * Validates N-D FFT grid dimensions.
 *
 * @param gridSize - Grid dimensions
 * @throws If any dimension is not a positive integer
 */
function assertValidGridSize(gridSize: readonly number[]): void {
  for (let d = 0; d < gridSize.length; d++) {
    const n = gridSize[d]!
    if (!Number.isInteger(n) || n < 1) {
      throw new Error(`FFT dimension must be positive integer, got ${n} at axis ${d}`)
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
 * In-place 3D inverse FFT via row decomposition.
 *
 * Applies 1D IFFT along each axis sequentially:
 * x-axis (fastest varying), then y-axis, then z-axis.
 * Data is in row-major order: `index = iz * ny * nx + iy * nx + ix`.
 *
 * @param data - Interleaved complex array of length `2 * nx * ny * nz`
 * @param nx - Grid size along x (must be power of 2)
 * @param ny - Grid size along y (must be power of 2)
 * @param nz - Grid size along z (must be power of 2)
 *
 * @example
 * ```ts
 * const data = new Float64Array(2 * 4 * 4 * 4)
 * // ... fill with k-space data ...
 * ifft3d(data, 4, 4, 4)
 * ```
 */
export function ifft3d(data: FFTArray, nx: number, ny: number, nz: number): void {
  ifftNd(data, [nx, ny, nz])
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
  const dim = gridSize.length
  if (dim === 0) return

  assertValidGridSize(gridSize)

  const totalSites = gridSize.reduce((a, b) => a * b, 1)
  assertComplexDataLength(data, totalSites)
  if (totalSites <= 1) return

  // Row-major strides: last dimension has stride 1
  const strides = new Array<number>(dim)
  strides[dim - 1] = 1
  for (let d = dim - 2; d >= 0; d--) {
    strides[d] = strides[d + 1]! * gridSize[d + 1]!
  }

  // For each dimension, apply 1D IFFT along all fibers
  for (let d = 0; d < dim; d++) {
    const n = gridSize[d]!
    if (n <= 1) continue
    assertPowerOf2(n)

    const fiberStride = strides[d]!
    const fiberCount = totalSites / n
    const fiber = new (data.constructor as { new(length: number): FFTArray })(2 * n)

    // Collect dimensions to iterate (all except d), in reverse for decomposition
    const otherDims: number[] = []
    for (let dd = dim - 1; dd >= 0; dd--) {
      if (dd !== d) otherDims.push(dd)
    }

    for (let f = 0; f < fiberCount; f++) {
      // Decompose fiber index f into coordinates for all dims except d
      let base = 0
      let remaining = f
      for (const dd of otherDims) {
        const coord = remaining % gridSize[dd]!
        remaining = Math.floor(remaining / gridSize[dd]!)
        base += coord * strides[dd]!
      }

      // Extract fiber along dimension d
      for (let i = 0; i < n; i++) {
        const flatIdx = base + i * fiberStride
        fiber[i * 2] = data[flatIdx * 2]!
        fiber[i * 2 + 1] = data[flatIdx * 2 + 1]!
      }

      ifft(fiber, n)

      // Write back
      for (let i = 0; i < n; i++) {
        const flatIdx = base + i * fiberStride
        data[flatIdx * 2] = fiber[i * 2]!
        data[flatIdx * 2 + 1] = fiber[i * 2 + 1]!
      }
    }
  }
}

/**
 * N-dimensional forward FFT (in-place).
 * Data layout: interleaved complex Float64Array [re0, im0, re1, im1, ...].
 * Applies 1D forward FFT along each dimension using row decomposition.
 * Symmetric to ifftNd — same fiber extraction, but calls fft() instead of ifft().
 */
export function fftNd(data: FFTArray, gridSize: readonly number[]): void {
  const dim = gridSize.length
  if (dim === 0) return

  assertValidGridSize(gridSize)

  const totalSites = gridSize.reduce((a, b) => a * b, 1)
  assertComplexDataLength(data, totalSites)
  if (totalSites <= 1) return

  // Row-major strides: last dimension has stride 1
  const strides = new Array<number>(dim)
  strides[dim - 1] = 1
  for (let d = dim - 2; d >= 0; d--) {
    strides[d] = strides[d + 1]! * gridSize[d + 1]!
  }

  // For each dimension, apply 1D FFT along all fibers
  for (let d = 0; d < dim; d++) {
    const n = gridSize[d]!
    if (n <= 1) continue
    assertPowerOf2(n)

    const fiberStride = strides[d]!
    const fiberCount = totalSites / n
    const fiber = new (data.constructor as { new(length: number): FFTArray })(2 * n)

    // Collect dimensions to iterate (all except d), in reverse for decomposition
    const otherDims: number[] = []
    for (let dd = dim - 1; dd >= 0; dd--) {
      if (dd !== d) otherDims.push(dd)
    }

    for (let f = 0; f < fiberCount; f++) {
      // Decompose fiber index f into coordinates for all dims except d
      let base = 0
      let remaining = f
      for (const dd of otherDims) {
        const coord = remaining % gridSize[dd]!
        remaining = Math.floor(remaining / gridSize[dd]!)
        base += coord * strides[dd]!
      }

      // Extract fiber along dimension d
      for (let i = 0; i < n; i++) {
        const flatIdx = base + i * fiberStride
        fiber[i * 2] = data[flatIdx * 2]!
        fiber[i * 2 + 1] = data[flatIdx * 2 + 1]!
      }

      fft(fiber, n)

      // Write back
      for (let i = 0; i < n; i++) {
        const flatIdx = base + i * fiberStride
        data[flatIdx * 2] = fiber[i * 2]!
        data[flatIdx * 2 + 1] = fiber[i * 2 + 1]!
      }
    }
  }
}
