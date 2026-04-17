/**
 * Physics-correctness tests for the Anti-de Sitter closed-form math.
 *
 * These tests implement the seven acceptance checks from the Stage-1 PRD:
 *   1. Ground-state radial proportionality (d=4, n=0, ℓ=0, mL=0 → R ∝ cos³ρ).
 *   2. Conformal-dimension formula (d=4, ℓ=1, mL=√5) + energy spectrum.
 *   3. Jacobi recurrence vs explicit-formula cross-check.
 *   4. Radial normalization integral = 1 under the AdS weight.
 *   5. Δ_+ + Δ_− = d − 1 in the KW window.
 *   6. BF-bound detection at multiple dimensions.
 *   7. Strictly increasing energies in (n, ℓ).
 */

import { describe, expect, it } from 'vitest'

import {
  adsEnergy,
  computeDelta,
  isBelowBF,
  isInKWWindow,
  jacobiP,
  radialNorm,
  radialWavefunction,
  resolveDelta,
} from '@/lib/physics/antiDeSitter/math'

/**
 * Reference evaluator for the Jacobi polynomial via the explicit hypergeometric
 * formula (Rodrigues). Independent of the recurrence under test.
 */
function jacobiExplicit(n: number, alpha: number, beta: number, x: number): number {
  if (n === 0) return 1
  const u = (x - 1) / 2
  const v = (x + 1) / 2
  let sum = 0
  for (let k = 0; k <= n; k++) {
    const term =
      binomReal(n + alpha, k) * binomReal(n + beta, n - k) * Math.pow(u, n - k) * Math.pow(v, k)
    sum += term
  }
  return sum
}

/**
 * Binomial coefficient C(z, k) for real z and non-negative integer k, via
 * the product formula z(z−1)⋯(z−k+1)/k!. Used by the Jacobi explicit
 * formula reference evaluator.
 */
function binomReal(z: number, k: number): number {
  if (k === 0) return 1
  let num = 1
  let den = 1
  for (let i = 0; i < k; i++) {
    num *= z - i
    den *= i + 1
  }
  return num / den
}

describe('jacobiP recurrence', () => {
  it('P_0(x) = 1 for any α, β', () => {
    expect(jacobiP(0, 1.5, 2.5, 0.3)).toBe(1)
    expect(jacobiP(0, 0.5, 1.0, -0.7)).toBe(1)
  })

  it('P_1(x; α=1.5, β=2.5) = 3x − 0.5', () => {
    const x = 0.3
    const expected = 3 * x - 0.5
    expect(jacobiP(1, 1.5, 2.5, x)).toBeCloseTo(expected, 12)
  })

  it('matches the explicit formula for n ∈ {2, 3, 4} at α=1.5, β=2.5, x=0.3', () => {
    const alpha = 1.5
    const beta = 2.5
    const x = 0.3
    for (const n of [2, 3, 4]) {
      const fromRecurrence = jacobiP(n, alpha, beta, x)
      const fromExplicit = jacobiExplicit(n, alpha, beta, x)
      expect(fromRecurrence).toBeCloseTo(fromExplicit, 10)
    }
  })

  it('matches the explicit formula at a second parameter set (α=0.5, β=−0.5, x=−0.2)', () => {
    const alpha = 0.5
    const beta = -0.5
    const x = -0.2
    for (const n of [2, 3, 4]) {
      const fromRecurrence = jacobiP(n, alpha, beta, x)
      const fromExplicit = jacobiExplicit(n, alpha, beta, x)
      expect(fromRecurrence).toBeCloseTo(fromExplicit, 10)
    }
  })
})

describe('computeDelta and adsEnergy', () => {
  it('Δ_+ = 3 for d=4, mL=0 (massless scalar → standard CFT dimension)', () => {
    expect(computeDelta(4, 0, 'standard')).toBeCloseTo(3, 12)
  })

  it('Δ_+ = (d−1)/2 + √((d−1)²/4 + m²L²) for d=4, ℓ=1, mL=√5', () => {
    // d=4 ⇒ (d−1)/2 = 3/2 and (d−1)²/4 = 9/4, so m²L²=5 ⇒ discriminant = 29/4.
    // (PRD text listed 5/2 rather than 3/2 for the leading term — typo; the
    // formula Δ_± = (d−1)/2 ± √((d−1)²/4 + m²L²) is unambiguous.)
    const expected = 3 / 2 + Math.sqrt(29 / 4)
    expect(computeDelta(4, Math.sqrt(5), 'standard')).toBeCloseTo(expected, 12)
  })

  it('E_{0,1}(Δ) = Δ + 1', () => {
    const d = 4
    const delta = computeDelta(d, Math.sqrt(5), 'standard')
    expect(adsEnergy(0, 1, delta)).toBeCloseTo(delta + 1, 12)
  })
})

describe('radial wavefunction', () => {
  it('d=4, n=0, ℓ=0, mL=0 → R(ρ) ∝ cos³(ρ) with a state-independent ratio', () => {
    const d = 4
    const delta = computeDelta(d, 0, 'standard')
    expect(delta).toBeCloseTo(3, 12)
    const norm = radialNorm(0, 0, delta, d)
    const rhos = [Math.PI / 8, Math.PI / 4, (3 * Math.PI) / 8]
    const ratios = rhos.map((rho) => {
      const R = radialWavefunction(0, 0, delta, d, rho)
      return R / Math.pow(Math.cos(rho), 3)
    })
    // Ratio must equal the normalization constant and be independent of ρ.
    expect(ratios[0]).toBeCloseTo(norm, 10)
    expect(ratios[1]).toBeCloseTo(norm, 10)
    expect(ratios[2]).toBeCloseTo(norm, 10)
    expect(Math.abs(ratios[0]! - ratios[1]!)).toBeLessThan(1e-10)
    expect(Math.abs(ratios[1]! - ratios[2]!)).toBeLessThan(1e-10)
  })

  it('radial normalization integral = 1 ± 0.01 for a sampled (n,ℓ) grid (d=4)', () => {
    const d = 4
    const delta = computeDelta(d, 0, 'standard')
    const pairs: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 0],
      [0, 2],
    ]
    for (const [n, l] of pairs) {
      const integral = trapezoidNormIntegral(n, l, delta, d)
      expect(integral).toBeGreaterThan(0.99)
      expect(integral).toBeLessThan(1.01)
    }
  })
})

describe('branches and BF bound', () => {
  it('Δ_+ + Δ_− = d − 1 inside the KW window (d=4, m²L² = −2)', () => {
    // m²L² = −2 ⇒ mL = −√2 (negative slider encodes imaginary mass).
    const d = 4
    const mL = -Math.sqrt(2)
    expect(isInKWWindow(d, mL)).toBe(true)
    const deltaPlus = computeDelta(d, mL, 'standard')
    const deltaMinus = computeDelta(d, mL, 'alternate')
    // Δ_+ = 2, Δ_− = 1 for d=4, m²L² = −2.
    expect(deltaPlus).toBeCloseTo(2, 12)
    expect(deltaMinus).toBeCloseTo(1, 12)
    expect(deltaPlus + deltaMinus).toBeCloseTo(d - 1, 12)
  })

  it('isBelowBF true iff m²L² < −(d−1)²/4', () => {
    // d=3: BF threshold = −1. mL = √0.99 → m²L² = 0.98, above threshold.
    expect(isBelowBF(3, Math.sqrt(0.99))).toBe(false)
    // Negative-signed mL with |mL|² exceeding BF threshold triggers tachyon.
    expect(isBelowBF(3, -Math.sqrt(1.01))).toBe(true)
    // d=4: BF threshold = −2.25.
    expect(isBelowBF(4, -Math.sqrt(2.0))).toBe(false)
    expect(isBelowBF(4, -Math.sqrt(3.0))).toBe(true)
    // d=5: BF threshold = −4.
    expect(isBelowBF(5, -Math.sqrt(3.99))).toBe(false)
    expect(isBelowBF(5, -Math.sqrt(4.01))).toBe(true)
    // d=7: BF threshold = −9.
    expect(isBelowBF(7, -Math.sqrt(8.9))).toBe(false)
    expect(isBelowBF(7, -Math.sqrt(9.1))).toBe(true)
  })

  it('resolveDelta falls back to standard when alternate is requested outside KW', () => {
    // d=4, mL=0 is outside the KW window (m²L² = 0, threshold −(d−1)²/4 + 1 = −1.25).
    // Actually m²L² = 0 > −1.25, so outside the upper bound. KW window is (−2.25, −1.25).
    const resolved = resolveDelta(4, 0, 'alternate')
    expect(resolved.kwFallbackApplied).toBe(true)
    expect(resolved.branch).toBe('standard')
    expect(resolved.delta).toBeCloseTo(3, 12)
  })
})

describe('energy spectrum monotonicity', () => {
  it('energy is strictly increasing along the diagonal ordering (2n + ℓ)', () => {
    // Jointly (n, ℓ) ordering is not a total order without tie-breaking. The
    // physically meaningful monotone axis is "shell number" 2n + ℓ — any two
    // states with higher 2n + ℓ strictly dominate one with lower 2n + ℓ.
    const d = 4
    const delta = computeDelta(d, 0.2, 'standard')
    for (const shellLo of [0, 1, 2, 3]) {
      for (const shellHi of [shellLo + 1, shellLo + 2]) {
        if (shellHi > 6) continue
        const eLo = adsEnergy(Math.floor(shellLo / 2), shellLo % 2, delta)
        const eHi = adsEnergy(Math.floor(shellHi / 2), shellHi % 2, delta)
        expect(eHi).toBeGreaterThan(eLo)
      }
    }
  })

  it('energy increases with n at fixed ℓ, and with ℓ at fixed n', () => {
    const d = 5
    const delta = computeDelta(d, 1.0, 'standard')
    for (const l of [0, 1, 2]) {
      for (let n = 0; n < 4; n++) {
        expect(adsEnergy(n + 1, l, delta)).toBeGreaterThan(adsEnergy(n, l, delta))
      }
    }
    for (const n of [0, 1, 2]) {
      for (let l = 0; l < 3; l++) {
        expect(adsEnergy(n, l + 1, delta)).toBeGreaterThan(adsEnergy(n, l, delta))
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Numerical normalization integral using the AdS Sturm-Liouville weight:
 *   ∫_{ρ ∈ (δ, π/2 − δ)} R²(ρ) · sin^{d−2}(ρ) · cos^{2−d}(ρ) dρ.
 * Trapezoid rule with 2001 samples (2000 intervals) and δ = 0.002.
 */
function trapezoidNormIntegral(n: number, l: number, delta: number, d: number): number {
  const samples = 2001
  const deltaRho = 0.002
  const rhoMin = deltaRho
  const rhoMax = Math.PI / 2 - deltaRho
  const step = (rhoMax - rhoMin) / (samples - 1)
  let sum = 0
  for (let i = 0; i < samples; i++) {
    const rho = rhoMin + i * step
    const R = radialWavefunction(n, l, delta, d, rho)
    const weight = Math.pow(Math.sin(rho), d - 2) / Math.pow(Math.cos(rho), d - 2)
    const value = R * R * weight
    sum += i === 0 || i === samples - 1 ? 0.5 * value : value
  }
  return sum * step
}
