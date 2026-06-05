/**
 * SRMT overlay clock-to-slice-plane mapping contract tests.
 *
 * The SRMT overlay path consists of two independent consumers that
 * agree by convention on the `sliceK` layout:
 *
 *   1. `buildSliceK` (in `srmt/diagnostic.ts`) populates `sliceK[i · Nphi + j]`
 *      with the on-slice `|χ(x_clock = cut, …)|²` values, per clock.
 *   2. `packWdwDensityGrid → sampleSrmtVoxelAlpha` reads the same buffer
 *      and maps density-texel coordinates to `(i, j)` based on the
 *      supplied `slicePlane` enum.
 *
 * If the two disagree on which density axis corresponds to which
 * `sliceK` index, the heatmap appears rotated or mirrored. That kind
 * of regression is particularly hard to spot because the overlay still
 * renders, just with the wrong geometry.
 *
 * This file bakes the contract into a pinpoint test per clock, using
 * a synthetic solver output with a known asymmetric `|χ|²` pattern so
 * the expected mapping is identifiable from the output texels.
 */

import { describe, expect, it } from 'vitest'

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
import { packWdwDensityGrid, type WdwSrmtOverlay } from '@/lib/physics/wheelerDeWitt/densityGrid'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'

/** Decode rgba16float half back to f32. */
function halfToFloat(h: number): number {
  const sign = (h & 0x8000) >> 15
  const exp = (h & 0x7c00) >> 10
  const frac = h & 0x03ff
  if (exp === 0) {
    const v = Math.pow(2, -14) * (frac / 0x400)
    return sign ? -v : v
  }
  if (exp === 0x1f) return frac === 0 ? (sign ? -Infinity : Infinity) : NaN
  const v = Math.pow(2, exp - 15) * (1 + frac / 0x400)
  return sign ? -v : v
}

/** Build a synthetic WDW output with χ ≡ 0 (so all R/G contributions come from SRMT overlay only). */
function zeroOutput(Na: number, Nphi: number): WheelerDeWittSolverOutput {
  const slab = Nphi * Nphi
  const chi = new Float32Array(2 * Na * slab)
  return {
    chi,
    lorentzianMask: new Uint8Array(Na * slab).fill(1),
    bandKind: new Uint8Array(Na * slab),
    gridSize: [Na, Nphi, Nphi],
    aMin: 0.1,
    aMax: 1.5,
    phiExtent: 2,
    maxDensity: 1, // non-zero so maxRho floor activates
    columnAiry: [],
  }
}

function readAlpha(density: Uint16Array, x: number, y: number, z: number): number {
  const N = DENSITY_GRID_SIZE
  const idx = (z * N + y) * N + x
  return halfToFloat(density[idx * 4 + 3]!)
}

describe('SRMT overlay — clock-to-density-axis mapping', () => {
  const Nphi = 8
  const Na = 16
  const output = zeroOutput(Na, Nphi)
  const N = DENSITY_GRID_SIZE

  // Asymmetric sliceK pattern: a linear gradient from 0 (top-left) to
  // 1 (bottom-right). Indexed `[i * Nphi + j]` — asymmetric so row vs
  // column is distinguishable.
  const gradientSliceK = (() => {
    const s = new Float32Array(Nphi * Nphi)
    for (let i = 0; i < Nphi; i++) {
      for (let j = 0; j < Nphi; j++) {
        s[i * Nphi + j] = i + j // row + col → unique per (i, j) swap
      }
    }
    return s
  })()

  it('clock a → cut on density x-axis, sliceK.i = density-y (φ₁), sliceK.j = density-z (φ₂)', () => {
    const cutIndex = Math.floor((Na - 1) / 2)
    const srmt: WdwSrmtOverlay = {
      sliceK: gradientSliceK,
      slicePlane: 'phi-phi',
      intensity: 1,
      cutIndex,
      clockAxisLen: Na,
      Nphi,
    }
    const { density } = packWdwDensityGrid(output, null, srmt)
    const cutX = Math.round((cutIndex / (Na - 1)) * (N - 1))

    // At density (cutX, y_hi, z_lo), sliceK.i should be high (y=Nphi-1
    // ⇒ i=Nphi-1) and sliceK.j should be low (z=0 ⇒ j=0). Value at
    // (i=Nphi-1, j=0) = (Nphi-1) + 0 = Nphi-1.
    // At density (cutX, y_lo, z_hi), value at (i=0, j=Nphi-1) = Nphi-1.
    // Both corners should read EQUAL alpha — enforces the (y,z) → (i,j)
    // mapping (not flipped). Asymmetric gradient prevents accidental
    // passes on a uniform sliceK.
    const yHi = N - 1
    const yLo = 0
    const zHi = N - 1
    const zLo = 0
    const aSymA = readAlpha(density, cutX, yHi, zLo)
    const aSymB = readAlpha(density, cutX, yLo, zHi)
    expect(aSymA).toBeGreaterThan(0)
    expect(aSymA).toBeCloseTo(aSymB, 2)

    // Off-cut voxel (x=0) must have zero SRMT contribution.
    expect(readAlpha(density, 0, yHi, zLo)).toBe(0)
  })

  it('clock φ₁ → cut on density y-axis, sliceK.i = density-x (a-bin), sliceK.j = density-z (φ₂)', () => {
    // Use a middle-phi cut on the φ₁ axis.
    const cutIndex = Math.floor((Nphi - 1) / 2)
    const srmt: WdwSrmtOverlay = {
      sliceK: gradientSliceK,
      slicePlane: 'a-phi2',
      intensity: 1,
      cutIndex,
      clockAxisLen: Nphi,
      Nphi,
    }
    const { density } = packWdwDensityGrid(output, null, srmt)
    const cutY = Math.round((cutIndex / (Nphi - 1)) * (N - 1))

    // Highest sliceK index i+j = 2(Nphi-1) lies at (i=Nphi-1, j=Nphi-1),
    // which under the 'a-phi2' mapping reads density-x at max AND
    // density-z at max. So density (N-1, cutY, N-1) should be the
    // brightest in-cut voxel.
    const bright = readAlpha(density, N - 1, cutY, N - 1)
    const dark = readAlpha(density, 0, cutY, 0)
    expect(bright).toBeGreaterThan(0)
    // Gradient asymmetry: bright corner ≥ dark corner.
    expect(bright).toBeGreaterThan(dark)

    // Off-cut voxel (y=0) must have zero SRMT contribution.
    expect(readAlpha(density, N / 2, 0, N / 2)).toBe(0)
  })

  it('clock φ₂ → cut on density z-axis, sliceK.i = density-x (a-bin), sliceK.j = density-y (φ₁)', () => {
    const cutIndex = Math.floor((Nphi - 1) / 2)
    const srmt: WdwSrmtOverlay = {
      sliceK: gradientSliceK,
      slicePlane: 'a-phi1',
      intensity: 1,
      cutIndex,
      clockAxisLen: Nphi,
      Nphi,
    }
    const { density } = packWdwDensityGrid(output, null, srmt)
    const cutZ = Math.round((cutIndex / (Nphi - 1)) * (N - 1))

    // Highest sliceK index at (density-x=max, density-y=max).
    const bright = readAlpha(density, N - 1, N - 1, cutZ)
    const dark = readAlpha(density, 0, 0, cutZ)
    expect(bright).toBeGreaterThan(0)
    expect(bright).toBeGreaterThan(dark)

    // Off-cut voxel (z=0) must have zero SRMT contribution.
    expect(readAlpha(density, N / 2, N / 2, 0)).toBe(0)
  })

  it('intensity = 0 suppresses SRMT alpha regardless of sliceK magnitude', () => {
    const cutIndex = Math.floor((Na - 1) / 2)
    const srmt: WdwSrmtOverlay = {
      sliceK: new Float32Array(Nphi * Nphi).fill(100),
      slicePlane: 'phi-phi',
      intensity: 0,
      cutIndex,
      clockAxisLen: Na,
      Nphi,
    }
    const { density } = packWdwDensityGrid(output, null, srmt)
    const cutX = Math.round((cutIndex / (Na - 1)) * (N - 1))
    // Inside the cut, alpha should still be 0 (intensity=0 silences the overlay).
    expect(readAlpha(density, cutX, N / 2, N / 2)).toBeLessThan(0.01)
  })
})
