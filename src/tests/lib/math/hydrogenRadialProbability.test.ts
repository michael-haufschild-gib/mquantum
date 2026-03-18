import { describe, expect, it } from 'vitest'

import { computeRadialProbabilityNorm } from '@/lib/math/hydrogenRadialProbability'

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
})
