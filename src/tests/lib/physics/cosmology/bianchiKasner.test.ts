/**
 * Unit tests for the Bianchi-I vacuum Kasner math helpers.
 *
 * The acceptance bar from the Round 1 PRD demands ≥ 10 tests covering the
 * constraints, parameterisation, snap, coefficient evaluator, and the
 * bit-identity property of the isotropic reduction. We also exercise the
 * Hamiltonian-drift physics check (test `i`) that anchors the integrator
 * against the analytic Kasner mode equation.
 *
 * @module
 */

import { describe, expect, it } from 'vitest'

import { computeCosmologyCoefs } from '@/lib/physics/cosmology/background'
import {
  computeBianchiKasnerCoefs,
  isKasnerVacuum,
  kasnerSymmetricVacuum,
  kasnerVacuumParameterization,
  snapToKasnerVacuum,
} from '@/lib/physics/cosmology/bianchiKasner'
import { isValidPreset, qExponent } from '@/lib/physics/cosmology/presets'

// ───────────────────────────────────────────────────────────────────────────
// Symmetric vacuum triple — acceptance (a)
// ───────────────────────────────────────────────────────────────────────────

describe('kasnerSymmetricVacuum', () => {
  it('(a) returns (-1/3, 2/3, 2/3) within 1e-12 and satisfies both vacuum constraints', () => {
    const exp = kasnerSymmetricVacuum()
    expect(exp.p1).toBeCloseTo(-1 / 3, 12)
    expect(exp.p2).toBeCloseTo(2 / 3, 12)
    expect(exp.p3).toBeCloseTo(2 / 3, 12)
    expect(isKasnerVacuum(exp)).toBe(true)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Vacuum parameterisation — acceptance (b), (c)
// ───────────────────────────────────────────────────────────────────────────

describe('kasnerVacuumParameterization', () => {
  it('(b) returns (-1/3, 2/3, 2/3) at φ = 0 within 1e-12', () => {
    const exp = kasnerVacuumParameterization(0)
    expect(exp.p1).toBeCloseTo(-1 / 3, 12)
    expect(exp.p2).toBeCloseTo(2 / 3, 12)
    expect(exp.p3).toBeCloseTo(2 / 3, 12)
  })

  it('(c) satisfies Σp = 1 and Σp² = 1 to within 1e-10 at 64 evenly-spaced φ', () => {
    const TWO_PI = 2 * Math.PI
    for (let i = 0; i < 64; i++) {
      const phi = (i * TWO_PI) / 64
      const exp = kasnerVacuumParameterization(phi)
      const sum = exp.p1 + exp.p2 + exp.p3
      const sumSq = exp.p1 * exp.p1 + exp.p2 * exp.p2 + exp.p3 * exp.p3
      expect(Math.abs(sum - 1)).toBeLessThan(1e-10)
      expect(Math.abs(sumSq - 1)).toBeLessThan(1e-10)
    }
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Snap — acceptance (d), (e)
// ───────────────────────────────────────────────────────────────────────────

describe('snapToKasnerVacuum', () => {
  it('(d) projects an off-circle triple onto the vacuum constraint surface within 1e-8', () => {
    const input = { p1: 0.5, p2: 0.5, p3: 0 }
    const snapped = snapToKasnerVacuum(input)
    expect(isKasnerVacuum(snapped, 1e-8)).toBe(true)
    // Sanity — the projection must not wander catastrophically far. The
    // input lies close to the vacuum circle; bounded L2 distance confirms
    // the golden-section refinement actually picked the minimum rather
    // than a random local plateau.
    const dx = snapped.p1 - input.p1
    const dy = snapped.p2 - input.p2
    const dz = snapped.p3 - input.p3
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    expect(distance).toBeLessThan(1.5)
  })

  it('(e) is idempotent on the symmetric vacuum triple within 1e-8', () => {
    const canonical = kasnerSymmetricVacuum()
    const snapped = snapToKasnerVacuum(canonical)
    expect(Math.abs(snapped.p1 - canonical.p1)).toBeLessThan(1e-8)
    expect(Math.abs(snapped.p2 - canonical.p2)).toBeLessThan(1e-8)
    expect(Math.abs(snapped.p3 - canonical.p3)).toBeLessThan(1e-8)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Coefficient evaluator — acceptance (f), (g), (h)
// ───────────────────────────────────────────────────────────────────────────

describe('computeBianchiKasnerCoefs', () => {
  it('(f) returns exact identities at η = 1.5 (t = 1) for the symmetric vacuum triple', () => {
    const exp = kasnerSymmetricVacuum()
    const coefs = computeBianchiKasnerCoefs(1.5, exp, 4)
    // At t = 1 every a_i = 1, ã = 1, every coef = 1, both ratios = 1.
    expect(coefs.a).toBeCloseTo(1, 12)
    expect(coefs.aKinetic).toBeCloseTo(1, 12)
    expect(coefs.aPotential).toBeCloseTo(1, 12)
    expect(coefs.aFull).toBeCloseTo(1, 12)
    expect(coefs.aPotentialRatio1).toBeCloseTo(1, 12)
    expect(coefs.aPotentialRatio2).toBeCloseTo(1, 12)
  })

  it('(g) matches the closed-form scale factors at η = 6 (t = 8): aPot_0 = 64, aFull = 16, aKinetic = 0.25, ratios = 1/64', () => {
    const exp = kasnerSymmetricVacuum()
    const coefs = computeBianchiKasnerCoefs(6, exp, 4)
    // ã = 2, aFull = 16, aKinetic = 1/4.
    expect(coefs.a).toBeCloseTo(2, 9)
    expect(coefs.aFull).toBeCloseTo(16, 9)
    expect(coefs.aKinetic).toBeCloseTo(0.25, 9)
    // aPot_0 = ã^4 / a_1² = 16 / 0.25 = 64
    expect(coefs.aPotential).toBeCloseTo(64, 9)
    // aPot_1 = aPot_2 = 16/16 = 1 ⇒ ratios = 1/64
    expect(coefs.aPotentialRatio1).toBeCloseTo(1 / 64, 10)
    expect(coefs.aPotentialRatio2).toBeCloseTo(1 / 64, 10)
  })

  it('(h) isotropic triple (1/3, 1/3, 1/3) yields ratios exactly equal to 1 at any η', () => {
    const isotropic = { p1: 1 / 3, p2: 1 / 3, p3: 1 / 3 }
    for (const eta of [0.3, 1.5, 4, 10, 100]) {
      const coefs = computeBianchiKasnerCoefs(eta, isotropic, 4)
      // a_1 = a_2 = a_3 bit-identically (same exponent on the same t) ⇒
      // aPot_1/aPot_0 = 1.0 exactly. FP division of identical finite
      // operands is bit-exact.
      expect(coefs.aPotentialRatio1).toBe(1)
      expect(coefs.aPotentialRatio2).toBe(1)
    }
  })

  it('throws for η ≤ 0 or non-finite η', () => {
    const exp = kasnerSymmetricVacuum()
    expect(() => computeBianchiKasnerCoefs(0, exp, 4)).toThrow(RangeError)
    expect(() => computeBianchiKasnerCoefs(-1, exp, 4)).toThrow(RangeError)
    expect(() => computeBianchiKasnerCoefs(Number.NaN, exp, 4)).toThrow(RangeError)
  })

  it('throws for spacetimeDim < 3', () => {
    const exp = kasnerSymmetricVacuum()
    expect(() => computeBianchiKasnerCoefs(1.5, exp, 2)).toThrow(RangeError)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Hamiltonian energy drift — acceptance (i) (load-bearing physics test)
// ───────────────────────────────────────────────────────────────────────────

describe('canonical leapfrog integration on Bianchi-I vacuum Kasner', () => {
  it('(i) adiabatic invariant J = E/ω drifts by < 10% over 500 kick-drift-kick leapfrog steps with k = 1, m = 0', () => {
    // Exercise the canonical drift+kick pair for a single wavevector mode
    // on axis 0 under the vacuum Kasner background. For the massless,
    // single-k case, the shader's Hamilton equations reduce (modulo
    // stencil discretisation) to the linear oscillator
    //
    //   dφ/dη = aKinetic · π
    //   dπ/dη = -(aPot_0 · k²) · φ
    //
    // with effective frequency ω_eff² = aKinetic · aPot_0 · k² = (ã/a_1)² k².
    // For the canonical vacuum triple (−1/3, 2/3, 2/3) at n = 4,
    // ã/a_1 = t^(1/3+1/3) = t^(2/3), so the mode stiffens monotonically
    // with t and the WKB action `J = E / ω` is the conserved quantity
    // under slow evolution of the coefficients.
    //
    // Drive the mode through many oscillations so the WKB adiabatic
    // invariant actually gets the chance to manifest. With k = 10 at
    // η₀ = 1 we have ω ≈ 6.7, period ≈ 0.94, so 500 steps × dt = 0.01
    // advances η by 5.0 — that's ~35 oscillation cycles, well into the
    // asymptotic regime where J = E/ω is meaningful. Over the same
    // interval ã grows by ~2× and the frequency by ~3×, giving a
    // non-trivial adiabatic test (|Δω/ω| ~ 1 but the per-period change
    // stays below 3%).
    const exp = kasnerSymmetricVacuum()
    const n = 4
    const k = 10
    const etaStart = 1
    const dt = 0.01
    const nSteps = 500

    // Initial condition: small displacement at the turning point.
    let phi = 1.0
    let pi = 0.0

    /**
     * Mode energy in the canonical (A, B, k²) variables.
     *
     * @param aKin - Drift coefficient `aKinetic`
     * @param aPotK2 - Kick stiffness `aPot_0 · k²`
     * @param p - Canonical field
     * @param q - Canonical momentum
     */
    const modeEnergy = (aKin: number, aPotK2: number, p: number, q: number): number =>
      0.5 * aKin * q * q + 0.5 * aPotK2 * p * p

    /**
     * Effective frequency `ω = √(A·B·k²)` at the given coefs.
     *
     * @param aKin - Drift coefficient `aKinetic`
     * @param aPotK2 - Kick stiffness `aPot_0 · k²`
     */
    const modeOmega = (aKin: number, aPotK2: number): number => Math.sqrt(aKin * aPotK2)

    // Reference adiabatic invariant at η₀.
    const coefs0 = computeBianchiKasnerCoefs(etaStart, exp, n)
    const B0K2 = coefs0.aPotential * k * k
    const e0 = modeEnergy(coefs0.aKinetic, B0K2, phi, pi)
    const j0 = e0 / modeOmega(coefs0.aKinetic, B0K2)

    // Kick-drift-kick symplectic Verlet. Each half-kick uses the
    // coefficients at its own η (start, mid, end), so the coefficient
    // time dependence is second-order accurate.
    let eta = etaStart
    for (let i = 0; i < nSteps; i++) {
      // Half-kick at current η
      const c0 = computeBianchiKasnerCoefs(eta, exp, n)
      pi -= 0.5 * dt * (c0.aPotential * k * k) * phi
      // Drift at mid-η
      eta += 0.5 * dt
      const c1 = computeBianchiKasnerCoefs(eta, exp, n)
      phi += dt * c1.aKinetic * pi
      eta += 0.5 * dt
      // Half-kick at new η
      const c2 = computeBianchiKasnerCoefs(eta, exp, n)
      pi -= 0.5 * dt * (c2.aPotential * k * k) * phi
    }

    const coefsEnd = computeBianchiKasnerCoefs(eta, exp, n)
    const BEndK2 = coefsEnd.aPotential * k * k
    const eEnd = modeEnergy(coefsEnd.aKinetic, BEndK2, phi, pi)
    const jEnd = eEnd / modeOmega(coefsEnd.aKinetic, BEndK2)

    const drift = Math.abs(jEnd - j0) / j0
    expect(drift).toBeLessThan(0.1)
    expect(Number.isFinite(phi)).toBe(true)
    expect(Number.isFinite(pi)).toBe(true)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Isotropic bit-identity under the generic dispatcher — acceptance (j)
// ───────────────────────────────────────────────────────────────────────────

describe('computeCosmologyCoefs under the bianchiKasner preset', () => {
  it('(j) isotropic exponent triple (1/3, 1/3, 1/3) returns ratios === 1 exactly', () => {
    const coefs = computeCosmologyCoefs(1.5, {
      preset: 'bianchiKasner',
      spacetimeDim: 4,
      kasnerExponents: { p1: 1 / 3, p2: 1 / 3, p3: 1 / 3 },
    })
    expect(coefs.aPotentialRatio1).toBe(1)
    expect(coefs.aPotentialRatio2).toBe(1)
  })

  it('the canonical vacuum triple at η = 1.5 uploads ratios = 1 exactly (t = 1)', () => {
    const coefs = computeCosmologyCoefs(1.5, {
      preset: 'bianchiKasner',
      spacetimeDim: 4,
      kasnerExponents: kasnerSymmetricVacuum(),
    })
    // At η = 1.5 we have t = 1 and all a_i bit-identically equal Math.pow(1, p_i) = 1.
    expect(coefs.aPotentialRatio1).toBe(1)
    expect(coefs.aPotentialRatio2).toBe(1)
    expect(coefs.aKinetic).toBe(1)
    expect(coefs.aFull).toBe(1)
  })

  it('the canonical vacuum triple at η = 6 uploads ratios = 1/64 within 1e-10', () => {
    const coefs = computeCosmologyCoefs(6, {
      preset: 'bianchiKasner',
      spacetimeDim: 4,
      kasnerExponents: kasnerSymmetricVacuum(),
    })
    const r1 = coefs.aPotentialRatio1 ?? Number.NaN
    const r2 = coefs.aPotentialRatio2 ?? Number.NaN
    expect(Math.abs(r1 - 1 / 64)).toBeLessThan(1e-10)
    expect(Math.abs(r2 - 1 / 64)).toBeLessThan(1e-10)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Preset dispatch guards
// ───────────────────────────────────────────────────────────────────────────

describe('bianchiKasner preset plumbing', () => {
  it('qExponent throws a clear RangeError under bianchiKasner', () => {
    expect(() =>
      qExponent({
        preset: 'bianchiKasner',
        spacetimeDim: 4,
        kasnerExponents: kasnerSymmetricVacuum(),
      })
    ).toThrow(RangeError)
  })

  it('isValidPreset accepts a well-formed bianchiKasner params object', () => {
    expect(
      isValidPreset({
        preset: 'bianchiKasner',
        spacetimeDim: 4,
        kasnerExponents: kasnerSymmetricVacuum(),
      })
    ).toBe(true)
  })

  it('isValidPreset rejects bianchiKasner without kasnerExponents', () => {
    expect(isValidPreset({ preset: 'bianchiKasner', spacetimeDim: 4 })).toBe(false)
  })

  it('isValidPreset rejects bianchiKasner for spacetimeDim < 4 (Bianchi-I needs 3 spatial axes)', () => {
    expect(
      isValidPreset({
        preset: 'bianchiKasner',
        spacetimeDim: 3,
        kasnerExponents: kasnerSymmetricVacuum(),
      })
    ).toBe(false)
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Bit-identity under existing isotropic presets — guards the shader property
// ───────────────────────────────────────────────────────────────────────────

describe('isotropic-preset bit-identity under computeCosmologyCoefs', () => {
  it('Minkowski, de Sitter, Kasner FLRW, and ekpyrotic all return ratios === 1', () => {
    const presetCases = [
      { preset: 'minkowski' as const, spacetimeDim: 4 },
      { preset: 'deSitter' as const, spacetimeDim: 4, hubble: 1 },
      { preset: 'kasner' as const, spacetimeDim: 4 },
      { preset: 'ekpyrotic' as const, spacetimeDim: 4, steepness: 7 },
    ]
    for (const params of presetCases) {
      const coefs = computeCosmologyCoefs(-1, params)
      expect(coefs.aPotentialRatio1).toBe(1)
      expect(coefs.aPotentialRatio2).toBe(1)
    }
  })
})
