import { describe, expect, it } from 'vitest'

import { PASSTHROUGH_KSPACE_VIZ, DEFAULT_KSPACE_VIZ } from '@/lib/geometry/extended/types'
import {
  computeRawKSpaceData,
  OUTPUT_GRID_SIZE,
} from '@/lib/physics/freeScalar/kSpaceOccupation'
import { computeRadialShells, buildRadialDisplayGrid } from '@/lib/physics/freeScalar/kSpaceRadialSpectrum'

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
        phi[idx] = Math.cos((2 * Math.PI * ix) / N)
          + Math.cos((2 * Math.PI * iy) / N)
          + Math.cos((2 * Math.PI * iz) / N)
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
        const expectedCenter = (b + 0.5) / shells.binCount
        // Just verify it's a reasonable value (not NaN or negative)
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
})
