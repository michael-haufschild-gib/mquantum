/**
 * Unit tests for the cosmological preset closed-form exponents.
 *
 * Each assertion answers a specific question about the paper's mathematics:
 *
 * - Does `s_c(n)` match eq. (1.17) numerically for `n ∈ {3, 4, 5, 6, 7}`?
 * - Does the Kasner exponent `q = 1/(n − 2)` match eq. (3.38)?
 * - Does the ekpyrotic exponent reproduce `(1 − R)/(n − 2)` with `R` from
 *   eq. (3.41) for several `(s, n)` pairs?
 * - Does `β(β − 1)` behave as expected across the regimes (tachyonic sign
 *   in de Sitter, mass-like sign in Kasner, regime flip in ekpyrotic)?
 * - Are invalid inputs rejected with the correct error types?
 *
 * @module
 */

import { describe, expect, it } from 'vitest'

import {
  betaExponent,
  COSMOLOGY_PRESETS,
  isValidPreset,
  MAX_SPACETIME_DIM,
  MIN_SPACETIME_DIM,
  qExponent,
  sCritical,
  validateSpacetimeDim,
  zppOverZCoefficient,
} from '@/lib/physics/cosmology/presets'

// ───────────────────────────────────────────────────────────────────────────
// Critical steepness s_c(n)
// ───────────────────────────────────────────────────────────────────────────

describe('sCritical', () => {
  it('matches paper eq. (1.17): s_c = √(8(n−1)/(n−2))', () => {
    // Hand-computed reference values from the closed form.
    // n=3: √(16) = 4
    // n=4: √(12) ≈ 3.4641016151
    // n=5: √(32/3) ≈ 3.2659863237
    // n=6: √(10) ≈ 3.1622776602
    // n=7: √(48/5) = √9.6 ≈ 3.0983866769
    expect(sCritical(3)).toBeCloseTo(4, 12)
    expect(sCritical(4)).toBeCloseTo(Math.sqrt(12), 12)
    expect(sCritical(5)).toBeCloseTo(Math.sqrt(32 / 3), 12)
    expect(sCritical(6)).toBeCloseTo(Math.sqrt(10), 12)
    expect(sCritical(7)).toBeCloseTo(Math.sqrt(48 / 5), 12)
  })

  it('is strictly decreasing in n for n ≥ 3', () => {
    // The functional form s_c²(n) = 8 + 8/(n−2) is strictly decreasing, so
    // violating this ordering would indicate a sign or denominator bug.
    const values = [3, 4, 5, 6, 7].map(sCritical)
    for (let i = 0; i < values.length - 1; i++) {
      expect(values[i + 1]).toBeLessThan(values[i]!)
    }
  })

  it('rejects n < 3 with RangeError', () => {
    expect(() => sCritical(2)).toThrow(RangeError)
    expect(() => sCritical(0)).toThrow(RangeError)
    expect(() => sCritical(-1)).toThrow(RangeError)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Conformal-time exponent q
// ───────────────────────────────────────────────────────────────────────────

describe('qExponent', () => {
  it('returns 0 for Minkowski with admissible spacetime dim', () => {
    expect(qExponent({ preset: 'minkowski', spacetimeDim: 4 })).toBe(0)
    expect(qExponent({ preset: 'minkowski', spacetimeDim: 7, steepness: 1 })).toBe(0)
  })

  it('rejects an out-of-range spacetimeDim for every preset', () => {
    // L7 audit: the previous form skipped validation in the Minkowski and
    // de Sitter branches, allowing nonsense `n` values to pass silently.
    // The Mukhanov-Sasaki bridge is physically defined only for `n ∈ [3, 7]`.
    expect(() => qExponent({ preset: 'minkowski', spacetimeDim: -5 })).toThrow(RangeError)
    expect(() => qExponent({ preset: 'minkowski', spacetimeDim: 2 })).toThrow(RangeError)
    expect(() => qExponent({ preset: 'minkowski', spacetimeDim: 99 })).toThrow(RangeError)
    expect(() => qExponent({ preset: 'deSitter', spacetimeDim: 2 })).toThrow(RangeError)
    expect(() => qExponent({ preset: 'deSitter', spacetimeDim: 11 })).toThrow(RangeError)
    expect(() => qExponent({ preset: 'kasner', spacetimeDim: 2 })).toThrow(RangeError)
    expect(() => qExponent({ preset: 'kasner', spacetimeDim: Number.NaN })).toThrow(RangeError)
  })

  it('returns −1 for de Sitter', () => {
    expect(qExponent({ preset: 'deSitter', spacetimeDim: 4 })).toBe(-1)
    expect(qExponent({ preset: 'deSitter', spacetimeDim: 5, hubble: 2 })).toBe(-1)
  })

  it('returns 1/(n−2) for Kasner — matches eq. (3.38)', () => {
    expect(qExponent({ preset: 'kasner', spacetimeDim: 3 })).toBeCloseTo(1, 12)
    expect(qExponent({ preset: 'kasner', spacetimeDim: 4 })).toBeCloseTo(1 / 2, 12)
    expect(qExponent({ preset: 'kasner', spacetimeDim: 5 })).toBeCloseTo(1 / 3, 12)
    expect(qExponent({ preset: 'kasner', spacetimeDim: 6 })).toBeCloseTo(1 / 4, 12)
  })

  it('returns s_c²/((n−1)s² − s_c²) for ekpyrotic — matches eqs. (3.41)', () => {
    // Paper's closed form: q = s_c²/((n−1)s² − s_c²). We cross-check this
    // against the algebraically equivalent form derived from x₁ = s/s_c:
    //     q = 1/((n−1)·x₁² − 1)
    // If both formulas agree on the implementation output, the paper's
    // derivation is correctly encoded.
    const cases = [
      { n: 4, sMult: 1.5 }, // s = 1.5·s_c — near-critical
      { n: 4, sMult: 2.0 }, // s = 2.0·s_c — textbook ekpyrotic
      { n: 4, sMult: 5.0 }, // s = 5.0·s_c — deep ekpyrotic, large w
      { n: 5, sMult: 2.0 },
      { n: 6, sMult: 3.0 },
    ]
    for (const { n, sMult } of cases) {
      const sc = sCritical(n)
      const s = sMult * sc
      const q = qExponent({ preset: 'ekpyrotic', spacetimeDim: n, steepness: s })

      // Direct formula from paper eq. (3.41): (1 − R)/(n − 2)
      const R = ((n - 1) * (s * s - sc * sc)) / ((n - 1) * s * s - sc * sc)
      const qDirect = (1 - R) / (n - 2)
      expect(q).toBeCloseTo(qDirect, 12)

      // Algebraic alternative: 1/((n−1)x₁² − 1)
      const x1 = s / sc
      const qAlt = 1 / ((n - 1) * x1 * x1 - 1)
      expect(q).toBeCloseTo(qAlt, 12)

      // Sign: ekpyrotic contracting → q > 0
      expect(q).toBeGreaterThan(0)
    }
  })

  it('smoothly continues the Kasner value at s = s_c', () => {
    // At the critical steepness x₁ = 1 coincides with the Kasner fixed
    // point x₂. The ekpyrotic q-formula reduces to 1/(n−2) — the Kasner
    // exponent — in the limit. We confirm this by taking s just above s_c
    // and checking the value is close to 1/(n−2), not the sub-critical
    // denominator-zero singularity at x₁ = 1/√(n−1).
    for (const n of [3, 4, 5, 6]) {
      const sc = sCritical(n)
      const qNearCritical = qExponent({
        preset: 'ekpyrotic',
        spacetimeDim: n,
        steepness: sc * 1.0001,
      })
      expect(qNearCritical).toBeCloseTo(1 / (n - 2), 3)
    }
  })

  it('decreases monotonically in s through the ekpyrotic regime', () => {
    // dq/ds < 0 across s ∈ (s_c, ∞). Physical meaning: a steeper potential
    // drives slower conformal-time contraction, hence a smaller exponent.
    const n = 4
    const sc = sCritical(n)
    const steepnesses = [1.1, 1.5, 2, 3, 5, 10, 100].map((m) => m * sc)
    const qValues = steepnesses.map((s) =>
      qExponent({ preset: 'ekpyrotic', spacetimeDim: n, steepness: s })
    )
    for (let i = 0; i < qValues.length - 1; i++) {
      expect(qValues[i + 1]).toBeLessThan(qValues[i]!)
    }
  })

  it('approaches zero for ekpyrotic as s → ∞ (deep ekpyrotic)', () => {
    const q = qExponent({ preset: 'ekpyrotic', spacetimeDim: 4, steepness: 1000 })
    expect(q).toBeGreaterThan(0)
    expect(q).toBeLessThan(1e-3)
  })

  it('stays within (0, 1/(n−2)] across the entire ekpyrotic regime', () => {
    // β = q·(n−2)/2 must stay in (0, 1/2]. This property is what makes the
    // ekpyrotic effective mass non-tachyonic — a distinguishing feature of
    // the regime compared to de Sitter.
    for (const n of [3, 4, 5, 6, 7]) {
      const sc = sCritical(n)
      const qMax = 1 / (n - 2)
      for (const mult of [1.001, 1.1, 2, 5, 100]) {
        const q = qExponent({ preset: 'ekpyrotic', spacetimeDim: n, steepness: sc * mult })
        expect(q).toBeGreaterThan(0)
        expect(q).toBeLessThanOrEqual(qMax + 1e-9)
      }
    }
  })

  it('rejects ekpyrotic with s ≤ s_c', () => {
    const n = 4
    const sc = sCritical(n)
    expect(() => qExponent({ preset: 'ekpyrotic', spacetimeDim: n, steepness: sc })).toThrow(
      RangeError
    )
    expect(() => qExponent({ preset: 'ekpyrotic', spacetimeDim: n, steepness: sc * 0.5 })).toThrow(
      RangeError
    )
    expect(() => qExponent({ preset: 'ekpyrotic', spacetimeDim: n, steepness: 0 })).toThrow(
      RangeError
    )
  })

  it('rejects ekpyrotic without a numeric steepness', () => {
    expect(() => qExponent({ preset: 'ekpyrotic', spacetimeDim: 4 })).toThrow(RangeError)
  })

  it('throws for bianchiKasner — no closed-form scalar q exists', () => {
    // Bianchi-I has three axis-specific scale factors; there is no single `q`
    // exponent. Callers must use `computeBianchiKasnerCoefs` directly.
    const run = (): number =>
      qExponent({
        preset: 'bianchiKasner',
        spacetimeDim: 4,
        kasnerExponents: { p1: -1 / 3, p2: 2 / 3, p3: 2 / 3 },
      })
    expect(run).toThrow(RangeError)
    expect(run).toThrow(/bianchiKasner/)
  })

  it('throws for lqcBounce — no closed-form scalar q exists', () => {
    // The LQC bounce is resolved from a dense look-up table, not a
    // `a(η) = A·|η|^q` ansatz.
    const run = (): number =>
      qExponent({
        preset: 'lqcBounce',
        spacetimeDim: 4,
        lqcRhoCritical: 1,
        lqcEquationOfState: 1,
        lqcInitialRhoRatio: 0.1,
      })
    expect(run).toThrow(RangeError)
    expect(run).toThrow(/lqcBounce/)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// z''/z coefficient β(β − 1)
// ───────────────────────────────────────────────────────────────────────────

describe('zppOverZCoefficient', () => {
  it('returns 0 for Minkowski', () => {
    expect(zppOverZCoefficient({ preset: 'minkowski', spacetimeDim: 4 })).toBe(0)
  })

  it('returns 2 for de Sitter in 4D — matches textbook', () => {
    // β = q·(n−2)/2 = −1·1 = −1, so β(β−1) = (−1)(−2) = 2.
    // This gives z''/z = 2/η², the iconic de Sitter term reproducing the
    // Bunch-Davies scale-invariant spectrum.
    expect(zppOverZCoefficient({ preset: 'deSitter', spacetimeDim: 4 })).toBeCloseTo(2, 12)
  })

  it('returns n(n−2)/4 for de Sitter in arbitrary n', () => {
    // β = −(n−2)/2, so β(β−1) = ((n−2)/2)·((n−2)/2 + 1) = (n−2)(n)/4.
    for (const n of [3, 4, 5, 6, 7]) {
      const expected = ((n - 2) * n) / 4
      expect(zppOverZCoefficient({ preset: 'deSitter', spacetimeDim: n })).toBeCloseTo(expected, 12)
    }
  })

  it('is negative for Kasner (mass-like effective mass)', () => {
    // β = 1/(n−2) · (n−2)/2 = 1/2 → β(β−1) = −1/4 for every n ≥ 3.
    for (const n of [3, 4, 5, 6, 7]) {
      expect(zppOverZCoefficient({ preset: 'kasner', spacetimeDim: n })).toBeCloseTo(-0.25, 12)
    }
  })

  it('matches (1/26)(−25/26) for n=4 ekpyrotic at s = 3·s_c', () => {
    // Hand-derived reference: for n=4, s = 3·s_c gives x₁ = 3, so
    // (n−1)x₁² − 1 = 26, q = 1/26 ≈ 0.0385, β = q·1 = 1/26,
    // β(β−1) = (1/26)·(−25/26) ≈ −0.0370.
    const n = 4
    const sc = sCritical(n)
    const zpp = zppOverZCoefficient({ preset: 'ekpyrotic', spacetimeDim: n, steepness: sc * 3 })
    expect(zpp).toBeCloseTo((1 / 26) * (-25 / 26), 10)
    expect(zpp).toBeLessThan(0)
  })

  it('is always in [−1/4, 0] across the ekpyrotic regime', () => {
    // This is the physically meaningful statement: ekpyrotic is NEVER
    // tachyonic in the Mukhanov-Sasaki sense (β(β−1) < 0 always). The
    // minimum −1/4 is attained as s → s_c⁺ where β → 1/2; the supremum
    // 0 is approached as s → ∞ where β → 0. This property distinguishes
    // ekpyrotic from inflation: super-horizon modes do not grow by the
    // tachyonic mechanism.
    for (const n of [3, 4, 5, 6, 7]) {
      const sc = sCritical(n)
      for (const mult of [1.001, 1.1, 2, 5, 100]) {
        const zpp = zppOverZCoefficient({
          preset: 'ekpyrotic',
          spacetimeDim: n,
          steepness: sc * mult,
        })
        expect(zpp).toBeGreaterThanOrEqual(-0.25 - 1e-9)
        expect(zpp).toBeLessThanOrEqual(0)
      }
    }
  })

  it('throws for the non-scalar-q presets (bianchiKasner, lqcBounce)', () => {
    // Both presets lack a closed-form `q` exponent, so z''/z reduces to no
    // scalar coefficient. The documented contract is a RangeError — pinning
    // this so a future refactor can't silently return NaN / 0 for those
    // presets.
    expect(() =>
      zppOverZCoefficient({
        preset: 'bianchiKasner',
        spacetimeDim: 4,
        kasnerExponents: { p1: -1 / 3, p2: 2 / 3, p3: 2 / 3 },
      })
    ).toThrow(RangeError)
    expect(() =>
      zppOverZCoefficient({
        preset: 'lqcBounce',
        spacetimeDim: 4,
        lqcRhoCritical: 1,
        lqcEquationOfState: 1,
        lqcInitialRhoRatio: 0.1,
      })
    ).toThrow(RangeError)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// betaExponent
// ───────────────────────────────────────────────────────────────────────────

describe('betaExponent', () => {
  it('agrees with the q·(n−2)/2 identity for every non-Minkowski preset', () => {
    const cases: Array<Parameters<typeof qExponent>[0]> = [
      { preset: 'deSitter', spacetimeDim: 4 },
      { preset: 'deSitter', spacetimeDim: 5 },
      { preset: 'kasner', spacetimeDim: 3 },
      { preset: 'kasner', spacetimeDim: 6 },
      { preset: 'ekpyrotic', spacetimeDim: 4, steepness: 2 * sCritical(4) },
      { preset: 'ekpyrotic', spacetimeDim: 5, steepness: 3 * sCritical(5) },
    ]
    for (const c of cases) {
      const q = qExponent(c)
      const beta = betaExponent(c)
      expect(beta).toBeCloseTo((q * (c.spacetimeDim - 2)) / 2, 12)
    }
  })

  it('returns 0 for Minkowski', () => {
    expect(betaExponent({ preset: 'minkowski', spacetimeDim: 4 })).toBe(0)
  })

  it('throws for bianchiKasner and lqcBounce — β requires a scalar q', () => {
    expect(() =>
      betaExponent({
        preset: 'bianchiKasner',
        spacetimeDim: 4,
        kasnerExponents: { p1: -1 / 3, p2: 2 / 3, p3: 2 / 3 },
      })
    ).toThrow(RangeError)
    expect(() =>
      betaExponent({
        preset: 'lqcBounce',
        spacetimeDim: 4,
        lqcRhoCritical: 1,
        lqcEquationOfState: 1,
        lqcInitialRhoRatio: 0.1,
      })
    ).toThrow(RangeError)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Validation & discoverability
// ───────────────────────────────────────────────────────────────────────────

describe('validateSpacetimeDim', () => {
  it('accepts integers in [MIN, MAX]', () => {
    for (let n = MIN_SPACETIME_DIM; n <= MAX_SPACETIME_DIM; n++) {
      expect(() => validateSpacetimeDim(n)).not.toThrow()
    }
  })

  it('rejects out-of-range or non-integer values', () => {
    expect(() => validateSpacetimeDim(2)).toThrow(RangeError)
    expect(() => validateSpacetimeDim(MAX_SPACETIME_DIM + 1)).toThrow(RangeError)
    expect(() => validateSpacetimeDim(4.5)).toThrow(RangeError)
    expect(() => validateSpacetimeDim(Number.NaN)).toThrow(RangeError)
  })
})

describe('isValidPreset', () => {
  it('accepts Minkowski and Kasner without extra parameters', () => {
    expect(isValidPreset({ preset: 'minkowski', spacetimeDim: 4 })).toBe(true)
    expect(isValidPreset({ preset: 'kasner', spacetimeDim: 4 })).toBe(true)
  })

  it('requires a finite positive hubble for de Sitter', () => {
    // Regression: previously isValidPreset only consulted qExponent, which
    // ignores the hubble requirement. The compute pass's scaleFactorAmplitude
    // then threw at reset time despite isValidPreset having returned true.
    expect(isValidPreset({ preset: 'deSitter', spacetimeDim: 4, hubble: 1 })).toBe(true)
    expect(isValidPreset({ preset: 'deSitter', spacetimeDim: 4 })).toBe(false)
    expect(isValidPreset({ preset: 'deSitter', spacetimeDim: 4, hubble: 0 })).toBe(false)
    expect(isValidPreset({ preset: 'deSitter', spacetimeDim: 4, hubble: -1 })).toBe(false)
    expect(isValidPreset({ preset: 'deSitter', spacetimeDim: 4, hubble: Number.NaN })).toBe(false)
    expect(
      isValidPreset({ preset: 'deSitter', spacetimeDim: 4, hubble: Number.POSITIVE_INFINITY })
    ).toBe(false)
  })

  it('accepts admissible ekpyrotic and rejects invalid steepness', () => {
    const sc = sCritical(4)
    expect(isValidPreset({ preset: 'ekpyrotic', spacetimeDim: 4, steepness: sc * 2 })).toBe(true)
    expect(isValidPreset({ preset: 'ekpyrotic', spacetimeDim: 4, steepness: sc })).toBe(false)
    expect(isValidPreset({ preset: 'ekpyrotic', spacetimeDim: 4 })).toBe(false)
  })

  describe('bianchiKasner', () => {
    const vacuum = { p1: -1 / 3, p2: 2 / 3, p3: 2 / 3 }

    it('accepts a vacuum-like Kasner triple at n ≥ 4', () => {
      for (const n of [4, 5, 6, 7]) {
        expect(
          isValidPreset({ preset: 'bianchiKasner', spacetimeDim: n, kasnerExponents: vacuum })
        ).toBe(true)
      }
    })

    it('accepts a non-vacuum finite triple — constraint enforcement is a UI concern', () => {
      // The store deliberately allows non-vacuum Bianchi-I backgrounds so the
      // user can explore Kasner-violating anisotropy. isValidPreset must not
      // reject them.
      expect(
        isValidPreset({
          preset: 'bianchiKasner',
          spacetimeDim: 4,
          kasnerExponents: { p1: 0, p2: 0, p3: 0 },
        })
      ).toBe(true)
    })

    it('rejects n < 4 (Bianchi-I requires 3 spatial axes)', () => {
      expect(
        isValidPreset({ preset: 'bianchiKasner', spacetimeDim: 3, kasnerExponents: vacuum })
      ).toBe(false)
    })

    it('rejects n outside [MIN, MAX]', () => {
      expect(
        isValidPreset({ preset: 'bianchiKasner', spacetimeDim: 2, kasnerExponents: vacuum })
      ).toBe(false)
      expect(
        isValidPreset({ preset: 'bianchiKasner', spacetimeDim: 11, kasnerExponents: vacuum })
      ).toBe(false)
    })

    it('rejects missing exponents', () => {
      expect(isValidPreset({ preset: 'bianchiKasner', spacetimeDim: 4 })).toBe(false)
    })

    it('rejects non-finite exponents', () => {
      expect(
        isValidPreset({
          preset: 'bianchiKasner',
          spacetimeDim: 4,
          kasnerExponents: { p1: Number.NaN, p2: 0, p3: 0 },
        })
      ).toBe(false)
      expect(
        isValidPreset({
          preset: 'bianchiKasner',
          spacetimeDim: 4,
          kasnerExponents: { p1: 0, p2: Number.POSITIVE_INFINITY, p3: 0 },
        })
      ).toBe(false)
    })
  })

  describe('lqcBounce', () => {
    const validLqc = {
      preset: 'lqcBounce' as const,
      spacetimeDim: 4,
      lqcRhoCritical: 1.0,
      lqcEquationOfState: 1.0,
      lqcInitialRhoRatio: 0.1,
    }

    it('accepts a well-formed LQC config', () => {
      expect(isValidPreset(validLqc)).toBe(true)
    })

    it('rejects non-positive rho_c', () => {
      expect(isValidPreset({ ...validLqc, lqcRhoCritical: 0 })).toBe(false)
      expect(isValidPreset({ ...validLqc, lqcRhoCritical: -0.5 })).toBe(false)
      expect(isValidPreset({ ...validLqc, lqcRhoCritical: Number.NaN })).toBe(false)
    })

    it('rejects equation-of-state outside [0, 1]', () => {
      expect(isValidPreset({ ...validLqc, lqcEquationOfState: -0.1 })).toBe(false)
      expect(isValidPreset({ ...validLqc, lqcEquationOfState: 1.01 })).toBe(false)
      expect(isValidPreset({ ...validLqc, lqcEquationOfState: Number.POSITIVE_INFINITY })).toBe(
        false
      )
    })

    it('rejects initialRhoRatio outside (0, 1)', () => {
      // Open interval — boundaries are rejected because ρ/ρ_c = 0 gives the
      // Minkowski limit and ρ/ρ_c = 1 sits exactly at the bounce.
      expect(isValidPreset({ ...validLqc, lqcInitialRhoRatio: 0 })).toBe(false)
      expect(isValidPreset({ ...validLqc, lqcInitialRhoRatio: 1 })).toBe(false)
      expect(isValidPreset({ ...validLqc, lqcInitialRhoRatio: -0.5 })).toBe(false)
    })

    it('rejects out-of-range spacetimeDim', () => {
      expect(isValidPreset({ ...validLqc, spacetimeDim: 2 })).toBe(false)
      expect(isValidPreset({ ...validLqc, spacetimeDim: 11 })).toBe(false)
    })
  })
})

describe('COSMOLOGY_PRESETS catalogue', () => {
  it('lists all six presets in a stable order', () => {
    expect(COSMOLOGY_PRESETS).toEqual([
      'minkowski',
      'deSitter',
      'ekpyrotic',
      'kasner',
      'bianchiKasner',
      'lqcBounce',
    ])
  })
})
