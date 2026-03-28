/**
 * Tests for N-dimensional hydrogen energy and radial wavefunction corrections.
 *
 * Validates the physics of the D-dimensional Coulomb problem:
 *   E_n(D) = -0.5 / n_eff²  where  n_eff = n + (D-3)/2
 *   R_nl^(D)(r) uses effective angular momentum λ = l + (D-3)/2
 *
 * Reference: Dong, S.-H. "Wave Equations in Higher Dimensions" (2011), Ch. 7.
 */
import { describe, expect, it } from 'vitest'

import {
  buildHydrogenBasis,
  hydrogenEnergy,
  hydrogenEnergyND,
} from '@/lib/physics/openQuantum/hydrogenBasis'

// ---------------------------------------------------------------------------
// hydrogenEnergyND — analytical values
// ---------------------------------------------------------------------------

describe('hydrogenEnergyND', () => {
  it('reduces to hydrogenEnergy at D=3 for all n and l', () => {
    for (let n = 1; n <= 7; n++) {
      for (let l = 0; l < n; l++) {
        expect(hydrogenEnergyND(n, l, 3)).toBeCloseTo(hydrogenEnergy(n), 10)
      }
    }
  })

  it('computes correct n_eff for D=5: n_eff = n + 1', () => {
    // D=5 → (D-3)/2 = 1 → n_eff = n + 1
    // n=1, l=0: n_eff = 2, E = -0.5/4 = -0.125
    expect(hydrogenEnergyND(1, 0, 5)).toBeCloseTo(-0.125, 10)
    // n=2, l=1: n_eff = 3, E = -0.5/9
    expect(hydrogenEnergyND(2, 1, 5)).toBeCloseTo(-0.5 / 9, 10)
  })

  it('computes correct n_eff for D=4: n_eff = n + 0.5', () => {
    // D=4 → (D-3)/2 = 0.5 → n_eff = n + 0.5
    // n=1, l=0: n_eff = 1.5, E = -0.5/2.25 = -2/9
    expect(hydrogenEnergyND(1, 0, 4)).toBeCloseTo(-0.5 / 2.25, 10)
    // n=2, l=0: n_eff = 2.5, E = -0.5/6.25 = -0.08
    expect(hydrogenEnergyND(2, 0, 4)).toBeCloseTo(-0.08, 10)
  })

  it('energy is independent of l (n_eff only depends on n and D)', () => {
    // In the D-dimensional hydrogen atom, the energy depends on n_eff = n + (D-3)/2
    // which is independent of l. This is a key property.
    for (const dim of [3, 4, 5, 6, 7]) {
      for (let n = 2; n <= 5; n++) {
        const e0 = hydrogenEnergyND(n, 0, dim)
        for (let l = 1; l < n; l++) {
          expect(hydrogenEnergyND(n, l, dim)).toBeCloseTo(e0, 10)
        }
      }
    }
  })

  it('energy gets shallower (less negative) as D increases', () => {
    // Higher D → larger n_eff → weaker binding
    const n = 2,
      l = 1
    let prevE = hydrogenEnergyND(n, l, 3)
    for (let dim = 4; dim <= 11; dim++) {
      const e = hydrogenEnergyND(n, l, dim)
      expect(e).toBeGreaterThan(prevE) // less negative = greater
      prevE = e
    }
  })

  it('approaches zero energy as D → ∞', () => {
    // n_eff → ∞ as D → ∞, so E → 0
    expect(hydrogenEnergyND(1, 0, 100)).toBeCloseTo(0, 3)
  })

  it('matches specific D=11 analytical value', () => {
    // n=3, l=2, D=11: n_eff = 3 + (11-3)/2 = 7, E = -0.5/49
    expect(hydrogenEnergyND(3, 2, 11)).toBeCloseTo(-0.5 / 49, 10)
  })
})

// ---------------------------------------------------------------------------
// buildHydrogenBasis — ND energy integration
// ---------------------------------------------------------------------------

describe('buildHydrogenBasis with D > 3', () => {
  it('uses hydrogenEnergyND for D=5 (n_eff = n + 1)', () => {
    const basis = buildHydrogenBasis(2, 5, [1, 1])
    // n=1: E_3D_ND = -0.5/(1+1)² = -0.125, E_extra = 1*(0+0.5) + 1*(0+0.5) = 1
    // total = -0.125 + 1 = 0.875
    expect(basis[0]!.energy).toBeCloseTo(-0.125 + 1.0, 10)
  })

  it('5D ground state energy is shallower than 3D ground state', () => {
    const basis3D = buildHydrogenBasis(1, 3)
    const basis5D = buildHydrogenBasis(1, 5)
    // 3D: E = -0.5, 5D: E = -0.125 + extra dim zero-point
    // Even without extra-dim energy, the 3D part is shallower in 5D
    expect(basis5D[0]!.energy).toBeGreaterThan(basis3D[0]!.energy)
  })

  it('uses standard hydrogenEnergy for D=3 (backward compat)', () => {
    const basis = buildHydrogenBasis(2, 3)
    expect(basis[0]!.energy).toBe(-0.5) // 1s: E = -0.5/1 = -0.5
    expect(basis[1]!.energy).toBe(-0.125) // 2s: E = -0.5/4 = -0.125
  })
})
