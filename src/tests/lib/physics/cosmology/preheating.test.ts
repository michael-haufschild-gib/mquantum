/**
 * Tests for the parametric-resonance / preheating module.
 *
 * Anchors the CPU Mathieu-equation integrator against the canonical Floquet
 * results so the GPU shader's `massSquaredScale` drive can be tied to
 * testable physics:
 *
 *   (a) Mass-scale evaluator — disabled returns 1, enabled matches the
 *       analytical formula.
 *   (b) Drive-off round trip — the integrator with `A = 0` reduces to the
 *       bare Klein-Gordon leapfrog and stays bit-identical.
 *   (c) First instability tongue — growth rate matches `μ = A·m²/(4·ω)`
 *       within 15% at `Ω = 2·ω`.
 *   (d) Off-resonance stability — amplitude stays bounded far from any
 *       tongue.
 *   (e) Second tongue — nonzero growth at `Ω = ω` (second parametric
 *       resonance at `Ω ≈ ω`, quadratic in A).
 *   (f) Commutativity — with cosmology and preheating off, `massCoef`
 *       factorization reduces to `m² · 1 · 1` bit-identically.
 */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PREHEATING_CONFIG,
  type PreheatingConfig,
} from '@/lib/geometry/extended/freeScalar'
import {
  computeMassSquaredScale,
  integrateMathieu1D,
  maxAbsPhi,
  measureGrowthRateFromEnergyEnvelope,
} from '@/lib/physics/cosmology/preheating'

const OFF: PreheatingConfig = { ...DEFAULT_PREHEATING_CONFIG, enabled: false }

describe('computeMassSquaredScale', () => {
  it('returns 1 when disabled regardless of time or reference', () => {
    expect(computeMassSquaredScale(0, OFF, 0)).toBe(1)
    expect(computeMassSquaredScale(17.3, OFF, -4.1)).toBe(1)
    expect(computeMassSquaredScale(-99.9, OFF, 99.9)).toBe(1)
  })

  it('returns 1 + A·sin(Ω·(η − η_ref)) when enabled', () => {
    const cfg: PreheatingConfig = { enabled: true, amplitude: 0.2, frequency: 2 }
    // At η = η_ref the drive is at phase 0 — the scale must be exactly 1.
    expect(computeMassSquaredScale(5, cfg, 5)).toBe(1)
    // Quarter period: sin(π/2) = 1 → scale = 1 + A.
    const quarter = 5 + Math.PI / (2 * cfg.frequency)
    expect(computeMassSquaredScale(quarter, cfg, 5)).toBeCloseTo(1 + cfg.amplitude, 12)
    // Half period: sin(π) = 0.
    const half = 5 + Math.PI / cfg.frequency
    expect(computeMassSquaredScale(half, cfg, 5)).toBeCloseTo(1, 12)
    // Three-quarter period: sin(3π/2) = −1 → scale = 1 − A.
    const threeQuarter = 5 + (3 * Math.PI) / (2 * cfg.frequency)
    expect(computeMassSquaredScale(threeQuarter, cfg, 5)).toBeCloseTo(1 - cfg.amplitude, 12)
  })
})

describe('integrateMathieu1D — drive off', () => {
  it('amplitude stays bounded and trajectory matches a bare KG leapfrog to within 1e-8', () => {
    const mass = 1
    const k = 0
    const dt = 0.01
    const nSteps = 1000
    const phi0 = 1
    const pi0 = 0

    const traj = integrateMathieu1D({
      mass,
      k,
      dt,
      nSteps,
      preheating: OFF,
      phi0,
      pi0,
    })

    // Reference: bare Klein-Gordon leapfrog with `massCoef = m² · 1 · 1`,
    // drift-then-kick substep ordering, matching the shader.
    let pRef = phi0
    let qRef = pi0
    const massCoef = mass * mass * 1 * 1
    const kSq = k * k
    for (let n = 0; n < nSteps; n++) {
      pRef = pRef + dt * qRef
      qRef = qRef - dt * (kSq + massCoef) * pRef
    }

    expect(Math.abs(traj.phi[nSteps]! - pRef)).toBeLessThan(1e-8)
    expect(Math.abs(traj.pi[nSteps]! - qRef)).toBeLessThan(1e-8)

    // Amplitude is bounded by the symplectic-Euler modified Hamiltonian.
    // Use the energy envelope — conserved to O(dt²) — instead of raw
    // amplitude, which oscillates within its dt² band.
    const omega = 1
    let maxE = 0
    let minE = Infinity
    for (let i = 0; i < traj.phi.length; i++) {
      const e = 0.5 * (traj.pi[i]! * traj.pi[i]! + omega * omega * traj.phi[i]! * traj.phi[i]!)
      if (e > maxE) maxE = e
      if (e < minE) minE = e
    }
    // No exponential drift: max/min stays near unity. Symplectic Euler
    // conserves a modified Hamiltonian to O(dt), so raw energy wobbles at
    // ~dt/2 = 0.5% per cycle — well below any Mathieu instability
    // fingerprint but non-zero. 2% gives a comfortable margin.
    expect(maxE / minE - 1).toBeLessThan(2e-2)
  })
})

describe('integrateMathieu1D — first instability tongue', () => {
  it('zero-mode amplifies at μ ≈ A·m²/(4·ω) within 15% at Ω = 2·m', () => {
    const mass = 1
    const k = 0
    const amplitude = 0.2
    const frequency = 2.0 // Ω = 2·ω₀ = 2·m
    const dt = 0.01
    const nSteps = 3000 // ~9.5 drive periods

    const traj = integrateMathieu1D({
      mass,
      k,
      dt,
      nSteps,
      preheating: { enabled: true, amplitude, frequency },
      phi0: 1e-3,
      pi0: 0,
    })

    const omega = Math.sqrt(k * k + mass * mass) // 1
    const muTheoretical = (amplitude * mass * mass) / (4 * omega) // 0.05
    const muMeasured = measureGrowthRateFromEnergyEnvelope(traj, omega)

    expect(muMeasured).toBeGreaterThan(0)
    const relativeError = Math.abs(muMeasured - muTheoretical) / muTheoretical
    expect(relativeError).toBeLessThan(0.15)
  })
})

describe('integrateMathieu1D — off-resonance stability', () => {
  it('amplitude stays bounded far from any Mathieu tongue', () => {
    const mass = 1
    const k = 0
    const amplitude = 0.3
    const frequency = 5.0 // Between tongues: Ω ≠ 2·ω, Ω ≠ ω, Ω ≠ 2ω/3, …
    const dt = 0.01
    const nSteps = 2000
    const phi0 = 1

    const traj = integrateMathieu1D({
      mass,
      k,
      dt,
      nSteps,
      preheating: { enabled: true, amplitude, frequency },
      phi0,
      pi0: 0,
    })

    const ratio = maxAbsPhi(traj) / Math.abs(phi0)
    expect(ratio).toBeLessThan(1.6)
  })
})

describe('integrateMathieu1D — second instability tongue', () => {
  it('amplifies with μ ≥ 0.005 at Ω = ω (second tongue, quadratic in A)', () => {
    const mass = 1
    const k = 0
    const amplitude = 0.5
    const frequency = 1.0 // Ω = ω₀ — second parametric resonance
    const dt = 0.01
    const nSteps = 6000

    const traj = integrateMathieu1D({
      mass,
      k,
      dt,
      nSteps,
      preheating: { enabled: true, amplitude, frequency },
      phi0: 1e-3,
      pi0: 0,
    })

    const omega = Math.sqrt(k * k + mass * mass)
    const muMeasured = measureGrowthRateFromEnergyEnvelope(traj, omega)
    expect(muMeasured).toBeGreaterThanOrEqual(0.005)
  })
})

describe('commutativity — preheating off reduces to bare Klein-Gordon', () => {
  it('computeMassSquaredScale·aFull·m² factorization collapses to m² under trivial coefs', () => {
    // The shader's kick equation is:
    //   massCoef = m² · aFull · massSquaredScale
    //   π' = π − dt · massCoef · φ
    // With cosmology off (aFull = 1) and preheating off
    // (massSquaredScale = 1), this must reduce to `massCoef = m²` exactly.
    const mass = 1.7
    const aFull = 1
    const scale = computeMassSquaredScale(42, OFF, 0)
    const massCoef = mass * mass * aFull * scale
    expect(scale).toBe(1)
    expect(massCoef).toBe(mass * mass)

    // End-to-end: integrator trajectory with preheating off and integrator
    // trajectory advanced manually with `massCoef = m²` produce identical
    // state arrays (IEEE 754 `x · 1 === x`).
    const dt = 0.005
    const nSteps = 500
    const traj = integrateMathieu1D({
      mass,
      k: 0,
      dt,
      nSteps,
      preheating: OFF,
      phi0: 0.7,
      pi0: 0.1,
    })
    let pRef = 0.7
    let qRef = 0.1
    for (let n = 0; n < nSteps; n++) {
      pRef = pRef + dt * qRef
      qRef = qRef - dt * (mass * mass) * pRef
    }
    expect(traj.phi[nSteps]!).toBe(pRef)
    expect(traj.pi[nSteps]!).toBe(qRef)
  })
})
