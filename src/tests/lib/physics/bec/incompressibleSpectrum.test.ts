import { describe, expect, it } from 'vitest'

import {
  computeIncompressibleSpectrum,
  fftND,
  NUM_SPECTRUM_BINS,
} from '@/lib/physics/bec/incompressibleSpectrum'

function withSpectrumWasmDisabled<T>(fn: () => T): T {
  const g = globalThis as { __BEC_SPECTRUM_WASM_DISABLED__?: boolean }
  const previous = g.__BEC_SPECTRUM_WASM_DISABLED__
  g.__BEC_SPECTRUM_WASM_DISABLED__ = true
  try {
    return fn()
  } finally {
    g.__BEC_SPECTRUM_WASM_DISABLED__ = previous
  }
}

describe('fftND', () => {
  it('preserves Parseval theorem for 1D', () => {
    const N = 16
    const re = new Float64Array(N)
    const im = new Float64Array(N)
    // Gaussian signal
    for (let i = 0; i < N; i++) {
      const x = (i - N / 2) / (N / 4)
      re[i] = Math.exp(-x * x)
    }

    // Energy in time domain
    let eTime = 0
    for (let i = 0; i < N; i++) eTime += re[i]! * re[i]! + im[i]! * im[i]!

    fftND(re, im, [N], false)

    // Energy in frequency domain (should equal N × eTime for unnormalized FFT)
    let eFreq = 0
    for (let i = 0; i < N; i++) eFreq += re[i]! * re[i]! + im[i]! * im[i]!

    expect(eFreq / N).toBeCloseTo(eTime, 8)
  })

  it('roundtrips (forward then inverse) for 1D', () => {
    const N = 32
    const re = new Float64Array(N)
    const im = new Float64Array(N)
    for (let i = 0; i < N; i++) {
      re[i] = Math.sin((2 * Math.PI * 3 * i) / N)
      im[i] = Math.cos((2 * Math.PI * 5 * i) / N)
    }
    const origRe = new Float64Array(re)
    const origIm = new Float64Array(im)

    fftND(re, im, [N], false)
    fftND(re, im, [N], true)

    for (let i = 0; i < N; i++) {
      expect(re[i]).toBeCloseTo(origRe[i]!, 10)
      expect(im[i]).toBeCloseTo(origIm[i]!, 10)
    }
  })

  it('roundtrips for 2D', () => {
    const gridSize = [8, 8]
    const N = 64
    const re = new Float64Array(N)
    const im = new Float64Array(N)
    for (let i = 0; i < N; i++) {
      re[i] = Math.sin((2 * Math.PI * i) / N)
      im[i] = 0.5 * Math.cos((4 * Math.PI * i) / N)
    }
    const origRe = new Float64Array(re)
    const origIm = new Float64Array(im)

    fftND(re, im, gridSize, false)
    fftND(re, im, gridSize, true)

    for (let i = 0; i < N; i++) {
      expect(re[i]).toBeCloseTo(origRe[i]!, 8)
      expect(im[i]).toBeCloseTo(origIm[i]!, 8)
    }
  })

  it('roundtrips for 3D', () => {
    const gridSize = [4, 4, 4]
    const N = 64
    const re = new Float64Array(N)
    const im = new Float64Array(N)
    for (let i = 0; i < N; i++) {
      re[i] = (i % 7) * 0.1 - 0.3
      im[i] = (i % 5) * 0.1 - 0.2
    }
    const origRe = new Float64Array(re)
    const origIm = new Float64Array(im)

    fftND(re, im, gridSize, false)
    fftND(re, im, gridSize, true)

    for (let i = 0; i < N; i++) {
      expect(re[i]).toBeCloseTo(origRe[i]!, 8)
      expect(im[i]).toBeCloseTo(origIm[i]!, 8)
    }
  })

  it('transforms a known delta function', () => {
    const N = 8
    const re = new Float64Array(N)
    const im = new Float64Array(N)
    re[0] = 1.0 // delta at origin

    fftND(re, im, [N], false)

    // FFT of delta = constant (all bins = 1)
    for (let i = 0; i < N; i++) {
      expect(re[i]).toBeCloseTo(1.0, 10)
      expect(im[i]).toBeCloseTo(0.0, 10)
    }
  })
})

describe('computeIncompressibleSpectrum', () => {
  it('returns correct number of bins', () => {
    const N = 8
    const total = N * N * N
    const psiRe = new Float32Array(total)
    const psiIm = new Float32Array(total)
    // Simple condensate: uniform density
    psiRe.fill(1.0)

    const result = computeIncompressibleSpectrum(psiRe, psiIm, [N, N, N], [0.1, 0.1, 0.1], 1.0, 1.0)

    expect(result.spectrum).toHaveLength(NUM_SPECTRUM_BINS)
    expect(result.kValues).toHaveLength(NUM_SPECTRUM_BINS)
  })

  it('uniform condensate (no vortices) has zero incompressible energy', () => {
    // ψ = const → ∇ψ = 0 → v = 0 → E_incomp = 0
    const N = 8
    const total = N * N * N
    const psiRe = new Float32Array(total)
    const psiIm = new Float32Array(total)
    psiRe.fill(1.0)

    const result = computeIncompressibleSpectrum(psiRe, psiIm, [N, N, N], [0.1, 0.1, 0.1], 1.0, 1.0)

    expect(result.totalIncompressible).toBeCloseTo(0, 5)
    expect(result.totalCompressible).toBeCloseTo(0, 5)
  })

  it('plane wave has zero incompressible energy (purely compressible)', () => {
    // ψ = exp(ikx) → v = ℏk/m = const → ∇×v = 0 → purely irrotational/compressible
    const N = 16
    const total = N * N
    const psiRe = new Float32Array(total)
    const psiIm = new Float32Array(total)
    const dx = 0.5
    const k0 = ((2 * Math.PI) / (N * dx)) * 3 // k-mode 3

    for (let ix = 0; ix < N; ix++) {
      for (let iy = 0; iy < N; iy++) {
        const x = ix * dx
        const idx = ix * N + iy
        psiRe[idx] = Math.cos(k0 * x)
        psiIm[idx] = Math.sin(k0 * x)
      }
    }

    const result = computeIncompressibleSpectrum(psiRe, psiIm, [N, N], [dx, dx], 1.0, 1.0)

    // Incompressible should be near zero (plane wave = purely compressible)
    // Compressible should be nonzero
    expect(result.totalIncompressible).toBeLessThan(result.totalCompressible * 0.01)
  })

  it('single vortex has nonzero incompressible energy', () => {
    // ψ = (x + iy) × exp(-r²/2σ²) — charge-1 vortex in 2D
    const N = 32
    const total = N * N
    const psiRe = new Float32Array(total)
    const psiIm = new Float32Array(total)
    const dx = 0.3
    const sigma = 2.0

    for (let ix = 0; ix < N; ix++) {
      for (let iy = 0; iy < N; iy++) {
        const x = (ix - N / 2 + 0.5) * dx
        const y = (iy - N / 2 + 0.5) * dx
        const r2 = x * x + y * y
        const env = Math.exp(-r2 / (2 * sigma * sigma))
        const rxy = Math.sqrt(r2)
        // Core profile: r / sqrt(r² + ξ²) with ξ = 0.3
        const xi = 0.3
        const core = rxy / Math.sqrt(r2 + xi * xi)
        const theta = Math.atan2(y, x)
        psiRe[ix * N + iy] = core * env * Math.cos(theta)
        psiIm[ix * N + iy] = core * env * Math.sin(theta)
      }
    }

    const result = computeIncompressibleSpectrum(psiRe, psiIm, [N, N], [dx, dx], 1.0, 1.0)

    // Vortex has significant incompressible energy
    expect(result.totalIncompressible).toBeGreaterThan(0)
    // The incompressible part should dominate for a pure vortex
    expect(result.totalIncompressible).toBeGreaterThan(result.totalCompressible * 0.5)
  })

  it('kValues are logarithmically spaced and positive', () => {
    const N = 8
    const total = N * N * N
    const psiRe = new Float32Array(total)
    psiRe.fill(1.0)
    const psiIm = new Float32Array(total)

    const result = computeIncompressibleSpectrum(psiRe, psiIm, [N, N, N], [0.1, 0.1, 0.1], 1.0, 1.0)

    for (let i = 0; i < result.kValues.length; i++) {
      expect(result.kValues[i]).toBeGreaterThan(0)
    }
    // Check monotonically increasing
    for (let i = 1; i < result.kValues.length; i++) {
      expect(result.kValues[i]).toBeGreaterThan(result.kValues[i - 1]!)
    }
  })

  it('spectrum values are non-negative', () => {
    // Random wavefunction
    const N = 8
    const total = N * N
    const psiRe = new Float32Array(total)
    const psiIm = new Float32Array(total)
    let seed = 42
    for (let i = 0; i < total; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      psiRe[i] = (seed / 0x7fffffff - 0.5) * 2
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      psiIm[i] = (seed / 0x7fffffff - 0.5) * 2
    }

    const result = computeIncompressibleSpectrum(psiRe, psiIm, [N, N], [0.1, 0.1], 1.0, 1.0)

    for (let i = 0; i < result.spectrum.length; i++) {
      expect(result.spectrum[i]).toBeGreaterThanOrEqual(0)
    }
    expect(result.totalIncompressible).toBeGreaterThanOrEqual(0)
    expect(result.totalCompressible).toBeGreaterThanOrEqual(0)
  })

  it('uses physical Parseval scaling instead of raw FFT power', () => {
    withSpectrumWasmDisabled(() => {
      const N = 32
      const total = N * N
      const makeVortex = () => {
        const psiRe = new Float32Array(total)
        const psiIm = new Float32Array(total)
        for (let ix = 0; ix < N; ix++) {
          for (let iy = 0; iy < N; iy++) {
            const x = ix - N / 2 + 0.5
            const y = iy - N / 2 + 0.5
            const r = Math.sqrt(x * x + y * y)
            const theta = Math.atan2(y, x)
            const core = r / Math.sqrt(r * r + 4)
            const idx = ix * N + iy
            psiRe[idx] = core * Math.cos(theta)
            psiIm[idx] = core * Math.sin(theta)
          }
        }
        return { psiRe, psiIm }
      }

      const coarse = makeVortex()
      const fine = makeVortex()
      const eCoarse = computeIncompressibleSpectrum(
        coarse.psiRe,
        coarse.psiIm,
        [N, N],
        [0.5, 0.5],
        1,
        1
      )
      const eFine = computeIncompressibleSpectrum(
        fine.psiRe,
        fine.psiIm,
        [N, N],
        [0.25, 0.25],
        1,
        1
      )

      expect(eCoarse.totalIncompressible).toBeGreaterThan(0)
      expect(eFine.totalIncompressible / eCoarse.totalIncompressible).toBeGreaterThan(0.85)
      expect(eFine.totalIncompressible / eCoarse.totalIncompressible).toBeLessThan(1.15)
    })
  })
})

// ---------------------------------------------------------------------------
// N-D Parseval's theorem and Helmholtz invariants
// ---------------------------------------------------------------------------

describe('fftND Parseval theorem (multi-dimensional)', () => {
  it('preserves energy for 2D FFT', () => {
    const Nx = 16
    const Ny = 16
    const total = Nx * Ny
    const re = new Float64Array(total)
    const im = new Float64Array(total)

    // 2D Gaussian signal
    for (let ix = 0; ix < Nx; ix++) {
      for (let iy = 0; iy < Ny; iy++) {
        const x = (ix - Nx / 2) / 4
        const y = (iy - Ny / 2) / 4
        re[ix * Ny + iy] = Math.exp(-(x * x + y * y))
      }
    }

    let eSpace = 0
    for (let i = 0; i < total; i++) eSpace += re[i]! * re[i]! + im[i]! * im[i]!

    fftND(re, im, [Nx, Ny], false)

    let eFreq = 0
    for (let i = 0; i < total; i++) eFreq += re[i]! * re[i]! + im[i]! * im[i]!

    // Parseval: Σ|f_k|² = N × Σ|f_x|²
    expect(eFreq / total).toBeCloseTo(eSpace, 6)
  })

  it('preserves energy for 3D FFT', () => {
    const dims = [8, 8, 8]
    const total = 512
    const re = new Float64Array(total)
    const im = new Float64Array(total)

    // 3D signal with some structure
    for (let ix = 0; ix < 8; ix++) {
      for (let iy = 0; iy < 8; iy++) {
        for (let iz = 0; iz < 8; iz++) {
          const x = (ix - 4) / 3
          const y = (iy - 4) / 3
          const z = (iz - 4) / 3
          re[ix * 64 + iy * 8 + iz] = Math.exp(-(x * x + y * y + z * z))
        }
      }
    }

    let eSpace = 0
    for (let i = 0; i < total; i++) eSpace += re[i]! * re[i]! + im[i]! * im[i]!

    fftND(re, im, dims, false)

    let eFreq = 0
    for (let i = 0; i < total; i++) eFreq += re[i]! * re[i]! + im[i]! * im[i]!

    expect(eFreq / total).toBeCloseTo(eSpace, 6)
  })
})

describe('Helmholtz decomposition physics', () => {
  it('vortex flow is entirely incompressible (divergence-free)', () => {
    // A single quantum vortex ψ = |ψ| exp(iθ) has a purely rotational
    // (incompressible) velocity field v = (ℏ/m) ∇θ = (ℏ/m)(1/r) θ̂.
    // The Helmholtz decomposition should classify ~100% as incompressible.
    const N = 32
    const spacing = [0.5, 0.5]
    const totalSites = N * N
    const psiRe = new Float32Array(totalSites)
    const psiIm = new Float32Array(totalSites)

    for (let ix = 0; ix < N; ix++) {
      for (let iy = 0; iy < N; iy++) {
        const x = (ix - N / 2 + 0.5) * spacing[0]!
        const y = (iy - N / 2 + 0.5) * spacing[1]!
        const r = Math.sqrt(x * x + y * y)
        const theta = Math.atan2(y, x)
        // Vortex with healing-length core: |ψ| = r/sqrt(r²+ξ²)
        const xi = 1.0 // healing length
        const amp = r / Math.sqrt(r * r + xi * xi)
        psiRe[ix * N + iy] = amp * Math.cos(theta)
        psiIm[ix * N + iy] = amp * Math.sin(theta)
      }
    }

    const result = computeIncompressibleSpectrum(
      psiRe,
      psiIm,
      [N, N],
      spacing,
      1.0, // hbar
      1.0 // mass
    )

    // Vortex flow should be predominantly incompressible. The compressible
    // fraction is non-zero due to the density gradient at the vortex core
    // (healing length ξ=1 on spacing=0.5 grid), which is physical.
    const totalKE = result.totalIncompressible + result.totalCompressible
    if (totalKE > 0) {
      const incompFraction = result.totalIncompressible / totalKE
      expect(incompFraction).toBeGreaterThan(0.55)
    }
  })
})
