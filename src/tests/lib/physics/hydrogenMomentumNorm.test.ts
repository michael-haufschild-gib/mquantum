/**
 * Hydrogen Momentum-Space Normalization Verification
 *
 * Tests that ∫₀^∞ |R̃_nl(k)|² k² dk = 1 (within numerical tolerance)
 * for the WGSL hydrogenRadialMomentum function.
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

const FACTORIAL = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800, 479001600]

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

/**
 * Mirror of WGSL hydrogenRadialMomentum — with Fock normalization fix.
 * Includes the correction factor 2^l × l! × √(2n/π).
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

  const factNum = FACTORIAL[Math.max(order, 0)]!
  const factDen = Math.max(FACTORIAL[Math.min(n + l, 12)]!, 1e-6)
  const norm = Math.sqrt(Math.max(factNum / factDen, 1e-8))

  // Fock normalization correction: 2^l × l! × √(2n/π)
  const lFact = FACTORIAL[l]!
  const fockNorm = Math.pow(2, l) * lFact * Math.sqrt((2 * n) / Math.PI)

  const naNorm = na * Math.sqrt(na)
  return (naNorm * Math.pow(2, l + 2.0) * norm * fockNorm * qPow * gegen) / Math.max(denom, 1e-8)
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
