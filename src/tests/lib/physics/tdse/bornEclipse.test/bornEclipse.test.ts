import { describe, expect, it } from 'vitest'

import { computeBornEclipseScalar } from '@/lib/physics/tdse/bornEclipse'

describe('TDSE Born Eclipse scalar', () => {
  it('is finite and bounded', () => {
    const scalar = computeBornEclipseScalar({
      current: [1, 0, 0],
      densityGradient: [-2, 0, 0],
      density: 0.4,
      maxDensity: 1,
      averageSpacing: 0.1,
      phase: 0,
      densityGate: 1,
    })

    expect(Number.isFinite(scalar)).toBe(true)
    expect(scalar).toBeGreaterThanOrEqual(0)
    expect(scalar).toBeLessThanOrEqual(1)
  })

  it('brightens only when current exits into the density shadow', () => {
    const shadow = computeBornEclipseScalar({
      current: [1, 0, 0],
      densityGradient: [-1, 0, 0],
      density: 0.6,
      maxDensity: 1,
      averageSpacing: 0.1,
      densityGate: 1,
    })
    const uphill = computeBornEclipseScalar({
      current: [1, 0, 0],
      densityGradient: [1, 0, 0],
      density: 0.6,
      maxDensity: 1,
      averageSpacing: 0.1,
      densityGate: 1,
    })

    expect(shadow).toBeGreaterThan(0)
    expect(uphill).toBe(0)
  })

  it('increases with stronger flow and density slope at fixed alignment', () => {
    const weak = computeBornEclipseScalar({
      current: [0.2, 0, 0],
      densityGradient: [-0.2, 0, 0],
      density: 0.7,
      maxDensity: 1,
      averageSpacing: 0.1,
      densityGate: 1,
    })
    const strong = computeBornEclipseScalar({
      current: [1.2, 0, 0],
      densityGradient: [-1.2, 0, 0],
      density: 0.7,
      maxDensity: 1,
      averageSpacing: 0.1,
      densityGate: 1,
    })

    expect(strong).toBeGreaterThan(weak)
  })

  it('returns zero for empty or degenerate vectors', () => {
    expect(
      computeBornEclipseScalar({
        current: [1, 0, 0],
        densityGradient: [-1, 0, 0],
        density: 0,
        maxDensity: 1,
        averageSpacing: 0.1,
      })
    ).toBe(0)
    expect(
      computeBornEclipseScalar({
        current: [0, 0, 0],
        densityGradient: [-1, 0, 0],
        density: 1,
        maxDensity: 1,
        averageSpacing: 0.1,
      })
    ).toBe(0)
  })
})
