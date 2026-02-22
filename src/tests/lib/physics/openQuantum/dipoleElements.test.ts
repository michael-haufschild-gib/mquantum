import { describe, expect, it } from 'vitest'
import {
  radialDipoleIntegral,
  wigner3j,
  angularFactor,
  dipoleMatrixElementSquared,
  clearDipoleCache,
} from '@/lib/physics/openQuantum/dipoleElements'
import type { HydrogenBasisState } from '@/lib/physics/openQuantum/hydrogenBasis'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal HydrogenBasisState for testing */
function makeState(
  index: number,
  n: number,
  l: number,
  m: number,
): HydrogenBasisState {
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
