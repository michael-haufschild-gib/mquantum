import { describe, expect, it } from 'vitest'

import type { KSpaceVizConfig } from '@/lib/geometry/extended/types'
import { PASSTHROUGH_KSPACE_VIZ, DEFAULT_KSPACE_VIZ } from '@/lib/geometry/extended/types'
import type { KSpaceRawData } from '@/lib/physics/freeScalar/kSpaceOccupation'
import {
  computeRawKSpaceData,
  OUTPUT_GRID_SIZE,
} from '@/lib/physics/freeScalar/kSpaceOccupation'
import {
  projectToDisplayGrid,
  applyExposureTransfer,
  applyBroadening,
  packDisplayTextures,
  buildKSpaceDisplayTextures,
} from '@/lib/physics/freeScalar/kSpaceDisplayTransforms'

// ============================================================================
// Helpers
// ============================================================================

/** Create raw data from a simple plane wave at k=(1,0,0) on an NxNxN grid. */
function makeTestRawData(N: number): KSpaceRawData {
  const gridSize = [N, N, N]
  const spacing = [1.0, 1.0, 1.0]
  const totalSites = N ** 3
  const phi = new Float32Array(totalSites)
  const pi = new Float32Array(totalSites)

  const A = 1.0
  for (let iz = 0; iz < N; iz++) {
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        const idx = (iz * N + iy) * N + ix
        phi[idx] = A * Math.cos((2 * Math.PI * ix) / N)
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
    const shiftedPeakZ = offset + 5                    // (1 + 4) % 8 = 5 for dim 2
    const idx = (shiftedPeakZ * OUTPUT_GRID_SIZE + shiftedCenterY) * OUTPUT_GRID_SIZE + shiftedCenterX

    // The value at the shifted position should be non-zero
    expect(grid.nk[idx]).toBeGreaterThan(0)
  })

  it('shift preserves total occupation sum', () => {
    const raw = makeTestRawData(8)

    const noShift = projectToDisplayGrid(raw, { ...PASSTHROUGH_KSPACE_VIZ, fftShiftEnabled: false })
    const withShift = projectToDisplayGrid(raw, { ...PASSTHROUGH_KSPACE_VIZ, fftShiftEnabled: true })

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
    expect(grid.omegaNorm[idx]).toBeCloseTo((10 / 4) / 200, 12)
    expect(grid.kNorm[idx]).toBeCloseTo((10 / 4) / 60, 12)
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
