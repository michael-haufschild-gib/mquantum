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
  QW_MAX_LATTICE_DIM,
  QW_MAX_TOTAL_SITES,
  resizeQuantumWalkArrays,
  sanitizeQuantumWalkConfig,
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

  it('defaults to real (asymmetric) initial coin state', () => {
    expect(DEFAULT_QUANTUM_WALK_CONFIG.coinInitial).toBe('real')
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

describe('sanitizeQuantumWalkConfig', () => {
  it('snaps active grid sizes to powers of two and clamps initial positions', () => {
    const cfg = sanitizeQuantumWalkConfig({
      ...DEFAULT_QUANTUM_WALK_CONFIG,
      latticeDim: 3,
      gridSize: [30, 17, 999],
      spacing: [0.1, Number.NaN, 0.2],
      initialPosition: [99, -4, 300],
      slicePositions: [1, 2],
      needsReset: false,
    })

    expect(cfg.gridSize).toEqual([32, 16, 128])
    expect(cfg.spacing).toEqual([0.1, 0.1, 0.2])
    expect(cfg.initialPosition).toEqual([31, 0, 127])
    expect(cfg.slicePositions).toEqual([])
    expect(cfg.needsReset).toBe(true)
  })

  it('caps malformed dimensions to the shader-supported 11D range', () => {
    const cfg = sanitizeQuantumWalkConfig({
      ...DEFAULT_QUANTUM_WALK_CONFIG,
      latticeDim: 99,
      gridSize: Array.from({ length: 99 }, () => 128),
      spacing: Array.from({ length: 99 }, () => 0.1),
      initialPosition: Array.from({ length: 99 }, () => 64),
      slicePositions: Array.from({ length: 96 }, () => 0),
      needsReset: false,
    })
    const totalSites = cfg.gridSize.reduce((acc, value) => acc * value, 1)

    expect(cfg.latticeDim).toBe(QW_MAX_LATTICE_DIM)
    expect(cfg.gridSize).toHaveLength(QW_MAX_LATTICE_DIM)
    expect(cfg.slicePositions).toHaveLength(QW_MAX_LATTICE_DIM - 3)
    expect(totalSites).toBeLessThanOrEqual(QW_MAX_TOTAL_SITES)
    expect(cfg.gridSize.every((g) => Math.log2(g) % 1 === 0)).toBe(true)
    expect(cfg.needsReset).toBe(true)
  })

  it('pads missing active axes when latticeDim grows through a direct config merge', () => {
    const cfg = sanitizeQuantumWalkConfig({
      ...DEFAULT_QUANTUM_WALK_CONFIG,
      latticeDim: 5,
      gridSize: [64, 64],
      spacing: [0.2],
      initialPosition: [3],
      needsReset: false,
    })
    const totalSites = cfg.gridSize.reduce((acc, value) => acc * value, 1)

    expect(cfg.latticeDim).toBe(5)
    expect(cfg.gridSize).toHaveLength(5)
    expect(cfg.spacing).toEqual([0.2, 0.1, 0.1, 0.1, 0.1])
    expect(cfg.initialPosition).toHaveLength(5)
    expect(totalSites).toBeLessThanOrEqual(QW_MAX_TOTAL_SITES)
    expect(cfg.gridSize.every((g) => Math.log2(g) % 1 === 0)).toBe(true)
    expect(cfg.needsReset).toBe(true)
  })

  it('sanitizes non-finite scalar fields before they reach shader uniforms', () => {
    const cfg = sanitizeQuantumWalkConfig({
      ...DEFAULT_QUANTUM_WALK_CONFIG,
      coinType: 'bogus' as never,
      coinInitial: 'complex' as never,
      fieldView: 'bad-field' as never,
      coinBias: Number.POSITIVE_INFINITY,
      stepsPerFrame: Number.NaN,
      autoScale: 'yes' as never,
      absorberEnabled: 'true' as never,
      absorberWidth: Number.NaN,
      pmlTargetReflection: Number.POSITIVE_INFINITY,
      needsReset: 'false' as never,
    })

    expect(cfg.coinType).toBe(DEFAULT_QUANTUM_WALK_CONFIG.coinType)
    expect(cfg.coinInitial).toBe(DEFAULT_QUANTUM_WALK_CONFIG.coinInitial)
    expect(cfg.fieldView).toBe(DEFAULT_QUANTUM_WALK_CONFIG.fieldView)
    expect(cfg.coinBias).toBe(DEFAULT_QUANTUM_WALK_CONFIG.coinBias)
    expect(cfg.stepsPerFrame).toBe(DEFAULT_QUANTUM_WALK_CONFIG.stepsPerFrame)
    expect(cfg.autoScale).toBe(DEFAULT_QUANTUM_WALK_CONFIG.autoScale)
    expect(cfg.absorberEnabled).toBe(DEFAULT_QUANTUM_WALK_CONFIG.absorberEnabled)
    expect(cfg.absorberWidth).toBe(DEFAULT_QUANTUM_WALK_CONFIG.absorberWidth)
    expect(cfg.pmlTargetReflection).toBe(DEFAULT_QUANTUM_WALK_CONFIG.pmlTargetReflection)
    expect(cfg.needsReset).toBe(false)
  })
})
