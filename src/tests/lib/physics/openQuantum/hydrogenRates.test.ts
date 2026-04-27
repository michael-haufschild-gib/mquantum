import { beforeEach, describe, expect, it } from 'vitest'

import { clearDipoleCache } from '@/lib/physics/openQuantum/dipoleElements'
import { buildHydrogenBasis } from '@/lib/physics/openQuantum/hydrogenBasis'
import {
  buildTransitionRates,
  einsteinA,
  thermalOccupation,
} from '@/lib/physics/openQuantum/hydrogenRates'

/**
 * Boltzmann constant in atomic units (E_h / K).
 * Mirrors the private constant in hydrogenRates.ts.
 */
const KB_ATOMIC = 3.1668115634556e-6

// ---------------------------------------------------------------------------
// einsteinA
// ---------------------------------------------------------------------------

describe('einsteinA', () => {
  it('returns a positive rate for positive omega and dipoleSq', () => {
    // A = (4 α³ ω³ / 3) · |d|² > 0 when both inputs > 0
    // Bug caught: sign error or zero-guard incorrectly triggering
    const rate = einsteinA(0.375, 0.5)
    expect(rate).toBeGreaterThan(0)
  })

  it('returns 0 when omega is zero', () => {
    // No transition frequency means no spontaneous emission
    // Bug caught: division by zero or NaN instead of 0
    expect(einsteinA(0, 1.0)).toBe(0)
  })

  it('returns 0 when dipoleSq is zero', () => {
    // Zero matrix element means forbidden transition
    // Bug caught: returning nonzero rate for forbidden transition
    expect(einsteinA(0.375, 0)).toBe(0)
  })

  it('scales as omega cubed', () => {
    // A ∝ ω³ at fixed dipole element
    // Bug caught: wrong power of omega in formula
    const d2 = 1.0
    const a1 = einsteinA(1.0, d2)
    const a2 = einsteinA(2.0, d2)
    expect(a2 / a1).toBeCloseTo(8, 5) // 2³ = 8
  })
})

// ---------------------------------------------------------------------------
// thermalOccupation
// ---------------------------------------------------------------------------

describe('thermalOccupation', () => {
  it('is positive for positive temperature', () => {
    // Bose-Einstein distribution is always > 0 for T > 0
    // Bug caught: returning negative or NaN
    const n = thermalOccupation(0.375, 300)
    expect(n).toBeGreaterThan(0)
  })

  it('approaches 0 as temperature approaches 0', () => {
    // At T → 0, thermal photons freeze out: n̄ → 0
    // Bug caught: overflow in exp(ω / kT) not handled
    const n = thermalOccupation(0.375, 0.001)
    expect(n).toBeLessThan(1e-10)
  })

  it('grows large at high temperature', () => {
    // At T → ∞, n̄ ≈ kT/ω → large (classical equipartition)
    // For ω = 0.375 a.u., kT at 1e8 K ≈ 316.7 a.u., so n̄ ≈ 844
    // Bug caught: clamping or early-return suppressing high-T behavior
    const n = thermalOccupation(0.375, 1e8)
    expect(n).toBeGreaterThan(100)
  })

  it('returns 0 for zero temperature', () => {
    // No thermal photons at absolute zero
    // Bug caught: missing T ≤ 0 guard
    expect(thermalOccupation(0.375, 0)).toBe(0)
  })

  it('returns 0 for negative temperature', () => {
    // Negative temperature is unphysical for this model
    // Bug caught: missing T ≤ 0 guard producing NaN
    expect(thermalOccupation(0.375, -100)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// buildTransitionRates (maxN=2 hydrogen basis)
// ---------------------------------------------------------------------------

describe('buildTransitionRates', () => {
  const temperature = 5000 // Kelvin — high enough for nontrivial thermal occupation
  let basis: ReturnType<typeof buildHydrogenBasis>

  beforeEach(() => {
    clearDipoleCache()
    basis = buildHydrogenBasis(2, 3)
  })

  it('produces rates for the 1s↔2p allowed transitions', () => {
    // maxN=2 gives 5 states: 1s, 2s, 2p₋₁, 2p₀, 2p₊₁
    // The 1s↔2p transitions (3 pairs) must appear
    // Bug caught: buildTransitionRates skipping valid allowed pairs
    const rates = buildTransitionRates(basis, temperature)
    expect(rates.length).toBeGreaterThanOrEqual(3)
  })

  it('has gammaDown > 0 for all rates (spontaneous emission always present)', () => {
    // γ_down = A · (1 + n̄) > 0 since A > 0 and n̄ ≥ 0
    // Bug caught: zero or negative spontaneous emission rate
    const rates = buildTransitionRates(basis, temperature)
    for (const rate of rates) {
      expect(rate.gammaDown).toBeGreaterThan(0)
    }
  })

  it('satisfies detailed balance: gammaUp / gammaDown ≈ exp(-omega / (kB * T))', () => {
    // Detailed balance is a thermodynamic identity that must hold exactly
    // γ_up / γ_down = n̄ / (1 + n̄) = exp(-ω / kT)
    // Bug caught: incorrect Bose-Einstein factor or rate formula
    const rates = buildTransitionRates(basis, temperature)
    for (const rate of rates) {
      const ratio = rate.gammaUp / rate.gammaDown
      const boltzmann = Math.exp(-rate.omega / (KB_ATOMIC * temperature))
      expect(ratio).toBeCloseTo(boltzmann, 6)
    }
  })

  it('contains no rates for the forbidden 1s↔2s transition', () => {
    // 1s (n=1,l=0) to 2s (n=2,l=0): Δl = 0 is dipole-forbidden
    // Bug caught: selection rule not enforced in rate builder
    const rates = buildTransitionRates(basis, temperature)

    const s1 = basis.find((s) => s.n === 1 && s.l === 0)!
    const s2 = basis.find((s) => s.n === 2 && s.l === 0)!

    const forbidden = rates.find(
      (r) =>
        (r.from === s1.index && r.to === s2.index) || (r.from === s2.index && r.to === s1.index)
    )
    expect(forbidden).toBeUndefined()
  })

  it('scales rates linearly with couplingScale', () => {
    // Rates at scale=2 should be exactly 2× rates at scale=1
    // Bug caught: couplingScale applied incorrectly (squared, missing, etc.)
    const rates1 = buildTransitionRates(basis, temperature, 1)
    const rates2 = buildTransitionRates(basis, temperature, 2)

    expect(rates1.length).toBe(rates2.length)

    for (let i = 0; i < rates1.length; i++) {
      expect(rates2[i]!.gammaDown).toBeCloseTo(2 * rates1[i]!.gammaDown, 10)
      expect(rates2[i]!.gammaUp).toBeCloseTo(2 * rates1[i]!.gammaUp, 10)
    }
  })

  it('returns all rates with positive omega', () => {
    // Transition frequencies must be positive (non-degenerate energy gap)
    // Bug caught: zero or negative omega from energy ordering error
    const rates = buildTransitionRates(basis, temperature)
    for (const rate of rates) {
      expect(rate.omega).toBeGreaterThan(0)
    }
  })

  it('returns all rates with positive dipoleSq', () => {
    // Only transitions with nonzero dipole elements should appear
    // Bug caught: rate builder including zero-dipole transitions
    const rates = buildTransitionRates(basis, temperature)
    for (const rate of rates) {
      expect(rate.dipoleSq).toBeGreaterThan(0)
    }
  })

  it('reproduces the tabulated A(2p→1s) ≈ 6.27×10⁸ s⁻¹', () => {
    // The Lyman-α 2p→1s spontaneous emission rate is one of the most
    // precisely known atomic constants (NIST: 6.2649e8 s⁻¹). Each of the
    // three 2p substates (m=−1,0,+1) decays to 1s at the same rate.
    // Bug caught: missing (4π/3) factor in dipole element converting
    // r·Y_{1q} matrix elements to true r_q matrix elements; without it
    // every Einstein A coefficient downstream is too small by 4π/3.
    clearDipoleCache()
    // Zero-temperature: gammaDown = A · (1 + n̄) = A (n̄ → 0).
    const rates = buildTransitionRates(basis, 0)
    const ATU_S = 2.4188843265857e-17 // atomic time unit in seconds
    let matched = 0
    for (const rate of rates) {
      // 2p substates have l=1; 1s has l=0; pick out the 2p→1s pairs.
      const fromState = basis[rate.from]!
      const toState = basis[rate.to]!
      if (fromState.n === 2 && fromState.l === 1 && toState.n === 1 && toState.l === 0) {
        matched += 1
        const rateSI = rate.gammaDown / ATU_S
        // 5% tolerance covers Gauss-Laguerre quadrature noise (~1e-4) and
        // the 1/137 fine-structure-constant rounding.
        expect(rateSI).toBeGreaterThan(5.9e8)
        expect(rateSI).toBeLessThan(6.6e8)
      }
    }
    // Three 2p substates (m = −1, 0, +1) → 1s. Without this assertion the
    // test would silently pass if buildTransitionRates regressed and
    // emitted no 2p→1s entries at all.
    expect(matched).toBe(3)
  })
})

describe('buildTransitionRates — ND', () => {
  const temperature = 5000

  it('D=3 explicit matches default (backward compatibility)', () => {
    clearDipoleCache()
    const basis3 = buildHydrogenBasis(2, 3)
    const ratesDefault = buildTransitionRates(basis3, temperature)
    clearDipoleCache()
    const ratesExplicit = buildTransitionRates(basis3, temperature, 1.0, 3)
    expect(ratesExplicit.length).toBe(ratesDefault.length)
    for (let i = 0; i < ratesDefault.length; i++) {
      expect(ratesExplicit[i]!.gammaDown).toBeCloseTo(ratesDefault[i]!.gammaDown, 10)
    }
  })

  it('D=5 produces rates with ND energies and ND dipole elements', () => {
    clearDipoleCache()
    const basis5 = buildHydrogenBasis(2, 5)
    const rates5 = buildTransitionRates(basis5, temperature, 1.0, 5)
    // Should still produce allowed 1s↔2p transitions
    expect(rates5.length).toBeGreaterThanOrEqual(3)
    for (const rate of rates5) {
      expect(rate.gammaDown).toBeGreaterThan(0)
      expect(rate.omega).toBeGreaterThan(0)
      expect(rate.dipoleSq).toBeGreaterThan(0)
    }
  })

  it('D=5 rates differ from D=3 rates (self-consistency with ND model)', () => {
    clearDipoleCache()
    const basis3 = buildHydrogenBasis(2, 3)
    const rates3 = buildTransitionRates(basis3, temperature, 1.0, 3)
    clearDipoleCache()
    const basis5 = buildHydrogenBasis(2, 5)
    const rates5 = buildTransitionRates(basis5, temperature, 1.0, 5)
    // Both should have the same number of allowed transitions (same quantum number structure)
    expect(rates5.length).toBe(rates3.length)
    // But the actual rates must differ due to ND energy shifts and radial overlaps
    // Use relative comparison since absolute values are tiny (~1e-9)
    const relDiff =
      Math.abs(rates5[0]!.gammaDown - rates3[0]!.gammaDown) /
      Math.max(rates5[0]!.gammaDown, rates3[0]!.gammaDown)
    expect(relDiff).toBeGreaterThan(0.1)
  })

  it('D=5 detailed balance holds with ND energies', () => {
    clearDipoleCache()
    const basis5 = buildHydrogenBasis(2, 5)
    const rates5 = buildTransitionRates(basis5, temperature, 1.0, 5)
    for (const rate of rates5) {
      const ratio = rate.gammaUp / rate.gammaDown
      const boltzmann = Math.exp(-rate.omega / (KB_ATOMIC * temperature))
      expect(ratio).toBeCloseTo(boltzmann, 6)
    }
  })
})
