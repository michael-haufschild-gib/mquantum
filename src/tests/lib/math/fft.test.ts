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
    const nx = 4,
      ny = 4,
      nz = 4
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
          const idx = iz * 16 + iy * 4 + ix
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

  it('throws on non-positive or non-integer dimensions', () => {
    const data = new Float64Array(2 * 4 * 4)
    expect(() => fftNd(data, [0, 4])).toThrow('positive integer')
    expect(() => fftNd(data, [2.5, 4])).toThrow('positive integer')
    expect(() => fftNd(data, [-4, 4])).toThrow('positive integer')
  })

  it('throws when data buffer is too small for the provided grid', () => {
    const tooSmall = new Float64Array(2 * 15) // one complex sample short for 4x4
    expect(() => fftNd(tooSmall, [4, 4])).toThrow('data length too small')
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

  it('rejects non-integer sizes', () => {
    const data = new Float64Array(8)
    expect(() => fft(data, 2.5)).toThrow('power-of-2')
  })

  it('rejects undersized buffers', () => {
    const data = new Float64Array(6) // needs at least 8 values for n=4 complex points
    expect(() => fft(data, 4)).toThrow('data length too small')
  })
})

describe('fft linearity', () => {
  it('FFT(a*x + b*y) = a*FFT(x) + b*FFT(y)', () => {
    const n = 8
    const a = 2.5
    const b = -1.3

    // Create two signals
    const x = new Float64Array(2 * n)
    const y = new Float64Array(2 * n)
    for (let i = 0; i < n; i++) {
      x[i * 2] = Math.cos((2 * Math.PI * i) / n)
      y[i * 2] = Math.sin((2 * Math.PI * 2 * i) / n)
    }

    // FFT(a*x + b*y)
    const combined = new Float64Array(2 * n)
    for (let i = 0; i < 2 * n; i++) {
      combined[i] = a * x[i]! + b * y[i]!
    }
    fft(combined, n)

    // a*FFT(x) + b*FFT(y)
    const xCopy = new Float64Array(x)
    const yCopy = new Float64Array(y)
    fft(xCopy, n)
    fft(yCopy, n)
    const expected = new Float64Array(2 * n)
    for (let i = 0; i < 2 * n; i++) {
      expected[i] = a * xCopy[i]! + b * yCopy[i]!
    }

    expectComplexClose(combined, expected)
  })
})

describe('fft complex-valued signals', () => {
  it('roundtrips a fully complex signal', () => {
    const n = 16
    const original = new Float64Array(2 * n)
    for (let i = 0; i < n; i++) {
      original[i * 2] = Math.cos((2 * Math.PI * i) / n) // real part
      original[i * 2 + 1] = Math.sin((2 * Math.PI * 3 * i) / n) // imaginary part
    }

    const data = new Float64Array(original)
    fft(data, n)
    ifft(data, n)

    expectComplexClose(data, original)
  })
})

describe('fftNd non-uniform grid sizes', () => {
  it('roundtrips a 4x8 signal (non-square 2D)', () => {
    const dims = [4, 8]
    const total = 32
    const original = new Float64Array(2 * total)
    for (let i = 0; i < total; i++) {
      original[i * 2] = Math.sin((2 * Math.PI * i) / total)
    }

    const data = new Float64Array(original)
    fftNd(data, dims)
    ifftNd(data, dims)

    expectComplexClose(data, original)
  })

  it('roundtrips a 2x4x8 signal (non-uniform 3D)', () => {
    const dims = [2, 4, 8]
    const total = 64
    const original = new Float64Array(2 * total)
    for (let i = 0; i < total; i++) {
      original[i * 2] = Math.cos((2 * Math.PI * 5 * i) / total)
      original[i * 2 + 1] = Math.sin((2 * Math.PI * 7 * i) / total)
    }

    const data = new Float64Array(original)
    fftNd(data, dims)
    ifftNd(data, dims)

    expectComplexClose(data, original)
  })

  it('roundtrips a 4D signal (2x2x4x4)', () => {
    const dims = [2, 2, 4, 4]
    const total = 64
    const original = new Float64Array(2 * total)
    for (let i = 0; i < total; i++) {
      original[i * 2] =
        Math.sin((2 * Math.PI * i) / total) * (1 + 0.5 * Math.cos((4 * Math.PI * i) / total))
    }

    const data = new Float64Array(original)
    fftNd(data, dims)
    ifftNd(data, dims)

    expectComplexClose(data, original)
  })
})

describe('fft — Float32Array support', () => {
  it('roundtrips a Float32Array signal (lower precision)', () => {
    const n = 8
    const original = new Float32Array(2 * n)
    for (let i = 0; i < n; i++) {
      original[i * 2] = Math.cos((2 * Math.PI * i) / n)
    }

    const data = new Float32Array(original)
    fft(data, n)
    ifft(data, n)

    // Float32 has ~7 decimal digits precision, so tolerance is looser
    for (let i = 0; i < 2 * n; i++) {
      expect(Math.abs(data[i]! - original[i]!)).toBeLessThan(1e-5)
    }
  })

  it('Parseval theorem holds for Float32Array', () => {
    const n = 16
    const data = new Float32Array(2 * n)
    for (let i = 0; i < n; i++) {
      data[i * 2] = Math.sin((2 * Math.PI * 3 * i) / n)
    }

    let timeEnergy = 0
    for (let i = 0; i < n; i++) {
      timeEnergy += data[i * 2]! ** 2 + data[i * 2 + 1]! ** 2
    }

    fft(data, n)

    let freqEnergy = 0
    for (let i = 0; i < n; i++) {
      freqEnergy += data[i * 2]! ** 2 + data[i * 2 + 1]! ** 2
    }
    freqEnergy /= n

    // Float32 introduces more rounding → looser tolerance
    expect(Math.abs(timeEnergy - freqEnergy)).toBeLessThan(1e-4)
  })

  it('fftNd/ifftNd roundtrips Float32Array', () => {
    const dims = [4, 4]
    const total = 16
    const original = new Float32Array(2 * total)
    for (let i = 0; i < total; i++) {
      original[i * 2] = Math.sin((2 * Math.PI * i) / total)
    }

    const data = new Float32Array(original)
    fftNd(data, dims)
    ifftNd(data, dims)

    for (let i = 0; i < 2 * total; i++) {
      expect(Math.abs(data[i]! - original[i]!)).toBeLessThan(1e-4)
    }
  })
})

describe('fft — known DFT pairs', () => {
  it('pure cosine at frequency k produces peaks at bins k and N-k', () => {
    const n = 16
    const k = 3
    const data = new Float64Array(2 * n)
    for (let i = 0; i < n; i++) {
      data[i * 2] = Math.cos((2 * Math.PI * k * i) / n)
    }

    fft(data, n)

    // FFT of cos(2πkn/N) = (N/2)[δ(f-k) + δ(f+k)] = (N/2) at bins k and N-k
    for (let i = 0; i < n; i++) {
      const mag = Math.sqrt(data[i * 2]! ** 2 + data[i * 2 + 1]! ** 2)
      if (i === k || i === n - k) {
        expect(mag).toBeCloseTo(n / 2, 8)
      } else {
        expect(mag).toBeLessThan(1e-8)
      }
    }
  })

  it('pure sine at frequency k produces imaginary peaks at bins k and N-k', () => {
    const n = 16
    const k = 5
    const data = new Float64Array(2 * n)
    for (let i = 0; i < n; i++) {
      data[i * 2] = Math.sin((2 * Math.PI * k * i) / n)
    }

    fft(data, n)

    // FFT of sin(2πkn/N) = (N/2i)[δ(f-k) - δ(f+k)]
    // At bin k: imaginary part = -N/2, at bin N-k: imaginary part = N/2
    const magK = Math.sqrt(data[k * 2]! ** 2 + data[k * 2 + 1]! ** 2)
    const magNK = Math.sqrt(data[(n - k) * 2]! ** 2 + data[(n - k) * 2 + 1]! ** 2)
    expect(magK).toBeCloseTo(n / 2, 8)
    expect(magNK).toBeCloseTo(n / 2, 8)

    // Other bins should be zero
    for (let i = 0; i < n; i++) {
      if (i !== k && i !== n - k) {
        const mag = Math.sqrt(data[i * 2]! ** 2 + data[i * 2 + 1]! ** 2)
        expect(mag).toBeLessThan(1e-8)
      }
    }
  })

  it('time shift property: delay by m samples → multiply by exp(-i2πkm/N)', () => {
    const n = 8
    const m = 2 // shift by 2 samples
    const signal = new Float64Array(2 * n)
    const shifted = new Float64Array(2 * n)

    // Create a test signal and its shifted version
    for (let i = 0; i < n; i++) {
      signal[i * 2] = Math.cos((2 * Math.PI * i) / n) + 0.5 * Math.sin((4 * Math.PI * i) / n)
      shifted[((i + m) % n) * 2] = signal[i * 2]!
    }

    fft(signal, n)
    fft(shifted, n)

    // For each bin k, shifted[k] should be signal[k] * exp(-i2πkm/N)
    for (let k = 0; k < n; k++) {
      const phase = (-2 * Math.PI * k * m) / n
      const twiddleRe = Math.cos(phase)
      const twiddleIm = Math.sin(phase)

      // expected = signal[k] * twiddle
      const sRe = signal[k * 2]!
      const sIm = signal[k * 2 + 1]!
      const expectedRe = sRe * twiddleRe - sIm * twiddleIm
      const expectedIm = sRe * twiddleIm + sIm * twiddleRe

      expect(shifted[k * 2]).toBeCloseTo(expectedRe, 8)
      expect(shifted[k * 2 + 1]).toBeCloseTo(expectedIm, 8)
    }
  })

  it('convolution theorem: FFT(a ⊛ b) = FFT(a) · FFT(b)', () => {
    const n = 8
    const a = new Float64Array(2 * n)
    const b = new Float64Array(2 * n)
    for (let i = 0; i < n; i++) {
      a[i * 2] = i < 3 ? 1 : 0 // rectangular pulse
      b[i * 2] = Math.exp(-i * 0.5) // exponential decay
    }

    // Compute circular convolution manually
    const conv = new Float64Array(2 * n)
    for (let k = 0; k < n; k++) {
      let sumRe = 0
      for (let j = 0; j < n; j++) {
        const idx = ((k - j + n) % n) * 2
        sumRe += a[j * 2]! * b[idx]!
      }
      conv[k * 2] = sumRe
    }

    // Compute via FFT multiplication
    const aFreq = new Float64Array(a)
    const bFreq = new Float64Array(b)
    fft(aFreq, n)
    fft(bFreq, n)

    const product = new Float64Array(2 * n)
    for (let k = 0; k < n; k++) {
      const ar = aFreq[k * 2]!,
        ai = aFreq[k * 2 + 1]!
      const br = bFreq[k * 2]!,
        bi = bFreq[k * 2 + 1]!
      product[k * 2] = ar * br - ai * bi
      product[k * 2 + 1] = ar * bi + ai * br
    }
    ifft(product, n)

    for (let i = 0; i < n; i++) {
      expect(product[i * 2]).toBeCloseTo(conv[i * 2]!, 8)
    }
  })
})

describe('fft — minimal N=2 edge case', () => {
  it('transforms two-point signal correctly', () => {
    // DFT of [a, b] = [a+b, a-b]
    const data = new Float64Array([3, 0, 7, 0])
    fft(data, 2)
    expect(data[0]).toBeCloseTo(10, 10) // 3+7
    expect(data[2]).toBeCloseTo(-4, 10) // 3-7
  })

  it('roundtrips N=2 signal', () => {
    const original = new Float64Array([2.5, 1.3, -0.7, 0.4])
    const data = new Float64Array(original)
    fft(data, 2)
    ifft(data, 2)
    for (let i = 0; i < 4; i++) {
      expect(data[i]).toBeCloseTo(original[i]!, 10)
    }
  })
})

describe('fft — large N accuracy', () => {
  it('roundtrips a 1024-point signal with < 1e-10 error', () => {
    const n = 1024
    const original = new Float64Array(2 * n)
    for (let i = 0; i < n; i++) {
      original[i * 2] =
        Math.sin((2 * Math.PI * 7 * i) / n) + 0.5 * Math.cos((2 * Math.PI * 31 * i) / n)
    }

    const data = new Float64Array(original)
    fft(data, n)
    ifft(data, n)

    for (let i = 0; i < 2 * n; i++) {
      expect(Math.abs(data[i]! - original[i]!)).toBeLessThan(1e-10)
    }
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
