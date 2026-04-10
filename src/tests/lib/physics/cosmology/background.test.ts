/**
 * Unit tests for the classical FLRW background integrator and the per-frame
 * cosmology snapshot used to drive the shader.
 *
 * Assertions answer:
 *
 * - Does the ODE (paper eq. 1.16) have the three fixed points from eq. (1.21)
 *   and the correct signs of `x'` in each sub-interval of `[−1, 1]`?
 * - Does RK4 integration preserve the invariant `x ∈ [−1, 1]` and converge
 *   to the expected future attractor from paper Table 1?
 * - Does `w(x) = 2x² − 1` satisfy the ekpyrotic `w > 1` bound for `|x| > 1`
 *   and the Kasner `w = 1` limit at `x = ±1`?
 * - Does `computeCosmologyAt` reproduce the Minkowski defaults bit-identically?
 * - Does the de Sitter snapshot produce `a(η) = −1/(Hη)`, the textbook form?
 * - Does the Kasner snapshot give `a(η) = η^(1/(n−2))`?
 * - Does the ekpyrotic snapshot agree with direct evaluation of
 *   `A·|η|^q` for the closed-form `q`?
 *
 * @module
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  backgroundRhs,
  classifyAttractor,
  computeCosmologyAt,
  effectiveMassSquared,
  equationOfState,
  fixedPoints,
  integrateBackground,
  scaleFactorAmplitude,
} from '@/lib/physics/cosmology/background'
import { qExponent, sCritical } from '@/lib/physics/cosmology/presets'

// ───────────────────────────────────────────────────────────────────────────
// Fixed points & RHS
// ───────────────────────────────────────────────────────────────────────────

describe('fixedPoints', () => {
  it('returns x₁ = s/s_c, x₂ = 1, x₃ = −1 per eq. (1.21)', () => {
    const n = 4
    const sc = sCritical(n)
    const s = 2.5 * sc
    const fp = fixedPoints(n, s)
    expect(fp.x1).toBeCloseTo(s / sc, 12)
    expect(fp.x2).toBe(1)
    expect(fp.x3).toBe(-1)
  })
})

describe('backgroundRhs', () => {
  it('vanishes at the three fixed points', () => {
    const n = 5
    const sc = sCritical(n)
    const s = 2 * sc
    const fp = fixedPoints(n, s)
    expect(backgroundRhs(fp.x1, n, s)).toBeCloseTo(0, 12)
    expect(backgroundRhs(fp.x2, n, s)).toBeCloseTo(0, 12)
    expect(backgroundRhs(fp.x3, n, s)).toBeCloseTo(0, 12)
  })

  it('has the correct sign structure for the positive ekpyrotic case (s > s_c)', () => {
    // For s > s_c the x₁ = s/s_c fixed point lies at x > 1 — OUTSIDE the
    // invariant interval [−1, 1] — so within [−1, 1] the flow sign is
    // determined by (s/s_c − x) > 0 and (1 − x²) ≥ 0. Hence x' ≥ 0 on
    // [−1, 1], vanishing at x = ±1. Trajectories starting in (−1, 1) flow
    // FORWARD toward x₂ = 1.
    const n = 4
    const s = 2 * sCritical(n) // s > s_c
    expect(backgroundRhs(0.5, n, s)).toBeGreaterThan(0)
    expect(backgroundRhs(-0.5, n, s)).toBeGreaterThan(0)
    expect(backgroundRhs(0, n, s)).toBeGreaterThan(0)
  })

  it('changes sign at x₁ for the sub-critical case (s < s_c)', () => {
    // For s < s_c, x₁ = s/s_c ∈ (0, 1) is an interior fixed point. The flow
    // should be positive for x < x₁ and negative for x ∈ (x₁, 1) (apart from
    // the boundary zero at x₂ = 1).
    const n = 4
    const sc = sCritical(n)
    const s = 0.5 * sc
    const x1 = s / sc // = 0.5
    expect(backgroundRhs(x1 - 0.1, n, s)).toBeGreaterThan(0)
    expect(backgroundRhs(x1 + 0.1, n, s)).toBeLessThan(0)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// ODE integration
// ───────────────────────────────────────────────────────────────────────────

describe('integrateBackground', () => {
  it('preserves the invariant interval [−1, 1]', () => {
    fc.assert(
      fc.property(fc.double({ min: -1, max: 1, noNaN: true }), (x0) => {
        const n = 4
        const s = 2 * sCritical(n)
        const xFinal = integrateBackground(x0, n, s, 10, 256)
        return xFinal >= -1 && xFinal <= 1
      }),
      { numRuns: 50, seed: 12345 }
    )
  })

  it('converges to x₂ = 1 for the positive ekpyrotic forward flow from interior', () => {
    // Forward (+τ) flow in the ekpyrotic regime sends (−1, 1) → x₂ = 1
    // (NOT x₁, because x₁ > 1 is outside the invariant interval). This is
    // the opposite of the paper's PAST attractor — the paper classifies the
    // past-stable attractor, which for positive ekpyrotic is x₁ (paper
    // Table 1). The forward-flow convergence checked here is the
    // mathematical dual: integrating −τ from interior would recover x₁.
    const n = 4
    const s = 3 * sCritical(n)
    for (const x0 of [-0.9, -0.5, 0, 0.5, 0.9]) {
      const xFinal = integrateBackground(x0, n, s, 100, 4096)
      expect(xFinal).toBeCloseTo(1, 4)
    }
  })

  it('rejects x₀ outside [−1, 1]', () => {
    expect(() => integrateBackground(1.5, 4, 8, 1)).toThrow(RangeError)
    expect(() => integrateBackground(-1.001, 4, 8, 1)).toThrow(RangeError)
    expect(() => integrateBackground(Number.NaN, 4, 8, 1)).toThrow(RangeError)
  })
})

describe('classifyAttractor', () => {
  it('maps interior initial conditions to x₂ for positive ekpyrotic forward flow', () => {
    // Forward flow sends everything interior to x₂ = 1. See the
    // integrateBackground test above for the discussion of forward vs past.
    const n = 4
    const s = 2 * sCritical(n)
    for (const x0 of [-0.8, -0.3, 0.3, 0.8]) {
      expect(classifyAttractor(x0, n, s)).toBe('x2')
    }
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Equation of state
// ───────────────────────────────────────────────────────────────────────────

describe('equationOfState', () => {
  it('gives w = 1 at the Kasner fixed points x = ±1 (stiff fluid)', () => {
    expect(equationOfState(1)).toBeCloseTo(1, 12)
    expect(equationOfState(-1)).toBeCloseTo(1, 12)
  })

  it('gives w > 1 outside [−1, 1] (ekpyrotic ultra-stiff regime)', () => {
    // This matches paper eq. (1.29): for ekpyrotic x₁ = s/s_c > 1, so
    // w = 2x₁² − 1 > 1.
    expect(equationOfState(1.5)).toBeCloseTo(3.5, 12)
    expect(equationOfState(-1.5)).toBeCloseTo(3.5, 12)
  })

  it('gives w = −1 at x = 0 (cosmological-constant-like point)', () => {
    expect(equationOfState(0)).toBeCloseTo(-1, 12)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// scaleFactorAmplitude
// ───────────────────────────────────────────────────────────────────────────

describe('scaleFactorAmplitude', () => {
  it('returns 1 for Minkowski, Kasner, ekpyrotic', () => {
    expect(scaleFactorAmplitude('minkowski', undefined)).toBe(1)
    expect(scaleFactorAmplitude('kasner', undefined)).toBe(1)
    expect(scaleFactorAmplitude('ekpyrotic', undefined)).toBe(1)
  })

  it('returns 1/H for de Sitter', () => {
    expect(scaleFactorAmplitude('deSitter', 1)).toBe(1)
    expect(scaleFactorAmplitude('deSitter', 2)).toBe(0.5)
    expect(scaleFactorAmplitude('deSitter', 0.1)).toBeCloseTo(10, 12)
  })

  it('rejects non-positive hubble for de Sitter', () => {
    expect(() => scaleFactorAmplitude('deSitter', 0)).toThrow(RangeError)
    expect(() => scaleFactorAmplitude('deSitter', -1)).toThrow(RangeError)
    expect(() => scaleFactorAmplitude('deSitter', undefined)).toThrow(RangeError)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// computeCosmologyAt — per-frame snapshot
// ───────────────────────────────────────────────────────────────────────────

describe('computeCosmologyAt — Minkowski', () => {
  it('produces bit-identical trivial snapshot for any eta and mass', () => {
    for (const eta of [-10, -1, 1, 10, Number.EPSILON, -Number.EPSILON]) {
      for (const mass of [0, 0.5, 1, 3]) {
        const snap = computeCosmologyAt(eta, { preset: 'minkowski', spacetimeDim: 4 }, mass)
        expect(snap.a).toBe(1)
        expect(snap.hubble).toBe(0)
        expect(snap.zppOverZ).toBe(0)
        expect(snap.mEffSq).toBe(mass * mass)
      }
    }
  })
})

describe('computeCosmologyAt — de Sitter', () => {
  it('reproduces a(η) = −1/(Hη) for η < 0', () => {
    const H = 1.5
    const eta = -3
    const snap = computeCosmologyAt(eta, { preset: 'deSitter', spacetimeDim: 4, hubble: H }, 0)
    // a(η) = (1/H) · |η|^(−1) = 1/(H·|η|)
    expect(snap.a).toBeCloseTo(1 / (H * Math.abs(eta)), 12)
  })

  it('gives conformal Hubble ℋ = −1/η (positive for η < 0)', () => {
    const snap = computeCosmologyAt(-2, { preset: 'deSitter', spacetimeDim: 4, hubble: 1 }, 0)
    // ℋ = q/η = (−1)/(−2) = 0.5
    expect(snap.hubble).toBeCloseTo(0.5, 12)
    expect(snap.hubble).toBeGreaterThan(0) // expansion
  })

  it("gives z''/z = 2/η² in 4D", () => {
    const eta = -5
    const snap = computeCosmologyAt(eta, { preset: 'deSitter', spacetimeDim: 4, hubble: 1 }, 0)
    expect(snap.zppOverZ).toBeCloseTo(2 / (eta * eta), 12)
  })

  it('produces negative mEffSq for massless (tachyonic — drives spectrum)', () => {
    const snap = computeCosmologyAt(-1, { preset: 'deSitter', spacetimeDim: 4, hubble: 1 }, 0)
    expect(snap.mEffSq).toBeCloseTo(-2, 12)
    expect(snap.mEffSq).toBeLessThan(0)
  })

  it('rejects eta = 0', () => {
    expect(() =>
      computeCosmologyAt(0, { preset: 'deSitter', spacetimeDim: 4, hubble: 1 }, 0)
    ).toThrow(RangeError)
  })
})

describe('computeCosmologyAt — Kasner', () => {
  it('reproduces a(η) = |η|^(1/(n−2))', () => {
    for (const n of [3, 4, 5, 6]) {
      const eta = -4
      const snap = computeCosmologyAt(eta, { preset: 'kasner', spacetimeDim: n }, 0)
      const expected = Math.pow(Math.abs(eta), 1 / (n - 2))
      expect(snap.a).toBeCloseTo(expected, 12)
    }
  })

  it('gives conformal Hubble ℋ = 1/((n−2)·η) (negative for η < 0 — contracting)', () => {
    const n = 4
    const eta = -3
    const snap = computeCosmologyAt(eta, { preset: 'kasner', spacetimeDim: n }, 0)
    expect(snap.hubble).toBeCloseTo(1 / ((n - 2) * eta), 12)
    expect(snap.hubble).toBeLessThan(0) // contraction
  })

  it('produces positive mEffSq for massless (mass-like, non-tachyonic)', () => {
    const snap = computeCosmologyAt(-2, { preset: 'kasner', spacetimeDim: 4 }, 0)
    // mEffSq = −z''/z = −(−1/(4η²)) = 1/(4η²) = 1/16
    expect(snap.mEffSq).toBeCloseTo(1 / 16, 12)
    expect(snap.mEffSq).toBeGreaterThan(0)
  })
})

describe('computeCosmologyAt — ekpyrotic', () => {
  it('matches a(η) = |η|^q for the closed-form q', () => {
    const n = 4
    const sc = sCritical(n)
    const s = 2 * sc
    const eta = -7
    const q = qExponent({ preset: 'ekpyrotic', spacetimeDim: n, steepness: s })
    const snap = computeCosmologyAt(eta, { preset: 'ekpyrotic', spacetimeDim: n, steepness: s }, 0)
    expect(snap.a).toBeCloseTo(Math.pow(Math.abs(eta), q), 12)
  })

  it('produces non-negative mEffSq for massless across the regime', () => {
    // Because β(β−1) ∈ [−1/4, 0] for ekpyrotic, mEffSq = −z''/z ∈ [0, 1/(4η²)].
    // Non-tachyonic — the distinguishing feature from de Sitter.
    const n = 4
    const sc = sCritical(n)
    for (const mult of [1.1, 2, 5, 100]) {
      const snap = computeCosmologyAt(
        -3,
        { preset: 'ekpyrotic', spacetimeDim: n, steepness: sc * mult },
        0
      )
      expect(snap.mEffSq).toBeGreaterThanOrEqual(0)
    }
  })

  it('includes the mass term a²·m² additively', () => {
    const n = 4
    const sc = sCritical(n)
    const s = 2 * sc
    const eta = -3
    const mass = 0.5
    const snap = computeCosmologyAt(
      eta,
      { preset: 'ekpyrotic', spacetimeDim: n, steepness: s },
      mass
    )
    const snap0 = computeCosmologyAt(eta, { preset: 'ekpyrotic', spacetimeDim: n, steepness: s }, 0)
    expect(snap.mEffSq - snap0.mEffSq).toBeCloseTo(snap.a * snap.a * mass * mass, 10)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// effectiveMassSquared wrapper
// ───────────────────────────────────────────────────────────────────────────

describe('effectiveMassSquared', () => {
  it('agrees with the full snapshot', () => {
    const params = { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 }
    const mass = 0.7
    for (const eta of [-10, -2.5, -0.5]) {
      expect(effectiveMassSquared(eta, params, mass)).toBe(
        computeCosmologyAt(eta, params, mass).mEffSq
      )
    }
  })
})
