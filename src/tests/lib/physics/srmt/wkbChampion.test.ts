/**
 * Unit tests for the WKB cross-diagnostic champion.
 *
 * The mean-phase-rate construction must:
 *  1. Pick the axis along which the synthetic plane wave winds fastest.
 *  2. Return null for degenerate (constant-amplitude) inputs where no
 *     direction has any phase content.
 *
 * @module tests/lib/physics/srmt/wkbChampion
 */

import { describe, expect, it } from 'vitest'

import { computeWkbPhaseRates, findWkbChampion } from '@/lib/physics/srmt/wkbChampion'

/**
 * Build a synthetic χ = exp(i · (k_a·ia + k_φ1·i1 + k_φ2·i2)) on a
 * grid of given shape. Tests that use this helper choose physical
 * axis spacings of one, so the largest `(k_a, k_φ1, k_φ2)` is also the
 * largest physical momentum.
 */
function syntheticPlaneWave(
  shape: [number, number, number],
  k: [number, number, number]
): Float32Array {
  const [Na, N1, N2] = shape
  const out = new Float32Array(2 * Na * N1 * N2)
  for (let ia = 0; ia < Na; ia++) {
    for (let i1 = 0; i1 < N1; i1++) {
      for (let i2 = 0; i2 < N2; i2++) {
        const phase = k[0] * ia + k[1] * i1 + k[2] * i2
        const idx = 2 * (ia * N1 * N2 + i1 * N2 + i2)
        out[idx] = Math.cos(phase)
        out[idx + 1] = Math.sin(phase)
      }
    }
  }
  return out
}

function syntheticPhysicalPlaneWave(
  shape: [number, number, number],
  extents: { aMin: number; aMax: number; phiExtent: number },
  k: [number, number, number]
): Float32Array {
  const [Na, N1, N2] = shape
  const out = new Float32Array(2 * Na * N1 * N2)
  const da = (extents.aMax - extents.aMin) / (Na - 1)
  const dphi1 = N1 > 1 ? (2 * extents.phiExtent) / (N1 - 1) : 0
  const dphi2 = N2 > 1 ? (2 * extents.phiExtent) / (N2 - 1) : 0
  for (let ia = 0; ia < Na; ia++) {
    const a = extents.aMin + ia * da
    for (let i1 = 0; i1 < N1; i1++) {
      const phi1 = -extents.phiExtent + i1 * dphi1
      for (let i2 = 0; i2 < N2; i2++) {
        const phi2 = -extents.phiExtent + i2 * dphi2
        const phase = k[0] * a + k[1] * phi1 + k[2] * phi2
        const idx = 2 * (ia * N1 * N2 + i1 * N2 + i2)
        out[idx] = Math.cos(phase)
        out[idx + 1] = Math.sin(phase)
      }
    }
  }
  return out
}

function supportedAClockWithLowDensityPhiNoise(shape: [number, number, number]): Float32Array {
  const [Na, N1, N2] = shape
  const out = new Float32Array(2 * Na * N1 * N2)
  for (let ia = 0; ia < Na; ia++) {
    for (let i1 = 0; i1 < N1; i1++) {
      for (let i2 = 0; i2 < N2; i2++) {
        const supported = i2 === 0
        const amplitude = supported ? 1 : 1e-4
        const phase = supported ? 0.4 * ia : 1.2 * i1
        const idx = 2 * (ia * N1 * N2 + i1 * N2 + i2)
        out[idx] = amplitude * Math.cos(phase)
        out[idx + 1] = amplitude * Math.sin(phase)
      }
    }
  }
  return out
}

function localizedAEnvelopePlaneWave(
  shape: [number, number, number],
  extents: { aMin: number; aMax: number; phiExtent: number },
  k: [number, number, number],
  sigmaCells: number
): Float32Array {
  const [Na, N1, N2] = shape
  const out = new Float32Array(2 * Na * N1 * N2)
  const da = (extents.aMax - extents.aMin) / (Na - 1)
  const dphi1 = N1 > 1 ? (2 * extents.phiExtent) / (N1 - 1) : 0
  const dphi2 = N2 > 1 ? (2 * extents.phiExtent) / (N2 - 1) : 0
  const centerA = 0.5 * (Na - 1)
  for (let ia = 0; ia < Na; ia++) {
    const a = extents.aMin + ia * da
    const envelope = Math.exp(-0.5 * ((ia - centerA) / sigmaCells) ** 2)
    for (let i1 = 0; i1 < N1; i1++) {
      const phi1 = -extents.phiExtent + i1 * dphi1
      for (let i2 = 0; i2 < N2; i2++) {
        const phi2 = -extents.phiExtent + i2 * dphi2
        const phase = k[0] * a + k[1] * phi1 + k[2] * phi2
        const idx = 2 * (ia * N1 * N2 + i1 * N2 + i2)
        out[idx] = envelope * Math.cos(phase)
        out[idx + 1] = envelope * Math.sin(phase)
      }
    }
  }
  return out
}

describe('WKB cross-diagnostic — phase-rate champion', () => {
  it('selects "a" when the plane wave winds fastest along the a-axis', () => {
    const shape: [number, number, number] = [16, 8, 8]
    // k_a = 0.6, k_phi1 = 0.1, k_phi2 = 0.1. a is the dominant winder.
    const chi = syntheticPlaneWave(shape, [0.6, 0.1, 0.1])
    const rates = computeWkbPhaseRates(chi, shape, 0, 15, 3.5, 0)
    expect(rates.a).toBeGreaterThan(rates.phi1)
    expect(rates.a).toBeGreaterThan(rates.phi2)
    expect(findWkbChampion(rates)).toBe('a')
  })

  it('selects "phi1" when the plane wave winds fastest along the phi1 axis', () => {
    const shape: [number, number, number] = [16, 8, 8]
    const chi = syntheticPlaneWave(shape, [0.1, 0.6, 0.1])
    const rates = computeWkbPhaseRates(chi, shape, 0, 15, 3.5, 0)
    expect(rates.phi1).toBeGreaterThan(rates.a)
    expect(rates.phi1).toBeGreaterThan(rates.phi2)
    expect(findWkbChampion(rates)).toBe('phi1')
  })

  it('returns null on a near-uniform phase (no winner)', () => {
    const shape: [number, number, number] = [12, 6, 6]
    // Equal phase rates in all three directions — strict tie.
    const chi = syntheticPlaneWave(shape, [0.3, 0.3, 0.3])
    const rates = computeWkbPhaseRates(chi, shape, 0, 11, 2.5, 0)
    // The mean |∂S/∂x| should be ~equal across the three axes; the
    // champion selector should not declare a clear winner.
    expect(findWkbChampion(rates, 0.05)).toBeNull()
  })

  it('compares physical phase gradients instead of raw grid-cell increments', () => {
    const shape: [number, number, number] = [11, 11, 11]
    const extents = { aMin: 0, aMax: 1, phiExtent: 5 }
    const chi = syntheticPhysicalPlaneWave(shape, extents, [1, 1, 0])
    const rates = computeWkbPhaseRates(chi, shape, extents.aMin, extents.aMax, extents.phiExtent, 0)
    expect(rates.a).toBeCloseTo(rates.phi1, 5)
    expect(findWkbChampion(rates, 0.05)).toBeNull()
  })

  it('phase rates scale linearly with k for small k', () => {
    const shape: [number, number, number] = [12, 6, 6]
    const slow = computeWkbPhaseRates(
      syntheticPlaneWave(shape, [0.1, 0.05, 0.05]),
      shape,
      0,
      11,
      2.5,
      0
    )
    const fast = computeWkbPhaseRates(
      syntheticPlaneWave(shape, [0.4, 0.05, 0.05]),
      shape,
      0,
      11,
      2.5,
      0
    )
    // a is the winder in both, fast is winding 4× harder.
    expect(fast.a / slow.a).toBeGreaterThan(2.5)
    expect(fast.a / slow.a).toBeLessThan(5.0)
  })

  it('weights WKB phase rates by wavefunction support instead of empty-tail phase noise', () => {
    const shape: [number, number, number] = [16, 8, 8]
    const chi = supportedAClockWithLowDensityPhiNoise(shape)
    const rates = computeWkbPhaseRates(chi, shape, 0, 15, 3.5, 0)

    expect(rates.a).toBeGreaterThan(0.3)
    expect(rates.phi1).toBeLessThan(0.01)
    expect(findWkbChampion(rates)).toBe('a')
  })

  it('does not penalize a valid local WKB momentum because support is narrow along that axis', () => {
    const shape: [number, number, number] = [21, 21, 21]
    const extents = { aMin: 0, aMax: 20, phiExtent: 10 }
    const chi = localizedAEnvelopePlaneWave(shape, extents, [0.4, 0.4, 0.4], 0.8)

    const rates = computeWkbPhaseRates(chi, shape, extents.aMin, extents.aMax, extents.phiExtent, 0)

    expect(rates.a).toBeCloseTo(rates.phi1, 5)
    expect(rates.a).toBeCloseTo(rates.phi2, 5)
    expect(findWkbChampion(rates, 0.05)).toBeNull()
  })

  it('findWkbChampion returns null when any rate is non-finite', () => {
    expect(findWkbChampion({ a: 1, phi1: Number.NaN, phi2: 0.5 })).toBeNull()
    expect(findWkbChampion({ a: 1, phi1: 0.5, phi2: Number.POSITIVE_INFINITY })).toBeNull()
  })
})
