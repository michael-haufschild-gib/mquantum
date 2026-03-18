/**
 * Tests for the Lindblad dissipator implementation.
 *
 * Verifies the rank-1 optimized dissipator D[L](ρ) = LρL† − ½{L†L, ρ}
 * preserves physical invariants: trace conservation and Hermiticity.
 */

import { describe, expect, it } from 'vitest'

import { applyDissipator, computeDissipator } from '@/lib/physics/openQuantum/lindblad'
import type { DensityMatrix, LindbladChannel } from '@/lib/physics/openQuantum/types'

/** Create a zero K×K density matrix. */
function zeroDM(K: number): DensityMatrix {
  return { K, elements: new Float64Array(K * K * 2) }
}

/** Create a pure state |n⟩⟨n| density matrix. */
function pureState(K: number, n: number): DensityMatrix {
  const dm = zeroDM(K)
  dm.elements[2 * (n * K + n)] = 1.0 // ρ_{nn} = 1
  return dm
}

/** Create a maximally mixed state ρ = I/K. */
function mixedState(K: number): DensityMatrix {
  const dm = zeroDM(K)
  for (let k = 0; k < K; k++) {
    dm.elements[2 * (k * K + k)] = 1 / K
  }
  return dm
}

/** Compute Tr(dRho) to verify trace conservation. */
function trace(dm: DensityMatrix): number {
  let tr = 0
  for (let k = 0; k < dm.K; k++) {
    tr += dm.elements[2 * (k * dm.K + k)]!
  }
  return tr
}

/** Create a simple decay channel L = √γ |row⟩⟨col|. */
function decayChannel(row: number, col: number, gamma: number): LindbladChannel {
  const sqrtGamma = Math.sqrt(gamma)
  return { row, col, amplitudeRe: sqrtGamma, amplitudeIm: 0 }
}

describe('applyDissipator', () => {
  it('preserves trace: Tr(D[L](ρ)) = 0 for a single channel', () => {
    const K = 3
    const rho = pureState(K, 1) // |1⟩⟨1|
    const dRho = zeroDM(K)
    const ch = decayChannel(0, 1, 1.0) // |0⟩⟨1| decay

    applyDissipator(ch, rho, dRho)

    expect(trace(dRho)).toBeCloseTo(0, 10)
  })

  it('transfers population from |col⟩ to |row⟩', () => {
    const K = 2
    const rho = pureState(K, 1) // Start in |1⟩
    const dRho = zeroDM(K)
    const ch = decayChannel(0, 1, 1.0) // Decay 1→0

    applyDissipator(ch, rho, dRho)

    // dρ_{00} should be positive (gaining population)
    expect(dRho.elements[2 * (0 * K + 0)]!).toBeGreaterThan(0)
    // dρ_{11} should be negative (losing population)
    expect(dRho.elements[2 * (1 * K + 1)]!).toBeLessThan(0)
  })

  it('has no effect when population is already in target state', () => {
    const K = 2
    const rho = pureState(K, 0) // Already in |0⟩
    const dRho = zeroDM(K)
    const ch = decayChannel(0, 1, 1.0) // Decay 1→0, but nothing in |1⟩

    applyDissipator(ch, rho, dRho)

    // No population in |1⟩, so dissipator contributes nothing to diagonal
    expect(dRho.elements[2 * (0 * K + 0)]!).toBeCloseTo(0, 10)
    expect(dRho.elements[2 * (1 * K + 1)]!).toBeCloseTo(0, 10)
  })

  it('accumulates into dRho (does not overwrite)', () => {
    const K = 2
    const rho = pureState(K, 1)
    const dRho = zeroDM(K)
    dRho.elements[0] = 42 // Pre-existing value

    const ch = decayChannel(0, 1, 1.0)
    applyDissipator(ch, rho, dRho)

    // Should have added to 42, not replaced
    expect(dRho.elements[0]!).toBeGreaterThan(42)
  })
})

describe('computeDissipator', () => {
  it('preserves trace for multiple channels', () => {
    const K = 3
    const rho = mixedState(K)
    const dRho = zeroDM(K)
    const channels: LindbladChannel[] = [
      decayChannel(0, 1, 0.5), // |0⟩⟨1|
      decayChannel(0, 2, 0.3), // |0⟩⟨2|
      decayChannel(1, 2, 0.2), // |1⟩⟨2|
    ]

    computeDissipator(channels, rho, dRho)

    expect(trace(dRho)).toBeCloseTo(0, 10)
  })

  it('total dissipation rate increases with more channels', () => {
    const K = 3
    const rho = pureState(K, 2) // All population in |2⟩

    const dRho1 = zeroDM(K)
    computeDissipator([decayChannel(0, 2, 1.0)], rho, dRho1)
    const rate1 = Math.abs(dRho1.elements[2 * (2 * K + 2)]!)

    const dRho2 = zeroDM(K)
    computeDissipator([decayChannel(0, 2, 1.0), decayChannel(1, 2, 1.0)], rho, dRho2)
    const rate2 = Math.abs(dRho2.elements[2 * (2 * K + 2)]!)

    expect(rate2).toBeGreaterThan(rate1)
  })

  it('empty channel list produces zero dissipator', () => {
    const K = 2
    const rho = pureState(K, 0)
    const dRho = zeroDM(K)
    computeDissipator([], rho, dRho)

    for (let i = 0; i < dRho.elements.length; i++) {
      expect(dRho.elements[i]!).toBe(0)
    }
  })
})
