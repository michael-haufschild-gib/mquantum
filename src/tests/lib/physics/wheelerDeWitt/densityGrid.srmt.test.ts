/**
 * Tests for the optional SRMT overlay in `packWdwDensityGrid`.
 *
 * Contract under test:
 *   1. Without `srmtOverlay`, the alpha channel is determined entirely by
 *      the WKB streamline overlay (or 0 when both are null).
 *   2. With `srmtOverlay` supplied, the alpha channel is raised at voxels
 *      lying on the cut plane — and voxels far from the cut stay at the
 *      streamline value (zero when no streamline).
 *   3. The existing R/G/B channels (|χ|², log-density, phase) are
 *      unchanged regardless of SRMT overlay state.
 */

import { describe, expect, it } from 'vitest'

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
import { packWdwDensityGrid, type WdwSrmtOverlay } from '@/lib/physics/wheelerDeWitt/densityGrid'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'

/**
 * Decode a half-float (binary16) back into float32.
 */
function halfToFloat(h: number): number {
  const sign = (h & 0x8000) >> 15
  const exp = (h & 0x7c00) >> 10
  const frac = h & 0x03ff
  if (exp === 0) {
    const val = Math.pow(2, -14) * (frac / 0x400)
    return sign ? -val : val
  }
  if (exp === 0x1f) {
    return frac === 0 ? (sign ? -Infinity : Infinity) : Number.NaN
  }
  const val = Math.pow(2, exp - 15) * (1 + frac / 0x400)
  return sign ? -val : val
}

/** Build a simple synthetic solver output: χ = (1, 0) everywhere. */
function makeSyntheticOutput(Na: number, Nphi: number): WheelerDeWittSolverOutput {
  const slab = Nphi * Nphi
  const chi = new Float32Array(2 * Na * slab)
  for (let i = 0; i < Na * slab; i++) {
    chi[2 * i] = 1
    chi[2 * i + 1] = 0
  }
  return {
    chi,
    lorentzianMask: new Uint8Array(Na * slab).fill(1),
    bandKind: new Uint8Array(Na * slab),
    gridSize: [Na, Nphi, Nphi],
    aMin: 0.1,
    aMax: 1.5,
    phiExtent: 2,
    maxDensity: 1,
    columnAiry: [],
  }
}

/** Read the alpha channel at a given density-texel coordinate. */
function readAlpha(density: Uint16Array, x: number, y: number, z: number): number {
  const N = DENSITY_GRID_SIZE
  const idx = (z * N + y) * N + x
  return halfToFloat(density[idx * 4 + 3]!)
}
/** Read the red channel at a given density-texel coordinate. */
function readRed(density: Uint16Array, x: number, y: number, z: number): number {
  const N = DENSITY_GRID_SIZE
  const idx = (z * N + y) * N + x
  return halfToFloat(density[idx * 4]!)
}
/** Read the blue (phase) channel at a given density-texel coordinate. */
function readBlue(density: Uint16Array, x: number, y: number, z: number): number {
  const N = DENSITY_GRID_SIZE
  const idx = (z * N + y) * N + x
  return halfToFloat(density[idx * 4 + 2]!)
}

describe('packWdwDensityGrid — SRMT overlay', () => {
  const Nphi = 8
  const Na = 10
  const output = makeSyntheticOutput(Na, Nphi)

  it('leaves alpha at 0 when neither streamline nor SRMT overlays are provided', () => {
    const { density } = packWdwDensityGrid(output, null)
    // Sample a handful of voxels; all should have alpha = 0 exactly.
    const N = DENSITY_GRID_SIZE
    for (const [x, y, z] of [
      [0, 0, 0],
      [Math.floor(N / 2), Math.floor(N / 2), Math.floor(N / 2)],
      [N - 1, N - 1, N - 1],
    ] as const) {
      expect(readAlpha(density, x, y, z)).toBe(0)
    }
  })

  it('raises alpha at the cut plane when SRMT overlay is supplied', () => {
    // Uniform sliceK = 1 across all Nphi² entries. With intensity=1 and
    // log1p(1) ≈ 0.693 / 0.693 = 1, normalized sliceK = 1 everywhere.
    // Alpha in the cut-disk should be ≈ 1; alpha far from the cut plane
    // should remain at the default (0 when no streamline).
    const sliceK = new Float32Array(Nphi * Nphi).fill(1)
    const srmt: WdwSrmtOverlay = {
      sliceK,
      slicePlane: 'phi-phi',
      intensity: 1,
      cutIndex: Math.floor((Na - 1) / 2), // middle of the a axis
      clockAxisLen: Na,
      Nphi,
    }
    const { density } = packWdwDensityGrid(output, null, srmt)

    const N = DENSITY_GRID_SIZE
    const cutX = Math.round((srmt.cutIndex / (Na - 1)) * (N - 1))
    // On the cut plane (density x ≈ cutX), alpha should be near 1.
    const alphaOnCut = readAlpha(density, cutX, N / 2, N / 2)
    expect(alphaOnCut).toBeGreaterThan(0.9)

    // Far from the cut plane, alpha should remain ~0.
    const alphaFar = readAlpha(density, 0, N / 2, N / 2)
    expect(alphaFar).toBeLessThan(0.05)
  })

  it('does not change R/G/B channels between the no-overlay and SRMT-overlay cases', () => {
    const { density: baseline } = packWdwDensityGrid(output, null)
    const sliceK = new Float32Array(Nphi * Nphi).fill(1)
    const srmt: WdwSrmtOverlay = {
      sliceK,
      slicePlane: 'phi-phi',
      intensity: 0.7,
      cutIndex: 3,
      clockAxisLen: Na,
      Nphi,
    }
    const { density: withSrmt } = packWdwDensityGrid(output, null, srmt)

    const N = DENSITY_GRID_SIZE
    // Sample a few voxels on a plane that is NOT the SRMT cut — their R
    // and B channels must match the baseline exactly.
    const samples: [number, number, number][] = [
      [0, 0, 0],
      [N - 1, N - 1, N - 1],
      [Math.floor(N / 3), Math.floor(N / 3), Math.floor(N / 3)],
    ]
    for (const [x, y, z] of samples) {
      expect(readRed(withSrmt, x, y, z)).toBeCloseTo(readRed(baseline, x, y, z), 6)
      expect(readBlue(withSrmt, x, y, z)).toBeCloseTo(readBlue(baseline, x, y, z), 6)
    }
  })

  it('respects intensity scaling — zero intensity yields zero SRMT alpha contribution', () => {
    const sliceK = new Float32Array(Nphi * Nphi).fill(1)
    const srmt: WdwSrmtOverlay = {
      sliceK,
      slicePlane: 'phi-phi',
      intensity: 0, // fully suppressed
      cutIndex: Math.floor((Na - 1) / 2),
      clockAxisLen: Na,
      Nphi,
    }
    const { density } = packWdwDensityGrid(output, null, srmt)
    const N = DENSITY_GRID_SIZE
    const cutX = Math.round((srmt.cutIndex / (Na - 1)) * (N - 1))
    const alphaOnCut = readAlpha(density, cutX, N / 2, N / 2)
    expect(alphaOnCut).toBeLessThan(0.05)
  })
})
