/**
 * Tests for quantum walk configuration and array resizing.
 *
 * Verifies:
 * - Default config has internally consistent arrays
 * - resizeQuantumWalkArrays produces correct grid sizes across dimensions 1-11
 * - Total site counts stay within GPU dispatch limits
 * - Initial position is always centered
 * - Spacing is preserved from previous config where possible
 */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_QUANTUM_WALK_CONFIG,
  type QuantumWalkConfig,
  resizeQuantumWalkArrays,
} from '@/lib/geometry/extended/quantumWalk'

describe('DEFAULT_QUANTUM_WALK_CONFIG', () => {
  it('has consistent array lengths matching latticeDim', () => {
    const cfg = DEFAULT_QUANTUM_WALK_CONFIG
    expect(cfg.gridSize).toHaveLength(cfg.latticeDim)
    expect(cfg.spacing).toHaveLength(cfg.latticeDim)
    expect(cfg.initialPosition).toHaveLength(cfg.latticeDim)
  })

  it('centers initial position at grid midpoint', () => {
    const cfg = DEFAULT_QUANTUM_WALK_CONFIG
    for (let d = 0; d < cfg.latticeDim; d++) {
      expect(cfg.initialPosition[d]).toBe(Math.floor(cfg.gridSize[d]! / 2))
    }
  })
})

describe('resizeQuantumWalkArrays', () => {
  const prev: QuantumWalkConfig = {
    ...DEFAULT_QUANTUM_WALK_CONFIG,
    spacing: [0.15, 0.15],
  }

  it('produces arrays matching new dimension for dim=1', () => {
    const result = resizeQuantumWalkArrays(prev, 1)
    expect(result.latticeDim).toBe(1)
    expect(result.gridSize).toHaveLength(1)
    expect(result.spacing).toHaveLength(1)
    expect(result.initialPosition).toHaveLength(1)
  })

  it('produces arrays matching new dimension for dim=3', () => {
    const result = resizeQuantumWalkArrays(prev, 3)
    expect(result.latticeDim).toBe(3)
    expect(result.gridSize).toHaveLength(3)
    expect(result.spacing).toHaveLength(3)
    expect(result.initialPosition).toHaveLength(3)
  })

  it('preserves existing spacing for dimensions that had values', () => {
    const result = resizeQuantumWalkArrays(prev, 3)
    // First two dims should preserve the 0.15 from prev
    expect(result.spacing![0]).toBe(0.15)
    expect(result.spacing![1]).toBe(0.15)
    // Third dim falls back to default 0.1
    expect(result.spacing![2]).toBe(0.1)
  })

  it('centers initial position for all dimensions', () => {
    const result = resizeQuantumWalkArrays(prev, 4)
    for (let d = 0; d < 4; d++) {
      expect(result.initialPosition![d]).toBe(Math.floor(result.gridSize![d]! / 2))
    }
  })

  it('resets steps to 0', () => {
    const withSteps = { ...prev, steps: 100 }
    const result = resizeQuantumWalkArrays(withSteps, 3)
    expect(result.steps).toBe(0)
  })

  it('sets needsReset to true', () => {
    const result = resizeQuantumWalkArrays(prev, 3)
    expect(result.needsReset).toBe(true)
  })

  it('keeps total sites within GPU dispatch limit (65535*64) for all dims 1-11', () => {
    const MAX_SITES = 65535 * 64
    for (let dim = 1; dim <= 11; dim++) {
      const result = resizeQuantumWalkArrays(prev, dim)
      const totalSites = result.gridSize!.reduce((a, b) => a * b, 1)
      expect(totalSites).toBeLessThanOrEqual(MAX_SITES)
      // Each grid size should be a power of 2
      for (const g of result.gridSize!) {
        expect(Math.log2(g) % 1).toBe(0)
      }
    }
  })

  it('uses reasonable grid sizes for high dimensions', () => {
    // At dim=11, grid per dim should be small enough that 2^11 doesn't blow up
    const result = resizeQuantumWalkArrays(prev, 11)
    // With max 65535*64 = 4194240 total sites, 11D grids must be very small
    const totalSites = result.gridSize!.reduce((a, b) => a * b, 1)
    expect(totalSites).toBeGreaterThan(0)
    expect(totalSites).toBeLessThanOrEqual(65535 * 64)
  })
})
