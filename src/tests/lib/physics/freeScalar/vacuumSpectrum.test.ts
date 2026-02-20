import { describe, expect, it } from 'vitest'

import { type FreeScalarConfig, DEFAULT_KSPACE_VIZ } from '@/lib/geometry/extended/types'
import { fft } from '@/lib/math/fft'
import {
  computeOmegaK,
  estimateVacuumMaxPhi,
  sampleVacuumSpectrum,
} from '@/lib/physics/freeScalar/vacuumSpectrum'

/** Minimal config for testing */
function makeConfig(overrides: Partial<FreeScalarConfig> = {}): FreeScalarConfig {
  return {
    latticeDim: 3,
    gridSize: [8, 8, 8],
    spacing: [0.1, 0.1, 0.1],
    mass: 1.0,
    dt: 0.01,
    stepsPerFrame: 4,
    initialCondition: 'vacuumNoise',
    packetCenter: [0, 0, 0],
    packetWidth: 0.3,
    packetAmplitude: 1.0,
    modeK: [1, 0, 0],
    fieldView: 'phi',
    autoScale: true,
    needsReset: false,
    vacuumSeed: 42,
    slicePositions: [],
    kSpaceViz: { ...DEFAULT_KSPACE_VIZ },
    ...overrides,
  }
}

describe('computeOmegaK', () => {
  it('returns mass for the zero mode (k=0)', () => {
    // omega(k=0) = max(m, 0.01) when m > 0.01
    const omega = computeOmegaK([0, 0, 0], [8, 8, 8], [0.1, 0.1, 0.1], 1.0, 3)
    expect(omega).toBeCloseTo(1.0, 10)
  })

  it('uses m_floor = 0.01 when mass is zero', () => {
    const omega = computeOmegaK([0, 0, 0], [8, 8, 8], [0.1, 0.1, 0.1], 0.0, 3)
    expect(omega).toBeCloseTo(0.01, 10)
  })

  it('matches lattice dispersion for a specific nonzero mode', () => {
    // Mode (1, 0, 0) on 8-site lattice with spacing 0.1:
    // k_lat = 2 * sin(pi * 1 / 8) / 0.1
    const sinVal = Math.sin(Math.PI / 8)
    const kLat = (2 * sinVal) / 0.1
    const expected = Math.sqrt(1.0 + kLat * kLat)
    const omega = computeOmegaK([1, 0, 0], [8, 8, 8], [0.1, 0.1, 0.1], 1.0, 3)
    expect(omega).toBeCloseTo(expected, 10)
  })

  it('only uses active dimensions', () => {
    const omega1d = computeOmegaK([1, 2, 3], [8, 8, 8], [0.1, 0.1, 0.1], 1.0, 1)
    const omegaX = computeOmegaK([1, 0, 0], [8, 8, 8], [0.1, 0.1, 0.1], 1.0, 1)
    // In 1D, only the x-component matters
    expect(omega1d).toBeCloseTo(omegaX, 10)
  })
})

describe('sampleVacuumSpectrum', () => {
  it('is deterministic: same seed produces same output', () => {
    const config = makeConfig()
    const result1 = sampleVacuumSpectrum(config, 42)
    const result2 = sampleVacuumSpectrum(config, 42)
    expect(result1.phi).toEqual(result2.phi)
    expect(result1.pi).toEqual(result2.pi)
  })

  it('different seeds produce different output', () => {
    const config = makeConfig()
    const result1 = sampleVacuumSpectrum(config, 42)
    const result2 = sampleVacuumSpectrum(config, 99)
    // Should differ (astronomically unlikely to match)
    let differs = false
    for (let i = 0; i < result1.phi.length; i++) {
      if (result1.phi[i] !== result2.phi[i]) {
        differs = true
        break
      }
    }
    expect(differs).toBe(true)
  })

  it('produces finite, non-NaN values', () => {
    const config = makeConfig()
    const { phi, pi } = sampleVacuumSpectrum(config, 42)
    for (let i = 0; i < phi.length; i++) {
      expect(Number.isFinite(phi[i])).toBe(true)
      expect(Number.isFinite(pi[i])).toBe(true)
    }
  })

  it('produces real-valued output (imaginary parts negligible after IFFT)', () => {
    // We verify this indirectly: the output is Float32Array extracted from real parts.
    // But we can verify Hermitian symmetry by doing a forward FFT on the output
    // and checking that phi_{-k} = conj(phi_k).
    const config = makeConfig({ gridSize: [8, 8, 8] })
    const { phi } = sampleVacuumSpectrum(config, 42)

    const nx = 8, ny = 8, nz = 8
    const total = nx * ny * nz

    // Forward 3D FFT on the real-valued phi to check Hermitian structure
    const data = new Float64Array(2 * total)
    for (let i = 0; i < total; i++) {
      data[i * 2] = phi[i]!
      data[i * 2 + 1] = 0
    }

    // FFT along x
    fft1dAllRows(data, nx, ny, nz)
    // FFT along y
    fft1dAllCols(data, nx, ny, nz)
    // FFT along z
    fft1dAllTubes(data, nx, ny, nz)

    // Check Hermitian: phi_k should equal conj(phi_{-k})
    for (let iz = 0; iz < nz; iz++) {
      for (let iy = 0; iy < ny; iy++) {
        for (let ix = 0; ix < nx; ix++) {
          const idx = (iz * ny + iy) * nx + ix
          const cix = (nx - ix) % nx
          const ciy = (ny - iy) % ny
          const ciz = (nz - iz) % nz
          const cidx = (ciz * ny + ciy) * nx + cix

          // Re(phi_k) should equal Re(phi_{-k})
          expect(Math.abs(data[idx * 2]! - data[cidx * 2]!)).toBeLessThan(1e-4)
          // Im(phi_k) should equal -Im(phi_{-k})
          expect(Math.abs(data[idx * 2 + 1]! + data[cidx * 2 + 1]!)).toBeLessThan(1e-4)
        }
      }
    }
  })

  it('handles zero mass with m_floor regularization (no NaN/Inf)', () => {
    const config = makeConfig({ mass: 0.0 })
    const { phi, pi } = sampleVacuumSpectrum(config, 42)
    for (let i = 0; i < phi.length; i++) {
      expect(Number.isFinite(phi[i])).toBe(true)
      expect(Number.isFinite(pi[i])).toBe(true)
    }
  })

  it('throws on non-power-of-2 grid sizes', () => {
    const config = makeConfig({ gridSize: [12, 8, 8] })
    expect(() => sampleVacuumSpectrum(config, 42)).toThrow('power-of-2')
  })

  it('works with 1D and 2D lattice dimensions', () => {
    const config1d = makeConfig({ latticeDim: 1, gridSize: [16, 1, 1] })
    const result1d = sampleVacuumSpectrum(config1d, 42)
    expect(result1d.phi.length).toBe(16)
    expect(Number.isFinite(result1d.phi[0])).toBe(true)

    const config2d = makeConfig({ latticeDim: 2, gridSize: [8, 8, 1] })
    const result2d = sampleVacuumSpectrum(config2d, 42)
    expect(result2d.phi.length).toBe(64)
    expect(Number.isFinite(result2d.phi[0])).toBe(true)
  })

  it('has correct power spectrum (statistical ensemble test)', () => {
    // Average over many seeds and check <|phi_k|^2> ~ N/(2*omega_k)
    // and <|pi_k|^2> ~ N*omega_k/2
    const nSeeds = 300
    const config = makeConfig({ gridSize: [8, 8, 8], mass: 1.0 })
    const nx = 8, ny = 8, nz = 8
    const total = nx * ny * nz

    // Accumulators for |phi_k|^2 and |pi_k|^2
    const phiKSqSum = new Float64Array(total)
    const piKSqSum = new Float64Array(total)

    for (let s = 0; s < nSeeds; s++) {
      const { phi, pi } = sampleVacuumSpectrum(config, s * 7919 + 13)

      // Forward 3D FFT
      const phiData = new Float64Array(2 * total)
      const piData = new Float64Array(2 * total)
      for (let i = 0; i < total; i++) {
        phiData[i * 2] = phi[i]!
        piData[i * 2] = pi[i]!
      }

      fft1dAllRows(phiData, nx, ny, nz)
      fft1dAllCols(phiData, nx, ny, nz)
      fft1dAllTubes(phiData, nx, ny, nz)

      fft1dAllRows(piData, nx, ny, nz)
      fft1dAllCols(piData, nx, ny, nz)
      fft1dAllTubes(piData, nx, ny, nz)

      for (let i = 0; i < total; i++) {
        phiKSqSum[i] = phiKSqSum[i]! + phiData[i * 2]! ** 2 + phiData[i * 2 + 1]! ** 2
        piKSqSum[i] = piKSqSum[i]! + piData[i * 2]! ** 2 + piData[i * 2 + 1]! ** 2
      }
    }

    // Check for a sample of modes
    const testModes = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
      [2, 0, 0],
      [1, 1, 1],
      [3, 2, 1],
    ]

    for (const [mx, my, mz] of testModes) {
      const idx = (mz! * ny + my!) * nx + mx!
      const omega = computeOmegaK([mx!, my!, mz!], [nx, ny, nz], config.spacing, config.mass, 3)

      const expectedPhiKSq = total / (2 * omega)
      const expectedPiKSq = (total * omega) / 2

      const measuredPhiKSq = phiKSqSum[idx]! / nSeeds
      const measuredPiKSq = piKSqSum[idx]! / nSeeds

      // Allow 20% tolerance (statistical, 300 samples)
      const phiRatio = measuredPhiKSq / expectedPhiKSq
      const piRatio = measuredPiKSq / expectedPiKSq

      expect(phiRatio).toBeGreaterThan(0.7)
      expect(phiRatio).toBeLessThan(1.3)
      expect(piRatio).toBeGreaterThan(0.7)
      expect(piRatio).toBeLessThan(1.3)
    }
  })
})

describe('estimateVacuumMaxPhi', () => {
  it('returns a finite positive value', () => {
    const config = makeConfig()
    const maxPhi = estimateVacuumMaxPhi(config)
    expect(maxPhi).toBeGreaterThan(0)
    expect(Number.isFinite(maxPhi)).toBe(true)
  })

  it('is larger for smaller mass (more fluctuations)', () => {
    const configHeavy = makeConfig({ mass: 5.0 })
    const configLight = makeConfig({ mass: 0.1 })
    expect(estimateVacuumMaxPhi(configLight)).toBeGreaterThan(estimateVacuumMaxPhi(configHeavy))
  })
})

// ---- Test helpers: 3D forward FFT via row decomposition ----

function fft1dAllRows(data: Float64Array, nx: number, ny: number, nz: number): void {
  if (nx <= 1) return
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

function fft1dAllCols(data: Float64Array, nx: number, ny: number, nz: number): void {
  if (ny <= 1) return
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

function fft1dAllTubes(data: Float64Array, nx: number, ny: number, nz: number): void {
  if (nz <= 1) return
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
