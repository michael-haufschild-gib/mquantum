/**
 * Multi-step Lindblad evolution tests.
 *
 * Verifies that the split-step integrator preserves physical invariants
 * (trace = 1, Hermiticity, positive semi-definiteness) across many
 * timesteps, and that dissipation drives purity toward the expected
 * steady state.
 */

import { describe, expect, it } from 'vitest'

import {
  densityMatrixFromCoefficients,
  evolveMultiStep,
  hermitianEigendecompose,
  MAX_K,
} from '@/lib/physics/openQuantum/integrator'
import { purity } from '@/lib/physics/openQuantum/metrics'
import type { DensityMatrix, LindbladChannel } from '@/lib/physics/openQuantum/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trace(rho: DensityMatrix): number {
  let tr = 0
  for (let k = 0; k < rho.K; k++) {
    tr += rho.elements[2 * (k * rho.K + k)]!
  }
  return tr
}

function checkHermitian(rho: DensityMatrix, tol = 1e-8): boolean {
  for (let k = 0; k < rho.K; k++) {
    for (let l = k + 1; l < rho.K; l++) {
      const idx_kl = 2 * (k * rho.K + l)
      const idx_lk = 2 * (l * rho.K + k)
      if (Math.abs(rho.elements[idx_kl]! - rho.elements[idx_lk]!) > tol) return false
      if (Math.abs(rho.elements[idx_kl + 1]! + rho.elements[idx_lk + 1]!) > tol) return false
    }
  }
  return true
}

function checkPositiveSemiDefinite(rho: DensityMatrix, tol = 1e-10): boolean {
  const evals = new Float64Array(MAX_K)
  const evecs = new Float64Array(MAX_K * MAX_K * 2)
  hermitianEigendecompose(rho, evals, evecs)
  for (let k = 0; k < rho.K; k++) {
    if (evals[k]! < -tol) return false
  }
  return true
}

function decayChannel(row: number, col: number, gamma: number): LindbladChannel {
  return { row, col, amplitudeRe: Math.sqrt(gamma), amplitudeIm: 0 }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('multi-step Lindblad evolution', () => {
  describe('physical invariant preservation', () => {
    it('trace remains 1 after 100 evolution steps', () => {
      const K = 3
      // Start in equal superposition |0⟩+|1⟩+|2⟩
      const c = 1 / Math.sqrt(3)
      const rho = densityMatrixFromCoefficients([c, c, c], [0, 0, 0], K)
      const energies = new Float64Array([0, 1, 2])
      const channels = [decayChannel(0, 1, 0.5), decayChannel(0, 2, 0.3)]
      const dt = 0.01

      evolveMultiStep(rho, energies, channels, dt, 100)

      expect(trace(rho)).toBeCloseTo(1.0, 6)
    })

    it('Hermiticity preserved after 100 steps', () => {
      const K = 3
      const rho = densityMatrixFromCoefficients([0.5, 0.5, Math.sqrt(0.5)], [0, 0.5, 0], K)
      const energies = new Float64Array([0, 2, 5])
      const channels = [decayChannel(0, 1, 1.0), decayChannel(1, 2, 0.5)]
      const dt = 0.005

      evolveMultiStep(rho, energies, channels, dt, 100)

      expect(checkHermitian(rho)).toBe(true)
    })

    it('remains positive semi-definite after 200 steps', () => {
      const K = 4
      const rho = densityMatrixFromCoefficients([0.5, 0.5, 0.5, 0.5], [0, 0, 0, 0], K)
      const energies = new Float64Array([0, 1, 3, 6])
      const channels = [decayChannel(0, 1, 0.8), decayChannel(0, 2, 0.4), decayChannel(1, 3, 0.6)]
      const dt = 0.01

      evolveMultiStep(rho, energies, channels, dt, 200)

      expect(checkPositiveSemiDefinite(rho)).toBe(true)
    })
  })

  describe('purity dynamics', () => {
    it('purity decreases monotonically under decoherence (no heating)', () => {
      const K = 2
      // Start in pure state |1⟩
      const rho = densityMatrixFromCoefficients([0, 1], [0, 0], K)
      const energies = new Float64Array([0, 1])
      const channels = [decayChannel(0, 1, 0.5)] // decay only, no thermal excitation
      const dt = 0.01

      let prevPurity = purity(rho)
      expect(prevPurity).toBeCloseTo(1.0, 6)

      for (let step = 0; step < 50; step++) {
        evolveMultiStep(rho, energies, channels, dt, 1)
        const currentPurity = purity(rho)
        // Allow tiny numerical increase (< 1e-8)
        expect(currentPurity).toBeLessThanOrEqual(prevPurity + 1e-8)
        prevPurity = currentPurity
      }

      // After 50 steps of decay, purity should have decreased significantly
      expect(prevPurity).toBeLessThan(0.99)
    })

    it('strong decay drives system toward ground state', () => {
      const K = 3
      // Start in excited state |2⟩
      const rho = densityMatrixFromCoefficients([0, 0, 1], [0, 0, 0], K)
      const energies = new Float64Array([0, 1, 3])
      const channels = [decayChannel(0, 1, 2.0), decayChannel(0, 2, 2.0), decayChannel(1, 2, 2.0)]
      const dt = 0.01

      evolveMultiStep(rho, energies, channels, dt, 500)

      // Ground state population should dominate
      const p0 = rho.elements[2 * (0 * K + 0)]!
      expect(p0).toBeGreaterThan(0.8)

      // Excited state populations should be small
      const p1 = rho.elements[2 * (1 * K + 1)]!
      const p2 = rho.elements[2 * (2 * K + 2)]!
      expect(p1).toBeLessThan(0.15)
      expect(p2).toBeLessThan(0.05)
    })
  })

  describe('unitary-only evolution', () => {
    it('preserves purity when no dissipation channels active', () => {
      const K = 3
      const rho = densityMatrixFromCoefficients(
        [1 / Math.sqrt(2), 1 / Math.sqrt(2), 0],
        [0, 0, 0],
        K
      )
      const energies = new Float64Array([0, 1, 2])
      const channels: LindbladChannel[] = [] // no dissipation
      const dt = 0.01

      const initialPurity = purity(rho)
      evolveMultiStep(rho, energies, channels, dt, 100)

      // Purity should be preserved (no dissipation)
      expect(purity(rho)).toBeCloseTo(initialPurity, 4)
    })

    it('populations remain constant under pure unitary evolution', () => {
      const K = 2
      const rho = densityMatrixFromCoefficients([0.6, 0.8], [0, 0], K)
      const energies = new Float64Array([0, 3])
      const channels: LindbladChannel[] = []
      const dt = 0.01

      const p0_before = rho.elements[0]!
      const p1_before = rho.elements[2 * (1 * K + 1)]!

      evolveMultiStep(rho, energies, channels, dt, 100)

      expect(rho.elements[0]!).toBeCloseTo(p0_before, 4)
      expect(rho.elements[2 * (1 * K + 1)]!).toBeCloseTo(p1_before, 4)
    })
  })

  describe('edge cases', () => {
    it('zero timestep leaves state unchanged', () => {
      const K = 2
      const rho = densityMatrixFromCoefficients([1, 0], [0, 0], K)
      const before = new Float64Array(rho.elements)
      const energies = new Float64Array([0, 1])
      const channels = [decayChannel(0, 1, 1.0)]

      evolveMultiStep(rho, energies, channels, 0, 100)

      for (let i = 0; i < before.length; i++) {
        expect(rho.elements[i]).toBeCloseTo(before[i]!, 10)
      }
    })

    it('zero substeps leaves state unchanged', () => {
      const K = 2
      const rho = densityMatrixFromCoefficients([1, 0], [0, 0], K)
      const before = new Float64Array(rho.elements)
      const energies = new Float64Array([0, 1])
      const channels = [decayChannel(0, 1, 1.0)]

      evolveMultiStep(rho, energies, channels, 0.01, 0)

      for (let i = 0; i < before.length; i++) {
        expect(rho.elements[i]).toBeCloseTo(before[i]!, 10)
      }
    })
  })
})
