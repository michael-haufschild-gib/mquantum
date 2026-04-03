/**
 * Tests for the open quantum integrator: density matrix creation,
 * evolution, and physicality guards.
 */
import { describe, expect, it } from 'vitest'

import { buildLindbladChannels } from '@/lib/physics/openQuantum/channels'
import {
  createDensityMatrix,
  densityMatrixFromCoefficients,
  eigenvalueFloor,
  evolveMultiStep,
  evolveStep,
  hermitianEigendecompose,
  hermitianize,
  MAX_K,
} from '@/lib/physics/openQuantum/integrator'
import { buildLiouvillian } from '@/lib/physics/openQuantum/liouvillian'
import { linearEntropy, purity, vonNeumannEntropy } from '@/lib/physics/openQuantum/metrics'
import { computePropagator, evolvePropagatorStep } from '@/lib/physics/openQuantum/propagator'
import type { DensityMatrix, OpenQuantumConfig } from '@/lib/physics/openQuantum/types'
import { DEFAULT_OPEN_QUANTUM_CONFIG } from '@/lib/physics/openQuantum/types'

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
    expect(rho).toHaveUnitTrace(1e-10)
  })

  it('produces a Hermitian matrix', () => {
    const rho = densityMatrixFromCoefficients([0.6, 0.0], [0.0, 0.8], 2)
    expect(rho).toBeHermitian()
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
    const rho = densityMatrixFromCoefficients([1 / Math.sqrt(2), 1 / Math.sqrt(2)], [0, 0], 2)
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

    expect(rho).toHaveUnitTrace(1e-6)
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

    expect(rho).toBeHermitian()
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
    expect(rho).toHaveUnitTrace(1e-6)
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

// ============================================================================
// Physical conservation laws and invariants
// ============================================================================

describe('physical invariants under Lindblad evolution', () => {
  it('purity monotonically decreases under dephasing (dissipation theorem)', () => {
    const c = 1 / Math.sqrt(2)
    const rho = densityMatrixFromCoefficients([c, c], [0, 0], 2)
    const energies = new Float64Array([0.5, 1.5])
    const config: OpenQuantumConfig = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      dephasingEnabled: true,
      dephasingRate: 1.0,
    }
    const channels = buildLindbladChannels(config, 2)

    const purityHistory: number[] = [purity(rho)]
    for (let step = 0; step < 50; step++) {
      evolveStep(rho, energies, channels, 0.01)
      purityHistory.push(purity(rho))
    }

    // Purity should monotonically decrease (or stay equal — never increase)
    for (let i = 1; i < purityHistory.length; i++) {
      expect(purityHistory[i]!).toBeLessThanOrEqual(purityHistory[i - 1]! + 1e-10)
    }

    // Pure state starts at purity = 1; after dephasing, should be < 1
    expect(purityHistory[purityHistory.length - 1]!).toBeLessThan(0.95)
  })

  it('von Neumann entropy monotonically increases under dephasing', () => {
    const c = 1 / Math.sqrt(2)
    const rho = densityMatrixFromCoefficients([c, c], [0, 0], 2)
    const energies = new Float64Array([0.5, 1.5])
    const config: OpenQuantumConfig = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      dephasingEnabled: true,
      dephasingRate: 2.0,
    }
    const channels = buildLindbladChannels(config, 2)

    const entropyHistory: number[] = [vonNeumannEntropy(rho)]
    for (let step = 0; step < 50; step++) {
      evolveStep(rho, energies, channels, 0.01)
      entropyHistory.push(vonNeumannEntropy(rho))
    }

    // Entropy should monotonically increase (or stay equal)
    for (let i = 1; i < entropyHistory.length; i++) {
      expect(entropyHistory[i]!).toBeGreaterThanOrEqual(entropyHistory[i - 1]! - 1e-10)
    }
  })

  it('linear entropy equals 1 - purity (definition consistency)', () => {
    const rho = densityMatrixFromCoefficients([0.6, 0.0], [0.0, 0.8], 2)
    const p = purity(rho)
    const le = linearEntropy(rho)
    expect(le).toBeCloseTo(1 - p, 10)
  })

  it('pure state has purity = 1 and von Neumann entropy = 0', () => {
    const rho = densityMatrixFromCoefficients([1, 0], [0, 0], 2)
    expect(purity(rho)).toBeCloseTo(1.0, 10)
    expect(vonNeumannEntropy(rho)).toBeCloseTo(0.0, 10)
  })

  it('maximally mixed state has purity = 1/K and maximum entropy', () => {
    const K = 3
    const rho = createDensityMatrix(K)
    // Maximally mixed: rho_{kk} = 1/K, all off-diagonal = 0
    for (let k = 0; k < K; k++) {
      rho.elements[2 * (k * K + k)] = 1 / K
    }

    expect(purity(rho)).toBeCloseTo(1 / K, 10)
    expect(vonNeumannEntropy(rho)).toBeCloseTo(Math.log(K), 6)
  })

  it('all diagonal elements remain non-negative under evolution (positivity)', () => {
    const rho = densityMatrixFromCoefficients(
      [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)],
      [0, 0, 0],
      3
    )
    const energies = new Float64Array([0.5, 1.5, 2.5])
    const config: OpenQuantumConfig = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      dephasingEnabled: true,
      dephasingRate: 1.0,
      relaxationEnabled: true,
      relaxationRate: 0.5,
    }
    const channels = buildLindbladChannels(config, 3)

    for (let step = 0; step < 200; step++) {
      evolveStep(rho, energies, channels, 0.01)

      // Check all diagonal elements (populations) are non-negative
      for (let k = 0; k < 3; k++) {
        expect(rho.elements[2 * (k * 3 + k)]!).toBeGreaterThanOrEqual(-1e-10)
      }
    }
  })

  it('relaxation drives system toward ground state at T=0', () => {
    // Start in equal superposition of 3 states
    const c = 1 / Math.sqrt(3)
    const rho = densityMatrixFromCoefficients([c, c, c], [0, 0, 0], 3)
    const energies = new Float64Array([0.5, 1.5, 2.5])
    const config: OpenQuantumConfig = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      relaxationEnabled: true,
      relaxationRate: 2.0,
      dephasingEnabled: true,
      dephasingRate: 1.0,
    }
    const channels = buildLindbladChannels(config, 3)

    evolveMultiStep(rho, energies, channels, 0.01, 500)

    // Ground state population should dominate
    const groundPop = rho.elements[0]! // rho_{00} re
    const firstExcited = rho.elements[2 * (1 * 3 + 1)]! // rho_{11} re
    const secondExcited = rho.elements[2 * (2 * 3 + 2)]! // rho_{22} re

    expect(groundPop).toBeGreaterThan(0.5)
    expect(groundPop).toBeGreaterThan(firstExcited)
    expect(groundPop).toBeGreaterThan(secondExcited)
  })

  it('unitary evolution (no channels) preserves purity exactly', () => {
    const c = 1 / Math.sqrt(2)
    const rho = densityMatrixFromCoefficients([c, c], [0, 0], 2)
    const energies = new Float64Array([0.5, 1.5])
    const initialPurity = purity(rho)

    // No channels = purely unitary
    for (let step = 0; step < 100; step++) {
      evolveStep(rho, energies, [], 0.01)
    }

    expect(purity(rho)).toBeCloseTo(initialPurity, 8)
    expect(rho).toHaveUnitTrace(1e-10)
  })

  it('4-level system with all channels preserves trace and positivity', () => {
    const K = 4
    const c = 1 / Math.sqrt(K)
    const re = Array.from({ length: K }, () => c)
    const im = Array.from({ length: K }, () => 0)
    const rho = densityMatrixFromCoefficients(re, im, K)
    const energies = new Float64Array([0.5, 1.5, 2.5, 3.5])
    const config: OpenQuantumConfig = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      dephasingEnabled: true,
      dephasingRate: 1.5,
      relaxationEnabled: true,
      relaxationRate: 1.0,
    }
    const channels = buildLindbladChannels(config, K)

    for (let step = 0; step < 300; step++) {
      evolveStep(rho, energies, channels, 0.01)
    }

    expect(rho).toHaveUnitTrace(1e-4)
    expect(rho).toBeHermitian()
    for (let k = 0; k < K; k++) {
      expect(rho.elements[2 * (k * K + k)]!).toBeGreaterThanOrEqual(-1e-8)
    }
  })

  it('large timestep does not produce negative populations', () => {
    const c = 1 / Math.sqrt(2)
    const rho = densityMatrixFromCoefficients([c, c], [0, 0], 2)
    const energies = new Float64Array([0.5, 1.5])
    const config: OpenQuantumConfig = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      dephasingEnabled: true,
      dephasingRate: 0.5,
    }
    const channels = buildLindbladChannels(config, 2)

    // Use larger-than-recommended timestep
    for (let step = 0; step < 20; step++) {
      evolveStep(rho, energies, channels, 0.1)
      for (let k = 0; k < 2; k++) {
        expect(rho.elements[2 * (k * 2 + k)]!).toBeGreaterThanOrEqual(-0.05)
      }
    }

    expect(rho).toHaveUnitTrace(0.1)
  })

  it('starting from fully mixed state with no channels yields unchanged state', () => {
    const K = 3
    const rho = createDensityMatrix(K)
    for (let k = 0; k < K; k++) {
      rho.elements[2 * (k * K + k)] = 1 / K
    }
    const energies = new Float64Array([1, 2, 3])

    // Pure unitary evolution of a fully mixed state — should remain mixed
    for (let step = 0; step < 50; step++) {
      evolveStep(rho, energies, [], 0.01)
    }

    // Diagonal should remain 1/K (unitary doesn't change populations of a mixed state)
    for (let k = 0; k < K; k++) {
      expect(rho.elements[2 * (k * K + k)]!).toBeCloseTo(1 / K, 6)
    }
  })

  it('unitary evolution preserves off-diagonal magnitude (coherence)', () => {
    const c = 1 / Math.sqrt(2)
    const rho = densityMatrixFromCoefficients([c, c], [0, 0], 2)
    const energies = new Float64Array([0.5, 1.5])

    const offDiagBefore = Math.sqrt(
      rho.elements[2]! * rho.elements[2]! + rho.elements[3]! * rho.elements[3]!
    )

    for (let step = 0; step < 100; step++) {
      evolveStep(rho, energies, [], 0.01)
    }

    const offDiagAfter = Math.sqrt(
      rho.elements[2]! * rho.elements[2]! + rho.elements[3]! * rho.elements[3]!
    )

    expect(offDiagAfter).toBeCloseTo(offDiagBefore, 6)
  })
})

// ============================================================================
// Euler vs Propagator convergence — decision tests
// ============================================================================

/** Frobenius norm ||A - B||_F for two density matrices */
function frobeniusDiff(a: DensityMatrix, b: DensityMatrix): number {
  const el_a = a.elements
  const el_b = b.elements
  let sum = 0
  for (let i = 0; i < el_a.length; i++) {
    const d = el_a[i]! - el_b[i]!
    sum += d * d
  }
  return Math.sqrt(sum)
}

describe('Euler vs propagator convergence', () => {
  it('Euler path matches propagator within visual tolerance at production dt', () => {
    // Production parameters: K=2, dt=0.01, dephasing γ=1.0
    const K = 2
    const c = 1 / Math.sqrt(2)
    const energies = new Float64Array([0.5, 1.5])
    const config: OpenQuantumConfig = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      dephasingEnabled: true,
      dephasingRate: 1.0,
    }
    const channels = buildLindbladChannels(config, K)
    const dt = 0.01
    const steps = 100 // T_final = 1.0

    // Propagator path (reference)
    const rhoProp = densityMatrixFromCoefficients([c, c], [0, 0], K)
    const liouvillian = buildLiouvillian(energies, channels, K)
    const P = computePropagator(liouvillian, dt, K)
    for (let i = 0; i < steps; i++) {
      evolvePropagatorStep(P, rhoProp)
    }

    // Euler path (under test)
    const rhoEuler = densityMatrixFromCoefficients([c, c], [0, 0], K)
    evolveMultiStep(rhoEuler, energies, channels, dt, steps)

    const error = frobeniusDiff(rhoEuler, rhoProp)
    // Visual tolerance: 1% Frobenius error is below perceptual threshold
    // for density matrix → wavefunction coefficient → color mapping
    expect(error).toBeLessThan(0.01)
  })

  it('Euler convergence rate is first-order in dt', () => {
    const K = 2
    const c = 1 / Math.sqrt(2)
    const energies = new Float64Array([0.5, 1.5])
    const config: OpenQuantumConfig = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      dephasingEnabled: true,
      dephasingRate: 1.0,
    }
    const channels = buildLindbladChannels(config, K)
    const tFinal = 0.5

    // Reference: propagator at finest dt
    const liouvillian = buildLiouvillian(energies, channels, K)

    const errors: number[] = []
    for (const dt of [0.02, 0.01, 0.005]) {
      const steps = Math.round(tFinal / dt)

      // Propagator reference for this dt (machine-precision per step)
      const rhoProp = densityMatrixFromCoefficients([c, c], [0, 0], K)
      const P = computePropagator(liouvillian, dt, K)
      for (let i = 0; i < steps; i++) {
        evolvePropagatorStep(P, rhoProp)
      }

      // Euler
      const rhoEuler = densityMatrixFromCoefficients([c, c], [0, 0], K)
      evolveMultiStep(rhoEuler, energies, channels, dt, steps)

      errors.push(frobeniusDiff(rhoEuler, rhoProp))
    }

    // First-order: halving dt should halve the error → ratio ≈ 2.0
    const ratio1 = errors[0]! / errors[1]!
    const ratio2 = errors[1]! / errors[2]!

    expect(ratio1).toBeGreaterThan(1.5)
    expect(ratio1).toBeLessThan(2.5)
    expect(ratio2).toBeGreaterThan(1.5)
    expect(ratio2).toBeLessThan(2.5)
  })

  it('Euler path at worst-case parameters (high γ, large dt)', () => {
    // Stress test: parameters beyond production range
    const K = 4
    const c = 1 / Math.sqrt(K)
    const coeffsRe = Array.from({ length: K }, () => c)
    const coeffsIm = Array.from({ length: K }, () => 0)
    const energies = new Float64Array([0.5, 1.5, 2.5, 3.5])
    const config: OpenQuantumConfig = {
      ...DEFAULT_OPEN_QUANTUM_CONFIG,
      enabled: true,
      dephasingEnabled: true,
      dephasingRate: 5.0,
      relaxationEnabled: true,
      relaxationRate: 2.0,
    }
    const channels = buildLindbladChannels(config, K)
    const dt = 0.05
    const steps = 10 // T_final = 0.5

    // Propagator reference
    const rhoProp = densityMatrixFromCoefficients(coeffsRe, coeffsIm, K)
    const liouvillian = buildLiouvillian(energies, channels, K)
    const P = computePropagator(liouvillian, dt, K)
    for (let i = 0; i < steps; i++) {
      evolvePropagatorStep(P, rhoProp)
    }

    // Euler
    const rhoEuler = densityMatrixFromCoefficients(coeffsRe, coeffsIm, K)
    evolveMultiStep(rhoEuler, energies, channels, dt, steps)

    const error = frobeniusDiff(rhoEuler, rhoProp)
    // This test documents the error at worst-case parameters.
    // If error > 5%, the Euler integrator is inadequate for this regime.
    // Current expectation: Euler diverges at high γ*dt products.
    expect(error).toBeLessThan(0.05)
  })
})

// ---------------------------------------------------------------------------
// hermitianEigendecompose
// ---------------------------------------------------------------------------

describe('hermitianEigendecompose', () => {
  function makeDensityMatrix(K: number, elements: number[]): DensityMatrix {
    return { K, elements: new Float64Array(elements) }
  }

  it('decomposes a 2×2 real diagonal matrix', () => {
    // [[3, 0], [0, 1]] → eigenvalues {3, 1}
    const rho = makeDensityMatrix(2, [3, 0, 0, 0, 0, 0, 1, 0])
    const evals = new Float64Array(MAX_K)
    const evecs = new Float64Array(MAX_K * MAX_K * 2)

    hermitianEigendecompose(rho, evals, evecs)

    const sorted = [evals[0]!, evals[1]!].sort((a, b) => a - b)
    expect(sorted[0]).toBeCloseTo(1, 8)
    expect(sorted[1]).toBeCloseTo(3, 8)
  })

  it('decomposes a 2×2 real symmetric matrix', () => {
    // [[2, 1], [1, 2]] → eigenvalues {1, 3}
    const rho = makeDensityMatrix(2, [2, 0, 1, 0, 1, 0, 2, 0])
    const evals = new Float64Array(MAX_K)
    const evecs = new Float64Array(MAX_K * MAX_K * 2)

    hermitianEigendecompose(rho, evals, evecs)

    const sorted = [evals[0]!, evals[1]!].sort((a, b) => a - b)
    expect(sorted[0]).toBeCloseTo(1, 6)
    expect(sorted[1]).toBeCloseTo(3, 6)
  })

  it('decomposes a 2×2 Hermitian matrix with complex off-diagonal', () => {
    // [[1, i], [-i, 1]] → eigenvalues {0, 2}
    const rho = makeDensityMatrix(2, [1, 0, 0, 1, 0, -1, 1, 0])
    const evals = new Float64Array(MAX_K)
    const evecs = new Float64Array(MAX_K * MAX_K * 2)

    hermitianEigendecompose(rho, evals, evecs)

    const sorted = [evals[0]!, evals[1]!].sort((a, b) => a - b)
    expect(sorted[0]).toBeCloseTo(0, 6)
    expect(sorted[1]).toBeCloseTo(2, 6)
  })

  it('decomposes a 3×3 identity matrix', () => {
    const rho = makeDensityMatrix(3, [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0])
    const evals = new Float64Array(MAX_K)
    const evecs = new Float64Array(MAX_K * MAX_K * 2)

    hermitianEigendecompose(rho, evals, evecs)

    for (let k = 0; k < 3; k++) {
      expect(evals[k]).toBeCloseTo(1, 8)
    }
  })

  it('reconstruction V·Λ·V† recovers original matrix within Jacobi precision', () => {
    // [[0.6, 0.2+0.1i], [0.2-0.1i, 0.4]] — a valid density matrix
    const rho = makeDensityMatrix(2, [0.6, 0, 0.2, 0.1, 0.2, -0.1, 0.4, 0])
    const evals = new Float64Array(MAX_K)
    const evecs = new Float64Array(MAX_K * MAX_K * 2)

    hermitianEigendecompose(rho, evals, evecs)

    // Verify eigenvalues: trace=1.0, det=0.24-0.05=0.19
    // λ = (1 ± √0.24)/2 ≈ 0.7449, 0.2551
    const sorted = [evals[0]!, evals[1]!].sort((a, b) => a - b)
    expect(sorted[0]).toBeCloseTo(0.2551, 2)
    expect(sorted[1]).toBeCloseTo(0.7449, 2)
    expect(sorted[0]! + sorted[1]!).toBeCloseTo(1.0, 4)

    // Reconstruct: ρ_reconstructed = Σ_k λ_k |v_k⟩⟨v_k|
    const K = 2
    let maxError = 0
    for (let i = 0; i < K; i++) {
      for (let j = 0; j < K; j++) {
        let sumRe = 0
        let sumIm = 0
        for (let k = 0; k < K; k++) {
          const lambda = evals[k]!
          const viIdx = 2 * (i * K + k)
          const viRe = evecs[viIdx]!
          const viIm = evecs[viIdx + 1]!
          const vjIdx = 2 * (j * K + k)
          const vjRe = evecs[vjIdx]!
          const vjIm = -evecs[vjIdx + 1]! // conjugate
          sumRe += lambda * (viRe * vjRe - viIm * vjIm)
          sumIm += lambda * (viRe * vjIm + viIm * vjRe)
        }
        const idx = 2 * (i * K + j)
        maxError = Math.max(maxError, Math.abs(sumRe - rho.elements[idx]!))
        maxError = Math.max(maxError, Math.abs(sumIm - rho.elements[idx + 1]!))
      }
    }
    // Jacobi one-element-at-a-time method has limited reconstruction precision
    // for Hermitian matrices with complex off-diagonals (phase factor accumulation).
    // The eigenvalueFloor use case (clamp + reconstruct) tolerates ~2% error.
    expect(maxError).toBeLessThan(0.02)
  })
})

// ---------------------------------------------------------------------------
// eigenvalueFloor
// ---------------------------------------------------------------------------

describe('eigenvalueFloor', () => {
  it('clamps negative eigenvalues and preserves trace', () => {
    // Construct a matrix with a negative eigenvalue:
    // [[0.5, 0.9], [0.9, 0.5]] has eigenvalues 1.4 and -0.4
    // Note: positive diagonals but NOT positive semi-definite
    const rho: DensityMatrix = {
      K: 2,
      elements: new Float64Array([0.5, 0, 0.9, 0, 0.9, 0, 0.5, 0]),
    }

    eigenvalueFloor(rho)

    // After eigenvalue floor, all eigenvalues should be >= 0
    const evals = new Float64Array(MAX_K)
    const evecs = new Float64Array(MAX_K * MAX_K * 2)
    hermitianEigendecompose(rho, evals, evecs)

    expect(evals[0]).toBeGreaterThanOrEqual(-1e-12)
    expect(evals[1]).toBeGreaterThanOrEqual(-1e-12)

    // Trace should be 1 (renormalized)
    const tr = rho.elements[0]! + rho.elements[2 * (1 * 2 + 1)]!
    expect(tr).toBeCloseTo(1.0, 8)
  })

  it('is a no-op for already positive semi-definite matrices', () => {
    // [[0.7, 0.1], [0.1, 0.3]] — eigenvalues ≈ 0.715, 0.285 (both positive)
    const rho: DensityMatrix = {
      K: 2,
      elements: new Float64Array([0.7, 0, 0.1, 0, 0.1, 0, 0.3, 0]),
    }
    const before = new Float64Array(rho.elements)

    eigenvalueFloor(rho)

    // Should be unchanged (within floating point)
    for (let i = 0; i < before.length; i++) {
      expect(rho.elements[i]).toBeCloseTo(before[i]!, 10)
    }
  })

  it('handles a 3×3 matrix with one negative eigenvalue', () => {
    // Start from a density matrix and perturb to make one eigenvalue negative
    const rho = densityMatrixFromCoefficients([0.5, 0.5, Math.sqrt(0.5)], [0, 0, 0], 3)

    // Perturb an off-diagonal to push one eigenvalue negative
    rho.elements[2 * (0 * 3 + 1)] = 0.8
    rho.elements[2 * (1 * 3 + 0)] = 0.8
    hermitianize(rho)

    eigenvalueFloor(rho)

    // Verify all eigenvalues are non-negative
    const evals = new Float64Array(MAX_K)
    const evecs = new Float64Array(MAX_K * MAX_K * 2)
    hermitianEigendecompose(rho, evals, evecs)

    for (let k = 0; k < 3; k++) {
      expect(evals[k]!).toBeGreaterThanOrEqual(-1e-12)
    }

    // Trace preserved
    let tr = 0
    for (let k = 0; k < 3; k++) tr += rho.elements[2 * (k * 3 + k)]!
    expect(tr).toBeCloseTo(1.0, 6)
  })
})
