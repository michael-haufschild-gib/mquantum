import { describe, expect, it, vi } from 'vitest'

// Heavy computation: FFTs on 8^3 grids projected to 64^3 output (262K voxels),
// plus Gaussian broadening. Runs ~10s in isolation, can exceed 20s under CI
// load with 4 parallel workers competing for CPU. Bumped to 60s after the
// `linear mode maps to [0,1] within percentile window` test at line 301 was
// observed to fail at test-collection time under peak full-suite load —
// symptom was a vitest-internal stack trace with no user-code frames, which
// is the reporter's placeholder for worker-level issues (timeout / worker
// restart). 60s keeps the budget comfortably above the 20s worst case.
vi.setConfig({ testTimeout: 60_000 })

import type { KSpaceVizConfig } from '@/lib/geometry/extended/types'
import { DEFAULT_KSPACE_VIZ, PASSTHROUGH_KSPACE_VIZ } from '@/lib/geometry/extended/types'
import {
  applyBroadening,
  applyExposureTransfer,
  buildKSpaceDisplayTextures,
  packDisplayTextures,
  projectToDisplayGrid,
} from '@/lib/physics/freeScalar/kSpaceDisplayTransforms'
import type { KSpaceRawData } from '@/lib/physics/freeScalar/kSpaceOccupation'
import { computeRawKSpaceData, OUTPUT_GRID_SIZE } from '@/lib/physics/freeScalar/kSpaceOccupation'

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create raw data from a plane wave superposition at k=(1,0,0) and k=(2,0,0)
 * with *different* amplitudes on an NxNxN grid.
 *
 * Using a single pure cosine produces two symmetric k-points (k=1 and k=N-1)
 * with byte-identical `n_k` values on every well-conditioned code path.
 * The downstream `applyExposureTransfer` percentile-window construction
 * then sees a zero range (`qLow === qHigh`) and short-circuits to the
 * "degenerate" branch, leaving values unchanged — see the dedicated
 * degenerate-range test at the bottom of this describe block. That case
 * is covered separately; this helper's job is to produce a fixture with
 * a *non-degenerate* percentile window so the remap path is exercised.
 *
 * Superposing a second mode at k=2 with a smaller amplitude gives us
 * four distinct positive `n_k` values (two pairs from the mirrored modes,
 * with the two pairs at different magnitudes), which is the minimum
 * asymmetry needed for the percentile histogram to produce a non-zero
 * range.
 */
function makeTestRawData(N: number): KSpaceRawData {
  const gridSize = [N, N, N]
  const spacing = [1.0, 1.0, 1.0]
  const totalSites = N ** 3
  const phi = new Float32Array(totalSites)
  const pi = new Float32Array(totalSites)

  const A1 = 1.0
  const A2 = 0.35
  for (let iz = 0; iz < N; iz++) {
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const idx = (iz * N + iy) * N + ix
        phi[idx] = A1 * Math.cos((2 * Math.PI * ix) / N) + A2 * Math.cos((2 * Math.PI * 2 * ix) / N)
      }
    }
  }

  return computeRawKSpaceData(phi, pi, gridSize, spacing, 1.0, 3)
}

/** Create zero-field raw data. */
function makeZeroRawData(N: number): KSpaceRawData {
  const gridSize = [N, N, N]
  const spacing = [1.0, 1.0, 1.0]
  const totalSites = N ** 3
  const phi = new Float32Array(totalSites)
  const pi = new Float32Array(totalSites)
  return computeRawKSpaceData(phi, pi, gridSize, spacing, 1.0, 3)
}

// ============================================================================
// computeRawKSpaceData
// ============================================================================

describe('computeRawKSpaceData', () => {
  it('returns correct structure with all required fields', () => {
    const raw = makeTestRawData(4)
    expect(raw.nk).toBeInstanceOf(Float64Array)
    expect(raw.kMag).toBeInstanceOf(Float64Array)
    expect(raw.omega).toBeInstanceOf(Float64Array)
    expect(raw.nk.length).toBe(64) // 4^3
    expect(raw.totalSites).toBe(64)
    expect(raw.latticeDim).toBe(3)
    expect(raw.strides.length).toBe(3)
  })

  it('produces zero nkMax for zero field', () => {
    const raw = makeZeroRawData(4)
    // n_k = -0.5 for zero field, clamped max should be 0
    expect(raw.nkMax).toBeLessThanOrEqual(0)
  })

  it('produces positive nkMax for plane wave', () => {
    const raw = makeTestRawData(8)
    expect(raw.nkMax).toBeGreaterThan(0)
  })
})

// ============================================================================
// FFT Shift
// ============================================================================

describe('projectToDisplayGrid — FFT shift', () => {
  it('with shift disabled, mode at k-index 1 maps to display offset+1', () => {
    const N = 8
    const raw = makeTestRawData(N)
    const noShift: KSpaceVizConfig = { ...PASSTHROUGH_KSPACE_VIZ, fftShiftEnabled: false }
    const grid = projectToDisplayGrid(raw, noShift)

    // Plane wave cos(2π*ix/N) excites k-coords (0,0,1) — last dim (d=2) maps to oz
    const offset = Math.floor((OUTPUT_GRID_SIZE - N) / 2)
    const centerX = offset + 0
    const centerY = offset + 0
    const peakZ = offset + 1
    const idx = (peakZ * OUTPUT_GRID_SIZE + centerY) * OUTPUT_GRID_SIZE + centerX
    expect(grid.nk[idx]).toBeGreaterThan(0)
  })

  it('with shift enabled, mode at k-index 1 maps to shifted display position', () => {
    const N = 8
    const raw = makeTestRawData(N)
    const shifted: KSpaceVizConfig = { ...PASSTHROUGH_KSPACE_VIZ, fftShiftEnabled: true }
    const grid = projectToDisplayGrid(raw, shifted)

    // With shift, kIdx = (displayIdx - offset + N/2) % N
    // DC (kIdx=0) maps to displayIdx = offset + N/2
    // Peak k-coords (0,0,1): d=0,1 DC at offset+4, d=2 peak at offset+5
    const offset = Math.floor((OUTPUT_GRID_SIZE - N) / 2)
    const shiftedCenterX = offset + Math.floor(N / 2) // DC for dim 0
    const shiftedCenterY = offset + Math.floor(N / 2) // DC for dim 1
    const shiftedPeakZ = offset + 5 // (1 + 4) % 8 = 5 for dim 2
    const idx =
      (shiftedPeakZ * OUTPUT_GRID_SIZE + shiftedCenterY) * OUTPUT_GRID_SIZE + shiftedCenterX

    // The value at the shifted position should be non-zero
    expect(grid.nk[idx]).toBeGreaterThan(0)
  })

  it('shift preserves total occupation sum', () => {
    const raw = makeTestRawData(8)

    const noShift = projectToDisplayGrid(raw, { ...PASSTHROUGH_KSPACE_VIZ, fftShiftEnabled: false })
    const withShift = projectToDisplayGrid(raw, {
      ...PASSTHROUGH_KSPACE_VIZ,
      fftShiftEnabled: true,
    })

    let sumNoShift = 0
    let sumShift = 0
    for (let i = 0; i < noShift.nk.length; i++) {
      sumNoShift += noShift.nk[i]!
      sumShift += withShift.nk[i]!
    }

    expect(Math.abs(sumNoShift - sumShift)).toBeLessThan(1e-10)
  })

  it('for latticeDim > 3, uses occupancy-weighted hidden-mode aggregation for metadata and nkOmega', () => {
    const gridSize = [2, 2, 2, 4]
    const strides = [16, 8, 4, 1]
    const totalSites = 32

    const nk = new Float64Array(totalSites)
    const kMag = new Float64Array(totalSites)
    const omega = new Float64Array(totalSites)

    // Collapsed voxel (first 3 dims = 0,0,0) has four hidden modes along dim 4.
    // Two occupied modes carry the physical signal; two zero-occupation modes
    // intentionally have large metadata to catch unweighted averaging bugs.
    nk[0] = 1
    nk[1] = 3
    nk[2] = 0
    nk[3] = 0

    kMag[0] = 1
    kMag[1] = 3
    kMag[2] = 50
    kMag[3] = 60

    omega[0] = 1
    omega[1] = 3
    omega[2] = 100
    omega[3] = 200

    const raw: KSpaceRawData = {
      nk,
      kMag,
      omega,
      nkMax: 3,
      kMagMax: 60,
      omegaMax: 200,
      totalSites,
      gridSize,
      strides,
      latticeDim: 4,
      spacing: [1, 1, 1, 1],
    }

    const grid = projectToDisplayGrid(raw, { ...PASSTHROUGH_KSPACE_VIZ, fftShiftEnabled: false })
    const offset = Math.floor((OUTPUT_GRID_SIZE - 2) / 2)
    const idx = (offset * OUTPUT_GRID_SIZE + offset) * OUTPUT_GRID_SIZE + offset

    // Expected from occupied modes only:
    // nk = 1 + 3 = 4
    // nkOmega = 1*1 + 3*3 = 10
    // omegaNorm = (10 / 4) / 200
    // kNorm = ((1*1 + 3*3) / 4) / 60
    expect(grid.nk[idx]).toBeCloseTo(4, 12)
    expect(grid.nkOmega[idx]).toBeCloseTo(10, 12)
    expect(grid.omegaNorm[idx]).toBeCloseTo(10 / 4 / 200, 12)
    expect(grid.kNorm[idx]).toBeCloseTo(10 / 4 / 60, 12)
  })
})

// ============================================================================
// Low-Dimensional Projection
// ============================================================================

describe('projectToDisplayGrid — low dimensions', () => {
  it('1D field produces non-zero values only along the X center line', () => {
    const N = 8
    const gridSize = [N]
    const spacing = [1.0]
    const totalSites = N
    const phi = new Float32Array(totalSites)
    const pi = new Float32Array(totalSites)

    // 1D plane wave along the single dimension
    for (let ix = 0; ix < N; ix++) {
      phi[ix] = Math.cos((2 * Math.PI * ix) / N)
    }

    const raw = computeRawKSpaceData(phi, pi, gridSize, spacing, 1.0, 1)
    const grid = projectToDisplayGrid(raw, { ...PASSTHROUGH_KSPACE_VIZ, fftShiftEnabled: false })

    const G = OUTPUT_GRID_SIZE
    const center = Math.floor(G / 2)
    const offset = Math.floor((G - N) / 2)

    // Voxels on the center line (y=center, z=center, x varies in active range) should have values
    let onLineNonZero = 0
    for (let ix = offset; ix < offset + N; ix++) {
      const idx = (center * G + center) * G + ix
      if (grid.nk[idx]! > 0) onLineNonZero++
    }
    expect(onLineNonZero).toBeGreaterThan(0)

    // Voxels off the center line should be zero
    // Check a Y-neighbor of a non-zero voxel
    const activeIdx = (center * G + center) * G + (offset + 1)
    const yNeighborIdx = (center * G + (center + 1)) * G + (offset + 1)
    expect(grid.nk[activeIdx]).toBeGreaterThan(0)
    expect(grid.nk[yNeighborIdx]).toBe(0)
  })

  it('preserves all 1D occupation when the lattice axis exceeds the display grid', () => {
    const N = 128
    const G = OUTPUT_GRID_SIZE
    expect(N).toBeGreaterThan(G)

    const raw: KSpaceRawData = {
      nk: new Float64Array(N).fill(1),
      kMag: new Float64Array(N),
      omega: new Float64Array(N).fill(1),
      nkMax: 1,
      kMagMax: 1,
      omegaMax: 1,
      totalSites: N,
      gridSize: [N],
      strides: [1],
      latticeDim: 1,
      spacing: [1],
    }

    const grid = projectToDisplayGrid(raw, { ...PASSTHROUGH_KSPACE_VIZ, fftShiftEnabled: false })

    let sum = 0
    for (let i = 0; i < grid.nk.length; i++) sum += grid.nk[i]!
    expect(sum).toBe(N)
  })

  it('2D field produces non-zero values only in the center Z plane', () => {
    const N = 4
    const gridSize = [N, N]
    const spacing = [1.0, 1.0]
    const totalSites = N * N
    const phi = new Float32Array(totalSites)
    const pi = new Float32Array(totalSites)

    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        phi[iy * N + ix] = Math.cos((2 * Math.PI * ix) / N)
      }
    }

    const raw = computeRawKSpaceData(phi, pi, gridSize, spacing, 1.0, 2)
    const grid = projectToDisplayGrid(raw, { ...PASSTHROUGH_KSPACE_VIZ, fftShiftEnabled: false })

    const G = OUTPUT_GRID_SIZE
    const center = Math.floor(G / 2)
    const offset = Math.floor((G - N) / 2)

    // Voxels in the center Z plane (z=center) should have values
    let inPlaneNonZero = 0
    for (let iy = offset; iy < offset + N; iy++) {
      for (let ix = offset; ix < offset + N; ix++) {
        const idx = (center * G + iy) * G + ix
        if (grid.nk[idx]! > 0) inPlaneNonZero++
      }
    }
    expect(inPlaneNonZero).toBeGreaterThan(0)

    // Voxels one Z-step away from center should be zero
    const offPlaneIdx = ((center + 1) * G + offset) * G + offset
    expect(grid.nk[offPlaneIdx]).toBe(0)
  })
})

// ============================================================================
// Exposure Transfer
// ============================================================================

describe('applyExposureTransfer', () => {
  it('linear mode maps to [0,1] within percentile window', () => {
    const raw = makeTestRawData(8)
    const grid = projectToDisplayGrid(raw, PASSTHROUGH_KSPACE_VIZ)
    const config: KSpaceVizConfig = {
      ...PASSTHROUGH_KSPACE_VIZ,
      exposureMode: 'linear',
      lowPercentile: 0,
      highPercentile: 100,
      gamma: 1.0,
    }

    applyExposureTransfer(grid, config)

    for (let i = 0; i < grid.nk.length; i++) {
      expect(grid.nk[i]).toBeGreaterThanOrEqual(0)
      expect(grid.nk[i]).toBeLessThanOrEqual(1.001) // small tolerance for float
    }
  })

  it('maps 0/100 percentile endpoints to exact output bounds', () => {
    const G = OUTPUT_GRID_SIZE
    const nk = new Float64Array(G ** 3)
    nk[0] = 1
    nk[1] = 2
    const grid = {
      nk,
      kNorm: new Float64Array(G ** 3),
      omegaNorm: new Float64Array(G ** 3),
      nkOmega: new Float64Array(G ** 3),
      nkMax: 2,
    }

    applyExposureTransfer(grid, {
      ...PASSTHROUGH_KSPACE_VIZ,
      exposureMode: 'linear',
      lowPercentile: 0,
      highPercentile: 100,
      gamma: 1,
    })

    expect(grid.nk[0]).toBe(0)
    expect(grid.nk[1]).toBe(1)
  })

  it('log mode produces monotonically increasing output for increasing input', () => {
    const G = OUTPUT_GRID_SIZE
    const outputTotal = G ** 3
    const nk = new Float64Array(outputTotal)
    const kNorm = new Float64Array(outputTotal)
    const omegaNorm = new Float64Array(outputTotal)
    const nkOmega = new Float64Array(outputTotal)

    // Place synthetic increasing values along x-axis at center
    const center = Math.floor(G / 2)
    const values = [0.001, 0.01, 0.1, 1.0, 10.0]
    for (let i = 0; i < values.length; i++) {
      const idx = (center * G + center) * G + (center - 2 + i)
      nk[idx] = values[i]!
    }

    const grid = { nk, kNorm, omegaNorm, nkOmega, nkMax: 10.0 }
    applyExposureTransfer(grid, {
      ...PASSTHROUGH_KSPACE_VIZ,
      exposureMode: 'log',
      lowPercentile: 0,
      highPercentile: 100,
      gamma: 1.0,
    })

    // Collect mapped values
    const mapped: number[] = []
    for (let i = 0; i < values.length; i++) {
      const idx = (center * G + center) * G + (center - 2 + i)
      mapped.push(grid.nk[idx]!)
    }

    // Check monotonically increasing
    for (let i = 1; i < mapped.length; i++) {
      expect(mapped[i]).toBeGreaterThanOrEqual(mapped[i - 1]!)
    }
  })

  it('does nothing with fewer than 2 positive values', () => {
    const G = OUTPUT_GRID_SIZE
    const nk = new Float64Array(G ** 3)
    // Only one positive value
    nk[0] = 5.0
    const grid = {
      nk,
      kNorm: new Float64Array(G ** 3),
      omegaNorm: new Float64Array(G ** 3),
      nkOmega: new Float64Array(G ** 3),
      nkMax: 5.0,
    }

    applyExposureTransfer(grid, {
      ...PASSTHROUGH_KSPACE_VIZ,
      exposureMode: 'linear',
      lowPercentile: 0,
      highPercentile: 100,
      gamma: 1.0,
    })

    // Value should be unchanged
    expect(grid.nk[0]).toBe(5.0)
  })

  it('keeps original values when log exposure percentile window is degenerate', () => {
    const G = OUTPUT_GRID_SIZE
    const nk = new Float64Array(G ** 3)
    nk[0] = 0.5
    nk[1] = 0.5

    const grid = {
      nk,
      kNorm: new Float64Array(G ** 3),
      omegaNorm: new Float64Array(G ** 3),
      nkOmega: new Float64Array(G ** 3),
      nkMax: 0.5,
    }

    applyExposureTransfer(grid, {
      ...PASSTHROUGH_KSPACE_VIZ,
      exposureMode: 'log',
      lowPercentile: 0,
      highPercentile: 100,
      gamma: 1.0,
    })

    expect(grid.nk[0]).toBe(0.5)
    expect(grid.nk[1]).toBe(0.5)
    expect(grid.nkMax).toBe(0.5)
  })

  it('none mode is a no-op', () => {
    const raw = makeTestRawData(8)
    const grid = projectToDisplayGrid(raw, PASSTHROUGH_KSPACE_VIZ)
    const nkCopy = new Float64Array(grid.nk)

    applyExposureTransfer(grid, {
      ...PASSTHROUGH_KSPACE_VIZ,
      exposureMode: 'none',
    })

    for (let i = 0; i < grid.nk.length; i++) {
      expect(grid.nk[i]).toBe(nkCopy[i])
    }
  })

  it('gamma < 1 boosts mid-range values relative to linear', () => {
    const G = OUTPUT_GRID_SIZE
    const center = Math.floor(G / 2)

    // Helper: apply linear exposure with given gamma, return a mid-range mapped value
    const applyWithGamma = (gamma: number) => {
      const nk = new Float64Array(G ** 3)
      // Place a gradient of 20 values so percentile binning resolves well
      for (let i = 0; i < 20; i++) {
        nk[(center * G + center) * G + (center + i)] = (i + 1) * 1.0
      }
      const grid = {
        nk,
        kNorm: new Float64Array(G ** 3),
        omegaNorm: new Float64Array(G ** 3),
        nkOmega: new Float64Array(G ** 3),
        nkMax: 20.0,
      }
      applyExposureTransfer(grid, {
        ...PASSTHROUGH_KSPACE_VIZ,
        exposureMode: 'linear',
        lowPercentile: 0,
        highPercentile: 100,
        gamma,
      })
      // Return the mapped value for mid-range voxel (value=10, index 9)
      return grid.nk[(center * G + center) * G + (center + 9)]!
    }

    const lowGamma = applyWithGamma(0.5) // boosts mids
    const linearGamma = applyWithGamma(1.0)
    const highGamma = applyWithGamma(2.0) // darkens mids

    // gamma < 1 should produce higher output for mid-range (pow(0.5, 0.5)=0.71 > 0.5)
    expect(lowGamma).toBeGreaterThan(linearGamma)
    // gamma > 1 should produce lower output (pow(0.5, 2.0)=0.25 < 0.5)
    expect(highGamma).toBeLessThan(linearGamma)
  })

  it('gamma = 2 darkens low values', () => {
    const G = OUTPUT_GRID_SIZE
    const nk = new Float64Array(G ** 3)
    const center = Math.floor(G / 2)
    const idxLow = (center * G + center) * G + center
    const idxHigh = (center * G + center) * G + (center + 1)
    nk[idxLow] = 1.0
    nk[idxHigh] = 10.0

    const grid = {
      nk,
      kNorm: new Float64Array(G ** 3),
      omegaNorm: new Float64Array(G ** 3),
      nkOmega: new Float64Array(G ** 3),
      nkMax: 10.0,
    }

    applyExposureTransfer(grid, {
      ...PASSTHROUGH_KSPACE_VIZ,
      exposureMode: 'linear',
      lowPercentile: 0,
      highPercentile: 100,
      gamma: 2.0,
    })

    // High value maps to ~1, gamma=2 → 1^2=1
    expect(grid.nk[idxHigh]).toBeCloseTo(1.0, 1)
    // Low value maps to ~0.1, gamma=2 → 0.01 (much darker)
    expect(grid.nk[idxLow]).toBeLessThan(0.05)
  })

  it('percentile window clips extreme values', () => {
    const G = OUTPUT_GRID_SIZE
    const nk = new Float64Array(G ** 3)
    const center = Math.floor(G / 2)
    // Fill 100 voxels with values 1..100
    for (let i = 0; i < 100; i++) {
      nk[(center * G + center) * G + i] = i + 1
    }

    const grid = {
      nk,
      kNorm: new Float64Array(G ** 3),
      omegaNorm: new Float64Array(G ** 3),
      nkOmega: new Float64Array(G ** 3),
      nkMax: 100,
    }

    applyExposureTransfer(grid, {
      ...PASSTHROUGH_KSPACE_VIZ,
      exposureMode: 'linear',
      lowPercentile: 10,
      highPercentile: 90,
      gamma: 1.0,
    })

    // nkMax should be set to 1.0 after transfer
    expect(grid.nkMax).toBe(1.0)
    // Values outside the window should be clamped to 0 or 1
    let hasZero = false
    let hasOne = false
    for (let i = 0; i < 100; i++) {
      const v = grid.nk[(center * G + center) * G + i]!
      if (v <= 0.001) hasZero = true
      if (v >= 0.999) hasOne = true
    }
    expect(hasZero).toBe(true)
    expect(hasOne).toBe(true)
  })

  it('sanitizes non-finite percentile/gamma parameters', () => {
    const G = OUTPUT_GRID_SIZE
    const nk = new Float64Array(G ** 3)
    nk[0] = 1
    nk[1] = 2
    nk[2] = 4

    const grid = {
      nk,
      kNorm: new Float64Array(G ** 3),
      omegaNorm: new Float64Array(G ** 3),
      nkOmega: new Float64Array(G ** 3),
      nkMax: 4,
    }

    applyExposureTransfer(grid, {
      ...PASSTHROUGH_KSPACE_VIZ,
      exposureMode: 'linear',
      lowPercentile: Number.NaN,
      highPercentile: Number.NaN,
      gamma: Number.NaN,
    })

    for (let i = 0; i < 3; i++) {
      expect(Number.isFinite(grid.nk[i]!)).toBe(true)
      expect(grid.nk[i]).toBeGreaterThanOrEqual(0)
      expect(grid.nk[i]).toBeLessThanOrEqual(1)
    }
  })

  it('updates nkOmega to be consistent with remapped nk', () => {
    const raw = makeTestRawData(8)
    const grid = projectToDisplayGrid(raw, PASSTHROUGH_KSPACE_VIZ)

    applyExposureTransfer(grid, {
      ...PASSTHROUGH_KSPACE_VIZ,
      exposureMode: 'linear',
      lowPercentile: 0,
      highPercentile: 100,
      gamma: 1.0,
    })

    // After exposure, nkOmega[i] should equal nk[i] * omegaNorm[i] for all occupied voxels
    for (let i = 0; i < grid.nk.length; i++) {
      if (grid.nk[i]! <= 0) continue
      const expected = grid.nk[i]! * grid.omegaNorm[i]!
      expect(grid.nkOmega[i]).toBeCloseTo(expected, 12)
    }
  })
})

// ============================================================================
// Broadening
// ============================================================================

describe('applyBroadening', () => {
  it('preserves total mass (sum of nk)', () => {
    const raw = makeTestRawData(8)
    const grid = projectToDisplayGrid(raw, PASSTHROUGH_KSPACE_VIZ)

    let sumBefore = 0
    for (let i = 0; i < grid.nk.length; i++) sumBefore += grid.nk[i]!

    applyBroadening(grid, {
      ...PASSTHROUGH_KSPACE_VIZ,
      broadeningEnabled: true,
      broadeningRadius: 2,
      broadeningSigma: 1.0,
    })

    let sumAfter = 0
    for (let i = 0; i < grid.nk.length; i++) sumAfter += grid.nk[i]!

    // Mass should be preserved within 1%
    if (sumBefore > 0) {
      expect(Math.abs(sumBefore - sumAfter) / sumBefore).toBeLessThan(0.01)
    }
  })

  it('does nothing when disabled', () => {
    const raw = makeTestRawData(8)
    const grid = projectToDisplayGrid(raw, PASSTHROUGH_KSPACE_VIZ)
    const nkCopy = new Float64Array(grid.nk)

    applyBroadening(grid, {
      ...PASSTHROUGH_KSPACE_VIZ,
      broadeningEnabled: false,
      broadeningRadius: 3,
      broadeningSigma: 2.0,
    })

    // Values should be identical
    for (let i = 0; i < grid.nk.length; i++) {
      expect(grid.nk[i]).toBe(nkCopy[i])
    }
  })

  it('nkOnly=true blurs only nk, leaves kNorm/omegaNorm unchanged', () => {
    const G = OUTPUT_GRID_SIZE
    const total = G ** 3
    const nk = new Float64Array(total)
    const kNorm = new Float64Array(total)
    const omegaNorm = new Float64Array(total)
    const nkOmega = new Float64Array(total)
    const center = Math.floor(G / 2)
    const centerIdx = (center * G + center) * G + center
    nk[centerIdx] = 100.0
    kNorm[centerIdx] = 0.5
    omegaNorm[centerIdx] = 0.3
    nkOmega[centerIdx] = 30.0

    const grid = { nk, kNorm, omegaNorm, nkOmega, nkMax: 100.0 }
    const kNormBefore = new Float64Array(kNorm)
    const omegaNormBefore = new Float64Array(omegaNorm)

    applyBroadening(
      grid,
      {
        ...PASSTHROUGH_KSPACE_VIZ,
        broadeningEnabled: true,
        broadeningRadius: 2,
        broadeningSigma: 1.0,
      },
      3,
      true
    )

    // nk should have changed (spread to neighbors)
    expect(grid.nk[centerIdx]).toBeLessThan(100.0)
    const neighborIdx = (center * G + center) * G + (center + 1)
    expect(grid.nk[neighborIdx]).toBeGreaterThan(0)

    // kNorm and omegaNorm should be unchanged in nkOnly mode
    expect(grid.kNorm[centerIdx]).toBe(kNormBefore[centerIdx])
    expect(grid.omegaNorm[centerIdx]).toBe(omegaNormBefore[centerIdx])
  })

  it('latticeDim=1 only blurs along X axis', () => {
    const G = OUTPUT_GRID_SIZE
    const total = G ** 3
    const nk = new Float64Array(total)
    const center = Math.floor(G / 2)
    const centerIdx = (center * G + center) * G + center
    nk[centerIdx] = 100.0

    const grid = {
      nk,
      kNorm: new Float64Array(total),
      omegaNorm: new Float64Array(total),
      nkOmega: new Float64Array(total),
      nkMax: 100.0,
    }

    applyBroadening(
      grid,
      {
        ...PASSTHROUGH_KSPACE_VIZ,
        broadeningEnabled: true,
        broadeningRadius: 2,
        broadeningSigma: 1.0,
      },
      1,
      true
    )

    // X neighbor should have received blur
    const xNeighbor = (center * G + center) * G + (center + 1)
    expect(grid.nk[xNeighbor]).toBeGreaterThan(0)

    // Y neighbor should NOT have blur (only 1 blur dim)
    const yNeighbor = (center * G + (center + 1)) * G + center
    expect(grid.nk[yNeighbor]).toBe(0)
  })

  it('nkOnly=false blurs kNorm and omegaNorm weighted channels', () => {
    const G = OUTPUT_GRID_SIZE
    const total = G ** 3
    const nk = new Float64Array(total)
    const kNorm = new Float64Array(total)
    const omegaNorm = new Float64Array(total)
    const nkOmega = new Float64Array(total)
    const center = Math.floor(G / 2)
    const centerIdx = (center * G + center) * G + center
    nk[centerIdx] = 100.0
    kNorm[centerIdx] = 0.5
    omegaNorm[centerIdx] = 0.3
    nkOmega[centerIdx] = 30.0

    const grid = { nk, kNorm, omegaNorm, nkOmega, nkMax: 100.0 }

    applyBroadening(
      grid,
      {
        ...PASSTHROUGH_KSPACE_VIZ,
        broadeningEnabled: true,
        broadeningRadius: 2,
        broadeningSigma: 1.0,
      },
      3,
      false
    )

    // Center should still have high nk but less than original
    expect(grid.nk[centerIdx]).toBeLessThan(100.0)
    expect(grid.nk[centerIdx]).toBeGreaterThan(0)

    // Neighbor should have inherited weighted kNorm and omegaNorm
    const neighborIdx = (center * G + center) * G + (center + 1)
    expect(grid.nk[neighborIdx]).toBeGreaterThan(0)
    // kNorm should be ~0.5 (occupancy-weighted average near source)
    expect(grid.kNorm[neighborIdx]).toBeCloseTo(0.5, 1)
    expect(grid.omegaNorm[neighborIdx]).toBeCloseTo(0.3, 1)
  })

  it('spreads a single-voxel peak to neighboring voxels', () => {
    const G = OUTPUT_GRID_SIZE
    const nk = new Float64Array(G ** 3)
    const center = Math.floor(G / 2)
    const centerIdx = (center * G + center) * G + center
    nk[centerIdx] = 100.0

    const grid = {
      nk,
      kNorm: new Float64Array(G ** 3),
      omegaNorm: new Float64Array(G ** 3),
      nkOmega: new Float64Array(G ** 3),
      nkMax: 100.0,
    }

    applyBroadening(grid, {
      ...PASSTHROUGH_KSPACE_VIZ,
      broadeningEnabled: true,
      broadeningRadius: 2,
      broadeningSigma: 1.0,
    })

    // Center should still be the maximum
    expect(grid.nk[centerIdx]).toBeGreaterThan(0)
    // But neighbors should now also have positive values
    const neighborIdx = (center * G + center) * G + (center + 1)
    expect(grid.nk[neighborIdx]).toBeGreaterThan(0)
    // Center should be less than original 100 (mass was spread)
    expect(grid.nk[centerIdx]).toBeLessThan(100.0)
  })
})

// ============================================================================
// Pack Display Textures
// ============================================================================

describe('packDisplayTextures', () => {
  it('returns correctly sized output arrays', () => {
    const raw = makeTestRawData(4)
    const grid = projectToDisplayGrid(raw, PASSTHROUGH_KSPACE_VIZ)
    const { density, analysis } = packDisplayTextures(grid)

    const expected = OUTPUT_GRID_SIZE ** 3 * 4
    expect(density.length).toBe(expected)
    expect(analysis.length).toBe(expected)
  })

  it('nkOnly=true zeros analysis G/B/A channels', () => {
    const raw = makeTestRawData(8)
    const grid = projectToDisplayGrid(raw, PASSTHROUGH_KSPACE_VIZ)
    const { analysis } = packDisplayTextures(grid, true)

    // Find any voxel with non-zero R in analysis (there should be at least one)
    let hasNonZeroR = false
    let hasNonZeroGBA = false
    for (let i = 0; i < analysis.length; i += 4) {
      if (analysis[i]! !== 0) hasNonZeroR = true
      if (analysis[i + 1]! !== 0 || analysis[i + 2]! !== 0 || analysis[i + 3]! !== 0) {
        hasNonZeroGBA = true
      }
    }
    expect(hasNonZeroR).toBe(true) // R channel has data
    expect(hasNonZeroGBA).toBe(false) // G,B,A are zero in nkOnly mode
  })

  it('nkOnly=false packs all 4 analysis channels', () => {
    const raw = makeTestRawData(8)
    const grid = projectToDisplayGrid(raw, PASSTHROUGH_KSPACE_VIZ)
    const { analysis } = packDisplayTextures(grid, false)

    // With real data, analysis G (kNorm) should have non-zero values
    let hasNonZeroG = false
    for (let i = 0; i < analysis.length; i += 4) {
      if (analysis[i + 1]! !== 0) {
        hasNonZeroG = true
        break
      }
    }
    expect(hasNonZeroG).toBe(true)
  })

  it('density R channel contains normalized nk values', () => {
    const G = OUTPUT_GRID_SIZE
    const nk = new Float64Array(G ** 3)
    nk[0] = 10.0
    nk[1] = 5.0

    const grid = {
      nk,
      kNorm: new Float64Array(G ** 3),
      omegaNorm: new Float64Array(G ** 3),
      nkOmega: new Float64Array(G ** 3),
      nkMax: 10.0,
    }

    const { density } = packDisplayTextures(grid)
    // Voxel 0: R=10/10=1.0, Voxel 1: R=5/10=0.5
    // These are packed as float16, so check that voxel 0 has larger R than voxel 1
    expect(density[0]).not.toBe(0) // voxel 0 R channel
    expect(density[4]).not.toBe(0) // voxel 1 R channel
  })
})

// ============================================================================
// Full Pipeline (buildKSpaceDisplayTextures)
// ============================================================================

describe('buildKSpaceDisplayTextures', () => {
  it('produces non-zero output for plane wave with default config', () => {
    const raw = makeTestRawData(8)
    const { density } = buildKSpaceDisplayTextures(raw, DEFAULT_KSPACE_VIZ)

    let hasNonZero = false
    for (let i = 0; i < density.length; i += 4) {
      if (density[i]! !== 0) {
        hasNonZero = true
        break
      }
    }
    expect(hasNonZero).toBe(true)
  })

  it('produces output for radial3d display mode', () => {
    const raw = makeTestRawData(8)
    const config: KSpaceVizConfig = { ...DEFAULT_KSPACE_VIZ, displayMode: 'radial3d' }
    const { density, analysis } = buildKSpaceDisplayTextures(raw, config)

    expect(density.length).toBe(OUTPUT_GRID_SIZE ** 3 * 4)
    expect(analysis.length).toBe(OUTPUT_GRID_SIZE ** 3 * 4)
  })

  it('nkOnly=true produces valid output (skips aux channels)', () => {
    const raw = makeTestRawData(8)
    const { density, analysis } = buildKSpaceDisplayTextures(raw, DEFAULT_KSPACE_VIZ, true)

    expect(density.length).toBe(OUTPUT_GRID_SIZE ** 3 * 4)
    expect(analysis.length).toBe(OUTPUT_GRID_SIZE ** 3 * 4)

    // Density should have non-zero values
    let hasNonZero = false
    for (let i = 0; i < density.length; i += 4) {
      if (density[i]! !== 0) {
        hasNonZero = true
        break
      }
    }
    expect(hasNonZero).toBe(true)
  })

  it('physics invariance: raw n_k values unchanged by display config', () => {
    const N = 8
    const gridSize = [N, N, N] as const
    const spacing = [1.0, 1.0, 1.0] as const
    const totalSites = N ** 3
    const phi = new Float32Array(totalSites)
    const pi = new Float32Array(totalSites)
    for (let i = 0; i < totalSites; i++) {
      phi[i] = Math.cos((2 * Math.PI * (i % N)) / N)
    }

    const raw1 = computeRawKSpaceData(phi, pi, gridSize, spacing, 1.0, 3)
    const raw2 = computeRawKSpaceData(phi, pi, gridSize, spacing, 1.0, 3)

    // raw data is identical regardless of what display config we later apply
    for (let i = 0; i < raw1.nk.length; i++) {
      expect(raw1.nk[i]).toBe(raw2.nk[i])
    }
  })
})
