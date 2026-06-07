import { describe, expect, it } from 'vitest'

import {
  computeHubbleLaceBulk4DGate,
  computeHubbleLaceScalar,
} from '@/lib/physics/dirac/hubbleLace'

const brightBase = {
  rho: 0.08,
  upperDensity: 0.5,
  lowerDensity: 0.5,
  current: [1, 0, 0] as const,
  spin: [1, 0, 0] as const,
  radiusNorm: 0,
  azimuth: 0,
  phase: 0,
  simTime: 0,
  latticeDim: 3,
}

describe('Dirac Hubble Lace scalar', () => {
  it('returns a finite bounded scalar for aligned balanced sectors', () => {
    const value = computeHubbleLaceScalar(brightBase)

    expect(Number.isFinite(value)).toBe(true)
    expect(value).toBeGreaterThan(0)
    expect(value).toBeLessThanOrEqual(1)
  })

  it('stays dark below the density gate', () => {
    expect(computeHubbleLaceScalar({ ...brightBase, rho: 0 })).toBe(0)
    expect(computeHubbleLaceScalar({ ...brightBase, rho: 1e-6 })).toBeLessThan(1e-6)
  })

  it('brightens when current and spin expectations are helically aligned', () => {
    const aligned = computeHubbleLaceScalar(brightBase)
    const orthogonal = computeHubbleLaceScalar({
      ...brightBase,
      spin: [0, 1, 0],
    })

    expect(aligned).toBeGreaterThan(orthogonal)
    expect(orthogonal).toBe(0)
  })

  it('darkens under particle/antiparticle sector imbalance', () => {
    const balanced = computeHubbleLaceScalar(brightBase)
    const imbalanced = computeHubbleLaceScalar({
      ...brightBase,
      upperDensity: 0.98,
      lowerDensity: 0.02,
    })
    const absent = computeHubbleLaceScalar({
      ...brightBase,
      upperDensity: 1,
      lowerDensity: 0,
    })

    expect(imbalanced).toBeLessThan(balanced * 0.1)
    expect(absent).toBe(0)
  })

  it('keeps the 4D gate as identity in 3D and slice-sensitive in 4D', () => {
    expect(computeHubbleLaceBulk4DGate(-10, 1.2, 0.5, 3)).toBe(1)
    expect(computeHubbleLaceBulk4DGate(10, 1.2, 0.5, 3)).toBe(1)

    const sliceA = computeHubbleLaceBulk4DGate(0, 0, 0, 4)
    const sliceB = computeHubbleLaceBulk4DGate(0.5, 0, 0, 4)

    expect(sliceA).not.toBeCloseTo(sliceB, 6)
    expect(sliceA).toBeGreaterThanOrEqual(0)
    expect(sliceA).toBeLessThanOrEqual(1)
    expect(sliceB).toBeGreaterThanOrEqual(0)
    expect(sliceB).toBeLessThanOrEqual(1)
  })
})
