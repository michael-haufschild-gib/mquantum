import { describe, expect, it } from 'vitest'

import {
  angularFactor,
  clearDipoleCache,
  dipoleMatrixElementSquared,
  radialDipoleIntegral,
  wigner3j,
} from '@/lib/physics/openQuantum/dipoleElements'
import type { HydrogenBasisState } from '@/lib/physics/openQuantum/hydrogenBasis'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal HydrogenBasisState for testing */
function makeState(index: number, n: number, l: number, m: number): HydrogenBasisState {
  return { index, n, l, m, extraDimN: [], energy: -1 / (n * n) }
}

// ---------------------------------------------------------------------------
// radialDipoleIntegral
// ---------------------------------------------------------------------------

describe('radialDipoleIntegral', () => {
  it('produces the known 1s->2p radial integral ≈ 1.29 a.u.', () => {
    // Analytic value: 768 / (243 * sqrt(6)) ≈ 1.2902
    // Bug caught: incorrect radial wavefunction normalization or quadrature weights
    const result = radialDipoleIntegral(1, 0, 2, 1)
    expect(result).toBeCloseTo(1.2902, 1)
  })

  it('is symmetric: (n1,l1,n2,l2) equals (n2,l2,n1,l1)', () => {
    // Bug caught: asymmetric integrand evaluation or argument ordering error
    const forward = radialDipoleIntegral(1, 0, 2, 1)
    const reverse = radialDipoleIntegral(2, 1, 1, 0)
    expect(forward).toBeCloseTo(reverse, 10)
  })

  it('is symmetric for 2p->3d transition', () => {
    // Bug caught: symmetry break for higher quantum numbers
    const forward = radialDipoleIntegral(2, 1, 3, 2)
    const reverse = radialDipoleIntegral(3, 2, 2, 1)
    expect(forward).toBeCloseTo(reverse, 10)
  })

  // Higher-n transitions verified against high-precision Simpson's rule integration
  // (200k points). These catch quadrature accuracy degradation at higher quantum numbers
  // where the Laguerre polynomials oscillate more.

  it('produces the known 1s→3p radial integral ≈ 0.5167', () => {
    expect(radialDipoleIntegral(1, 0, 3, 1)).toBeCloseTo(0.5167, 2)
  })

  it('produces the known 2s→3p radial integral ≈ 3.06', () => {
    // 0.2% quadrature tolerance — the 2s WF has a radial node that slightly
    // degrades GL accuracy relative to nodeless states
    expect(radialDipoleIntegral(2, 0, 3, 1)).toBeCloseTo(3.06, 1)
  })

  it('produces the known 2p→3d radial integral ≈ 4.748', () => {
    expect(radialDipoleIntegral(2, 1, 3, 2)).toBeCloseTo(4.748, 2)
  })

  it('produces the known 2p→3s radial integral ≈ 0.938', () => {
    expect(radialDipoleIntegral(2, 1, 3, 0)).toBeCloseTo(0.9384, 2)
  })

  it('produces the known 3d→4f radial integral ≈ 10.23', () => {
    expect(radialDipoleIntegral(3, 2, 4, 3)).toBeCloseTo(10.2303, 1)
  })

  it('produces the known 3p→4d radial integral ≈ 7.565', () => {
    expect(radialDipoleIntegral(3, 1, 4, 2)).toBeCloseTo(7.5654, 1)
  })

  it('produces the known 4f→5g radial integral ≈ 17.72', () => {
    expect(radialDipoleIntegral(4, 3, 5, 4)).toBeCloseTo(17.7206, 1)
  })

  it('produces the known 5g→6h radial integral ≈ 27.21', () => {
    expect(radialDipoleIntegral(5, 4, 6, 5)).toBeCloseTo(27.2145, 1)
  })

  it('produces the known 6h→7i radial integral ≈ 38.71', () => {
    // Highest quantum numbers supported (n=7). Tests quadrature at the accuracy limit.
    expect(radialDipoleIntegral(6, 5, 7, 6)).toBeCloseTo(38.7103, 0)
  })

  it('produces the known 1s→7p radial integral ≈ 0.1214', () => {
    // Large Δn transition — tests quadrature with very different radial scales
    expect(radialDipoleIntegral(1, 0, 7, 1)).toBeCloseTo(0.1214, 2)
  })

  it('is symmetric for high-n transitions', () => {
    const forward = radialDipoleIntegral(4, 3, 5, 4)
    const reverse = radialDipoleIntegral(5, 4, 4, 3)
    expect(forward).toBeCloseTo(reverse, 6)
  })
})

// ---------------------------------------------------------------------------
// wigner3j
// ---------------------------------------------------------------------------

describe('wigner3j', () => {
  it('returns |1/sqrt(3)| for (1,1,0; 0,0,0)', () => {
    // Known tabulated value: (1 1 0; 0 0 0) = ±1/√3
    // Bug caught: incorrect Racah formula summation or factorial lookup
    const result = wigner3j(1, 1, 0, 0, 0, 0)
    expect(Math.abs(result)).toBeCloseTo(1 / Math.sqrt(3), 6)
  })

  it('returns 0 when triangle inequality is violated', () => {
    // j3 = 5 violates |j1-j2| ≤ j3 ≤ j1+j2 for j1=1, j2=1
    // Bug caught: missing triangle inequality check
    expect(wigner3j(1, 1, 5, 0, 0, 0)).toBe(0)
  })

  it('returns 0 when m1 + m2 + m3 ≠ 0', () => {
    // m-projection conservation violated
    // Bug caught: missing m-sum selection rule
    expect(wigner3j(1, 1, 0, 1, 1, 0)).toBe(0)
    expect(wigner3j(2, 1, 1, 0, 1, 1)).toBe(0)
  })

  it('returns 0 when |mi| > ji', () => {
    // Bug caught: missing individual m-bound check
    expect(wigner3j(1, 1, 0, 2, -2, 0)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// angularFactor
// ---------------------------------------------------------------------------

describe('angularFactor', () => {
  it('is nonzero for allowed l=0->l=1, m=0->m=0 (q=0) transition', () => {
    // 1s -> 2p_0 angular coupling must be nonzero for selection rule to work
    // Bug caught: angular factor incorrectly rejecting allowed transitions
    const result = angularFactor(1, 0, 0, 0, 0)
    expect(Math.abs(result)).toBeGreaterThan(0.01)
  })

  it('is nonzero for allowed l=1->l=2, m=0->m=1 (q=-1) transition', () => {
    // angularFactor(l1, m1, l2, m2, q) with q = m1 - m2
    // l1=2, m1=0, l2=1, m2=1, q = 0 - 1 = -1
    // Bug caught: incorrect handling of non-zero q values
    const result = angularFactor(2, 0, 1, 1, -1)
    expect(Math.abs(result)).toBeGreaterThan(0.001)
  })

  it('returns 0 for forbidden l=0->l=0 transition (parity)', () => {
    // Δl = 0 violates E1 parity selection rule
    // Bug caught: missing Δl = ±1 enforcement via the (l1 1 l2; 0 0 0) 3j symbol
    expect(angularFactor(0, 0, 0, 0, 0)).toBe(0)
  })

  it('returns 0 when q ≠ m1 - m2 (m-conservation violated)', () => {
    // Bug caught: missing q = m1 - m2 check
    expect(angularFactor(1, 0, 0, 0, 1)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// dipoleMatrixElementSquared
// ---------------------------------------------------------------------------

describe('dipoleMatrixElementSquared', () => {
  it('is non-negative for a 1s->2p transition', () => {
    // |⟨j|r|i⟩|² is a squared quantity; must never be negative
    // Bug caught: sign error in angular/radial product
    const s1 = makeState(0, 1, 0, 0)
    const s2 = makeState(1, 2, 1, 0)
    expect(dipoleMatrixElementSquared(s1, s2)).toBeGreaterThanOrEqual(0)
  })

  it('is strictly positive for the allowed 1s->2p_0 transition', () => {
    // The 1s→2p₀ transition is the strongest hydrogen line; must be nonzero
    // Bug caught: dipole element evaluating to zero for allowed transitions
    const s1 = makeState(0, 1, 0, 0)
    const s2 = makeState(1, 2, 1, 0)
    expect(dipoleMatrixElementSquared(s1, s2)).toBeGreaterThan(1e-10)
  })

  it('is zero for the forbidden 1s->2s transition (Δl = 0)', () => {
    // Same-parity transition is dipole-forbidden
    // Bug caught: missing Δl = ±1 selection rule in dipole calculation
    const s1 = makeState(0, 1, 0, 0)
    const s2 = makeState(1, 2, 0, 0)
    expect(dipoleMatrixElementSquared(s1, s2)).toBe(0)
  })

  it('is zero for Δl = 2 transitions (2s->3d)', () => {
    // Δl = 2 is forbidden for E1; only Δl = ±1 allowed
    // Bug caught: selection rule accepting |Δl| > 1
    const s1 = makeState(0, 2, 0, 0)
    const s2 = makeState(1, 3, 2, 0)
    expect(dipoleMatrixElementSquared(s1, s2)).toBe(0)
  })

  it('is symmetric: |⟨i|r|j⟩|² = |⟨j|r|i⟩|²', () => {
    clearDipoleCache()
    const s1 = makeState(0, 1, 0, 0)
    const s2 = makeState(1, 2, 1, 1)
    const forward = dipoleMatrixElementSquared(s1, s2)
    clearDipoleCache()
    const reverse = dipoleMatrixElementSquared(s2, s1)
    // Bug caught: asymmetric cache key or angular factor argument ordering
    expect(forward).toBeCloseTo(reverse, 10)
  })
})

// ---------------------------------------------------------------------------
// clearDipoleCache
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Thomas-Reiche-Kuhn f-sum rule (integration test)
// ---------------------------------------------------------------------------

describe('Thomas-Reiche-Kuhn f-sum rule', () => {
  it('discrete 1s→np oscillator strengths (n=2..7) sum to ≈0.551', () => {
    // The TRK sum rule: Σ_f f_{i→f} = Z (number of electrons = 1 for hydrogen).
    // The discrete sum over bound states converges to ~0.565; the rest is
    // in the continuum. Summing n=2..7 should give ≈0.551.
    //
    // f_{1s→np} = (2/3) × |E_n - E_1| × |⟨np|r|1s⟩|²
    // where the factor accounts for summing over all m' of the np subshell.
    //
    // Bug caught: systematic error in radial integrals, angular factors, or
    // energy computation that would make the sum deviate from the known value.
    clearDipoleCache()
    let fSum = 0
    for (let n = 2; n <= 7; n++) {
      const omega = Math.abs(-0.5 / (n * n) - -0.5)
      const rad = radialDipoleIntegral(1, 0, n, 1)
      fSum += (2 / 3) * omega * rad * rad
    }
    // Known value from high-precision computation: 0.5508
    expect(fSum).toBeCloseTo(0.5508, 2)
  })

  it('f-sum is strictly less than 1 (continuum contribution missing)', () => {
    clearDipoleCache()
    let fSum = 0
    for (let n = 2; n <= 7; n++) {
      const omega = Math.abs(-0.5 / (n * n) - -0.5)
      const rad = radialDipoleIntegral(1, 0, n, 1)
      fSum += (2 / 3) * omega * rad * rad
    }
    expect(fSum).toBeLessThan(1)
    expect(fSum).toBeGreaterThan(0.5)
  })

  it('Lyman-alpha (1s→2p) dominates the sum with f ≈ 0.416', () => {
    const omega = 0.375 // E_2 - E_1 in Hartree
    const rad = radialDipoleIntegral(1, 0, 2, 1)
    const f = (2 / 3) * omega * rad * rad
    // Known: f_{1s→2p} = 0.4162 (NIST Wiese & Fuhr 2009)
    expect(f).toBeCloseTo(0.4162, 2)
  })
})

// ---------------------------------------------------------------------------
// clearDipoleCache
// ---------------------------------------------------------------------------

describe('clearDipoleCache', () => {
  it('does not throw', () => {
    // Bug caught: cache clear crashing on empty or populated map
    expect(() => clearDipoleCache()).not.toThrow()
  })

  it('allows recomputation after clearing', () => {
    const s1 = makeState(0, 1, 0, 0)
    const s2 = makeState(1, 2, 1, 0)
    const before = dipoleMatrixElementSquared(s1, s2)
    clearDipoleCache()
    const after = dipoleMatrixElementSquared(s1, s2)
    // Bug caught: cache corruption causing different values on recomputation
    expect(after).toBeCloseTo(before, 10)
  })
})

// ---------------------------------------------------------------------------
// N-dimensional dipole elements
// ---------------------------------------------------------------------------

describe('radialDipoleIntegral — ND', () => {
  it('D=3 explicit matches default (backward compatibility)', () => {
    const default3D = radialDipoleIntegral(1, 0, 2, 1)
    const explicit3D = radialDipoleIntegral(1, 0, 2, 1, 3)
    expect(explicit3D).toBeCloseTo(default3D, 12)
  })

  it('D=4 produces finite positive result for 1s→2p', () => {
    const result = radialDipoleIntegral(1, 0, 2, 1, 4)
    expect(Number.isFinite(result)).toBe(true)
    expect(result).toBeGreaterThan(0)
  })

  it('D=4 differs from D=3 (effective quantum numbers shift)', () => {
    const d3 = radialDipoleIntegral(1, 0, 2, 1, 3)
    const d4 = radialDipoleIntegral(1, 0, 2, 1, 4)
    // n_eff shifts by 0.5 at D=4, changing the radial overlap
    expect(Math.abs(d4 - d3) / d3).toBeGreaterThan(0.05)
  })

  it('is symmetric for ND: ∫R₁·r·R₂·r²dr = ∫R₂·r·R₁·r²dr', () => {
    const forward = radialDipoleIntegral(1, 0, 2, 1, 5)
    const reverse = radialDipoleIntegral(2, 1, 1, 0, 5)
    expect(forward).toBeCloseTo(reverse, 6)
  })

  it('D=7 high-n transitions produce finite results', () => {
    const result = radialDipoleIntegral(3, 2, 4, 3, 7)
    expect(Number.isFinite(result)).toBe(true)
    expect(result).toBeGreaterThan(0)
  })
})

describe('dipoleMatrixElementSquared — ND', () => {
  it('D=3 explicit matches default', () => {
    clearDipoleCache()
    const s1 = makeState(0, 1, 0, 0)
    const s2 = makeState(1, 2, 1, 0)
    const default3D = dipoleMatrixElementSquared(s1, s2)
    clearDipoleCache()
    const explicit3D = dipoleMatrixElementSquared(s1, s2, 3)
    expect(explicit3D).toBeCloseTo(default3D, 12)
  })

  it('D=4 produces different value than D=3 for same quantum numbers', () => {
    clearDipoleCache()
    const s1 = makeState(0, 1, 0, 0)
    const s2 = makeState(1, 2, 1, 0)
    const d3 = dipoleMatrixElementSquared(s1, s2, 3)
    clearDipoleCache()
    const d4 = dipoleMatrixElementSquared(s1, s2, 4)
    expect(d4).toBeGreaterThan(0)
    expect(Math.abs(d4 - d3) / d3).toBeGreaterThan(0.05)
  })

  it('cache distinguishes dimensions (same quantum numbers, different D)', () => {
    clearDipoleCache()
    const s1 = makeState(0, 1, 0, 0)
    const s2 = makeState(1, 2, 1, 0)
    const d3 = dipoleMatrixElementSquared(s1, s2, 3)
    // Without clearing cache, D=5 should return a different value
    const d5 = dipoleMatrixElementSquared(s1, s2, 5)
    expect(d3).not.toBeCloseTo(d5, 2)
  })

  it('selection rules still enforced at D≠3', () => {
    clearDipoleCache()
    // Δl = 0 is forbidden regardless of dimension
    const s1 = makeState(0, 1, 0, 0)
    const s2 = makeState(1, 2, 0, 0)
    expect(dipoleMatrixElementSquared(s1, s2, 5)).toBe(0)
  })
})
