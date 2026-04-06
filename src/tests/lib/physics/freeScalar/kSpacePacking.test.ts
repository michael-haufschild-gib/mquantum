/**
 * Tests for k-space packing utilities and the complex-input FFT pipeline.
 *
 * Validates:
 * - Half-float packing (packRGBA16F, packRG16F, packR16F) round-trip fidelity
 * - N-D index conversion (computeStrides, linearToNDCoords, ndToLinearIdx) invertibility
 * - computeRawKSpaceDataFromComplex produces same physics as the Float32 variant
 *
 * @module tests/lib/physics/freeScalar/kSpacePacking
 */

import { describe, expect, it } from 'vitest'

import { computeStrides, linearToNDCoords, ndToLinearIdx } from '@/lib/math/ndArray'
import {
  computeRawKSpaceData,
  computeRawKSpaceDataFromComplex,
  float32ToFloat16,
  packR16F,
  packRG16F,
  packRGBA16F,
} from '@/lib/physics/freeScalar/kSpaceOccupation'

// ─── Half-float packing ──────────────────────────────────────────────────────

describe('packRGBA16F', () => {
  it('packs 4 channels at the correct pixel offset', () => {
    const out = new Uint16Array(16) // 4 pixels * 4 channels
    packRGBA16F(out, 2, 1.0, 0.5, -1.0, 0.0)

    // Pixel 2 starts at index 8
    expect(out[8]).toBe(float32ToFloat16(1.0))
    expect(out[9]).toBe(float32ToFloat16(0.5))
    expect(out[10]).toBe(float32ToFloat16(-1.0))
    expect(out[11]).toBe(float32ToFloat16(0.0))

    // Other pixels untouched
    expect(out[0]).toBe(0)
    expect(out[4]).toBe(0)
  })
})

describe('packRG16F', () => {
  it('packs R and G, leaves B and A as zero', () => {
    const out = new Uint16Array(8) // 2 pixels
    packRG16F(out, 1, 2.0, 3.0)

    expect(out[4]).toBe(float32ToFloat16(2.0))
    expect(out[5]).toBe(float32ToFloat16(3.0))
    expect(out[6]).toBe(0) // B untouched
    expect(out[7]).toBe(0) // A untouched
  })
})

describe('packR16F', () => {
  it('packs only R channel', () => {
    const out = new Uint16Array(8) // 2 pixels
    packR16F(out, 0, 0.25)

    expect(out[0]).toBe(float32ToFloat16(0.25))
    expect(out[1]).toBe(0) // G untouched
  })
})

// ─── N-D index conversion ────────────────────────────────────────────────────

describe('computeStrides', () => {
  it('computes row-major strides for 3D grid', () => {
    const strides = computeStrides([4, 8, 16])
    // Last dimension stride = 1, second-last = 16, first = 8*16 = 128
    expect(strides).toEqual([128, 16, 1])
  })

  it('1D grid has stride [1]', () => {
    expect(computeStrides([64])).toEqual([1])
  })
})

describe('linearToNDCoords / ndToLinearIdx invertibility', () => {
  it('round-trips for all indices in a small 3D grid', () => {
    const gridSize = [3, 4, 5]
    const strides = computeStrides(gridSize)
    const totalSites = 3 * 4 * 5

    for (let i = 0; i < totalSites; i++) {
      const coords = linearToNDCoords(i, gridSize)
      const recovered = ndToLinearIdx(coords, strides)
      expect(recovered).toBe(i)
    }
  })

  it('correctly maps known 2D indices', () => {
    const gridSize = [4, 8]
    // Linear index 10 in a 4×8 grid: row=1, col=2
    const coords = linearToNDCoords(10, gridSize)
    expect(coords).toEqual([1, 2])

    const strides = computeStrides(gridSize)
    expect(ndToLinearIdx([1, 2], strides)).toBe(10)
  })
})

// ─── Complex-input FFT pipeline ──────────────────────────────────────────────

describe('computeRawKSpaceDataFromComplex', () => {
  it('produces finite n_k, kMag, omega arrays with correct dimensions', () => {
    // Validates the complex-input FFT path produces well-formed output.
    const N = 8
    const gridSize = [N, N]
    const spacing = [1.0, 1.0]
    const totalSites = N * N
    const mass = 0.5

    // Create fields as interleaved complex (re, im) pairs
    const phiComplex = new Float64Array(totalSites * 2)
    const piComplex = new Float64Array(totalSites * 2)
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const idx = iy * N + ix
        phiComplex[idx * 2] = 0.3 * Math.cos((2 * Math.PI * ix) / N)
        piComplex[idx * 2] = 0.2 * Math.sin((2 * Math.PI * iy) / N)
      }
    }

    const result = computeRawKSpaceDataFromComplex(
      phiComplex,
      piComplex,
      gridSize,
      spacing,
      mass,
      2
    )

    expect(result.totalSites).toBe(totalSites)
    expect(result.latticeDim).toBe(2)
    expect(result.nkMax).toBeGreaterThan(0)
    expect(Number.isFinite(result.nkMax)).toBe(true)
    expect(Number.isFinite(result.kMagMax)).toBe(true)
    expect(Number.isFinite(result.omegaMax)).toBe(true)
    expect(result.omegaMax).toBeGreaterThan(0)

    // All per-mode values should be finite
    for (let i = 0; i < totalSites; i++) {
      expect(Number.isFinite(result.nk[i]!)).toBe(true)
      expect(Number.isFinite(result.kMag[i]!)).toBe(true)
      expect(Number.isFinite(result.omega[i]!)).toBe(true)
    }
  })

  it('matches Float32-input version for identical field data', () => {
    // Both functions should produce the same physics. Any difference indicates
    // a bug in the complex-input path (e.g., wrong stride, missing interleave).
    const N = 8
    const gridSize = [N, N]
    const spacing = [1.0, 1.0]
    const totalSites = N * N
    const mass = 1.0

    // Create matching Float32 and Float64 interleaved data
    const phi = new Float32Array(totalSites)
    const pi = new Float32Array(totalSites)
    const phiComplex = new Float64Array(totalSites * 2)
    const piComplex = new Float64Array(totalSites * 2)

    for (let i = 0; i < totalSites; i++) {
      const val = Math.sin((2 * Math.PI * i) / totalSites)
      phi[i] = val
      pi[i] = val * 0.5
      phiComplex[i * 2] = val
      piComplex[i * 2] = val * 0.5
    }

    const resultFloat32 = computeRawKSpaceData(phi, pi, gridSize, spacing, mass, 2)
    const resultComplex = computeRawKSpaceDataFromComplex(
      phiComplex,
      piComplex,
      gridSize,
      spacing,
      mass,
      2
    )

    // n_k values should match within Float32→Float64 precision
    for (let i = 0; i < totalSites; i++) {
      expect(resultComplex.nk[i]).toBeCloseTo(resultFloat32.nk[i]!, 3)
    }

    // Aggregate quantities should match
    expect(resultComplex.nkMax).toBeCloseTo(resultFloat32.nkMax, 3)
    expect(resultComplex.kMagMax).toBeCloseTo(resultFloat32.kMagMax, 6)
    expect(resultComplex.omegaMax).toBeCloseTo(resultFloat32.omegaMax, 6)
  })
})
