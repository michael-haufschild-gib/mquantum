/**
 * Hydrogen Momentum-Space Normalization Verification
 *
 * Tests that ∫₀^∞ |R̃_nl(k)|² k² dk = 1 (within numerical tolerance),
 * using a CPU-side TypeScript mirror of the WGSL hydrogenRadialMomentum
 * function with the Fock normalization correction.
 *
 * The normalization is derived from Gegenbauer orthogonality on the Fock
 * sphere. Without the correction factor 2^l × l! × √(2n/π), the integral
 * would be π/(2^{2l+1} × n × (l!)²) instead of 1.
 *
 * @module tests/lib/physics/hydrogenMomentumNorm
 */

import { describe, expect, it } from 'vitest'

// ============================================================================
// TypeScript mirror of WGSL functions (with Fock normalization fix)
// ============================================================================

/** Log-factorial: ln(k!) — matches WGSL lnFactorial() which covers 0..22. */
function lnFactorial(k: number): number {
  let sum = 0
  for (let i = 2; i <= k; i++) sum += Math.log(i)
  return sum
}

function gegenbauer(n: number, alpha: number, x: number): number {
  if (n <= 0) return 1.0
  if (n === 1) return 2.0 * alpha * x

  let cNm2 = 1.0
  let cNm1 = 2.0 * alpha * x
  let cN = cNm1

  for (let i = 2; i <= n; i++) {
    const a = (2.0 * (i + alpha - 1.0)) / i
    const b = (i + 2.0 * alpha - 2.0) / i
    cN = a * x * cNm1 - b * cNm2
    cNm2 = cNm1
    cNm1 = cN
  }

  return cN
}

/** Factorial for l! (l ≤ 6 in practice). */
function factorial(n: number): number {
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

/**
 * Mirror of WGSL hydrogenRadialMomentum — with Fock normalization fix.
 * Uses lnFactorial for (n-l-1)!/(n+l)! to handle n+l up to 13 (n=7,l=6).
 */
function hydrogenRadialMomentumFixed(n: number, l: number, k: number, a0: number): number {
  if (n < 1 || l < 0 || l >= n) return 0.0

  const a0Safe = Math.max(a0, 0.001)
  const na = n * a0Safe
  const q = Math.max(na * Math.abs(k), 0.0)
  const q2 = q * q
  const x = (q2 - 1.0) / Math.max(q2 + 1.0, 1e-6)

  const order = n - l - 1
  const alpha = l + 1
  const gegen = gegenbauer(order, alpha, Math.max(-1, Math.min(x, 1)))
  const denom = Math.pow(1.0 + q2, l + 2.0)

  let qPow = 1.0
  for (let il = 0; il < l; il++) qPow *= q

  // Use lnFactorial (matches WGSL fix) — FACTORIAL LUT only goes to 12!
  // Compute sqrt in log-space: exp(ln(a)/2) avoids intermediate underflow.
  const lnRatio = lnFactorial(order) - lnFactorial(n + l)
  const norm = Math.exp(lnRatio * 0.5)

  // Fock normalization correction: 2^l × l! × √(2n/π)
  const lFact = factorial(l)
  const fockNorm = Math.pow(2, l) * lFact * Math.sqrt((2 * n) / Math.PI)

  const naNorm = na * Math.sqrt(na)
  return (naNorm * Math.pow(2, l + 2.0) * norm * fockNorm * qPow * gegen) / Math.max(denom, 1e-8)
}

/**
 * Γ(λ+1) for integer or half-integer λ — mirrors WGSL gammaLambdaPlus1().
 */
function gammaLambdaPlus1(lambda: number): number {
  const lambdaInt = Math.trunc(lambda)
  const isHalfInt = Math.abs(lambda - lambdaInt) > 0.25

  if (!isHalfInt) {
    // Integer λ: Γ(λ+1) = λ!
    return factorial(lambdaInt)
  }

  // Half-integer λ = lambdaInt + 0.5: Γ(lambdaInt + 1.5) = √π × ∏_{k=0}^{lambdaInt} (k + 0.5)
  let result = Math.sqrt(Math.PI)
  for (let k = 0; k <= lambdaInt; k++) {
    result *= k + 0.5
  }
  return result
}

/**
 * Mirror of WGSL hydrogenRadialMomentumND — N-dimensional Fock-style.
 * Uses fractional λ = l + (D-3)/2 and n_eff = n + (D-3)/2.
 */
function hydrogenRadialMomentumND(
  n: number,
  l: number,
  k: number,
  a0: number,
  dim: number
): number {
  if (n < 1 || l < 0 || l >= n) return 0.0

  const a0Safe = Math.max(a0, 0.001)
  const lambda = l + (dim - 3) / 2
  const nr = n - l - 1
  const nEff = nr + lambda + 1
  const na = nEff * a0Safe
  const q = Math.max(na * Math.abs(k), 0.0)
  const q2 = q * q
  const x = (q2 - 1.0) / Math.max(q2 + 1.0, 1e-6)

  const gegen = gegenbauer(nr, lambda + 1, Math.max(-1, Math.min(x, 1)))
  const denom = Math.pow(1.0 + q2, lambda + 2.0)

  // q^λ
  const qPow = Math.pow(Math.max(q, 1e-20), lambda)

  // Normalization via log-factorial ratio: sqrt(nr! / (nr + 2λ + 1)!)
  const denomFactIdx = Math.round(nr + 2 * lambda + 1)
  const lnRatio = lnFactorial(nr) - lnFactorial(denomFactIdx)
  const norm = Math.exp(lnRatio * 0.5)

  // Fock correction: 2^λ × Γ(λ+1) × √(2·n_eff/π)
  const gammaLP1 = gammaLambdaPlus1(lambda)
  const fockNorm = Math.pow(2, lambda) * gammaLP1 * Math.sqrt((2 * nEff) / Math.PI)

  const naNorm = na * Math.sqrt(na)
  return (
    (naNorm * Math.pow(2, lambda + 2.0) * norm * fockNorm * qPow * gegen) / Math.max(denom, 1e-8)
  )
}

function integrateRadialMomentum(fn: (k: number) => number, kMax: number, nPts: number): number {
  const dk = kMax / nPts
  let sum = 0
  for (let i = 0; i < nPts; i++) {
    const k = (i + 0.5) * dk
    const val = fn(k)
    sum += val * val * k * k * dk
  }
  return sum
}

describe('hydrogen momentum-space normalization (Fock-corrected)', () => {
  const a0 = 1.0

  const states: [number, number][] = [
    [1, 0],
    [2, 0],
    [2, 1],
    [3, 0],
    [3, 1],
    [3, 2],
    [4, 0],
    [4, 1],
    [5, 0],
    [5, 3],
    [6, 0],
    [7, 0],
    [7, 5],
    [7, 6], // n+l=13 exceeds FACTORIAL_LUT — exercises lnFactorial path
  ]

  for (const [n, l] of states) {
    it(`∫|R̃_${n}${l}(k)|²k²dk = 1.0 ± 2% (n=${n}, l=${l})`, () => {
      // kMax scales with 1/(na₀) — larger k values are needed for small n
      const kMax = 30.0 / (n * a0)
      const nPts = 20000
      const integral = integrateRadialMomentum(
        (k) => hydrogenRadialMomentumFixed(n, l, k, a0),
        kMax,
        nPts
      )
      // 2% tolerance for midpoint quadrature on smooth oscillatory integrand
      expect(integral).toBeGreaterThan(0.98)
      expect(integral).toBeLessThan(1.02)
    })
  }
})

describe('N-dimensional momentum-space normalization (Fock-corrected)', () => {
  const a0 = 1.0

  it('D=3 ND function matches 3D specialization for 1s orbital', () => {
    // At D=3, hydrogenRadialMomentumND should produce same result as 3D version
    for (const k of [0.5, 1.0, 3.0, 8.0]) {
      const nd = hydrogenRadialMomentumND(1, 0, k, a0, 3)
      const d3 = hydrogenRadialMomentumFixed(1, 0, k, a0)
      expect(nd).toBeCloseTo(d3, 4)
    }
  })

  it('D=3 ND function matches 3D specialization for 3,2 orbital', () => {
    for (const k of [0.5, 1.0, 3.0]) {
      const nd = hydrogenRadialMomentumND(3, 2, k, a0, 3)
      const d3 = hydrogenRadialMomentumFixed(3, 2, k, a0)
      expect(nd).toBeCloseTo(d3, 4)
    }
  })

  // ND states to test: [n, l, dim]
  // D=4 gives λ = l + 0.5 (half-integer) — exercises gammaLambdaPlus1 half-int path
  // D=5 gives λ = l + 1 (integer) — exercises integer path with shifted nEff
  // D=7 gives λ = l + 2 (integer) — large lambda
  const ndStates: [number, number, number][] = [
    // D=4: half-integer lambda
    [1, 0, 4],
    [2, 0, 4],
    [2, 1, 4],
    [3, 0, 4],
    [3, 2, 4],
    // D=5: integer lambda (shifted)
    [1, 0, 5],
    [2, 0, 5],
    [2, 1, 5],
    [3, 1, 5],
    // D=7: large lambda
    [1, 0, 7],
    [2, 0, 7],
    [3, 0, 7],
  ]

  for (const [n, l, dim] of ndStates) {
    it(`D=${dim}: ∫|R̃_${n}${l}(k)|²k²dk = 1.0 ± 3% (n=${n}, l=${l})`, () => {
      const nEff = n + (dim - 3) / 2
      const kMax = 30.0 / (nEff * a0)
      const nPts = 25000
      const integral = integrateRadialMomentum(
        (k) => hydrogenRadialMomentumND(n, l, k, a0, dim),
        kMax,
        nPts
      )
      // 3% tolerance — ND integrands can be broader/oscillatory
      expect(integral).toBeGreaterThan(0.97)
      expect(integral).toBeLessThan(1.03)
    })
  }
})
