import { describe, expect, it } from 'vitest'

import type { DiracConfig } from '@/lib/geometry/extended/dirac'
import { DEFAULT_DIRAC_CONFIG } from '@/lib/geometry/extended/dirac'
import {
  computeBoundingRadius,
  computeDiracBoundingRadius,
  computeHOBoundingRadius,
  computeHOMomentumBoundingRadius,
  computeHydrogenBoundingRadius,
  computeHydrogenMomentumBoundingRadius,
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

  it('produces R~3.5 for ground state n=[0,0,0] omega~1.0', () => {
    // classical turning point for n=0, omega=1: sqrt(1)/1 = 1
    // + margin: 1 + 2.5/1 = 3.5
    const R = computeHOBoundingRadius(3, [[0, 0, 0]], [1.0, 1.0, 1.0])
    expect(R).toBeCloseTo(3.5, 0)
  })

  it('produces R~5.3 for typical n=2 omega~0.81 state', () => {
    // classical turning point for n=2, omega=0.81: sqrt(5)/sqrt(0.81) = 2.236/0.9 ≈ 2.48
    // + margin: 2.48 + 2.5/0.9 ≈ 5.26
    const R = computeHOBoundingRadius(3, [[2, 0, 0]], [0.81, 0.81, 0.81])
    expect(R).toBeGreaterThan(5.0)
    expect(R).toBeLessThan(6.0)
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

describe('computeHOMomentumBoundingRadius', () => {
  it('returns at least 2.0 for any state', () => {
    const R = computeHOMomentumBoundingRadius(3, [[0, 0, 0]], [1.0, 1.0, 1.0])
    expect(R).toBeGreaterThanOrEqual(2.0)
  })

  it('is reciprocal to position-space for omega', () => {
    // For omega=1, position and momentum bounds should be equal
    const R_pos = computeHOBoundingRadius(3, [[2, 0, 0]], [1.0, 1.0, 1.0])
    const R_mom = computeHOMomentumBoundingRadius(3, [[2, 0, 0]], [1.0, 1.0, 1.0])
    expect(R_mom).toBeCloseTo(R_pos, 4)
  })

  it('grows with higher frequencies (narrower in x, wider in k)', () => {
    const R_lowOmega = computeHOMomentumBoundingRadius(3, [[2, 2, 2]], [0.5, 0.5, 0.5])
    const R_highOmega = computeHOMomentumBoundingRadius(3, [[2, 2, 2]], [2.0, 2.0, 2.0])
    // Higher omega → wider in momentum space
    expect(R_highOmega).toBeGreaterThan(R_lowOmega)
  })

  it('shrinks when momentumScale increases', () => {
    const R_scale1 = computeHOMomentumBoundingRadius(3, [[2, 0, 0]], [1.0, 1.0, 1.0], 1.0)
    const R_scale2 = computeHOMomentumBoundingRadius(3, [[2, 0, 0]], [1.0, 1.0, 1.0], 2.0)
    expect(R_scale2).toBeLessThan(R_scale1)
  })
})

describe('computeHydrogenMomentumBoundingRadius', () => {
  it('returns at least 2.0', () => {
    const R = computeHydrogenMomentumBoundingRadius(1, 1.0)
    expect(R).toBeGreaterThanOrEqual(2.0)
  })

  it('is much smaller than position-space radius for large n', () => {
    // Position: n=4, a0=1 → R = 48
    // Momentum: R ≈ 6/(4*1) = 1.5 → clamped to 2.0
    const R_pos = computeHydrogenBoundingRadius(4, 1.0)
    const R_mom = computeHydrogenMomentumBoundingRadius(4, 1.0)
    expect(R_pos).toBeGreaterThan(40)
    expect(R_mom).toBeLessThan(10)
  })

  it('shrinks (inversely) with principal quantum number', () => {
    const R1 = computeHydrogenMomentumBoundingRadius(1, 1.0)
    const R3 = computeHydrogenMomentumBoundingRadius(3, 1.0)
    // Larger n → smaller momentum extent → smaller bounding radius
    expect(R3).toBeLessThan(R1)
  })
})

describe('computeHOBoundingRadius — edge cases', () => {
  it('clamps near-zero omega to 0.01 (prevents infinite radius)', () => {
    // omega=0 would cause division by zero: turning point = sqrt(2n+1) / sqrt(omega)
    // Production code clamps omega to max(omega, 0.01)
    const R = computeHOBoundingRadius(3, [[0, 0, 0]], [0, 0, 0])
    expect(Number.isFinite(R)).toBe(true)
    expect(R).toBeGreaterThanOrEqual(2.0)
  })

  it('handles negative omega by clamping', () => {
    const R = computeHOBoundingRadius(3, [[0, 0, 0]], [-1.0, -1.0, -1.0])
    expect(Number.isFinite(R)).toBe(true)
    expect(R).toBeGreaterThanOrEqual(2.0)
  })

  it('handles high quantum numbers (n=7) without overflow', () => {
    const R = computeHOBoundingRadius(3, [[7, 7, 7]], [1.0, 1.0, 1.0])
    expect(Number.isFinite(R)).toBe(true)
    // sqrt(2*7+1) = sqrt(15) ≈ 3.87, + 2.5 margin ≈ 6.37
    expect(R).toBeGreaterThan(6.0)
    expect(R).toBeLessThan(10.0)
  })

  it('handles 11D with high quantum numbers', () => {
    const qn = [Array(11).fill(5) as number[]]
    const omegas = Array(11).fill(1.0) as number[]
    const R = computeHOBoundingRadius(11, qn, omegas)
    expect(Number.isFinite(R)).toBe(true)
    expect(R).toBeGreaterThan(3.0)
  })

  it('handles empty quantum numbers array gracefully', () => {
    // Empty quantumNumbers should return MIN_BOUND_R (2.0), not NaN
    const R = computeHOBoundingRadius(3, [], [1.0, 1.0, 1.0])
    expect(R).toBe(2.0)
    expect(Number.isFinite(R)).toBe(true)
  })

  it('handles missing omega entries by defaulting to 1.0', () => {
    // Omega array shorter than dimension
    const R = computeHOBoundingRadius(3, [[2, 2, 2]], [1.0])
    expect(Number.isFinite(R)).toBe(true)
    expect(R).toBeGreaterThanOrEqual(2.0)
  })
})

describe('computeHydrogenBoundingRadius — N-dimensional', () => {
  it('uses n_eff = n + (D-3)/2 for D > 3', () => {
    // D=5: n_eff = 2 + 1 = 3, R = 9 * 1.0 * 3.0 = 27
    const R = computeHydrogenBoundingRadius(2, 1.0, undefined, undefined, 5)
    expect(R).toBeCloseTo(27.0, 0)
  })

  it('n_eff equals n for D=3 (standard hydrogen)', () => {
    // D=3: n_eff = n + 0 = n
    const R = computeHydrogenBoundingRadius(2, 1.0, undefined, undefined, 3)
    // R = 4 * 1.0 * 3.0 = 12
    expect(R).toBeCloseTo(12.0, 0)
  })

  it('n_eff handles even dimensions (half-integer offset)', () => {
    // D=4: n_eff = 2 + 0.5 = 2.5
    const R = computeHydrogenBoundingRadius(2, 1.0, undefined, undefined, 4)
    expect(R).toBeCloseTo(2.5 * 2.5 * 3.0, 2)
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

  it('dispatches to momentum HO when representation is momentum', () => {
    const preset = generateQuantumPreset(42, 3, 1, 3, 0.01)
    const R_mom = computeBoundingRadius(
      'harmonicOscillator',
      preset,
      3,
      2,
      1.0,
      undefined,
      undefined,
      'momentum'
    )
    // For omega≈1 these should be similar to position-space; test that momentum path runs
    expect(R_mom).toBeGreaterThanOrEqual(2.0)
  })

  it('dispatches to momentum hydrogen when representation is momentum', () => {
    const R_pos = computeBoundingRadius('hydrogenND', null, 3, 4, 1.0)
    const R_mom = computeBoundingRadius(
      'hydrogenND',
      null,
      3,
      4,
      1.0,
      undefined,
      undefined,
      'momentum'
    )
    // Momentum should be much smaller for n=4
    expect(R_pos).toBeGreaterThan(40)
    expect(R_mom).toBeLessThan(10)
  })

  it('ignores inactive extra-dimension slots when dimension is lower', () => {
    // Only dim 4 is active (one extra dim: index 0).
    // Hidden higher slots may still contain stale values from a previous higher dimension.
    const extraDimN = [0, 0, 0, 0, 0, 0, 0, 6]
    const extraDimOmega = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.1]

    const R = computeBoundingRadius('hydrogenND', null, 4, 2, 1.0, extraDimN, extraDimOmega)

    // Active physics is n=2, D=4 hydrogen core + one extra dim in ground state.
    // n_eff = 2 + (4-3)/2 = 2.5, radius = 2.5^2 * 1.0 * 3.0 = 18.75.
    expect(R).toBeCloseTo(18.75, 6)
  })

  it('dispatches to Dirac for diracEquation mode', () => {
    const diracConfig: DiracConfig = {
      ...DEFAULT_DIRAC_CONFIG,
      gridSize: [32, 32, 32],
      spacing: [0.2, 0.2, 0.2],
    }
    const R = computeBoundingRadius(
      'diracEquation',
      null,
      3,
      2,
      1.0,
      undefined,
      undefined,
      'position',
      1.0,
      diracConfig
    )
    // maxExtent = 32 * 0.2 * 0.5 = 3.2, R = 3.2 * 1.1 = 3.52
    expect(R).toBeCloseTo(3.52, 2)
  })

  it('dispatches hydrogenNDCoupled same as hydrogenND for position space', () => {
    const R_nd = computeBoundingRadius('hydrogenND', null, 3, 3, 1.0)
    const R_coupled = computeBoundingRadius('hydrogenNDCoupled', null, 3, 3, 1.0)
    expect(R_coupled).toBe(R_nd)
  })

  it('dispatches hydrogenNDCoupled same as hydrogenND for momentum space', () => {
    const R_nd = computeBoundingRadius(
      'hydrogenND',
      null,
      3,
      3,
      1.0,
      undefined,
      undefined,
      'momentum'
    )
    const R_coupled = computeBoundingRadius(
      'hydrogenNDCoupled',
      null,
      3,
      3,
      1.0,
      undefined,
      undefined,
      'momentum'
    )
    expect(R_coupled).toBe(R_nd)
  })

  it('returns MIN_BOUND_R for momentum HO with no preset', () => {
    const R = computeBoundingRadius(
      'harmonicOscillator',
      null,
      3,
      2,
      1.0,
      undefined,
      undefined,
      'momentum'
    )
    expect(R).toBe(2.0)
  })
})

describe('computeDiracBoundingRadius', () => {
  it('computes radius from lattice extent with 1.1 margin', () => {
    const config: DiracConfig = {
      ...DEFAULT_DIRAC_CONFIG,
      gridSize: [64, 64, 64],
      spacing: [0.15, 0.15, 0.15],
    }
    // maxExtent = 64 * 0.15 * 0.5 = 4.8, R = 4.8 * 1.1 = 5.28
    const R = computeDiracBoundingRadius(3, config)
    expect(R).toBeCloseTo(5.28, 2)
  })

  it('returns at least MIN_BOUND_R for small grids', () => {
    const config: DiracConfig = {
      ...DEFAULT_DIRAC_CONFIG,
      gridSize: [4, 4, 4],
      spacing: [0.01, 0.01, 0.01],
    }
    // maxExtent = 4 * 0.01 * 0.5 = 0.02, 0.02*1.1 = 0.022 < 2.0
    const R = computeDiracBoundingRadius(3, config)
    expect(R).toBe(2.0)
  })

  it('uses only min(dimension, 3) axes', () => {
    const config: DiracConfig = {
      ...DEFAULT_DIRAC_CONFIG,
      gridSize: [64, 64, 64, 128, 128],
      spacing: [0.1, 0.1, 0.1, 0.5, 0.5],
    }
    // Only first 3 dims: maxExtent = 64*0.1*0.5 = 3.2
    // The 4th/5th dims (128*0.5*0.5=32) are excluded for dim=3
    const R3 = computeDiracBoundingRadius(3, config)
    expect(R3).toBeCloseTo(3.2 * 1.1, 2)
  })

  it('handles anisotropic spacing (picks largest extent)', () => {
    const config: DiracConfig = {
      ...DEFAULT_DIRAC_CONFIG,
      gridSize: [32, 64, 16],
      spacing: [0.1, 0.2, 0.5],
    }
    // Extents: 32*0.1*0.5=1.6, 64*0.2*0.5=6.4, 16*0.5*0.5=4.0
    // max = 6.4, R = 6.4 * 1.1 = 7.04
    const R = computeDiracBoundingRadius(3, config)
    expect(R).toBeCloseTo(7.04, 2)
  })
})

describe('computeHydrogenBoundingRadius — extra dimensions formula', () => {
  it('extra dim HO formula: R_j = (sqrt(2n+1) + margin) / alpha', () => {
    // n=4, omega=1.0 → alpha=1.0, turning = sqrt(9) = 3, R = (3 + 2.5)/1 = 5.5
    const R = computeHydrogenBoundingRadius(1, 0.001, [4], [1.0], 4)
    // Hydrogen core: nEff = 1 + 0.5 = 1.5, hydrogenR = 1.5^2 * 0.001 * 3 = 0.00675
    // Extra dim: R = (sqrt(9) + 2.5) / 1 = 5.5 → dominates
    expect(R).toBeCloseTo(5.5, 1)
  })

  it('extra dim with low omega gives large radius', () => {
    // n=0, omega=0.25 → alpha=0.5, turning = sqrt(1)/0.5 = 2, margin = 2.5/0.5 = 5, R = 7
    const R = computeHydrogenBoundingRadius(1, 0.001, [0], [0.25], 4)
    expect(R).toBeCloseTo(7.0, 1)
  })
})

describe('computeHydrogenMomentumBoundingRadius — extra dimensions', () => {
  it('extra dim momentum formula: R_j = (sqrt(2n+1) + margin) * alpha / kScale', () => {
    // n=2, omega=4.0 → alpha=2.0, k_extent = (sqrt(5)+2.5)*2 = (2.236+2.5)*2 = 9.472
    // Use large a0 so hydrogen term (6/(nEff*a0*kScale)) is small
    // nEff = 1 + (4-3)/2 = 1.5, hydrogenK/kScale = 6/(1.5*10) = 0.4
    const R = computeHydrogenMomentumBoundingRadius(1, 10.0, 1.0, [2], [4.0], 4)
    const expected = (Math.sqrt(5) + 2.5) * 2.0
    expect(R).toBeCloseTo(expected, 1)
  })

  it('small momentumScale is clamped to 0.01', () => {
    const R_small = computeHydrogenMomentumBoundingRadius(1, 1.0, 0)
    expect(Number.isFinite(R_small)).toBe(true)
    expect(R_small).toBeGreaterThan(2.0)
  })
})
