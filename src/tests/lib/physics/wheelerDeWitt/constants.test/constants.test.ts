/**
 * Direct tests for the Wheeler–DeWitt closed-form helpers in `constants.ts`.
 *
 * These functions are the "single source of truth" for the minisuperspace
 * physics model — every downstream file (solver, Airy connection, HJ
 * operator, density packer) consults them. Larger test suites exercise
 * them transitively, but a sign flip or algebra typo in one of the
 * closed forms would manifest there as a vague solver regression rather
 * than pointing at this file. This suite pins the identities directly:
 *
 *   1. `wdwU(a_turn, φ) === 0`, and `wdwU` flips sign across the turning
 *      surface in the expected direction.
 *   2. `wdwEuclideanWkbAction` matches a numerical quadrature of
 *      `∫_{a_turn}^{a} √U da'` for a > a_turn.
 *   3. `wdwLorentzianWkbAction` matches `∫_{a}^{a_turn} √|U| da'` for
 *      a < a_turn.
 *   4. `wdwLangerVariable` is negative in the Lorentzian region, positive
 *      in the Euclidean region, zero at the turning surface, and its
 *      `(2/3)|ζ|^{3/2}` equals the correct action in each regime.
 *   5. `wdwTurningA` returns null for `V(φ) ≤ 0` and the correct radius
 *      otherwise.
 *
 * @module tests/lib/physics/wheelerDeWitt/constants
 */

import { describe, expect, it } from 'vitest'

import {
  WDW_C_U,
  WDW_G_PREFACTOR,
  wdwEuclideanWkbAction,
  wdwLangerVariable,
  wdwLorentzianWkbAction,
  wdwPotential,
  wdwTurningA,
  wdwU,
} from '@/lib/physics/wheelerDeWitt/constants'

/** Midpoint-rule numerical quadrature of `√U` (or `√|U|`) from a0 → a1. */
function midpointQuadrature(
  integrand: (a: number) => number,
  a0: number,
  a1: number,
  nSteps: number
): number {
  if (a1 <= a0) return 0
  const h = (a1 - a0) / nSteps
  let sum = 0
  for (let k = 0; k < nSteps; k++) {
    const a = a0 + (k + 0.5) * h
    sum += integrand(a)
  }
  return sum * h
}

describe('WDW_C_U / WDW_G_PREFACTOR literal consistency', () => {
  // These two constants appear individually in every downstream file. Pin
  // their numeric values against the closed-form definitions so a future
  // "let me inline this" edit can't drift them.
  it('WDW_C_U equals 36π²', () => {
    expect(WDW_C_U).toBeCloseTo(36 * Math.PI * Math.PI, 12)
  })

  it('WDW_G_PREFACTOR equals 8π/3', () => {
    expect(WDW_G_PREFACTOR).toBeCloseTo((8 * Math.PI) / 3, 12)
  })
})

describe('wdwPotential', () => {
  it('evaluates ½m²(φ₁²+φ₂²) + Λ', () => {
    // Hand-computed: ½·(0.3²)·(0.5² + 0.25²) + (-0.1) = ½·0.09·0.3125 − 0.1
    //              = 0.0140625 − 0.1 = −0.0859375
    expect(wdwPotential(0.5, 0.25, 0.3, -0.1)).toBeCloseTo(-0.0859375, 12)
  })

  it('is invariant under (φ₁, φ₂) → (±φ₁, ±φ₂) (the quadratic form)', () => {
    const base = wdwPotential(0.4, 0.6, 1, 0.2)
    expect(wdwPotential(-0.4, 0.6, 1, 0.2)).toBe(base)
    expect(wdwPotential(0.4, -0.6, 1, 0.2)).toBe(base)
    expect(wdwPotential(-0.4, -0.6, 1, 0.2)).toBe(base)
  })
})

describe('wdwTurningA', () => {
  it('returns null when V(φ) ≤ 0', () => {
    // (m, Λ) chosen so V(0, 0) = Λ = 0 exactly.
    expect(wdwTurningA(0, 0, 1.0, 0)).toBeNull()
    // V(0, 0) = Λ = -1 < 0.
    expect(wdwTurningA(0, 0, 1.0, -1)).toBeNull()
  })

  it('returns 1/√(K·V) when V(φ) > 0 — matches the U = 0 algebraic root', () => {
    const m = 0.5
    const lambda = 0.2
    const phi1 = 0.3
    const phi2 = -0.4
    const V = wdwPotential(phi1, phi2, m, lambda)
    expect(V).toBeGreaterThan(0)
    const aTurn = wdwTurningA(phi1, phi2, m, lambda)!
    expect(aTurn).toBeCloseTo(1 / Math.sqrt(WDW_G_PREFACTOR * V), 12)
    // Verify U actually vanishes at this radius.
    expect(wdwU(aTurn, phi1, phi2, m, lambda)).toBeCloseTo(0, 10)
  })
})

describe('wdwU sign flip across the turning surface', () => {
  it('U < 0 (Lorentzian) just below a_turn and U > 0 (Euclidean) just above', () => {
    const m = 0.8
    const lambda = 0.3
    const phi1 = 0.5
    const phi2 = 0.1
    const aTurn = wdwTurningA(phi1, phi2, m, lambda)
    if (aTurn === null) throw new Error('aTurn must be finite for chosen inputs')
    const Below = wdwU(aTurn * 0.999, phi1, phi2, m, lambda)
    const Above = wdwU(aTurn * 1.001, phi1, phi2, m, lambda)
    expect(Below).toBeLessThan(0)
    expect(Above).toBeGreaterThan(0)
  })
})

describe('wdwEuclideanWkbAction', () => {
  const m = 0.7
  const lambda = 0.15
  const phi1 = 0.2
  const phi2 = 0.0
  const aTurn = wdwTurningA(phi1, phi2, m, lambda)!

  it('vanishes at the turning surface and just below it', () => {
    expect(wdwEuclideanWkbAction(aTurn, phi1, phi2, m, lambda)).toBeCloseTo(0, 10)
    // Below the turning surface the integral is not defined (domain is
    // Euclidean region); the helper returns 0 by contract.
    expect(wdwEuclideanWkbAction(aTurn * 0.5, phi1, phi2, m, lambda)).toBe(0)
  })

  it('matches midpoint quadrature of ∫ √U da for a well above a_turn', () => {
    const aTarget = aTurn * 2
    const closed = wdwEuclideanWkbAction(aTarget, phi1, phi2, m, lambda)
    const integrand = (a: number) => Math.sqrt(wdwU(a, phi1, phi2, m, lambda))
    const quad = midpointQuadrature(integrand, aTurn, aTarget, 4096)
    // Midpoint rule on √U has a 1/√(a−a_turn) singularity at the lower
    // bound. Still converges to 3–4 digits at 4096 steps — good enough to
    // catch a sign flip or factor-of-two in the closed form.
    expect(Math.abs(closed - quad) / Math.max(closed, 1e-6)).toBeLessThan(0.01)
  })
})

describe('wdwLorentzianWkbAction', () => {
  const m = 0.7
  const lambda = 0.15
  const phi1 = 0.2
  const phi2 = 0.0
  const aTurn = wdwTurningA(phi1, phi2, m, lambda)!

  it('vanishes at the turning surface and just above it', () => {
    expect(wdwLorentzianWkbAction(aTurn, phi1, phi2, m, lambda)).toBeCloseTo(0, 10)
    expect(wdwLorentzianWkbAction(aTurn * 1.5, phi1, phi2, m, lambda)).toBe(0)
  })

  it('matches midpoint quadrature of ∫ √|U| da below the turning surface', () => {
    const aTarget = aTurn * 0.4
    const closed = wdwLorentzianWkbAction(aTarget, phi1, phi2, m, lambda)
    const integrand = (a: number) => Math.sqrt(-wdwU(a, phi1, phi2, m, lambda))
    const quad = midpointQuadrature(integrand, aTarget, aTurn, 4096)
    expect(Math.abs(closed - quad) / Math.max(closed, 1e-6)).toBeLessThan(0.01)
  })

  it('returns 0 for V ≤ 0 columns (no turning point)', () => {
    // Λ = -1, φ = 0 ⇒ V = -1 < 0.
    expect(wdwLorentzianWkbAction(0.5, 0, 0, 1, -1)).toBe(0)
  })
})

describe('wdwLangerVariable', () => {
  const m = 1.2
  const lambda = 0.1
  const phi1 = 0.25
  const phi2 = -0.15
  const aTurn = wdwTurningA(phi1, phi2, m, lambda)!

  it('is zero at the turning surface', () => {
    expect(wdwLangerVariable(aTurn, phi1, phi2, m, lambda)).toBeCloseTo(0, 10)
  })

  it('is negative (Lorentzian) for a < a_turn', () => {
    expect(wdwLangerVariable(aTurn * 0.5, phi1, phi2, m, lambda)).toBeLessThan(0)
  })

  it('is positive (Euclidean) for a > a_turn', () => {
    expect(wdwLangerVariable(aTurn * 2, phi1, phi2, m, lambda)).toBeGreaterThan(0)
  })

  it('(2/3)·|ζ|^{3/2} equals the Euclidean WKB action for a > a_turn', () => {
    const a = aTurn * 1.8
    const zeta = wdwLangerVariable(a, phi1, phi2, m, lambda)
    const action = wdwEuclideanWkbAction(a, phi1, phi2, m, lambda)
    expect(zeta).toBeGreaterThan(0)
    expect((2 / 3) * Math.pow(zeta, 1.5)).toBeCloseTo(action, 8)
  })

  it('(2/3)·|ζ|^{3/2} equals the Lorentzian WKB action for a < a_turn', () => {
    const a = aTurn * 0.45
    const zeta = wdwLangerVariable(a, phi1, phi2, m, lambda)
    const action = wdwLorentzianWkbAction(a, phi1, phi2, m, lambda)
    expect(zeta).toBeLessThan(0)
    expect((2 / 3) * Math.pow(-zeta, 1.5)).toBeCloseTo(action, 8)
  })

  it('returns 0 for V ≤ 0 (no turning surface)', () => {
    expect(wdwLangerVariable(0.5, 0, 0, 1, -1)).toBe(0)
  })
})
