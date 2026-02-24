/**
 * Tests for the open quantum integrator: density matrix creation,
 * evolution, and physicality guards.
 */
import { describe, expect, it } from 'vitest'
import {
  createDensityMatrix,
  densityMatrixFromCoefficients,
  evolveStep,
  evolveMultiStep,
} from '@/lib/physics/openQuantum/integrator'
import { buildLindbladChannels } from '@/lib/physics/openQuantum/channels'
import type { OpenQuantumConfig } from '@/lib/physics/openQuantum/types'
import { DEFAULT_OPEN_QUANTUM_CONFIG } from '@/lib/physics/openQuantum/types'

/** Helper: compute Tr(rho) */
function trace(rho: { K: number; elements: Float64Array }): number {
  let tr = 0
  for (let k = 0; k < rho.K; k++) {
    tr += rho.elements[2 * (k * rho.K + k)]!
  }
  return tr
}

/** Helper: check Hermiticity rho_{kl} = conj(rho_{lk}) */
function isHermitian(rho: { K: number; elements: Float64Array }, tol = 1e-10): boolean {
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

describe('createDensityMatrix', () => {
  it('creates a zero-initialized K×K matrix', () => {
    const rho = createDensityMatrix(4)
    expect(rho.K).toBe(4)
    expect(rho.elements.length).toBe(4 * 4 * 2)
    expect(rho.elements.every((v) => v === 0)).toBe(true)
  })
})

describe('densityMatrixFromCoefficients', () => {
  it('produces a pure state with Tr(rho) = 1', () => {
    // |psi> = (1/sqrt(2)) |0> + (1/sqrt(2)) |1>
    const c = 1 / Math.sqrt(2)
    const rho = densityMatrixFromCoefficients([c, c], [0, 0], 2)
    expect(trace(rho)).toBeCloseTo(1.0, 10)
  })

  it('produces a Hermitian matrix', () => {
    const rho = densityMatrixFromCoefficients([0.6, 0.0], [0.0, 0.8], 2)
    expect(isHermitian(rho)).toBe(true)
  })

  it('produces rho = |psi><psi| (rank-1)', () => {
    // Single state |0>: rho = diag(1, 0)
    const rho = densityMatrixFromCoefficients([1, 0], [0, 0], 2)
    expect(rho.elements[0]).toBeCloseTo(1.0) // rho_{00} re
    expect(rho.elements[2 * 3]).toBeCloseTo(0.0) // rho_{11} re
  })
})

describe('evolveStep', () => {
  it('preserves trace after 100 steps with dephasing', () => {
    const rho = densityMatrixFromCoefficients(
      [1 / Math.sqrt(2), 1 / Math.sqrt(2)],
      [0, 0],
      2
    )
    const energies = new Float64Array([0.5, 1.5])
    const config: OpenQuantumConfig = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      dephasingEnabled: true,
      dephasingRate: 1.0,
    }
    const channels = buildLindbladChannels(config, 2)

    for (let i = 0; i < 100; i++) {
      evolveStep(rho, energies, channels, 0.01)
    }

    expect(trace(rho)).toBeCloseTo(1.0, 6)
  })

  it('maintains Hermiticity after evolution', () => {
    const rho = densityMatrixFromCoefficients([0.6, 0.0, 0.0], [0.0, 0.8, 0.0], 3)
    const energies = new Float64Array([0.5, 1.5, 2.5])
    const config: OpenQuantumConfig = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      dephasingEnabled: true,
      dephasingRate: 0.5,
      relaxationEnabled: true,
      relaxationRate: 0.3,
    }
    const channels = buildLindbladChannels(config, 3)

    for (let i = 0; i < 50; i++) {
      evolveStep(rho, energies, channels, 0.01)
    }

    expect(isHermitian(rho)).toBe(true)
  })
})

describe('evolveMultiStep', () => {
  it('converges to fully decohered state under strong dephasing', () => {
    const c = 1 / Math.sqrt(2)
    const rho = densityMatrixFromCoefficients([c, c], [0, 0], 2)
    const energies = new Float64Array([0.5, 1.5])
    const config: OpenQuantumConfig = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      dephasingEnabled: true,
      dephasingRate: 5.0,
    }
    const channels = buildLindbladChannels(config, 2)

    // Evolve for many steps
    evolveMultiStep(rho, energies, channels, 0.01, 500)

    // Off-diagonal elements should be near zero
    const offDiagRe = rho.elements[2 * 1]! // rho_{01} re
    const offDiagIm = rho.elements[2 * 1 + 1]! // rho_{01} im
    const offDiagMag = Math.sqrt(offDiagRe * offDiagRe + offDiagIm * offDiagIm)
    expect(offDiagMag).toBeLessThan(0.01)

    // Diagonal should still sum to 1
    expect(trace(rho)).toBeCloseTo(1.0, 6)
  })

  it('drives ground population up under relaxation', () => {
    // Start in |1> state
    const rho = densityMatrixFromCoefficients([0, 1], [0, 0], 2)
    const initialGround = rho.elements[0]! // rho_{00} re
    const energies = new Float64Array([0.5, 1.5])
    const config: OpenQuantumConfig = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      relaxationEnabled: true,
      relaxationRate: 2.0,
    }
    const channels = buildLindbladChannels(config, 2)

    evolveMultiStep(rho, energies, channels, 0.01, 200)

    // Ground population should have increased
    const finalGround = rho.elements[0]
    expect(finalGround!).toBeGreaterThan(initialGround + 0.1)
  })
})
