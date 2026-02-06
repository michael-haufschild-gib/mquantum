import { describe, it, expect } from 'vitest'
import {
  computeHOBoundingRadius,
  computeHydrogenBoundingRadius,
  computeBoundingRadius,
} from '@/lib/geometry/extended/schroedinger/boundingRadius'
import { generateQuantumPreset } from '@/lib/geometry/extended/schroedinger/presets'

describe('computeHOBoundingRadius', () => {
  it('returns at least 2.0 for any state', () => {
    const R = computeHOBoundingRadius(3, [[0, 0, 0]], [1.0, 1.0, 1.0])
    expect(R).toBeGreaterThanOrEqual(2.0)
  })

  it('grows with higher quantum numbers', () => {
    const R_low = computeHOBoundingRadius(3, [[0, 0, 0]], [1.0, 1.0, 1.0])
    const R_high = computeHOBoundingRadius(3, [[3, 2, 1]], [1.0, 1.0, 1.0])
    expect(R_high).toBeGreaterThan(R_low)
  })

  it('grows with lower frequencies (wider wavefunctions)', () => {
    const R_highOmega = computeHOBoundingRadius(3, [[2, 2, 2]], [2.0, 2.0, 2.0])
    const R_lowOmega = computeHOBoundingRadius(3, [[2, 2, 2]], [0.5, 0.5, 0.5])
    expect(R_lowOmega).toBeGreaterThan(R_highOmega)
  })

  it('uses the maximum quantum number across all terms', () => {
    const R_single = computeHOBoundingRadius(3, [[4, 0, 0]], [1.0, 1.0, 1.0])
    const R_multi = computeHOBoundingRadius(
      3,
      [
        [0, 0, 0],
        [4, 0, 0],
      ],
      [1.0, 1.0, 1.0]
    )
    // Multi-term with same max n should give same radius
    expect(R_multi).toBeCloseTo(R_single, 5)
  })

  it('produces R~5 for ground state n=[0,0,0] omega~1.0', () => {
    // classical turning point for n=0, omega=1: sqrt(1)/1 = 1
    // + margin: 1 + 4/1 = 5
    const R = computeHOBoundingRadius(3, [[0, 0, 0]], [1.0, 1.0, 1.0])
    expect(R).toBeCloseTo(5.0, 0)
  })

  it('produces R~7 for typical n=2 omega~0.81 state', () => {
    // classical turning point for n=2, omega=0.81: sqrt(5)/sqrt(0.81) = 2.236/0.9 ≈ 2.48
    // + margin: 2.48 + 4/0.9 ≈ 6.93
    const R = computeHOBoundingRadius(3, [[2, 0, 0]], [0.81, 0.81, 0.81])
    expect(R).toBeGreaterThan(6.0)
    expect(R).toBeLessThan(8.0)
  })
})

describe('computeHydrogenBoundingRadius', () => {
  it('returns at least 2.0', () => {
    const R = computeHydrogenBoundingRadius(1, 1.0)
    expect(R).toBeGreaterThanOrEqual(2.0)
  })

  it('grows quadratically with principal quantum number', () => {
    const R1 = computeHydrogenBoundingRadius(1, 1.0)
    const R2 = computeHydrogenBoundingRadius(2, 1.0)
    const R3 = computeHydrogenBoundingRadius(3, 1.0)
    expect(R2).toBeGreaterThan(R1)
    expect(R3).toBeGreaterThan(R2)
    // n=3 should give R = 9*1.0*3.0 = 27
    expect(R3).toBeCloseTo(27.0, 0)
  })

  it('scales with Bohr radius', () => {
    const R_small = computeHydrogenBoundingRadius(2, 0.5)
    const R_large = computeHydrogenBoundingRadius(2, 2.0)
    expect(R_large).toBeGreaterThan(R_small)
  })

  it('accounts for extra dimension quantum numbers', () => {
    const R_base = computeHydrogenBoundingRadius(2, 1.0)
    const R_extra = computeHydrogenBoundingRadius(2, 1.0, [4, 2], [1.0, 1.0])
    expect(R_extra).toBeGreaterThanOrEqual(R_base)
  })
})

describe('computeBoundingRadius (dispatch)', () => {
  it('dispatches to HO for harmonicOscillator mode', () => {
    const preset = generateQuantumPreset(42, 3, 1, 3, 0.01)
    const R = computeBoundingRadius('harmonicOscillator', preset, 3)
    expect(R).toBeGreaterThanOrEqual(2.0)
    expect(R).toBeGreaterThan(3.0) // Should extend beyond old BOUND_R
  })

  it('dispatches to hydrogen for hydrogenND mode', () => {
    const R = computeBoundingRadius('hydrogenND', null, 3, 3, 1.0)
    expect(R).toBeCloseTo(27.0, 0)
  })

  it('returns MIN_BOUND_R when no preset available', () => {
    const R = computeBoundingRadius('harmonicOscillator', null, 3)
    expect(R).toBe(2.0)
  })
})
