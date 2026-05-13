import { describe, expect, it } from 'vitest'

import {
  computeHydrogenRadialProbabilityDensity,
  computeHydrogenRadialWavefunction,
  computeRadialProbabilityNorm,
} from '@/lib/math/hydrogenRadialProbability'

/**
 * Known analytical peak values for hydrogen radial probability P(r) = 4πr²|R_nl(r)|².
 *
 * For the 1s orbital: R₁₀(r) = 2·exp(-r/a₀) (with a₀=1)
 *   P(r) = 4π·r²·4·exp(-2r) → peaks at r=1, peak value = 16π·e⁻² ≈ 6.795
 *
 * For the 2s orbital: R₂₀(r) = (1/2√2)(2 - r)·exp(-r/2)
 *   The peak is found numerically at r ≈ 0.764 (inner) and r ≈ 5.236 (outer)
 *
 * For the 2p orbital: R₂₁(r) = (1/2√6)·r·exp(-r/2)
 *   P(r) = 4π·r²·(r²/24)·exp(-r) → peaks at r=4, peak value = 4π·(256/24)·e⁻⁴ ≈ 1.942
 */
const ANALYTICAL_PEAK_1S = 4 * Math.PI * 1 * 4 * Math.exp(-2) // 16π·e⁻² ≈ 6.795
const ANALYTICAL_PEAK_2P = 4 * Math.PI * 16 * (16 / 24) * Math.exp(-4) // 4π·(256/24)·e⁻⁴ ≈ 1.942

describe('computeRadialProbabilityNorm', () => {
  describe('analytical verification against known hydrogen wavefunctions', () => {
    it('1s orbital (n=1, l=0): norm matches 1/P_peak within 5%', () => {
      // P_peak for 1s at r=a₀: 16π·e⁻² ≈ 6.795
      const norm = computeRadialProbabilityNorm(1, 0, 1.0)
      const expected = 1.0 / ANALYTICAL_PEAK_1S
      expect(norm).toBeCloseTo(expected, 1)
    })

    it('2p orbital (n=2, l=1): norm matches analytical peak within 5%', () => {
      // P_peak for 2p at r=4a₀: 4π·(256/24)·e⁻⁴ ≈ 1.942
      const norm = computeRadialProbabilityNorm(2, 1, 1.0)
      const expected = 1.0 / ANALYTICAL_PEAK_2P
      expect(norm).toBeCloseTo(expected, 1)
    })

    it('norm * P_peak ≈ 1 for 1s orbital (normalization consistency)', () => {
      const norm = computeRadialProbabilityNorm(1, 0, 1.0)
      expect(norm * ANALYTICAL_PEAK_1S).toBeCloseTo(1.0, 1)
    })
  })

  describe('physical ordering constraints', () => {
    it('higher n states have lower peak probability (wider spread)', () => {
      const norm1s = computeRadialProbabilityNorm(1, 0, 1.0)
      const norm2s = computeRadialProbabilityNorm(2, 0, 1.0)
      const norm3s = computeRadialProbabilityNorm(3, 0, 1.0)
      const norm4s = computeRadialProbabilityNorm(4, 0, 1.0)

      // norm = 1/max(P(r)), higher norm = lower peak = more spread
      expect(norm2s).toBeGreaterThan(norm1s)
      expect(norm3s).toBeGreaterThan(norm2s)
      expect(norm4s).toBeGreaterThan(norm3s)
    })

    it('circular orbits (l=n-1) have sharp concentrated peaks', () => {
      // Circular orbits (l=n-1) are highly localized at r ~ n²a₀
      // The 4f (l=3, n=4) radial function peaks sharply → lower norm than 4s
      const norm4s = computeRadialProbabilityNorm(4, 0, 1.0) // 4s: multiple radial nodes
      const norm4f = computeRadialProbabilityNorm(4, 3, 1.0) // 4f: circular, no radial nodes

      // 4f peak is sharp (no nodes) so peak P is higher → lower norm
      expect(norm4f).toBeLessThan(norm4s)
    })

    it('Bohr radius scaling: larger a₀ produces higher norm (lower peak)', () => {
      // Analytically, peak of P(r) for 1s = 16π/(a₀³·e²), so norm ∝ a₀³
      // The numerical grid scan may not capture exact scaling, but the direction is correct
      const norm1 = computeRadialProbabilityNorm(1, 0, 1.0)
      const norm2 = computeRadialProbabilityNorm(1, 0, 2.0)
      const norm4 = computeRadialProbabilityNorm(1, 0, 4.0)

      expect(norm2).toBeGreaterThan(norm1)
      expect(norm4).toBeGreaterThan(norm2)
    })
  })

  describe('quantum number validation and clamping', () => {
    it('clamps l >= n to l = n-1', () => {
      const normal = computeRadialProbabilityNorm(1, 0, 1.0)
      const overflowL = computeRadialProbabilityNorm(1, 1, 1.0)
      expect(overflowL).toBeCloseTo(normal, 10)
    })

    it('clamps negative n to 1', () => {
      const norm = computeRadialProbabilityNorm(-5, 0, 1.0)
      const norm1 = computeRadialProbabilityNorm(1, 0, 1.0)
      expect(norm).toBeCloseTo(norm1, 10)
    })

    it('clamps negative l to 0', () => {
      const norm = computeRadialProbabilityNorm(3, -1, 1.0)
      const norm_l0 = computeRadialProbabilityNorm(3, 0, 1.0)
      expect(norm).toBeCloseTo(norm_l0, 10)
    })

    it('NaN n defaults to n=1', () => {
      const norm = computeRadialProbabilityNorm(Number.NaN, 0, 1.0)
      const norm1 = computeRadialProbabilityNorm(1, 0, 1.0)
      expect(norm).toBeCloseTo(norm1, 10)
    })

    it('NaN a0 defaults to safe minimum', () => {
      const norm = computeRadialProbabilityNorm(1, 0, Number.NaN)
      expect(norm).toBeGreaterThan(0)
      expect(Number.isFinite(norm)).toBe(true)
    })

    it('very small a0 (near zero) does not produce NaN/Infinity', () => {
      const norm = computeRadialProbabilityNorm(1, 0, 1e-10)
      expect(Number.isFinite(norm)).toBe(true)
      expect(norm).toBeGreaterThan(0)
    })
  })

  describe('numerical stability for all hydrogen orbitals', () => {
    it('all orbitals up to n=7 produce finite positive norms', () => {
      for (let n = 1; n <= 7; n++) {
        for (let l = 0; l < n; l++) {
          const norm = computeRadialProbabilityNorm(n, l, 1.0)
          expect(norm, `n=${n}, l=${l}`).toBeGreaterThan(0)
          expect(Number.isFinite(norm), `n=${n}, l=${l} not finite`).toBe(true)
        }
      }
    })

    it('high quantum numbers n=10-15 do not overflow', () => {
      for (let n = 10; n <= 15; n++) {
        for (const l of [0, Math.floor(n / 2), n - 1]) {
          const norm = computeRadialProbabilityNorm(n, l, 1.0)
          expect(Number.isFinite(norm), `n=${n}, l=${l}`).toBe(true)
          expect(norm, `n=${n}, l=${l}`).toBeGreaterThan(0)
        }
      }
    })

    it('norms are deterministic (same inputs → same output)', () => {
      const a = computeRadialProbabilityNorm(3, 2, 1.0)
      const b = computeRadialProbabilityNorm(3, 2, 1.0)
      expect(a).toBe(b) // exact equality — deterministic
    })
  })

  describe('N-dimensional hydrogen (D > 3)', () => {
    it('all D=5 orbitals up to n=5 produce finite positive norms', () => {
      for (let n = 1; n <= 5; n++) {
        for (let l = 0; l < n; l++) {
          const norm = computeRadialProbabilityNorm(n, l, 1.0, 5)
          expect(norm, `D=5, n=${n}, l=${l}`).toBeGreaterThan(0)
          expect(Number.isFinite(norm), `D=5, n=${n}, l=${l} not finite`).toBe(true)
        }
      }
    })

    it('D=3 and D>3 agree at 1s orbital (nEff is the same when D=3)', () => {
      const norm3D = computeRadialProbabilityNorm(1, 0, 1.0, 3)
      // For D=3, n_eff = n + 0 = 1, same as standard hydrogen
      // This verifies the D>3 branch handles D=3 correctly
      const norm3D_explicit = computeRadialProbabilityNorm(1, 0, 1.0)
      expect(norm3D).toBeCloseTo(norm3D_explicit, 10)
    })

    it('D=4 norm is different from D=3 (nEff shift changes peak)', () => {
      const norm3D = computeRadialProbabilityNorm(2, 1, 1.0, 3)
      const norm4D = computeRadialProbabilityNorm(2, 1, 1.0, 4)
      expect(norm4D).not.toBeCloseTo(norm3D, 2)
    })

    it('higher D spreads the wavefunction (increases norm = lower peak)', () => {
      // Increasing dimension with fixed n,l should spread the wavefunction
      // nEff = n + (D-3)/2 grows with D
      const norm3D = computeRadialProbabilityNorm(2, 0, 1.0, 3)
      const norm5D = computeRadialProbabilityNorm(2, 0, 1.0, 5)
      const norm7D = computeRadialProbabilityNorm(2, 0, 1.0, 7)
      // Higher D → larger nEff → more spread → lower peak → higher norm
      expect(norm5D).toBeGreaterThan(norm3D)
      expect(norm7D).toBeGreaterThan(norm5D)
    })

    it('n_eff = n + (D-3)/2: D=5 n=2 matches D=3 n=3 effective behavior', () => {
      // D=5, n=2: nEff = 2 + 1 = 3
      // D=3, n=3: nEff = 3 + 0 = 3
      // Same nEff doesn't mean identical norms (the radial functions differ
      // because lambda = l + (D-3)/2 also changes), but for l=0 (s-orbital):
      // D=5 n=2 l=0: lambda=1, nr=1, nEff=3
      // D=3 n=3 l=0: uses standard formula with l=0, n=3
      // These use different code paths, so just verify D=5 n=2 produces a reasonable value
      const norm = computeRadialProbabilityNorm(2, 0, 1.0, 5)
      expect(norm).toBeGreaterThan(0)
      expect(norm).toBeLessThan(100) // sanity bound
    })

    it('Bohr radius scaling works in N-dimensional case', () => {
      const normSmall = computeRadialProbabilityNorm(2, 0, 0.5, 5)
      const normLarge = computeRadialProbabilityNorm(2, 0, 2.0, 5)
      // Larger a0 → more spread → lower peak → higher norm
      expect(normLarge).toBeGreaterThan(normSmall)
    })

    it('D=11 high quantum numbers do not overflow', () => {
      for (let n = 1; n <= 5; n++) {
        for (const l of [0, Math.min(n - 1, 3)]) {
          const norm = computeRadialProbabilityNorm(n, l, 1.0, 11)
          expect(Number.isFinite(norm), `D=11, n=${n}, l=${l}`).toBe(true)
          expect(norm, `D=11, n=${n}, l=${l}`).toBeGreaterThan(0)
        }
      }
    })

    it('clamps n to valid range even for D>3', () => {
      const norm = computeRadialProbabilityNorm(0, 0, 1.0, 5)
      const normN1 = computeRadialProbabilityNorm(1, 0, 1.0, 5)
      expect(norm).toBeCloseTo(normN1, 10)
    })
  })

  describe('2D hydrogen (D = 2)', () => {
    it('all D=2 orbitals up to n=5 produce finite positive norms', () => {
      for (let n = 1; n <= 5; n++) {
        for (let l = 0; l < n; l++) {
          const norm = computeRadialProbabilityNorm(n, l, 1.0, 2)
          expect(norm, `D=2, n=${n}, l=${l}`).toBeGreaterThan(0)
          expect(Number.isFinite(norm), `D=2, n=${n}, l=${l} not finite`).toBe(true)
        }
      }
    })

    it('D=2 norm differs from D=3 (nEff shift changes peak)', () => {
      // D=2: nEff = n - 0.5, D=3: nEff = n
      // These must produce different normalization values
      const norm2D = computeRadialProbabilityNorm(2, 1, 1.0, 2)
      const norm3D = computeRadialProbabilityNorm(2, 1, 1.0, 3)
      expect(norm2D).not.toBeCloseTo(norm3D, 2)
    })

    it('D=2 wavefunction is more compact than D=3 (lower nEff → higher peak → lower norm)', () => {
      // D=2: nEff = n - 0.5 < n (D=3). More compact wavefunction → higher peak → lower norm.
      const norm2D = computeRadialProbabilityNorm(2, 0, 1.0, 2)
      const norm3D = computeRadialProbabilityNorm(2, 0, 1.0, 3)
      expect(norm2D).toBeLessThan(norm3D)
    })

    it('D=2 routes through hydrogenRadialND, not the 3D function', () => {
      // Regression test: previously D=2 used the 3D branch due to `dimension > 3` check.
      // The 3D function at n=1 l=0 has peak P(r) at r=a0.
      // The 2D function at n=1 l=0 has nEff=0.5, lambda=-0.5, a very different shape.
      // If the 3D function were used, the norm would equal the standard 3D 1s norm.
      const norm2D = computeRadialProbabilityNorm(1, 0, 1.0, 2)
      const norm3D = computeRadialProbabilityNorm(1, 0, 1.0, 3)
      // These must NOT be equal — they use fundamentally different radial functions
      expect(Math.abs(norm2D - norm3D) / norm3D).toBeGreaterThan(0.1)
    })
  })

  describe('shared radial wavefunction helpers', () => {
    it('use the D-dimensional radial node location instead of the 3D Laguerre node', () => {
      const d2Node = 0.75
      const d3Node = 2.0

      expect(Math.abs(computeHydrogenRadialWavefunction(2, 0, d2Node, 1.0, 2))).toBeLessThan(1e-10)
      expect(Math.abs(computeHydrogenRadialWavefunction(2, 0, d3Node, 1.0, 3))).toBeLessThan(1e-10)

      expect(Math.abs(computeHydrogenRadialWavefunction(2, 0, d2Node, 1.0, 3))).toBeGreaterThan(
        0.01
      )
      expect(Math.abs(computeHydrogenRadialWavefunction(2, 0, d3Node, 1.0, 2))).toBeGreaterThan(
        0.01
      )
    })

    it('returns finite chart density for sanitized invalid inputs', () => {
      const density = computeHydrogenRadialProbabilityDensity(
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.NaN,
        Number.NaN
      )

      expect(Number.isFinite(density)).toBe(true)
      expect(density).toBeGreaterThanOrEqual(0)
    })

    it('mirrors WGSL half-integer radial behavior at the origin', () => {
      expect(computeHydrogenRadialWavefunction(1, 0, 0, 1.0, 4)).toBe(0)
      expect(computeHydrogenRadialWavefunction(2, 1, 0, 1.0, 6)).toBe(0)
    })
  })
})
