import { describe, expect, it } from 'vitest'

import { fftNd } from '@/lib/math/fft'
import {
  computeKSpaceTextures,
  float32ToFloat16,
} from '@/lib/physics/freeScalar/kSpaceOccupation'
import { computeOmegaK } from '@/lib/physics/freeScalar/vacuumSpectrum'

describe('float32ToFloat16', () => {
  it('encodes 0.0 correctly', () => {
    expect(float32ToFloat16(0.0)).toBe(0)
  })

  it('encodes 1.0 correctly (0x3C00)', () => {
    expect(float32ToFloat16(1.0)).toBe(0x3c00)
  })

  it('encodes -1.0 correctly (0xBC00)', () => {
    expect(float32ToFloat16(-1.0)).toBe(0xbc00)
  })

  it('encodes Infinity correctly', () => {
    expect(float32ToFloat16(Infinity)).toBe(0x7c00)
  })

  it('encodes -Infinity correctly', () => {
    expect(float32ToFloat16(-Infinity)).toBe(0xfc00)
  })

  it('preserves approximate value for 0.5', () => {
    const f16 = float32ToFloat16(0.5)
    // 0.5 = 0x3800 in half float
    expect(f16).toBe(0x3800)
  })
})

describe('computeKSpaceTextures', () => {
  it('returns correctly shaped output arrays for a 3D grid', () => {
    const gridSize = [4, 4, 4]
    const spacing = [1.0, 1.0, 1.0]
    const totalSites = 64
    const phi = new Float32Array(totalSites)
    const pi = new Float32Array(totalSites)

    const { density, analysis } = computeKSpaceTextures(
      phi, pi, gridSize, spacing, 1.0, 3
    )

    // Output is 64^3 × 4 channels (rgba16float → Uint16Array)
    expect(density.length).toBe(64 * 64 * 64 * 4)
    expect(analysis.length).toBe(64 * 64 * 64 * 4)
  })

  it('produces vacuum baseline (n_k ≈ 0) for zero field', () => {
    const gridSize = [4, 4, 4]
    const spacing = [1.0, 1.0, 1.0]
    const totalSites = 64
    const phi = new Float32Array(totalSites) // all zero
    const pi = new Float32Array(totalSites)  // all zero

    const { density } = computeKSpaceTextures(
      phi, pi, gridSize, spacing, 1.0, 3
    )

    // With zero field, n_k = -0.5 (clamped to 0 in output).
    // All density values should be zero or very small
    // Check a few center voxels where data exists
    const offset = Math.floor((64 - 4) / 2)
    let maxDensity = 0
    for (let z = offset; z < offset + 4; z++) {
      for (let y = offset; y < offset + 4; y++) {
        for (let x = offset; x < offset + 4; x++) {
          const idx = (z * 64 + y) * 64 + x
          // R channel is n_k/n_k_max (or 0 if all n_k <= 0)
          const rBits = density[idx * 4]!
          // For zero field, n_k = -0.5, clamped to 0, so density should be 0
          // The f16 value of 0 is 0x0000
          if (rBits > maxDensity) maxDensity = rBits
        }
      }
    }
    // All occupation numbers should be zero (vacuum with zero field)
    expect(maxDensity).toBe(0)
  })

  it('detects a single excited mode when field is initialized to a plane wave', () => {
    // Initialize phi and pi as a single-mode excitation at k-index (1,0,0)
    const N = 4
    const gridSize = [N, N, N]
    const spacing = [1.0, 1.0, 1.0]
    const totalSites = N ** 3
    const phi = new Float32Array(totalSites)
    const pi = new Float32Array(totalSites)

    // Set up a plane wave along x: phi(x,y,z) = A * cos(2π*1*x/N)
    const A = 1.0
    for (let iz = 0; iz < N; iz++) {
      for (let iy = 0; iy < N; iy++) {
        for (let ix = 0; ix < N; ix++) {
          const idx = (iz * N + iy) * N + ix
          phi[idx] = A * Math.cos((2 * Math.PI * ix) / N)
        }
      }
    }

    const { density } = computeKSpaceTextures(
      phi, pi, gridSize, spacing, 1.0, 3
    )

    // There should be at least some non-zero occupation
    // Check that the density texture has non-zero values
    let hasNonZero = false
    for (let i = 0; i < density.length; i += 4) {
      if (density[i]! !== 0) {
        hasNonZero = true
        break
      }
    }
    expect(hasNonZero).toBe(true)
  })

  it('conserves energy: sum(n_k * omega_k) ≈ total field energy', () => {
    const N = 8
    const gridSize = [N, N]
    const spacing = [1.0, 1.0]
    const totalSites = N * N
    const mass = 0.5

    // Create a field with known energy
    const phi = new Float32Array(totalSites)
    const pi = new Float32Array(totalSites)
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const idx = iy * N + ix
        phi[idx] = 0.3 * Math.cos((2 * Math.PI * ix) / N)
        pi[idx] = 0.2 * Math.sin((2 * Math.PI * iy) / N)
      }
    }

    // Compute energy in real space: E = sum over sites of [0.5*pi^2 + 0.5*m^2*phi^2 + 0.5*|grad phi|^2]
    let realEnergy = 0
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const idx = iy * N + ix
        const p = pi[idx]!
        const f = phi[idx]!
        realEnergy += 0.5 * p * p + 0.5 * mass * mass * f * f

        // Gradient energy (periodic boundary)
        const ixp = (ix + 1) % N
        const iyp = (iy + 1) % N
        const dPhiX = phi[iy * N + ixp]! - f
        const dPhiY = phi[iyp * N + ix]! - f
        realEnergy += 0.5 * (dPhiX * dPhiX + dPhiY * dPhiY) / (spacing[0]! * spacing[0]!)
      }
    }

    // Compute energy in k-space: E_k = sum_k (n_k + 0.5) * omega_k
    const phiComplex = new Float64Array(totalSites * 2)
    const piComplex = new Float64Array(totalSites * 2)
    for (let i = 0; i < totalSites; i++) {
      phiComplex[i * 2] = phi[i]!
      piComplex[i * 2] = pi[i]!
    }
    fftNd(phiComplex, gridSize)
    fftNd(piComplex, gridSize)

    let kEnergy = 0
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const i = iy * N + ix
        const omega = computeOmegaK([ix, iy], gridSize, spacing, mass, 2)
        const phiRe = phiComplex[i * 2]!
        const phiIm = phiComplex[i * 2 + 1]!
        const piRe = piComplex[i * 2]!
        const piIm = piComplex[i * 2 + 1]!
        const phiKSq = phiRe * phiRe + phiIm * phiIm
        const piKSq = piRe * piRe + piIm * piIm
        // E_k = (|pi_k|^2 + omega_k^2 * |phi_k|^2) / (2N)
        kEnergy += (piKSq + omega * omega * phiKSq) / (2 * totalSites)
      }
    }

    // Real-space and k-space energies should match
    expect(Math.abs(realEnergy - kEnergy) / Math.max(realEnergy, 1e-10)).toBeLessThan(0.01)
  })

  it('handles N-D grids (4D → 3D marginalization)', () => {
    const gridSize = [4, 4, 4, 4]
    const spacing = [1.0, 1.0, 1.0, 1.0]
    const totalSites = 256
    const phi = new Float32Array(totalSites)
    const pi = new Float32Array(totalSites)

    // Just verify it doesn't crash and returns correct sizes
    const { density, analysis } = computeKSpaceTextures(
      phi, pi, gridSize, spacing, 1.0, 4
    )

    expect(density.length).toBe(64 * 64 * 64 * 4)
    expect(analysis.length).toBe(64 * 64 * 64 * 4)
  })
})
