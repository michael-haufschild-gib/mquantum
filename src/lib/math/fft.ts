/**
 * Radix-2 Cooley-Tukey FFT for complex data in interleaved format.
 *
 * Data layout: `[re0, im0, re1, im1, ..., re_{N-1}, im_{N-1}]`
 * All operations are in-place on `Float64Array` for precision.
 * Only power-of-2 lengths are supported.
 *
 * Convention: forward DFT uses `exp(-i * 2pi * k * n / N)` (signal processing standard).
 * Inverse DFT uses `exp(+i * 2pi * k * n / N)` with 1/N normalization.
 *
 * @module
 */

/**
 * Checks that n is a positive power of 2.
 *
 * @param n - Value to check
 * @throws If n is not a power of 2
 */
function assertPowerOf2(n: number): void {
  if (n < 1 || (n & (n - 1)) !== 0) {
    throw new Error(`FFT requires power-of-2 length, got ${n}`)
  }
}

/**
 * In-place bit-reversal permutation of interleaved complex data.
 *
 * @param data - Interleaved complex array (length 2*n)
 * @param n - Number of complex elements
 */
function bitReverse(data: Float64Array, n: number): void {
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

/**
 * In-place radix-2 decimation-in-time FFT (forward transform).
 *
 * Computes `X[k] = sum_{n=0}^{N-1} x[n] * exp(-i * 2pi * k * n / N)`.
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
export function fft(data: Float64Array, n: number): void {
  assertPowerOf2(n)
  if (n <= 1) return

  bitReverse(data, n)

  for (let len = 2; len <= n; len *= 2) {
    const halfLen = len / 2
    const angle = (-2 * Math.PI) / len
    const wRe = Math.cos(angle)
    const wIm = Math.sin(angle)

    for (let i = 0; i < n; i += len) {
      let curRe = 1
      let curIm = 0

      for (let j = 0; j < halfLen; j++) {
        const evenIdx = (i + j) * 2
        const oddIdx = (i + j + halfLen) * 2

        // Twiddle: cur * data[odd]
        const tRe = curRe * data[oddIdx]! - curIm * data[oddIdx + 1]!
        const tIm = curRe * data[oddIdx + 1]! + curIm * data[oddIdx]!

        // Butterfly
        data[oddIdx] = data[evenIdx]! - tRe
        data[oddIdx + 1] = data[evenIdx + 1]! - tIm
        data[evenIdx] = data[evenIdx]! + tRe
        data[evenIdx + 1] = data[evenIdx + 1]! + tIm

        // Advance twiddle factor
        const nextRe = curRe * wRe - curIm * wIm
        const nextIm = curRe * wIm + curIm * wRe
        curRe = nextRe
        curIm = nextIm
      }
    }
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
export function ifft(data: Float64Array, n: number): void {
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
export function ifft3d(data: Float64Array, nx: number, ny: number, nz: number): void {
  assertPowerOf2(nx)
  assertPowerOf2(ny)
  assertPowerOf2(nz)

  // IFFT along x (rows within each yz-plane)
  if (nx > 1) {
    const row = new Float64Array(2 * nx)
    for (let iz = 0; iz < nz; iz++) {
      for (let iy = 0; iy < ny; iy++) {
        const base = (iz * ny + iy) * nx
        // Extract row
        for (let ix = 0; ix < nx; ix++) {
          row[ix * 2] = data[(base + ix) * 2]!
          row[ix * 2 + 1] = data[(base + ix) * 2 + 1]!
        }
        ifft(row, nx)
        // Write back
        for (let ix = 0; ix < nx; ix++) {
          data[(base + ix) * 2] = row[ix * 2]!
          data[(base + ix) * 2 + 1] = row[ix * 2 + 1]!
        }
      }
    }
  }

  // IFFT along y (columns within each xz-plane)
  if (ny > 1) {
    const col = new Float64Array(2 * ny)
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        // Extract column
        for (let iy = 0; iy < ny; iy++) {
          const idx = (iz * ny + iy) * nx + ix
          col[iy * 2] = data[idx * 2]!
          col[iy * 2 + 1] = data[idx * 2 + 1]!
        }
        ifft(col, ny)
        // Write back
        for (let iy = 0; iy < ny; iy++) {
          const idx = (iz * ny + iy) * nx + ix
          data[idx * 2] = col[iy * 2]!
          data[idx * 2 + 1] = col[iy * 2 + 1]!
        }
      }
    }
  }

  // IFFT along z (tubes along z)
  if (nz > 1) {
    const tube = new Float64Array(2 * nz)
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        // Extract tube
        for (let iz = 0; iz < nz; iz++) {
          const idx = (iz * ny + iy) * nx + ix
          tube[iz * 2] = data[idx * 2]!
          tube[iz * 2 + 1] = data[idx * 2 + 1]!
        }
        ifft(tube, nz)
        // Write back
        for (let iz = 0; iz < nz; iz++) {
          const idx = (iz * ny + iy) * nx + ix
          data[idx * 2] = tube[iz * 2]!
          data[idx * 2 + 1] = tube[iz * 2 + 1]!
        }
      }
    }
  }
}
