/**
 * Property-based tests for N-dimensional hydrogen radial wavefunctions.
 *
 * Uses fast-check to verify normalization, D=3 identity, node count,
 * and asymptotic decay across arbitrary valid (n, l, dim) quantum number
 * combinations and continuous radial coordinates.
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// Mirrors of internal functions (same as existing test + production code)
// ---------------------------------------------------------------------------

function laguerre(k: number, alpha: number, x: number): number {
  if (k <= 0) return 1.0
  if (k === 1) return 1.0 + alpha - x
  let lNm2 = 1.0
  let lNm1 = 1.0 + alpha - x
  let lN = lNm1
  for (let i = 2; i <= k; i++) {
    lN = ((2.0 * i - 1.0 + alpha - x) * lNm1 - (i - 1.0 + alpha) * lNm2) / i
    lNm2 = lNm1
    lNm1 = lN
  }
  return lN
}

function lnFactorial(k: number): number {
  let sum = 0
  for (let i = 2; i <= k; i++) sum += Math.log(i)
  return sum
}

function factorial(n: number): number {
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

function hydrogenRadial3D(n: number, l: number, r: number, a0: number): number {
  if (n < 1 || l < 0 || l >= n) return 0
  const rho = (2 * r) / (n * a0)
  const twoOverNa = 2 / (n * a0)
  const front = twoOverNa * Math.sqrt(twoOverNa)
  const norm = front * Math.sqrt(factorial(n - l - 1) / (2 * n * factorial(n + l)))
  let rhoL = 1
  for (let i = 0; i < l; i++) rhoL *= rho
  const L = laguerre(n - l - 1, 2 * l + 1, rho)
  return norm * rhoL * L * Math.exp(-rho / 2)
}

function hydrogenRadialND(n: number, l: number, r: number, a0: number, dim: number): number {
  if (n < 1 || l < 0 || l >= n) return 0
  const lambda = l + (dim - 3) / 2
  const nr = n - l - 1
  const nEff = nr + lambda + 1
  const rho = (2 * r) / (nEff * a0)
  const twoOverNa = 2 / (nEff * a0)
  const front = twoOverNa * Math.sqrt(twoOverNa)
  const denomFactArg = Math.round(nr + 2 * lambda + 1)
  const lnNum = lnFactorial(nr)
  const lnDen = Math.log(2 * nEff) + lnFactorial(denomFactArg)
  const norm = front * Math.sqrt(Math.exp(lnNum - lnDen))
  const rhoLambda = Math.pow(Math.max(rho, 1e-20), lambda)
  const L = laguerre(nr, 2 * lambda + 1, rho)
  return norm * rhoLambda * L * Math.exp(-rho / 2)
}

function integrate(f: (r: number) => number, rMax: number, steps: number = 2000): number {
  const h = rMax / steps
  let sum = f(0) + f(rMax)
  for (let i = 1; i < steps; i++) {
    const r = i * h
    sum += (i % 2 === 0 ? 2 : 4) * f(r)
  }
  return (sum * h) / 3
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary valid quantum numbers (n, l) with n in [1,5], 0 <= l < n */
const arbQuantumNumbers = fc
  .integer({ min: 1, max: 5 })
  .chain((n) => fc.integer({ min: 0, max: n - 1 }).map((l) => ({ n, l })))

/** Arbitrary dimension in supported range */
const arbDim = fc.integer({ min: 3, max: 11 })

/** Arbitrary valid (n, l, dim) triple */
const arbState = arbQuantumNumbers.chain(({ n, l }) => arbDim.map((dim) => ({ n, l, dim })))

/** Arbitrary positive radial coordinate */
const arbR = fc.double({ min: 0.01, max: 30, noNaN: true, noDefaultInfinity: true })

// ---------------------------------------------------------------------------
// D=3 identity
// ---------------------------------------------------------------------------

describe('hydrogenRadialND D=3 identity — property', () => {
  it('matches hydrogenRadial3D for arbitrary n, l, r at D=3', () => {
    fc.assert(
      fc.property(arbQuantumNumbers, arbR, ({ n, l }, r) => {
        const ref = hydrogenRadial3D(n, l, r, 1.0)
        const nd = hydrogenRadialND(n, l, r, 1.0, 3)
        if (Math.abs(ref) < 1e-15) {
          expect(Math.abs(nd)).toBeLessThan(1e-10)
        } else {
          expect(nd).toBeCloseTo(ref, 5)
        }
      }),
      { numRuns: 500 }
    )
  })
})

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

describe('hydrogenRadialND normalization — property', () => {
  it('∫|R|²r²dr ≈ 1 for arbitrary valid states', () => {
    fc.assert(
      fc.property(arbState, ({ n, l, dim }) => {
        const a0 = 1.0
        const nEff = n + (dim - 3) / 2
        const rMax = nEff * nEff * a0 * 8
        const normIntegral = integrate(
          (r) => {
            const R = hydrogenRadialND(n, l, r, a0, dim)
            return R * R * r * r
          },
          rMax,
          4000
        )
        expect(normIntegral).toBeCloseTo(1.0, 1)
      }),
      { numRuns: 50 } // Integration is expensive
    )
  })
})

// ---------------------------------------------------------------------------
// Asymptotic decay
// ---------------------------------------------------------------------------

describe('hydrogenRadialND asymptotic decay — property', () => {
  it('wavefunction decays at large r relative to characteristic radius', () => {
    fc.assert(
      fc.property(arbState, ({ n, l, dim }) => {
        const a0 = 1.0
        const nEff = n + (dim - 3) / 2
        const rChar = nEff * nEff * a0
        // Test at r well beyond classical turning point
        const nearR = rChar
        const farR = rChar * 6
        const nearVal = Math.abs(hydrogenRadialND(n, l, nearR, a0, dim))
        const farVal = Math.abs(hydrogenRadialND(n, l, farR, a0, dim))
        if (nearVal < 1e-20) return
        expect(farVal).toBeLessThan(nearVal * 0.01)
      }),
      { numRuns: 100 }
    )
  })
})

// ---------------------------------------------------------------------------
// Node count: n_r = n - l - 1 radial nodes
// ---------------------------------------------------------------------------

describe('hydrogenRadialND node count — property', () => {
  it('has exactly n_r = n - l - 1 sign changes', () => {
    // Only test small n to keep integration fast
    const arbSmallState = fc
      .integer({ min: 1, max: 4 })
      .chain((n) =>
        fc
          .integer({ min: 0, max: n - 1 })
          .chain((l) => fc.constantFrom(3, 4, 5, 7).map((dim) => ({ n, l, dim })))
      )

    fc.assert(
      fc.property(arbSmallState, ({ n, l, dim }) => {
        const a0 = 1.0
        const nEff = n + (dim - 3) / 2
        const rMax = nEff * nEff * a0 * 6
        const steps = 2000
        const dr = rMax / steps
        let signChanges = 0
        let prevVal = hydrogenRadialND(n, l, dr, a0, dim)

        for (let i = 2; i <= steps; i++) {
          const r = i * dr
          const val = hydrogenRadialND(n, l, r, a0, dim)
          if (Math.abs(val) > 1e-15 && Math.abs(prevVal) > 1e-15) {
            if (Math.sign(val) !== Math.sign(prevVal)) signChanges++
          }
          if (Math.abs(val) > 1e-15) prevVal = val
        }

        expect(signChanges).toBe(n - l - 1)
      }),
      { numRuns: 40 }
    )
  })
})
