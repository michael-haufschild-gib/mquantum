/**
 * Tests for `FreeScalarFieldComputePass.advanceSimEta` (cosmological clock).
 *
 * Covers Finding 1: the conformal-time advance must move η toward 0 for
 * both the inflationary `η < 0` convention and the reverse `η > 0` branch,
 * and must clamp at `±COSMOLOGY_ETA_FLOOR` to avoid the singularity.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/physics/freeScalar/vacuumSpectrum', () => ({
  estimateVacuumMaxEnergy: vi.fn(() => 1),
  estimateVacuumMaxPhi: vi.fn(() => 1),
  estimateVacuumMaxPi: vi.fn(() => 1),
  sampleVacuumSpectrum: vi.fn(() => ({ phi: new Float32Array(0), pi: new Float32Array(0) })),
}))

import { FreeScalarFieldComputePass } from '@/rendering/webgpu/passes/FreeScalarFieldComputePass'

describe('FreeScalarFieldComputePass.advanceSimEta (cosmology clock direction)', () => {
  it('advances η toward 0⁻ by ADDING dt on the η < 0 branch', () => {
    const pass = new FreeScalarFieldComputePass()
    const next = pass._testAdvanceSimEta(-5, 0.1)
    // The inflationary convention is η ∈ (-∞, 0); moving forward in time
    // must *increase* η toward 0⁻, so -5 → -4.9, not -5.1.
    expect(next).toBeCloseTo(-4.9, 10)
  })

  it('advances η toward 0⁺ by SUBTRACTING dt on the (unusual) η > 0 branch', () => {
    const pass = new FreeScalarFieldComputePass()
    const next = pass._testAdvanceSimEta(5, 0.1)
    expect(next).toBeCloseTo(4.9, 10)
  })

  it('monotonically reduces |η| across many steps on the η < 0 branch', () => {
    const pass = new FreeScalarFieldComputePass()
    let eta = -2
    const dt = 0.05
    for (let i = 0; i < 10; i++) {
      const nextEta = pass._testAdvanceSimEta(eta, dt)
      expect(Math.abs(nextEta)).toBeLessThan(Math.abs(eta))
      expect(nextEta).toBeLessThan(0) // never crossed into η > 0
      eta = nextEta
    }
  })

  it('clamps at the ETA_FLOOR when dt would cross the singularity', () => {
    const pass = new FreeScalarFieldComputePass()
    // η = -0.0005 with dt = 0.01 would overshoot to +0.0095 — clamp to -1e-3.
    const next = pass._testAdvanceSimEta(-5e-4, 1e-2)
    expect(next).toBeLessThan(0)
    expect(Math.abs(next)).toBeGreaterThanOrEqual(1e-3 - 1e-12)
  })
})
