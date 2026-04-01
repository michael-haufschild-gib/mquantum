/**
 * Tests for BEC Thomas-Fermi chemical potential computations.
 *
 * Validates the Thomas-Fermi approximation formulas against known
 * analytical results and physical invariants.
 */

import { describe, expect, it } from 'vitest'

import {
  healingLength,
  soundSpeed,
  thomasFermiMu3D,
  thomasFermiMuND,
  thomasFermiRadius,
} from '@/lib/physics/bec/chemicalPotential'

describe('thomasFermiMu3D', () => {
  it('computes positive μ for g=500, ω=1 (standard BEC parameters)', () => {
    const mu = thomasFermiMu3D(500, 1.0)
    // μ = 0.5 × (15×500 / 4π)^(2/5) × 1^(6/5)
    const expected = 0.5 * Math.pow((15 * 500) / (4 * Math.PI), 2 / 5)
    expect(mu).toBeCloseTo(expected, 10)
    expect(mu).toBeGreaterThan(0)
  })

  it('returns 0 for zero interaction strength', () => {
    expect(thomasFermiMu3D(0, 1.0)).toBe(0)
  })

  it('returns 0 for negative interaction strength', () => {
    expect(thomasFermiMu3D(-10, 1.0)).toBe(0)
  })

  it('scales with ω^(6/5)', () => {
    const mu1 = thomasFermiMu3D(100, 1.0)
    const mu2 = thomasFermiMu3D(100, 2.0)
    // μ ∝ ω^(6/5), so mu2/mu1 = 2^(6/5) ≈ 2.297
    expect(mu2 / mu1).toBeCloseTo(Math.pow(2, 6 / 5), 6)
  })

  it('scales with g^(2/5)', () => {
    const mu1 = thomasFermiMu3D(100, 1.0)
    const mu2 = thomasFermiMu3D(200, 1.0)
    // μ ∝ g^(2/5), so mu2/mu1 = 2^(2/5) ≈ 1.320
    expect(mu2 / mu1).toBeCloseTo(Math.pow(2, 2 / 5), 6)
  })
})

describe('thomasFermiMuND', () => {
  it('agrees with thomasFermiMu3D for D=3', () => {
    const g = 500
    const omega = 1.0
    const mu3d = thomasFermiMu3D(g, omega)
    const muNd = thomasFermiMuND(3, g, omega)
    expect(muNd).toBeCloseTo(mu3d, 8)
  })

  it('computes D=2 special case: μ = ω·√(g/π)', () => {
    const g = 100
    const omega = 1.0
    const expected = omega * Math.sqrt(g / Math.PI)
    const mu2d = thomasFermiMuND(2, g, omega)
    expect(mu2d).toBeCloseTo(expected, 6)
  })

  it('returns 0 for g ≤ 0', () => {
    expect(thomasFermiMuND(3, 0, 1.0)).toBe(0)
    expect(thomasFermiMuND(3, -10, 1.0)).toBe(0)
  })

  it('returns 0 for D < 2', () => {
    expect(thomasFermiMuND(1, 100, 1.0)).toBe(0)
    expect(thomasFermiMuND(0, 100, 1.0)).toBe(0)
  })

  it('produces positive finite results for all dimensions 2-11', () => {
    const g = 500
    const omega = 1.0
    for (let D = 2; D <= 11; D++) {
      const mu = thomasFermiMuND(D, g, omega)
      expect(mu).toBeGreaterThan(0)
      expect(Number.isFinite(mu)).toBe(true)
    }
  })

  it('is finite and positive for all supported dimensions', () => {
    for (let D = 2; D <= 11; D++) {
      const mu = thomasFermiMuND(D, 500, 1.0)
      expect(Number.isFinite(mu)).toBe(true)
      expect(mu).toBeGreaterThan(0)
    }
  })

  it('μ scales as g^(2/(D+2)) for each dimension D=2..6', () => {
    // The general TF formula gives μ ∝ g^(2/(D+2)) at fixed ω.
    // Verify by computing mu at g and 2g, checking the ratio equals 2^(2/(D+2)).
    const omega = 1.0
    const g1 = 100
    const g2 = 200

    for (let D = 2; D <= 6; D++) {
      const mu1 = thomasFermiMuND(D, g1, omega)
      const mu2 = thomasFermiMuND(D, g2, omega)
      const expectedRatio = Math.pow(2, 2 / (D + 2))
      expect(mu2 / mu1).toBeCloseTo(expectedRatio, 6)
    }
  })

  it('μ scales as ω^(2D/(D+2)) for each dimension D=2..6', () => {
    // μ ∝ ω^(2D/(D+2)) at fixed g.
    const g = 500
    const omega1 = 1.0
    const omega2 = 2.0

    for (let D = 2; D <= 6; D++) {
      const mu1 = thomasFermiMuND(D, g, omega1)
      const mu2 = thomasFermiMuND(D, g, omega2)
      const expectedRatio = Math.pow(2, (2 * D) / (D + 2))
      expect(mu2 / mu1).toBeCloseTo(expectedRatio, 6)
    }
  })

  it('Thomas-Fermi radius R_TF is consistent with μ for 3D', () => {
    // R_TF = sqrt(2μ/(mω²)) — so R_TF² × mω²/2 = μ
    const g = 500
    const omega = 1.0
    const mass = 1.0
    const mu = thomasFermiMu3D(g, omega)
    const R = thomasFermiRadius(mu, mass, omega)
    expect(0.5 * mass * omega * omega * R * R).toBeCloseTo(mu, 6)
  })

  it('healing length × sound speed = ℏ/m at constant density', () => {
    // ξ = ℏ/√(2mgn), c = √(gn/m)
    // ξ·c = ℏ/√(2mgn) · √(gn/m) = ℏ/√(2m²) = ℏ/(m√2)
    const hbar = 1.0
    const mass = 1.0
    const g = 500
    const density = 0.1
    const xi = healingLength(hbar, mass, g, density)
    const cs = soundSpeed(g, density, mass)
    expect(xi * cs).toBeCloseTo(hbar / (mass * Math.sqrt(2)), 6)
  })
})

describe('thomasFermiRadius', () => {
  it('computes R_TF = √(2μ/(m·ω²)) for known values', () => {
    const mu = 7.53
    const mass = 1.0
    const omega = 1.0
    const R = thomasFermiRadius(mu, mass, omega)
    expect(R).toBeCloseTo(Math.sqrt(2 * mu), 2)
  })

  it('returns 0 when μ ≤ 0', () => {
    expect(thomasFermiRadius(0, 1, 1)).toBe(0)
    expect(thomasFermiRadius(-5, 1, 1)).toBe(0)
  })

  it('returns 0 when mass·ω² ≤ 0', () => {
    expect(thomasFermiRadius(10, 0, 1)).toBe(0)
    expect(thomasFermiRadius(10, -1, 1)).toBe(0)
    expect(thomasFermiRadius(10, 1, 0)).toBe(0)
  })

  it('scales with 1/ω', () => {
    const R1 = thomasFermiRadius(10, 1, 1)
    const R2 = thomasFermiRadius(10, 1, 2)
    expect(R2 / R1).toBeCloseTo(0.5, 6)
  })
})

describe('healingLength', () => {
  it('returns ξ = ℏ/√(2mgn) for positive inputs', () => {
    const xi = healingLength(1, 1, 500, 0.1)
    expect(xi).toBeCloseTo(1 / Math.sqrt(2 * 1 * 500 * 0.1), 6)
  })

  it('returns Infinity when density is zero', () => {
    expect(healingLength(1, 1, 500, 0)).toBe(Infinity)
  })

  it('returns Infinity when g is zero', () => {
    expect(healingLength(1, 1, 0, 0.1)).toBe(Infinity)
  })

  it('returns Infinity when g is negative (attractive BEC)', () => {
    expect(healingLength(1, 1, -10, 0.1)).toBe(Infinity)
  })

  it('decreases as density increases (denser → shorter healing length)', () => {
    const xi1 = healingLength(1, 1, 100, 0.01)
    const xi2 = healingLength(1, 1, 100, 0.1)
    expect(xi2).toBeLessThan(xi1)
  })
})

describe('soundSpeed', () => {
  it('computes c_s = √(gn/m) for standard parameters', () => {
    const cs = soundSpeed(500, 0.1, 1.0)
    expect(cs).toBeCloseTo(Math.sqrt(50), 6)
  })

  it('returns 0 for zero density', () => {
    expect(soundSpeed(100, 0, 1)).toBe(0)
  })

  it('returns 0 for zero interaction strength', () => {
    expect(soundSpeed(0, 0.1, 1)).toBe(0)
  })

  it('returns 0 for negative interaction strength', () => {
    expect(soundSpeed(-10, 0.1, 1)).toBe(0)
  })

  it('increases with interaction strength', () => {
    const cs1 = soundSpeed(100, 0.1, 1)
    const cs2 = soundSpeed(200, 0.1, 1)
    expect(cs2).toBeGreaterThan(cs1)
  })
})
