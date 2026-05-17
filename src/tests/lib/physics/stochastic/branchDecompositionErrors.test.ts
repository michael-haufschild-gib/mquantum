/**
 * Error-path tests for `spatialBranchPartition` input validation.
 *
 * The branch decomposition is fed live wavefunction buffers from the TDSE
 * solver. A regression in the validation guards (latticeDim integer check,
 * gridSize/spacing length check, psi length match) would cause the function
 * to read past the end of a Float64Array and silently emit branch populations
 * that look real but reference uninitialized memory.
 */

import { describe, expect, it } from 'vitest'

import { spatialBranchPartition } from '@/lib/physics/stochastic/branchDecomposition'

describe('spatialBranchPartition — input validation', () => {
  it('throws when latticeDim is not a positive integer', () => {
    const psi = new Float64Array(8)
    expect(() => spatialBranchPartition(psi, psi, [8], [1], 0)).toThrow(
      /latticeDim must be a positive integer/
    )
    expect(() => spatialBranchPartition(psi, psi, [8], [1], -1)).toThrow(
      /latticeDim must be a positive integer/
    )
    expect(() => spatialBranchPartition(psi, psi, [8], [1], 1.5)).toThrow(
      /latticeDim must be a positive integer/
    )
    expect(() => spatialBranchPartition(psi, psi, [8], [1], NaN)).toThrow(
      /latticeDim must be a positive integer/
    )
  })

  it('throws when gridSize has fewer entries than latticeDim', () => {
    const psi = new Float64Array(64)
    expect(() => spatialBranchPartition(psi, psi, [8], [1, 1], 2)).toThrow(
      /gridSize\/spacing must have at least 2 entries/
    )
  })

  it('throws when spacing has fewer entries than latticeDim', () => {
    const psi = new Float64Array(64)
    expect(() => spatialBranchPartition(psi, psi, [8, 8], [1], 2)).toThrow(
      /gridSize\/spacing must have at least 2 entries/
    )
  })

  it('throws when active grid sizes are not positive integers', () => {
    const psi = new Float64Array(8)
    expect(() => spatialBranchPartition(psi, psi, [0], [1], 1)).toThrow(
      /gridSize\[0\] must be a positive integer/
    )
    expect(() => spatialBranchPartition(psi, psi, [-8], [1], 1)).toThrow(
      /gridSize\[0\] must be a positive integer/
    )
    expect(() => spatialBranchPartition(psi, psi, [2.5], [1], 1)).toThrow(
      /gridSize\[0\] must be a positive integer/
    )
  })

  it('throws when active spacings are not finite positive numbers', () => {
    const psi = new Float64Array(8)
    expect(() => spatialBranchPartition(psi, psi, [8], [0], 1)).toThrow(
      /spacing\[0\] must be a finite positive number/
    )
    expect(() => spatialBranchPartition(psi, psi, [8], [-1], 1)).toThrow(
      /spacing\[0\] must be a finite positive number/
    )
    expect(() => spatialBranchPartition(psi, psi, [8], [Number.NaN], 1)).toThrow(
      /spacing\[0\] must be a finite positive number/
    )
  })

  it('throws when planePosition is non-finite', () => {
    const psi = new Float64Array(8)
    expect(() => spatialBranchPartition(psi, psi, [8], [1], 1, Number.NaN)).toThrow(
      /planePosition must be finite/
    )
  })

  it('throws when psi buffer length is shorter than totalSites', () => {
    // gridSize=[16], latticeDim=1 → totalSites=16, but psi=8.
    const psi = new Float64Array(8)
    expect(() => spatialBranchPartition(psi, psi, [16], [1], 1)).toThrow(
      /does not match totalSites/
    )
  })

  it('throws when wavefunction density is non-finite', () => {
    const psiRe = new Float64Array(8)
    const psiIm = new Float64Array(8)
    psiRe[3] = Number.NaN

    expect(() => spatialBranchPartition(psiRe, psiIm, [8], [1], 1)).toThrow(
      /non-finite wavefunction density/
    )
  })

  it('returns 50/50 populations when totalNorm is zero (degenerate input)', () => {
    // All-zero wavefunction — the normalization branch returns 0.5/0.5.
    const psi = new Float64Array(8) // all zeros
    const result = spatialBranchPartition(psi, psi, [8], [1], 1)
    expect(result.populationA).toBe(0.5)
    expect(result.populationB).toBe(0.5)
    expect(result.totalNorm).toBe(0)
  })

  it('partitions a left-localized real wavepacket into branch A', () => {
    const N = 16
    const psiRe = new Float64Array(N)
    const psiIm = new Float64Array(N)
    // All density on the leftmost two sites (well to the left of x=0).
    psiRe[0] = 1
    psiRe[1] = 1
    const result = spatialBranchPartition(psiRe, psiIm, [N], [1], 1, 0)
    expect(result.populationA).toBeCloseTo(1, 9)
    expect(result.populationB).toBeCloseTo(0, 9)
  })

  it('partitions a right-localized wavepacket into branch B', () => {
    const N = 16
    const psiRe = new Float64Array(N)
    const psiIm = new Float64Array(N)
    psiRe[N - 1] = 1
    psiRe[N - 2] = 1
    const result = spatialBranchPartition(psiRe, psiIm, [N], [1], 1, 0)
    expect(result.populationA).toBeCloseTo(0, 9)
    expect(result.populationB).toBeCloseTo(1, 9)
  })

  it('shifts the partition plane via planePosition (positive shifts the boundary right)', () => {
    const N = 16
    const psiRe = new Float64Array(N)
    const psiIm = new Float64Array(N)
    // Symmetric two-site density on either side of center.
    psiRe[N / 2 - 1] = 1
    psiRe[N / 2] = 1
    // planePosition=0 (center) should give equal split.
    const center = spatialBranchPartition(psiRe, psiIm, [N], [1], 1, 0)
    expect(center.populationA).toBeCloseTo(0.5, 5)
    expect(center.populationB).toBeCloseTo(0.5, 5)

    // planePosition=+0.99 (rightmost) puts both density sites in branch A.
    const right = spatialBranchPartition(psiRe, psiIm, [N], [1], 1, 0.99)
    expect(right.populationA).toBeGreaterThan(center.populationA)
    expect(right.populationB).toBeLessThan(center.populationB)
  })

  it('total normalization equals sum of |ψ|² across the lattice', () => {
    const N = 8
    const psiRe = new Float64Array([1, 2, 3, 0, 0, 0, 0, 0])
    const psiIm = new Float64Array([0, 0, 1, 0, 0, 0, 0, 0])
    const expected = 1 + 4 + 9 + 1 // |ψ|² = re² + im²
    const result = spatialBranchPartition(psiRe, psiIm, [N], [1], 1)
    expect(result.totalNorm).toBeCloseTo(expected, 9)
  })

  it('branch populations always sum to 1.0 when totalNorm > 0', () => {
    const N = 8
    const psiRe = new Float64Array([0.7, 0.3, 0.5, 0.1, 0.4, 0.6, 0.2, 0.9])
    const psiIm = new Float64Array(N)
    const result = spatialBranchPartition(psiRe, psiIm, [N], [1], 1)
    expect(result.populationA + result.populationB).toBeCloseTo(1.0, 9)
  })
})
