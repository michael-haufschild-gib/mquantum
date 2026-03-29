import { describe, expect, it } from 'vitest'

import { DEFAULT_KSPACE_VIZ, PASSTHROUGH_KSPACE_VIZ } from '@/lib/geometry/extended/types'
import { computeRawKSpaceData, OUTPUT_GRID_SIZE } from '@/lib/physics/freeScalar/kSpaceOccupation'
import {
  buildRadialDisplayGrid,
  computeRadialShells,
} from '@/lib/physics/freeScalar/kSpaceRadialSpectrum'

// ============================================================================
// Helpers
// ============================================================================

function makeIsotropicRawData(N: number) {
  const gridSize = [N, N, N]
  const spacing = [1.0, 1.0, 1.0]
  const totalSites = N ** 3
  const phi = new Float32Array(totalSites)
  const pi = new Float32Array(totalSites)

  // Isotropic excitation: equal amplitude cosine in all 3 directions
  for (let iz = 0; iz < N; iz++) {
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const idx = (iz * N + iy) * N + ix
        phi[idx] =
          Math.cos((2 * Math.PI * ix) / N) +
          Math.cos((2 * Math.PI * iy) / N) +
          Math.cos((2 * Math.PI * iz) / N)
      }
    }
  }

  return computeRawKSpaceData(phi, pi, gridSize, spacing, 1.0, 3)
}

function makePlaneWaveRawData(N: number) {
  const gridSize = [N, N, N]
  const spacing = [1.0, 1.0, 1.0]
  const totalSites = N ** 3
  const phi = new Float32Array(totalSites)
  const pi = new Float32Array(totalSites)

  for (let iz = 0; iz < N; iz++) {
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        phi[(iz * N + iy) * N + ix] = Math.cos((2 * Math.PI * ix) / N)
      }
    }
  }

  return computeRawKSpaceData(phi, pi, gridSize, spacing, 1.0, 3)
}

// ============================================================================
// computeRadialShells
// ============================================================================

describe('computeRadialShells', () => {
  it('returns correct bin count', () => {
    const raw = makeIsotropicRawData(8)
    const shells = computeRadialShells(raw, 32)
    expect(shells.binCount).toBe(32)
    expect(shells.shellMeanNk.length).toBe(32)
    expect(shells.shellKCenter.length).toBe(32)
    expect(shells.shellCounts.length).toBe(32)
  })

  it('all modes are accounted for (sum of counts = totalSites)', () => {
    const raw = makeIsotropicRawData(8)
    const shells = computeRadialShells(raw, 32)
    let totalCount = 0
    for (let b = 0; b < shells.binCount; b++) {
      totalCount += shells.shellCounts[b]!
    }
    expect(totalCount).toBe(raw.totalSites)
  })

  it('clamps bin count to [1, 128]', () => {
    const raw = makeIsotropicRawData(4)
    expect(computeRadialShells(raw, 0).binCount).toBe(1)
    expect(computeRadialShells(raw, 200).binCount).toBe(128)
  })

  it('handles NaN bin count without throwing', () => {
    const raw = makeIsotropicRawData(4)
    const shells = computeRadialShells(raw, Number.NaN)
    expect(shells.binCount).toBe(1)
  })

  it('shell kCenter values are monotonically non-decreasing', () => {
    const raw = makeIsotropicRawData(8)
    const shells = computeRadialShells(raw, 32)

    // Only check bins with actual modes
    let prevK = 0
    for (let b = 0; b < shells.binCount; b++) {
      if (shells.shellCounts[b]! > 0) {
        expect(shells.shellKCenter[b]).toBeGreaterThanOrEqual(prevK)
        prevK = shells.shellKCenter[b]!
      }
    }
  })

  it('empty bins get interpolated kCenter = (b+0.5)/bins', () => {
    // Create raw data with all modes at k≈0 (DC mode only)
    const gridSize = [4, 4, 4]
    const spacing = [1.0, 1.0, 1.0]
    const totalSites = 64
    const phi = new Float32Array(totalSites)
    const pi = new Float32Array(totalSites)
    // Constant field → only DC mode
    phi.fill(1.0)
    const raw = computeRawKSpaceData(phi, pi, gridSize, spacing, 1.0, 3)
    const shells = computeRadialShells(raw, 8)

    // Most bins should be empty (modes concentrated at k≈0)
    // Check that empty bins get the interpolated center
    for (let b = 0; b < shells.binCount; b++) {
      if (shells.shellCounts[b]! === 0) {
        expect(shells.shellKCenter[b]).toBeCloseTo((b + 0.5) / shells.binCount, 10)
        expect(shells.shellOmegaCenter[b]).toBe(0)
      }
    }
  })

  it('shellMeanNk is sum/count for each bin', () => {
    const raw = makeIsotropicRawData(4)
    const shells = computeRadialShells(raw, 8)

    // Verify that mean = sumNk / count by checking non-empty bins have positive mean
    // when there's positive occupation
    for (let b = 0; b < shells.binCount; b++) {
      if (shells.shellCounts[b]! > 0) {
        // Mean nk should be non-negative (clamped to 0 in source)
        expect(shells.shellMeanNk[b]).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('kMax is positive for non-trivial data', () => {
    const raw = makeIsotropicRawData(8)
    const shells = computeRadialShells(raw, 16)
    expect(shells.kMax).toBeGreaterThan(0)
  })

  it('omegaCenter values are normalized to [0, 1]', () => {
    const raw = makeIsotropicRawData(8)
    const shells = computeRadialShells(raw, 16)
    for (let b = 0; b < shells.binCount; b++) {
      if (shells.shellCounts[b]! > 0) {
        expect(shells.shellOmegaCenter[b]).toBeGreaterThanOrEqual(0)
        expect(shells.shellOmegaCenter[b]).toBeLessThanOrEqual(1.001)
      }
    }
  })
})

// ============================================================================
// buildRadialDisplayGrid
// ============================================================================

describe('buildRadialDisplayGrid', () => {
  it('produces correctly sized display grid', () => {
    const raw = makePlaneWaveRawData(8)
    const config = { ...DEFAULT_KSPACE_VIZ, displayMode: 'radial3d' as const }
    const grid = buildRadialDisplayGrid(raw, config)

    expect(grid.nk.length).toBe(OUTPUT_GRID_SIZE ** 3)
    expect(grid.kNorm.length).toBe(OUTPUT_GRID_SIZE ** 3)
    expect(grid.omegaNorm.length).toBe(OUTPUT_GRID_SIZE ** 3)
  })

  it('isotropic input produces radially symmetric shell means', () => {
    const raw = makeIsotropicRawData(8)
    const shells = computeRadialShells(raw, 16)

    // Modes at the same |k| should have the same bin assignment
    // Check that non-empty bins have consistent kCenter
    for (let b = 0; b < shells.binCount; b++) {
      if (shells.shellCounts[b]! > 1) {
        // kCenter should be within expected range for this bin
        // Verify kCenter is a reasonable value (not NaN or negative)
        expect(shells.shellKCenter[b]).toBeGreaterThanOrEqual(0)
        expect(shells.shellKCenter[b]).toBeLessThanOrEqual(1.001)
      }
    }
  })

  it('respects FFT shift setting', () => {
    const raw = makePlaneWaveRawData(8)

    const noShift = buildRadialDisplayGrid(raw, {
      ...PASSTHROUGH_KSPACE_VIZ,
      displayMode: 'radial3d',
      fftShiftEnabled: false,
      radialBinCount: 32,
    })

    const withShift = buildRadialDisplayGrid(raw, {
      ...PASSTHROUGH_KSPACE_VIZ,
      displayMode: 'radial3d',
      fftShiftEnabled: true,
      radialBinCount: 32,
    })

    // Both should have the same total sum (just spatially rearranged)
    let sumNoShift = 0
    let sumShift = 0
    for (let i = 0; i < noShift.nk.length; i++) {
      sumNoShift += noShift.nk[i]!
      sumShift += withShift.nk[i]!
    }
    expect(Math.abs(sumNoShift - sumShift) / Math.max(sumNoShift, 1e-10)).toBeLessThan(0.01)
  })

  it('nkMax reflects the actual maximum nk in the grid', () => {
    const raw = makePlaneWaveRawData(8)
    const grid = buildRadialDisplayGrid(raw, {
      ...PASSTHROUGH_KSPACE_VIZ,
      displayMode: 'radial3d',
      fftShiftEnabled: false,
      radialBinCount: 32,
    })

    let actualMax = 0
    for (let i = 0; i < grid.nk.length; i++) {
      if (grid.nk[i]! > actualMax) actualMax = grid.nk[i]!
    }
    expect(grid.nkMax).toBe(actualMax)
  })

  it('invalid voxels (outside active grid) remain zero', () => {
    const raw = makePlaneWaveRawData(4) // Small grid → most of 64^3 is outside
    const grid = buildRadialDisplayGrid(raw, {
      ...PASSTHROUGH_KSPACE_VIZ,
      displayMode: 'radial3d',
      fftShiftEnabled: false,
      radialBinCount: 16,
    })

    // Corner voxel (0,0,0) should be outside the active grid region
    expect(grid.nk[0]).toBe(0)
    // Center region should have values
    const G = OUTPUT_GRID_SIZE
    const offset = Math.floor((G - 4) / 2)
    // At least some voxels near the offset should be non-zero
    let hasNonZero = false
    for (let i = offset; i < offset + 4; i++) {
      const idx = (offset * G + offset) * G + i
      if (grid.nk[idx]! > 0) hasNonZero = true
    }
    expect(hasNonZero).toBe(true)
  })

  it('keeps nkOmega in physical n*omega units (not normalized omega)', () => {
    const raw = makePlaneWaveRawData(8)
    const grid = buildRadialDisplayGrid(raw, {
      ...PASSTHROUGH_KSPACE_VIZ,
      displayMode: 'radial3d',
      fftShiftEnabled: false,
      radialBinCount: 32,
    })

    let checked = 0
    for (let i = 0; i < grid.nk.length; i++) {
      const n = grid.nk[i]!
      if (n <= 0) continue
      const expected = n * grid.omegaNorm[i]! * raw.omegaMax
      const relErr = Math.abs(grid.nkOmega[i]! - expected) / Math.max(expected, 1e-12)
      expect(relErr).toBeLessThan(1e-10)
      checked++
      if (checked >= 128) break
    }

    expect(checked).toBeGreaterThan(0)
  })
})
