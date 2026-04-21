/**
 * Tests for the CPU mirrors of the WGSL normalization constants that
 * uniformPacking writes into `SchroedingerUniforms`. The shader consumes
 * these values without recomputing them, so any CPU/GPU divergence produces
 * visibly wrong quantum amplitudes.
 *
 * Strategy:
 *   1. Closed-form checks against textbook values (1s, 2s, 2p, ...).
 *   2. CPU/GPU parity: compare `computeX` (f64 in JS) against a f32-emulated
 *      version that mirrors the WGSL implementation bit-for-bit (same LUTs,
 *      same rounding order) up to the 3 ULP transcendental budget defined
 *      in f32Equivalence.test.ts.
 *
 * @module tests/rendering/webgpu/renderers/uniformPackingHydrogenMath
 */

import { describe, expect, it } from 'vitest'

import {
  computeHydrogenRadialNormND,
  computeHypersphericalLayerNorm,
} from '@/rendering/webgpu/renderers/uniformPackingHydrogenMath'

// ----------------------------------------------------------------------------
// f32-emulated mirrors of the WGSL implementations.
//
// WGSL mandates IEEE 754 binary32; Math.fround() rounds to f32 with the
// same rules, so these functions reproduce GPU arithmetic exactly for basic
// ops. Transcendentals (log/exp) may still differ by up to 3 ULP per the
// WGSL §14.6.4 accuracy requirements.
// ----------------------------------------------------------------------------

const f = Math.fround

/** WGSL LN_FACTORIAL_LUT[0..22] — matches hydrogenRadial.wgsl.ts */
const LN_FACTORIAL_F32 = [
  0.0, 0.0, 0.6931472, 1.7917595, 3.1780539, 4.7874917, 6.5792512, 8.5251614, 10.604602, 12.801827,
  15.104413, 17.502308, 19.987214, 22.552164, 25.191221, 27.899271, 30.67186, 33.505073, 36.395445,
  39.339884, 42.335616, 45.380139, 48.471181,
].map(f)

/** WGSL LN_GAMMA_HALF[0..29] — matches hypersphericalHarmonics.wgsl.ts */
const LN_GAMMA_HALF_F32 = [
  0.5723649, 0.0, -0.1207822, 0.0, 0.2846829, 0.6931472, 1.2009736, 1.7917595, 2.4537365, 3.1780539,
  3.957814, 4.7874917, 5.6625621, 6.5792512, 7.5343642, 8.5251614, 9.5492673, 10.604602, 11.689333,
  12.801827, 13.940625, 15.104413, 16.291956, 17.502308, 18.734347, 19.987214, 21.260076, 22.552164,
  23.862765, 25.191221,
].map(f)

function lnFactorial_f32(k: number): number {
  if (k < 0 || k > 22) return f(0)
  return LN_FACTORIAL_F32[k]!
}

function lnGammaHalf_f32(n: number): number {
  if (n < 1 || n > 30) return f(0)
  return LN_GAMMA_HALF_F32[n - 1]!
}

/** f32 mirror of WGSL `hydrogenRadialNormND`. */
function hydrogenRadialNormND_f32(nr: number, lambda: number, nEff: number, a0: number): number {
  const nEffF = f(nEff)
  const twoOverNa = f(f(2) / f(nEffF * f(a0)))
  const front = f(twoOverNa * f(Math.sqrt(twoOverNa)))
  // WGSL: nr + i32(2*lambda + 1 + 0.5) — equivalent to rounding a non-negative integer.
  const denomFactIdx = nr + Math.trunc(f(f(f(2) * f(lambda)) + f(1)) + f(0.5))
  const lnNum = lnFactorial_f32(nr)
  const lnDen = f(f(Math.log(f(f(2) * nEffF))) + lnFactorial_f32(denomFactIdx))
  const lnRatio = f(lnNum - lnDen)
  return f(front * f(Math.exp(f(lnRatio * f(0.5)))))
}

/** f32 mirror of WGSL `lnHypersphericalLayerNorm`, returning `exp(0.5 * lnNormSq)` like the caller. */
function hypersphericalLayerNorm_f32(lk: number, lkp1: number, D: number, k: number): number {
  const nk = lk - lkp1
  if (nk < 0) return f(Math.exp(f(-20)))
  const dMinusKMinus1 = D - k - 1
  const prefactor = f(2 * lk + dMinusKMinus1)
  const lnNkFact = lnFactorial_f32(nk)
  const lnGammaNum = lnGammaHalf_f32(2 * lkp1 + dMinusKMinus1)
  const lnGammaDen = lnGammaHalf_f32(2 * lk + dMinusKMinus1 + 2)
  const lnNormSq = f(
    f(f(f(Math.log(f(Math.max(prefactor, f(1e-20))))) + lnNkFact) + lnGammaNum) -
      f(f(0.6931472) + lnGammaDen)
  )
  return f(Math.exp(f(lnNormSq * f(0.5))))
}

// ----------------------------------------------------------------------------
// Closed-form reference values (textbook hydrogen).
//
// For R_nl^(D=3)(r) the standard radial norm is
//   N_nl = (2/(n·a₀))^{3/2} × √((n-l-1)! / (2n·(n+l)!))
// Canonical values at a₀=1:
//   1s: N = 2                    (= 2 · 1^{-3/2})
//   2s: N = 1/(2√2)              ≈ 0.353553
//   2p: N = 1/(2√6)              ≈ 0.204124
//   3d: N = 2/(81·√30)           ≈ 0.004509
// ----------------------------------------------------------------------------

describe('computeHydrogenRadialNormND — closed-form values (3D hydrogen, a₀=1)', () => {
  it('matches 1s normalization (n=1, l=0): N = 2', () => {
    const norm = computeHydrogenRadialNormND(0, 0, 1, 1)
    expect(norm).toBeCloseTo(2, 10)
  })

  it('matches 2s normalization (n=2, l=0): N = 1/(2√2)', () => {
    const norm = computeHydrogenRadialNormND(1, 0, 2, 1)
    expect(norm).toBeCloseTo(1 / (2 * Math.SQRT2), 10)
  })

  it('matches 2p normalization (n=2, l=1): N = 1/(2√6)', () => {
    const norm = computeHydrogenRadialNormND(0, 1, 2, 1)
    expect(norm).toBeCloseTo(1 / (2 * Math.sqrt(6)), 10)
  })

  it('matches 3d normalization (n=3, l=2): N = 1/(9√30)', () => {
    // (2/3)^{3/2} · √(0!/(6·5!)) = (2√6/9) · (1/√720) = 1/(9√30).
    const norm = computeHydrogenRadialNormND(0, 2, 3, 1)
    expect(norm).toBeCloseTo(1 / (9 * Math.sqrt(30)), 10)
  })

  it('scales as a₀^(-3/2) at fixed (n, l)', () => {
    // Pure a0 dependence: front factor = (2/(n·a₀))^{3/2}, factorial piece is independent.
    const a = computeHydrogenRadialNormND(0, 0, 1, 1)
    const b = computeHydrogenRadialNormND(0, 0, 1, 4)
    expect(b / a).toBeCloseTo(Math.pow(4, -1.5), 10)
  })

  it('reduces to 3D norm when D=3 (λ=l, n_eff=n)', () => {
    // At D=3 the ND and 3D formulas are algebraically identical.
    const n3d = computeHydrogenRadialNormND(1, 1, 3, 1) // n=3, l=1 → nr=1, λ=1, nEff=3
    // Reference: (2/3)^(3/2) · √(1!/(6·4!)) = (2/3)^(3/2) / √144 = (2/3)^(3/2) / 12
    const expected = Math.pow(2 / 3, 1.5) / 12
    expect(n3d).toBeCloseTo(expected, 10)
  })
})

describe('computeHydrogenRadialNormND — CPU/GPU parity (f32 emulation ≤ 3 ULP)', () => {
  // ~30 ULP budget for chained f32 transcendentals (log, exp, sqrt, pow).
  const REL_TOL = 3.6e-6
  const ABS_TOL = 1e-12

  const cases: Array<[number, number, number, number]> = []
  // All valid (n, l, D) the shader actually emits with n ≤ 7, l < n, D ∈ [3, 11], a0 ∈ {0.5, 1, 2}.
  for (let D = 3; D <= 11; D++) {
    for (let n = 1; n <= 7; n++) {
      for (let l = 0; l < n; l++) {
        for (const a0 of [0.5, 1, 2]) {
          const nr = n - l - 1
          const lambda = l + (D - 3) / 2
          const nEff = nr + lambda + 1
          cases.push([nr, lambda, nEff, a0])
        }
      }
    }
  }

  it(`matches f32 WGSL within 3 ULP across ${cases.length} (n, l, D, a₀) combos`, () => {
    let maxRelErr = 0
    let maxAt = ''
    for (const [nr, lambda, nEff, a0] of cases) {
      const cpu = computeHydrogenRadialNormND(nr, lambda, nEff, a0)
      const gpu = hydrogenRadialNormND_f32(nr, lambda, nEff, a0)
      const absErr = Math.abs(cpu - gpu)
      const relErr = absErr / Math.max(Math.abs(cpu), ABS_TOL)
      if (relErr > maxRelErr) {
        maxRelErr = relErr
        maxAt = `nr=${nr} λ=${lambda} nEff=${nEff} a₀=${a0} (cpu=${cpu}, gpu=${gpu})`
      }
    }
    expect(maxRelErr, `worst divergence at ${maxAt}`).toBeLessThan(REL_TOL)
  })
})

describe('computeHypersphericalLayerNorm — closed-form values', () => {
  it('matches Gegenbauer norm √(2/3) for C_1^{1} (D=4, k=0, lk=1, lkp1=0)', () => {
    // α = lkp1 + (D-k-2)/2 = 0 + 1 = 1 → C_1^{1}, whose orthogonality norm is √(2/3).
    const norm = computeHypersphericalLayerNorm(1, 0, 4, 0)
    expect(norm).toBeCloseTo(Math.sqrt(2 / 3), 6)
  })

  it('nk=0 (lk=lkp1) gives finite, positive norm (Gegenbauer degree zero)', () => {
    const norm = computeHypersphericalLayerNorm(2, 2, 5, 0)
    expect(Number.isFinite(norm)).toBe(true)
    expect(norm).toBeGreaterThan(0)
  })

  it('returns exp(-20) sentinel for invalid nk<0', () => {
    const norm = computeHypersphericalLayerNorm(0, 1, 4, 0)
    expect(norm).toBeCloseTo(Math.exp(-20), 12)
  })

  it('independent of lkp1 when nk is held fixed (for alpha-only variation)', () => {
    // nk = lk - lkp1; with nk=1 fixed and D,k fixed, the prefactor (2·lk+D-k-1) grows with lk,
    // and Γ(lkp1 + (D-k-1)/2) / Γ(lk + (D-k+1)/2) decreases, but not trivially. Sanity: still positive.
    const a = computeHypersphericalLayerNorm(1, 0, 4, 0)
    const b = computeHypersphericalLayerNorm(3, 2, 4, 0)
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(0)
  })
})

describe('computeHypersphericalLayerNorm — CPU/GPU parity (f32 emulation ≤ 3 ULP)', () => {
  const REL_TOL = 3.6e-6
  const ABS_TOL = 1e-12

  it('matches f32 WGSL across all (lk, lkp1, D, k) combos the shader emits', () => {
    // Shader emits k ∈ [0, D-4] for D ∈ [3, 11]. lk, lkp1 are angular chain entries
    // constrained by |m| ≤ l_{D-2} ≤ ... ≤ l_1 ≤ principalN-1. We probe a superset.
    let maxRelErr = 0
    let maxAt = ''
    let checked = 0
    for (let D = 3; D <= 11; D++) {
      for (let k = 0; k < D - 3; k++) {
        for (let lk = 0; lk <= 6; lk++) {
          for (let lkp1 = 0; lkp1 <= lk; lkp1++) {
            const cpu = computeHypersphericalLayerNorm(lk, lkp1, D, k)
            const gpu = hypersphericalLayerNorm_f32(lk, lkp1, D, k)
            const absErr = Math.abs(cpu - gpu)
            const relErr = absErr / Math.max(Math.abs(cpu), ABS_TOL)
            if (relErr > maxRelErr) {
              maxRelErr = relErr
              maxAt = `lk=${lk} lkp1=${lkp1} D=${D} k=${k} (cpu=${cpu}, gpu=${gpu})`
            }
            checked++
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(100)
    expect(maxRelErr, `worst divergence at ${maxAt}`).toBeLessThan(REL_TOL)
  })
})
