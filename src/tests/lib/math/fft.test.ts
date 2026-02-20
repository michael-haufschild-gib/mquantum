import { describe, expect, it } from 'vitest'

import { fft, fftNd, ifft, ifft3d, ifftNd } from '@/lib/math/fft'

const TOL = 1e-10

/** Helper: check two interleaved complex arrays are approximately equal */
function expectComplexClose(a: Float64Array, b: Float64Array, tol = TOL) {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i++) {
    expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(tol)
  }
}

describe('fft (1D forward)', () => {
  it('transforms a delta function to a constant', () => {
    // x = [1, 0, 0, 0] -> X = [1, 1, 1, 1]
    const data = new Float64Array([1, 0, 0, 0, 0, 0, 0, 0])
    fft(data, 4)
    const expected = new Float64Array([1, 0, 1, 0, 1, 0, 1, 0])
    expectComplexClose(data, expected)
  })

  it('transforms a constant to a delta (scaled by N)', () => {
    // x = [1, 1, 1, 1] -> X = [4, 0, 0, 0]
    const data = new Float64Array([1, 0, 1, 0, 1, 0, 1, 0])
    fft(data, 4)
    const expected = new Float64Array([4, 0, 0, 0, 0, 0, 0, 0])
    expectComplexClose(data, expected)
  })

  it('handles N=1 (no-op)', () => {
    const data = new Float64Array([3.14, 2.72])
    fft(data, 1)
    expect(data[0]).toBeCloseTo(3.14)
    expect(data[1]).toBeCloseTo(2.72)
  })

  it('satisfies Parseval theorem (energy conservation)', () => {
    const n = 16
    const data = new Float64Array(2 * n)
    // Fill with known signal
    for (let i = 0; i < n; i++) {
      data[i * 2] = Math.sin((2 * Math.PI * 3 * i) / n)
      data[i * 2 + 1] = 0
    }

    // Sum |x|^2 in time domain
    let timeEnergy = 0
    for (let i = 0; i < n; i++) {
      timeEnergy += data[i * 2]! ** 2 + data[i * 2 + 1]! ** 2
    }

    fft(data, n)

    // Sum |X|^2 in frequency domain and divide by N (Parseval)
    let freqEnergy = 0
    for (let i = 0; i < n; i++) {
      freqEnergy += data[i * 2]! ** 2 + data[i * 2 + 1]! ** 2
    }
    freqEnergy /= n

    expect(Math.abs(timeEnergy - freqEnergy)).toBeLessThan(TOL)
  })
})

describe('ifft (1D inverse)', () => {
  it('inverts forward FFT (roundtrip)', () => {
    const n = 8
    const original = new Float64Array(2 * n)
    for (let i = 0; i < n; i++) {
      original[i * 2] = Math.cos((2 * Math.PI * i) / n) + 0.5 * Math.sin((4 * Math.PI * i) / n)
      original[i * 2 + 1] = 0
    }

    const data = new Float64Array(original)
    fft(data, n)
    ifft(data, n)

    expectComplexClose(data, original)
  })

  it('transforms constant spectrum to delta (with 1/N normalization)', () => {
    // X = [1, 1, 1, 1] -> x = [1, 0, 0, 0] via IFFT (1/N * N = 1 at index 0)
    const data = new Float64Array([1, 0, 1, 0, 1, 0, 1, 0])
    ifft(data, 4)
    const expected = new Float64Array([1, 0, 0, 0, 0, 0, 0, 0])
    expectComplexClose(data, expected)
  })
})

describe('ifft3d', () => {
  it('roundtrips a 4x4x4 signal through 3D FFT/IFFT', () => {
    const nx = 4, ny = 4, nz = 4
    const total = nx * ny * nz
    const original = new Float64Array(2 * total)

    // Fill with a structured signal
    for (let iz = 0; iz < nz; iz++) {
      for (let iy = 0; iy < ny; iy++) {
        for (let ix = 0; ix < nx; ix++) {
          const idx = (iz * ny + iy) * nx + ix
          original[idx * 2] = Math.sin((2 * Math.PI * ix) / nx) * Math.cos((2 * Math.PI * iy) / ny)
          original[idx * 2 + 1] = 0
        }
      }
    }

    // Forward 3D FFT via row decomposition
    const data = new Float64Array(original)
    fft3dForward(data, nx, ny, nz)

    // Inverse 3D FFT
    ifft3d(data, nx, ny, nz)

    expectComplexClose(data, original)
  })

  it('throws on non-power-of-2 dimensions', () => {
    const data = new Float64Array(2 * 6 * 4 * 4)
    expect(() => ifft3d(data, 6, 4, 4)).toThrow('power-of-2')
    expect(() => ifft3d(data, 4, 6, 4)).toThrow('power-of-2')
    expect(() => ifft3d(data, 4, 4, 6)).toThrow('power-of-2')
  })
})

describe('fftNd (N-dimensional forward)', () => {
  it('roundtrips a 4x4x4 signal through fftNd/ifftNd', () => {
    const dims = [4, 4, 4]
    const total = 64
    const original = new Float64Array(2 * total)

    for (let iz = 0; iz < 4; iz++) {
      for (let iy = 0; iy < 4; iy++) {
        for (let ix = 0; ix < 4; ix++) {
          const idx = (iz * 16 + iy * 4 + ix)
          original[idx * 2] = Math.sin((2 * Math.PI * ix) / 4) * Math.cos((2 * Math.PI * iy) / 4)
          original[idx * 2 + 1] = 0
        }
      }
    }

    const data = new Float64Array(original)
    fftNd(data, dims)
    ifftNd(data, dims)

    expectComplexClose(data, original)
  })

  it('roundtrips a 2D signal (8x4)', () => {
    const dims = [8, 4]
    const total = 32
    const original = new Float64Array(2 * total)

    for (let iy = 0; iy < 4; iy++) {
      for (let ix = 0; ix < 8; ix++) {
        const idx = iy * 8 + ix
        original[idx * 2] = Math.cos((2 * Math.PI * 2 * ix) / 8) + Math.sin((2 * Math.PI * iy) / 4)
      }
    }

    const data = new Float64Array(original)
    fftNd(data, dims)
    ifftNd(data, dims)

    expectComplexClose(data, original)
  })

  it('satisfies Parseval energy conservation for N-D FFT', () => {
    const dims = [4, 4, 4]
    const total = 64
    const data = new Float64Array(2 * total)

    for (let i = 0; i < total; i++) {
      data[i * 2] = Math.sin((2 * Math.PI * 3 * i) / total)
    }

    let timeEnergy = 0
    for (let i = 0; i < total; i++) {
      timeEnergy += data[i * 2]! ** 2 + data[i * 2 + 1]! ** 2
    }

    fftNd(data, dims)

    let freqEnergy = 0
    for (let i = 0; i < total; i++) {
      freqEnergy += data[i * 2]! ** 2 + data[i * 2 + 1]! ** 2
    }
    freqEnergy /= total

    expect(Math.abs(timeEnergy - freqEnergy)).toBeLessThan(TOL)
  })

  it('throws on non-power-of-2 dimensions', () => {
    const data = new Float64Array(2 * 6 * 4)
    expect(() => fftNd(data, [6, 4])).toThrow('power-of-2')
  })

  it('is a no-op for empty dims', () => {
    const data = new Float64Array([3.0, 1.0])
    fftNd(data, [])
    expect(data[0]).toBeCloseTo(3.0)
    expect(data[1]).toBeCloseTo(1.0)
  })

  it('matches manual 1D fft for a 1D signal', () => {
    const n = 8
    const dataA = new Float64Array(2 * n)
    const dataB = new Float64Array(2 * n)
    for (let i = 0; i < n; i++) {
      dataA[i * 2] = Math.cos((2 * Math.PI * i) / n)
      dataB[i * 2] = Math.cos((2 * Math.PI * i) / n)
    }

    fft(dataA, n)
    fftNd(dataB, [n])

    expectComplexClose(dataA, dataB)
  })
})

describe('fft throws on invalid input', () => {
  it('rejects non-power-of-2 sizes', () => {
    const data = new Float64Array(2 * 6)
    expect(() => fft(data, 6)).toThrow('power-of-2')
  })

  it('rejects size 0', () => {
    const data = new Float64Array(0)
    expect(() => fft(data, 0)).toThrow('power-of-2')
  })
})

/**
 * Helper: forward 3D FFT via row decomposition (used only for testing roundtrip).
 */
function fft3dForward(data: Float64Array, nx: number, ny: number, nz: number): void {
  // FFT along x
  if (nx > 1) {
    const row = new Float64Array(2 * nx)
    for (let iz = 0; iz < nz; iz++) {
      for (let iy = 0; iy < ny; iy++) {
        const base = (iz * ny + iy) * nx
        for (let ix = 0; ix < nx; ix++) {
          row[ix * 2] = data[(base + ix) * 2]!
          row[ix * 2 + 1] = data[(base + ix) * 2 + 1]!
        }
        fft(row, nx)
        for (let ix = 0; ix < nx; ix++) {
          data[(base + ix) * 2] = row[ix * 2]!
          data[(base + ix) * 2 + 1] = row[ix * 2 + 1]!
        }
      }
    }
  }

  // FFT along y
  if (ny > 1) {
    const col = new Float64Array(2 * ny)
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        for (let iy = 0; iy < ny; iy++) {
          const idx = (iz * ny + iy) * nx + ix
          col[iy * 2] = data[idx * 2]!
          col[iy * 2 + 1] = data[idx * 2 + 1]!
        }
        fft(col, ny)
        for (let iy = 0; iy < ny; iy++) {
          const idx = (iz * ny + iy) * nx + ix
          data[idx * 2] = col[iy * 2]!
          data[idx * 2 + 1] = col[iy * 2 + 1]!
        }
      }
    }
  }

  // FFT along z
  if (nz > 1) {
    const tube = new Float64Array(2 * nz)
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        for (let iz = 0; iz < nz; iz++) {
          const idx = (iz * ny + iy) * nx + ix
          tube[iz * 2] = data[idx * 2]!
          tube[iz * 2 + 1] = data[idx * 2 + 1]!
        }
        fft(tube, nz)
        for (let iz = 0; iz < nz; iz++) {
          const idx = (iz * ny + iy) * nx + ix
          data[idx * 2] = tube[iz * 2]!
          data[idx * 2 + 1] = tube[iz * 2 + 1]!
        }
      }
    }
  }
}
