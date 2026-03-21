/**
 * Tests for quantum walk rendering integration.
 *
 * Verifies:
 * - QUANTUM_MODE_MAP includes quantumWalk with correct integer value
 * - Strategy factory creates QuantumWalkStrategy for 'quantumWalk' mode
 * - QuantumWalkStrategy reports isComputeMode=true
 * - computeLatticeBoundingRadius produces correct values for quantum walk grids
 */

import { describe, expect, it } from 'vitest'

import { QUANTUM_MODE_MAP } from '@/rendering/webgpu/renderers/schrodingerRendererTypes'
import { computeLatticeBoundingRadius } from '@/rendering/webgpu/renderers/strategies/computeGridUtils'
import { createModeStrategy } from '@/rendering/webgpu/renderers/strategies/createStrategy'
import { QuantumWalkStrategy } from '@/rendering/webgpu/renderers/strategies/QuantumWalkStrategy'

describe('QUANTUM_MODE_MAP', () => {
  it('includes quantumWalk with a unique integer value', () => {
    expect(QUANTUM_MODE_MAP.quantumWalk).toBe(6)
  })

  it('has no duplicate values', () => {
    const values = Object.values(QUANTUM_MODE_MAP)
    expect(new Set(values).size).toBe(values.length)
  })

  it('covers all seven quantum modes', () => {
    const expected = [
      'harmonicOscillator',
      'hydrogenND',
      'freeScalarField',
      'tdseDynamics',
      'becDynamics',
      'diracEquation',
      'quantumWalk',
    ]
    for (const mode of expected) {
      expect(QUANTUM_MODE_MAP).toHaveProperty(mode)
    }
  })
})

describe('createModeStrategy', () => {
  it('returns QuantumWalkStrategy for quantumWalk mode', () => {
    const strategy = createModeStrategy({ quantumMode: 'quantumWalk' })
    expect(strategy).toBeInstanceOf(QuantumWalkStrategy)
  })

  it('QuantumWalkStrategy reports isComputeMode=true', () => {
    const strategy = new QuantumWalkStrategy()
    expect(strategy.isComputeMode).toBe(true)
  })
})

describe('computeLatticeBoundingRadius', () => {
  it('returns half-extent * 1.15 for uniform grid', () => {
    // 64 sites * 0.1 spacing = 6.4 extent → 3.2 half → * 1.15 = 3.68
    const r = computeLatticeBoundingRadius(2, [64, 64], [0.1, 0.1])
    expect(r).toBeCloseTo(3.68, 2)
  })

  it('uses the largest dimension extent', () => {
    // Dim 0: 32 * 0.1 = 3.2; Dim 1: 64 * 0.1 = 6.4 → max=6.4 → 3.2 * 1.15 = 3.68
    const r = computeLatticeBoundingRadius(2, [32, 64], [0.1, 0.1])
    expect(r).toBeCloseTo(3.68, 2)
  })

  it('handles 1D lattice', () => {
    const r = computeLatticeBoundingRadius(1, [128], [0.05])
    // 128 * 0.05 = 6.4 → 3.2 * 1.15 = 3.68
    expect(r).toBeCloseTo(3.68, 2)
  })

  it('returns fallback for zero-extent grid', () => {
    const r = computeLatticeBoundingRadius(2, [0, 0], [0.1, 0.1])
    // maxExtent <= 0 → fallback 3.2 → 3.2/2 * 1.15 = 1.84
    expect(r).toBeCloseTo(1.84, 2)
  })
})
