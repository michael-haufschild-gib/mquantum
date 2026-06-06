import { describe, expect, it } from 'vitest'

import { computeCliffordBloomScalar } from '@/lib/physics/dirac/cliffordBloom'

describe('Dirac Clifford Bloom scalar', () => {
  it('returns a bounded finite scalar for balanced upper/lower sectors', () => {
    const value = computeCliffordBloomScalar({
      upperDensity: 0.5,
      lowerDensity: 0.5,
      relativePhase: Math.PI / 4,
      phiXY: 0.3,
      phiXZ: -0.5,
      radius: 1.4,
      simTime: 0.25,
    })

    expect(Number.isFinite(value)).toBe(true)
    expect(value).toBeGreaterThan(0)
    expect(value).toBeLessThanOrEqual(1)
  })

  it('stays dark when either representation sector is absent', () => {
    expect(
      computeCliffordBloomScalar({
        upperDensity: 1,
        lowerDensity: 0,
        relativePhase: 0,
      })
    ).toBe(0)
    expect(
      computeCliffordBloomScalar({
        upperDensity: 0,
        lowerDensity: 1,
        relativePhase: 0,
      })
    ).toBe(0)
  })

  it('is symmetric under swapping equal geometry sector phases', () => {
    const forward = computeCliffordBloomScalar({
      upperDensity: 0.7,
      lowerDensity: 0.3,
      relativePhase: Math.PI / 5,
      phiXY: 0,
      phiXZ: 0,
      radius: 0,
      simTime: 0,
    })
    const swapped = computeCliffordBloomScalar({
      upperDensity: 0.3,
      lowerDensity: 0.7,
      relativePhase: -Math.PI / 5,
      phiXY: 0,
      phiXZ: 0,
      radius: 0,
      simTime: 0,
    })

    expect(swapped).toBeCloseTo(forward, 12)
  })

  it('uses densityGate as an explicit visibility mask', () => {
    const full = computeCliffordBloomScalar({
      upperDensity: 0.5,
      lowerDensity: 0.5,
      relativePhase: 0,
      densityGate: 1,
    })
    const dim = computeCliffordBloomScalar({
      upperDensity: 0.5,
      lowerDensity: 0.5,
      relativePhase: 0,
      densityGate: 0.25,
    })

    expect(dim).toBeCloseTo(full * 0.25, 12)
    expect(
      computeCliffordBloomScalar({
        upperDensity: 0.5,
        lowerDensity: 0.5,
        relativePhase: 0,
        densityGate: 0,
      })
    ).toBe(0)
  })

  it('creates petal contrast from visible-plane angular phase', () => {
    const brightPetal = computeCliffordBloomScalar({
      upperDensity: 0.5,
      lowerDensity: 0.5,
      relativePhase: 0,
      phiXY: 0,
      phiXZ: 0,
    })
    const darkPetal = computeCliffordBloomScalar({
      upperDensity: 0.5,
      lowerDensity: 0.5,
      relativePhase: 0,
      phiXY: Math.PI / 4,
      phiXZ: 0,
    })

    expect(brightPetal).toBeGreaterThan(darkPetal)
    expect(brightPetal - darkPetal).toBeGreaterThan(0.15)
  })

  it('sanitizes corrupted samples to a dark finite value', () => {
    expect(
      computeCliffordBloomScalar({
        upperDensity: Number.NaN,
        lowerDensity: Number.POSITIVE_INFINITY,
        relativePhase: Number.NaN,
        densityGate: Number.NEGATIVE_INFINITY,
      })
    ).toBe(0)
  })
})
