import { describe, expect, it } from 'vitest'

import type { CtcFractalCarpetInput } from '@/lib/physics/quantumWalk/ctcFractalCarpet'
import { ctcFractalCarpetScalar } from '@/lib/physics/quantumWalk/ctcFractalCarpet'

function sample(overrides: Partial<CtcFractalCarpetInput> = {}): CtcFractalCarpetInput {
  return {
    probability: 0.42,
    maxDensity: 1.25,
    phase: Math.PI * 0.73,
    chirality: 0.34,
    walkSteps: 19,
    latticeDim: 3,
    gridSize: [32, 32, 32],
    coords: [9, 15, 24],
    perpendicularFalloff: 1,
    ...overrides,
  }
}

describe('ctcFractalCarpetScalar', () => {
  it('returns exactly zero when probability is zero', () => {
    expect(ctcFractalCarpetScalar(sample({ probability: 0 }))).toBe(0)
  })

  it('stays finite and bounded for edge coordinates in 2D, 3D, and 4D configs', () => {
    const cases: CtcFractalCarpetInput[] = [
      sample({
        latticeDim: 2,
        gridSize: [16, 64],
        coords: [0, 63],
        phase: -17.25,
        chirality: 4.7,
        maxDensity: 1e-40,
        perpendicularFalloff: 0.37,
      }),
      sample({
        latticeDim: 3,
        gridSize: [2, 32, 128],
        coords: [1, 0, 127],
        phase: 99.5,
        chirality: -3.2,
        maxDensity: 0.03,
      }),
      sample({
        latticeDim: 4,
        gridSize: [8, 16, 32, 64],
        coords: [7, 0, 31, 63],
        phase: Math.PI * 11.9,
        chirality: 0.91,
        walkSteps: 4097,
      }),
    ]

    for (const input of cases) {
      const scalar = ctcFractalCarpetScalar(input)
      expect(Number.isFinite(scalar)).toBe(true)
      expect(scalar).toBeGreaterThanOrEqual(0)
      expect(scalar).toBeLessThanOrEqual(1)
    }
  })

  it('changes with the live walk step phase at representative lattice points', () => {
    const a = ctcFractalCarpetScalar(sample({ walkSteps: 5 }))
    const b = ctcFractalCarpetScalar(sample({ walkSteps: 41 }))

    expect(Math.abs(a - b)).toBeGreaterThan(1e-3)
  })

  it('suppresses faint normalized density so background cannot become a filled cube', () => {
    const bright = ctcFractalCarpetScalar(sample({ probability: 0.42, maxDensity: 1 }))
    const faint = ctcFractalCarpetScalar(sample({ probability: 0.01, maxDensity: 1 }))

    expect(bright).toBeGreaterThan(0.01)
    expect(faint).toBeLessThan(0.005)
    expect(faint).toBeLessThan(bright * 0.03)
  })

  it('moves closure bands when phase and chirality change', () => {
    const base = sample({ phase: Math.PI * 0.1, chirality: -0.45 })
    const shifted = sample({ phase: Math.PI * 1.38, chirality: 0.62 })

    expect(
      Math.abs(ctcFractalCarpetScalar(base) - ctcFractalCarpetScalar(shifted))
    ).toBeGreaterThan(1e-3)
  })
})
