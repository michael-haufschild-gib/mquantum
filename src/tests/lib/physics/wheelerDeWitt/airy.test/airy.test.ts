/**
 * Cross-check `airyAi`, `airyBi`, `airyAiPrime`, `airyBiPrime` against
 * SciPy `scipy.special.airy` reference values, plus a Wronskian
 * consistency check
 *
 *     Ai(z) · Bi'(z) − Ai'(z) · Bi(z) = 1 / π
 *
 * which catches any sign flip in the four series independently of the
 * absolute reference table.
 *
 * Tolerances reflect the actual numerical precision regimes:
 *
 *  - `|z| ≤ 6` (Maclaurin window): relative error ~1e−9 across
 *    `(Ai, Bi, Ai′, Bi′)`. Maclaurin converges to double precision with
 *    the cap of 80 terms.
 *  - `|z| > 6` (asymptotic window with 4 correction terms): relative
 *    error ~1e−5 at `|z| = 8`, improving by an order of magnitude per
 *    unit-z increase. The Wheeler–DeWitt connection uses Airy at
 *    `|ζ| ≲ 12` (deep-band cutoff), where 4-term asymptotic gives
 *    ≤ 1e−7 relative error.
 */

import { describe, expect, it } from 'vitest'

import { airyAi, airyAiPrime, airyAll, airyBi, airyBiPrime } from '@/lib/physics/wheelerDeWitt/airy'

interface Reference {
  z: number
  ai: number
  bi: number
  aiPrime: number
  biPrime: number
}

/**
 * Reference values from `scipy.special.airy` (verified against DLMF 9.9
 * tables). The two `|z| = 8` rows are at the boundary of the asymptotic
 * regime; the test loosens tolerance there to 1e-5.
 */
const REFERENCE: Reference[] = [
  {
    z: -8,
    ai: -5.270505035601e-2,
    bi: -3.312515807467e-1,
    aiPrime: 9.355609381951e-1,
    biPrime: -1.594504978135e-1,
  },
  {
    z: -6,
    ai: -3.291451736281e-1,
    bi: -1.466983766682e-1,
    aiPrime: 3.45935487283e-1,
    biPrime: -8.128987851072e-1,
  },
  {
    z: -2,
    ai: 2.274074282026e-1,
    bi: -4.123025879628e-1,
    aiPrime: 6.182590207358e-1,
    biPrime: 2.787951669159e-1,
  },
  {
    z: -1,
    ai: 5.355608832896e-1,
    bi: 1.039973894949e-1,
    aiPrime: -1.016056711718e-2,
    biPrime: 5.92375626416e-1,
  },
  {
    z: 0,
    ai: 3.550280538878e-1,
    bi: 6.14926627446e-1,
    aiPrime: -2.588194037928e-1,
    biPrime: 4.482883573538e-1,
  },
  {
    z: 1,
    ai: 1.352924163128e-1,
    bi: 1.207423594951,
    aiPrime: -1.591474412992e-1,
    biPrime: 9.324359333927e-1,
  },
  {
    z: 2,
    ai: 3.492413042362e-2,
    bi: 3.298094999836,
    aiPrime: -5.309038443448e-2,
    biPrime: 4.100682049905,
  },
  {
    z: 6,
    ai: 9.947694360374e-6,
    bi: 6.536446104773e3,
    aiPrime: -2.476520039712e-5,
    biPrime: 1.572560262174e4,
  },
  {
    z: 8,
    ai: 4.692207616066e-8,
    bi: 1.199585996122e6,
    aiPrime: -1.341439297888e-7,
    biPrime: 3.354342310822e6,
  },
]

/**
 * Maclaurin window: relaxed at the upper boundary because `Ai(z)` enters
 * the deeply-cancelling regime there. Ai(6) sits around 1e−5 while `f(6)`
 * and `g(6)` are O(10⁵) each, so 16-digit double subtraction leaves
 * ~10 sig figs in `Ai(6)`. Empirically achieves ~1e−8 at z = 6, ~1e−12
 * for `|z| ≤ 4`. Single tolerance covers both regimes.
 */
const MACLAURIN_TOL = 1e-7
/** Asymptotic window: 4-term truncation gives ~1e-5 at z = ±8. */
const ASYMPTOTIC_TOL = 1e-5

function tolFor(z: number): number {
  return Math.abs(z) <= 6 ? MACLAURIN_TOL : ASYMPTOTIC_TOL
}

function approxRel(actual: number, expected: number, tol: number, label: string): void {
  if (expected === 0) {
    expect(Math.abs(actual)).toBeLessThan(tol)
    return
  }
  const rel = Math.abs(actual - expected) / Math.abs(expected)
  if (rel > tol) {
    throw new Error(
      `${label}: got ${actual}, expected ${expected}, relative error ${rel.toExponential(3)} > ${tol}`
    )
  }
  expect(rel).toBeLessThan(tol)
}

describe('airy.ts — value table', () => {
  it.each(REFERENCE)('matches SciPy reference at z = $z', ({ z, ai, bi, aiPrime, biPrime }) => {
    const tol = tolFor(z)
    approxRel(airyAi(z), ai, tol, `Ai(${z})`)
    approxRel(airyBi(z), bi, tol, `Bi(${z})`)
    approxRel(airyAiPrime(z), aiPrime, tol, `Ai'(${z})`)
    approxRel(airyBiPrime(z), biPrime, tol, `Bi'(${z})`)
  })
})

describe('airy.ts — Wronskian identity', () => {
  // Ai(z)·Bi'(z) − Ai'(z)·Bi(z) = 1/π. Diagnostic that catches sign flips,
  // wrong constants, or a swapped P/Q in the asymptotic regime.
  // Maclaurin samples (|z| ≤ 6): ~1e-12 absolute error.
  it.each([-4, -2, -1, -0.5, 0, 0.5, 1, 2, 4])(
    'holds at z = %s to 1e−10 (Maclaurin core range)',
    (z) => {
      const w = airyAi(z) * airyBiPrime(z) - airyAiPrime(z) * airyBi(z)
      const expected = 1 / Math.PI
      expect(Math.abs(w - expected)).toBeLessThan(1e-10)
    }
  )

  // Maclaurin boundary (|z| = 6): cancellation noise is larger.
  it.each([-6, 6])('holds at z = %s to 1e−7 (Maclaurin boundary)', (z) => {
    const w = airyAi(z) * airyBiPrime(z) - airyAiPrime(z) * airyBi(z)
    const expected = 1 / Math.PI
    expect(Math.abs(w - expected)).toBeLessThan(1e-7)
  })

  // Asymptotic samples — relaxed: 4-term truncation gives ~1e-6 absolute
  // error at |z| = 8.
  it.each([-12, -10, -8, 8, 10, 12])('holds at z = %s to 1e−5 (asymptotic range)', (z) => {
    const w = airyAi(z) * airyBiPrime(z) - airyAiPrime(z) * airyBi(z)
    const expected = 1 / Math.PI
    expect(Math.abs(w - expected)).toBeLessThan(1e-5)
  })
})

describe('airy.ts — airyAll consistency', () => {
  // The fused evaluator must agree with the four scalar entry points to
  // floating-point precision (it shares the underlying series).
  const samples = [-7, -3, -1, 0, 1, 3, 7]
  it.each(samples)('returns the same components as scalar wrappers at z = %s', (z) => {
    const all = airyAll(z)
    expect(all.ai).toBe(airyAi(z))
    expect(all.bi).toBe(airyBi(z))
    expect(all.aiPrime).toBe(airyAiPrime(z))
    expect(all.biPrime).toBe(airyBiPrime(z))
  })
})

describe('airy.ts — sanity bounds', () => {
  it('Ai decays monotonically for z ≥ 0', () => {
    let prev = airyAi(0)
    for (let z = 0.5; z <= 10; z += 0.5) {
      const cur = airyAi(z)
      expect(cur).toBeLessThan(prev)
      expect(cur).toBeGreaterThan(0)
      prev = cur
    }
  })

  it('Bi grows monotonically for z ≥ 0', () => {
    let prev = airyBi(0)
    for (let z = 0.5; z <= 8; z += 0.5) {
      const cur = airyBi(z)
      expect(cur).toBeGreaterThan(prev)
      prev = cur
    }
  })
})
