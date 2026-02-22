import { describe, expect, it } from 'vitest'
import {
  validateDensityMatrix,
  validateDetailedBalance,
  validateSelectionRules,
} from '@/lib/physics/openQuantum/validation'
import {
  createDensityMatrix,
  densityMatrixFromCoefficients,
} from '@/lib/physics/openQuantum/integrator'
import { buildHydrogenBasis } from '@/lib/physics/openQuantum/hydrogenBasis'
import { buildTransitionRates } from '@/lib/physics/openQuantum/hydrogenRates'
import { buildHydrogenChannels } from '@/lib/physics/openQuantum/hydrogenChannels'
import type { LindbladChannel } from '@/lib/physics/openQuantum/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a maximally mixed state ρ = I/K.
 * Diagonal elements: (1/K, 0) for each k; off-diagonal: 0.
 */
function maximallyMixedState(K: number) {
  const rho = createDensityMatrix(K)
  const invK = 1 / K
  for (let k = 0; k < K; k++) {
    rho.elements[2 * (k * K + k)] = invK
  }
  return rho
}

// ---------------------------------------------------------------------------
// validateDensityMatrix
// ---------------------------------------------------------------------------

describe('validateDensityMatrix', () => {
  it('accepts a pure state |0⟩⟨0| with near-zero residuals', () => {
    const K = 4
    const re = [1, 0, 0, 0]
    const im = [0, 0, 0, 0]
    const rho = densityMatrixFromCoefficients(re, im, K)

    const result = validateDensityMatrix(rho)

    expect(result.valid).toBe(true)
    expect(result.violations).toEqual([])
    expect(result.hermitianResidual).toBeLessThan(1e-12)
    expect(result.traceDrift).toBeLessThan(1e-12)
    expect(result.minEigenvalue).toBeGreaterThanOrEqual(-1e-12)
  })

  it('accepts a superposition pure state with no violations', () => {
    const K = 3
    // |ψ⟩ = (1/√2)|0⟩ + (1/√2)|1⟩ — normalized pure state
    const s = 1 / Math.sqrt(2)
    const re = [s, s, 0]
    const im = [0, 0, 0]
    const rho = densityMatrixFromCoefficients(re, im, K)

    const result = validateDensityMatrix(rho)

    expect(result.valid).toBe(true)
    expect(result.violations).toEqual([])
    expect(result.traceDrift).toBeLessThan(1e-12)
  })

  it('accepts a maximally mixed state ρ = I/K', () => {
    const K = 4
    const rho = maximallyMixedState(K)

    const result = validateDensityMatrix(rho)

    expect(result.valid).toBe(true)
    expect(result.violations).toEqual([])
    expect(result.traceDrift).toBeLessThan(1e-12)
    // Maximally mixed: all eigenvalues = 1/K via Gershgorin
    expect(result.minEigenvalue).toBeGreaterThanOrEqual(-1e-6)
  })

  it('detects a non-Hermitian matrix (Hermiticity violation)', () => {
    const K = 2
    const rho = createDensityMatrix(K)
    const el = rho.elements
    // Diagonal: valid trace = 1
    el[2 * (0 * K + 0)] = 0.5 // ρ_{00} re
    el[2 * (1 * K + 1)] = 0.5 // ρ_{11} re
    // Off-diagonal: ρ_{01} ≠ ρ_{10}* → breaks Hermiticity
    el[2 * (0 * K + 1)] = 0.3 // ρ_{01} re
    el[2 * (0 * K + 1) + 1] = 0.1 // ρ_{01} im
    el[2 * (1 * K + 0)] = 0.1 // ρ_{10} re  (should be 0.3 for Hermitian)
    el[2 * (1 * K + 0) + 1] = -0.1 // ρ_{10} im  (conjugate is correct here)

    const result = validateDensityMatrix(rho)

    expect(result.valid).toBe(false)
    expect(result.hermitianResidual).toBeGreaterThan(1e-6)
    const hasHermViolation = result.violations.some((v) =>
      v.toLowerCase().includes('hermiticity'),
    )
    expect(hasHermViolation).toBe(true)
  })

  it('detects trace ≠ 1 (trace drift violation)', () => {
    const K = 2
    const rho = createDensityMatrix(K)
    const el = rho.elements
    // Diagonal sums to 0.7, not 1
    el[2 * (0 * K + 0)] = 0.3
    el[2 * (1 * K + 1)] = 0.4

    const result = validateDensityMatrix(rho)

    expect(result.valid).toBe(false)
    expect(result.traceDrift).toBeCloseTo(0.3, 5)
    const hasTraceViolation = result.violations.some((v) =>
      v.toLowerCase().includes('trace'),
    )
    expect(hasTraceViolation).toBe(true)
  })

  it('detects a negative eigenvalue bound (non-positive-semidefinite)', () => {
    const K = 2
    const rho = createDensityMatrix(K)
    const el = rho.elements
    // Construct a matrix with negative Gershgorin eigenvalue bound:
    // ρ = [[0.1, 0.9], [0.9, 0.9]]
    // Gershgorin disc for row 0: center 0.1, radius 0.9 → min = -0.8
    el[2 * (0 * K + 0)] = 0.1
    el[2 * (1 * K + 1)] = 0.9
    el[2 * (0 * K + 1)] = 0.9 // off-diag re
    el[2 * (1 * K + 0)] = 0.9 // conjugate re (Hermitian, real off-diag)

    const result = validateDensityMatrix(rho)

    expect(result.valid).toBe(false)
    expect(result.minEigenvalue).toBeLessThan(-1e-6)
    const hasEigenViolation = result.violations.some((v) =>
      v.toLowerCase().includes('eigenvalue'),
    )
    expect(hasEigenViolation).toBe(true)
  })

  it('reports multiple simultaneous violations', () => {
    const K = 2
    const rho = createDensityMatrix(K)
    const el = rho.elements
    // Trace = 2.0 (not 1), non-Hermitian off-diagonal, negative eigenvalue bound
    el[2 * (0 * K + 0)] = 0.2
    el[2 * (1 * K + 1)] = 1.8
    // Non-Hermitian: ρ_{01} ≠ ρ_{10}*
    el[2 * (0 * K + 1)] = 1.5
    el[2 * (0 * K + 1) + 1] = 0.5
    el[2 * (1 * K + 0)] = 0.1
    el[2 * (1 * K + 0) + 1] = 0.5 // should be -0.5 for Hermitian

    const result = validateDensityMatrix(rho)

    expect(result.valid).toBe(false)
    expect(result.violations.length).toBeGreaterThanOrEqual(2)
  })

  it('respects custom tolerance parameter', () => {
    const K = 2
    const rho = createDensityMatrix(K)
    const el = rho.elements
    // Trace = 0.9999 — within loose tolerance, outside tight tolerance
    el[2 * (0 * K + 0)] = 0.4999
    el[2 * (1 * K + 1)] = 0.5

    const loose = validateDensityMatrix(rho, 0.01)
    const tight = validateDensityMatrix(rho, 1e-8)

    expect(loose.valid).toBe(true)
    expect(tight.valid).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// validateDetailedBalance
// ---------------------------------------------------------------------------

describe('validateDetailedBalance', () => {
  it('returns true for physics-derived rates from buildTransitionRates', () => {
    const basis = buildHydrogenBasis(2, 3)
    const temperature = 300
    const rates = buildTransitionRates(basis, temperature)

    // Rates built by buildTransitionRates satisfy detailed balance by construction
    expect(validateDetailedBalance(rates, temperature)).toBe(true)
  })

  it('returns true for rates at a high temperature', () => {
    const basis = buildHydrogenBasis(2, 3)
    const temperature = 50000
    const rates = buildTransitionRates(basis, temperature)

    expect(validateDetailedBalance(rates, temperature)).toBe(true)
  })

  it('returns false for manually constructed rates violating detailed balance', () => {
    // γ_up / γ_down should = exp(-ω/kT) at T=300K
    // We set γ_up = γ_down (ratio = 1) which violates detailed balance
    // for any finite ω (where the Boltzmann factor ≠ 1)
    const bogusRates = [
      {
        from: 1,
        to: 0,
        gammaDown: 1.0,
        gammaUp: 1.0, // ratio = 1, but exp(-ω/kT) ≪ 1 for large ω
        omega: 0.75, // hydrogen 1s→2p energy difference
        dipoleSq: 0.5,
      },
    ]

    expect(validateDetailedBalance(bogusRates, 300)).toBe(false)
  })

  it('returns true for an empty rates array', () => {
    expect(validateDetailedBalance([], 300)).toBe(true)
  })

  it('returns true when gammaDown is zero (skipped by the check)', () => {
    const rates = [
      {
        from: 1,
        to: 0,
        gammaDown: 0,
        gammaUp: 0.5,
        omega: 0.75,
        dipoleSq: 0.1,
      },
    ]

    // gammaDown <= 0 means the rate is skipped entirely
    expect(validateDetailedBalance(rates, 300)).toBe(true)
  })

  it('at T=0 requires gammaUp = 0 for all transitions', () => {
    const rates = [
      {
        from: 1,
        to: 0,
        gammaDown: 1.0,
        gammaUp: 0.5, // nonzero at T=0 → violation
        omega: 0.75,
        dipoleSq: 0.5,
      },
    ]

    expect(validateDetailedBalance(rates, 0)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// validateSelectionRules
// ---------------------------------------------------------------------------

describe('validateSelectionRules', () => {
  it('returns true for channels built from buildHydrogenChannels with a valid basis', () => {
    const basis = buildHydrogenBasis(2, 3)
    const rates = buildTransitionRates(basis, 300)
    const channels = buildHydrogenChannels(basis, rates, 0.5, true)

    // All channels from the physics pipeline should respect E1 selection rules
    expect(validateSelectionRules(channels, basis)).toBe(true)
  })

  it('returns true for dephasing-only channels (row === col are skipped)', () => {
    const basis = buildHydrogenBasis(2, 3)
    // Dephasing channels: L_k = √γ |k⟩⟨k|, which have row===col → skipped
    const dephasingOnly = buildHydrogenChannels(basis, [], 0.5, true)

    expect(validateSelectionRules(dephasingOnly, basis)).toBe(true)
  })

  it('returns false when a forbidden Δl=0 channel is injected', () => {
    const basis = buildHydrogenBasis(2, 3)
    // 1s (index 0, l=0) and 2s (index 1, l=0): Δl=0 → forbidden E1 transition
    const s1Index = basis.findIndex((s) => s.n === 1 && s.l === 0)
    const s2Index = basis.findIndex((s) => s.n === 2 && s.l === 0)

    const forbiddenChannel: LindbladChannel = {
      row: s1Index,
      col: s2Index,
      amplitudeRe: 0.1,
      amplitudeIm: 0,
    }

    expect(validateSelectionRules([forbiddenChannel], basis)).toBe(false)
  })

  it('returns false when a forbidden |Δm|=2 channel is injected', () => {
    const basis = buildHydrogenBasis(3, 3)
    // Find two states with same l but |Δm| = 2: e.g., 2p_{-1} and 2p_{+1}
    // Both have l=1 so Δl=0 → also forbidden, but more importantly |Δm|=2
    // Instead, use 3d_{-2} (l=2,m=-2) and 3d_{0} (l=2,m=0): Δl=0 AND |Δm|=2
    const dMinus2 = basis.findIndex((s) => s.l === 2 && s.m === -2)
    const d0 = basis.findIndex((s) => s.l === 2 && s.m === 0)

    const forbiddenChannel: LindbladChannel = {
      row: dMinus2,
      col: d0,
      amplitudeRe: 0.1,
      amplitudeIm: 0,
    }

    expect(validateSelectionRules([forbiddenChannel], basis)).toBe(false)
  })

  it('returns true for an empty channels array', () => {
    const basis = buildHydrogenBasis(2, 3)
    expect(validateSelectionRules([], basis)).toBe(true)
  })

  it('returns false when a channel references an out-of-range basis index', () => {
    const basis = buildHydrogenBasis(2, 3)
    // Index 99 is outside basis bounds → basis[99] is undefined → should return false
    const badChannel: LindbladChannel = {
      row: 0,
      col: 99,
      amplitudeRe: 0.1,
      amplitudeIm: 0,
    }

    expect(validateSelectionRules([badChannel], basis)).toBe(false)
  })
})
