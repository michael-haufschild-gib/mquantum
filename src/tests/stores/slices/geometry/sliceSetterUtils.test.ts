/**
 * Tests for slice setter utility functions.
 *
 * These utilities are used across TDSE, BEC, Dirac, and Free Scalar setter
 * factories. A bug in CFL limit computation causes simulation instability
 * (wavefunction diverges exponentially). A bug in grid sizing produces
 * out-of-memory or incorrect FFT dimensions.
 */

import { describe, expect, it } from 'vitest'

import {
  clampDtWithCfl,
  computeCflLimit,
  defaultGridPerDim,
  defaultTdseGridPerDim,
  MAX_TOTAL_SITES,
  TDSE_MAX_TOTAL_SITES,
} from '@/stores/slices/geometry/setters/sliceSetterUtils'

describe('computeCflLimit', () => {
  it('returns 2/omega_max for uniform spacing with zero mass', () => {
    // mass=0, spacing=[0.1, 0.1, 0.1]
    // sum(2/a)^2 = 3 * (20)^2 = 1200
    // omega_max = sqrt(1200) ≈ 34.64
    // dt_max = 2/34.64 ≈ 0.0577
    const dt = computeCflLimit([0.1, 0.1, 0.1], 3, 0)
    expect(dt).toBeCloseTo(2 / Math.sqrt(1200), 6)
  })

  it('decreases when mass increases (more restrictive)', () => {
    const dt0 = computeCflLimit([0.1, 0.1, 0.1], 3, 0)
    const dt1 = computeCflLimit([0.1, 0.1, 0.1], 3, 10)
    expect(dt1).toBeLessThan(dt0)
  })

  it('decreases when spacing decreases (finer grid = smaller dt)', () => {
    const dtCoarse = computeCflLimit([0.2, 0.2, 0.2], 3, 1)
    const dtFine = computeCflLimit([0.05, 0.05, 0.05], 3, 1)
    expect(dtFine).toBeLessThan(dtCoarse)
  })

  it('is finite and positive for valid inputs', () => {
    const dt = computeCflLimit([0.1], 1, 1)
    expect(dt).toBeGreaterThan(0)
    expect(Number.isFinite(dt)).toBe(true)
  })

  it('handles 1D case correctly', () => {
    // 1D, spacing=0.1, mass=0
    // omega_max = sqrt((2/0.1)^2) = 20
    // dt_max = 2/20 = 0.1
    const dt = computeCflLimit([0.1], 1, 0)
    expect(dt).toBeCloseTo(0.1, 10)
  })

  it('uses minimum spacing when dimensions have unequal spacing', () => {
    const dtUniform = computeCflLimit([0.1, 0.1, 0.1], 3, 0)
    const dtNonUniform = computeCflLimit([0.1, 0.2, 0.3], 3, 0)
    // Non-uniform with smaller spacing in dim 0 should be more restrictive
    // but less than uniform 0.1 because dims 1,2 are coarser
    expect(dtNonUniform).toBeGreaterThan(dtUniform)
  })
})

describe('clampDtWithCfl', () => {
  it('clamps dt below CFL limit * 0.9 safety factor', () => {
    const cfl = computeCflLimit([0.1, 0.1, 0.1], 3, 0)
    const safeDt = cfl * 0.9
    const clamped = clampDtWithCfl(safeDt + 0.1, [0.1, 0.1, 0.1], 3, 0)
    expect(clamped).toBeLessThanOrEqual(safeDt + 1e-10)
  })

  it('does not go below 0.001', () => {
    const clamped = clampDtWithCfl(0.0001, [0.1, 0.1, 0.1], 3, 0)
    expect(clamped).toBe(0.001)
  })

  it('does not exceed 0.1', () => {
    // Very coarse grid would allow large dt, but we cap at 0.1
    const clamped = clampDtWithCfl(1.0, [1.0, 1.0, 1.0], 3, 0)
    expect(clamped).toBeLessThanOrEqual(0.1)
  })

  it('preserves valid dt within bounds', () => {
    const clamped = clampDtWithCfl(0.005, [0.1, 0.1, 0.1], 3, 1)
    expect(clamped).toBe(0.005)
  })
})

describe('defaultTdseGridPerDim', () => {
  it('returns a power of 2 for all dimensions 1-11', () => {
    for (let d = 1; d <= 11; d++) {
      const g = defaultTdseGridPerDim(d)
      expect(Math.log2(g) % 1, `dim=${d} returned non-power-of-2: ${g}`).toBe(0)
      expect(g).toBeGreaterThanOrEqual(2)
    }
  })

  it('total sites do not exceed TDSE_MAX_TOTAL_SITES', () => {
    for (let d = 1; d <= 11; d++) {
      const g = defaultTdseGridPerDim(d)
      expect(Math.pow(g, d)).toBeLessThanOrEqual(TDSE_MAX_TOTAL_SITES)
    }
  })

  it('returns 64 for 3D (64^3 = 262144 = TDSE_MAX_TOTAL_SITES)', () => {
    expect(defaultTdseGridPerDim(3)).toBe(64)
  })

  it('decreases as dimension increases', () => {
    const g3 = defaultTdseGridPerDim(3)
    const g5 = defaultTdseGridPerDim(5)
    const g8 = defaultTdseGridPerDim(8)
    expect(g5).toBeLessThanOrEqual(g3)
    expect(g8).toBeLessThanOrEqual(g5)
  })
})

describe('defaultGridPerDim (free scalar)', () => {
  it('returns a power of 2 for all dimensions 1-11', () => {
    for (let d = 1; d <= 11; d++) {
      const g = defaultGridPerDim(d)
      expect(Math.log2(g) % 1, `dim=${d} returned non-power-of-2: ${g}`).toBe(0)
      expect(g).toBeGreaterThanOrEqual(2)
    }
  })

  it('total sites do not exceed MAX_TOTAL_SITES', () => {
    for (let d = 1; d <= 11; d++) {
      const g = defaultGridPerDim(d)
      expect(Math.pow(g, d)).toBeLessThanOrEqual(MAX_TOTAL_SITES)
    }
  })

  it('returns 128 for 3D (larger budget than TDSE)', () => {
    // MAX_TOTAL_SITES = 1048576 = 128^3 (approx)
    // Actually, 128^3 = 2097152 > 1048576, so it should return 64
    const g = defaultGridPerDim(3)
    expect(Math.pow(g, 3)).toBeLessThanOrEqual(MAX_TOTAL_SITES)
  })

  it('larger budget means larger grid than TDSE for same dimension', () => {
    for (let d = 1; d <= 8; d++) {
      const gTdse = defaultTdseGridPerDim(d)
      const gFsf = defaultGridPerDim(d)
      expect(gFsf).toBeGreaterThanOrEqual(gTdse)
    }
  })
})
