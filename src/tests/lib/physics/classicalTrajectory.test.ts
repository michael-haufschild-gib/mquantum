/**
 * Unit tests for classical-quantum correspondence overlay physics.
 *
 * Verifies the energy-shell Lissajous trajectory model:
 * - Amplitude A_i = sqrt(2 * <E_i> / omega_i^2) for each dimension
 * - Trajectory x_i(t) = A_i * cos(omega_i * t) forms an N-D Lissajous
 * - Period T = 2*pi / min(omega) for the full Lissajous cycle
 *
 * @module tests/lib/physics/classicalTrajectory
 */

import { describe, expect, it } from 'vitest'

/**
 * Compute the classical energy-shell amplitude for dimension i.
 * This is the CPU-side reference for what the WGSL shader computes.
 *
 * @param quantumNumbers - Array of quantum numbers per term per dimension: n[k][i]
 * @param coefficients - Array of complex coefficients per term: [re, im]
 * @param omega - Frequency for this dimension
 * @returns Classical amplitude A_i
 */
function classicalAmplitude(
  quantumNumbers: number[],
  coefficients: [number, number][],
  omega: number
): number {
  let avgEnergy = 0
  let totalWeight = 0
  for (let k = 0; k < quantumNumbers.length; k++) {
    const [re, im] = coefficients[k]!
    const weight = re * re + im * im
    avgEnergy += weight * (quantumNumbers[k]! + 0.5)
    totalWeight += weight
  }
  if (totalWeight > 0) {
    avgEnergy /= totalWeight
  }
  return Math.sqrt(Math.max((2 * avgEnergy) / Math.max(omega, 0.01), 0))
}

/**
 * Compute the full N-D Lissajous trajectory position at time t.
 *
 * @param t - Time parameter
 * @param amplitudes - Per-dimension classical amplitudes
 * @param omegas - Per-dimension angular frequencies
 * @returns N-D position array
 */
function lissajousPosition(t: number, amplitudes: number[], omegas: number[]): number[] {
  return amplitudes.map((a, i) => a * Math.cos(omegas[i]! * t))
}

describe('classicalTrajectory', () => {
  describe('classicalAmplitude', () => {
    it('returns correct amplitude for ground state (n=0)', () => {
      const omega = 1.0
      // Ground state: E = 0.5 * omega, A = sqrt(2 * 0.5 / 1.0) = 1.0
      const a = classicalAmplitude([0], [[1, 0]], omega)
      expect(a).toBeCloseTo(1.0, 8)
    })

    it('returns correct amplitude for first excited state (n=1)', () => {
      const omega = 1.0
      // n=1: E = 1.5 * omega, A = sqrt(2 * 1.5 / 1.0) = sqrt(3)
      const a = classicalAmplitude([1], [[1, 0]], omega)
      expect(a).toBeCloseTo(Math.sqrt(3), 8)
    })

    it('scales amplitude with omega', () => {
      const omega = 2.0
      // n=0: ⟨n+0.5⟩ = 0.5, A = sqrt(2 * 0.5 / 2.0) = sqrt(0.5) ≈ 0.707
      const a = classicalAmplitude([0], [[1, 0]], omega)
      expect(a).toBeCloseTo(Math.sqrt(0.5), 8)
    })

    it('computes weighted average for superposition', () => {
      const omega = 1.0
      // Equal superposition of n=0 and n=2: ⟨n + 0.5⟩ = 0.5 * (0.5 + 2.5) = 1.5
      // A = sqrt(2 * 1.5 / 1.0) = sqrt(3)
      const c = 1 / Math.sqrt(2)
      const a = classicalAmplitude(
        [0, 2],
        [
          [c, 0],
          [c, 0],
        ],
        omega
      )
      expect(a).toBeCloseTo(Math.sqrt(3), 8)
    })

    it('handles complex coefficients correctly', () => {
      const omega = 1.0
      // Single term with complex coefficient (0.6 + 0.8i): |c|^2 = 1.0
      const a = classicalAmplitude([3], [[0.6, 0.8]], omega)
      // n=3: E = 3.5, A = sqrt(7)
      expect(a).toBeCloseTo(Math.sqrt(7), 8)
    })

    it('respects coefficient weights in superposition', () => {
      const omega = 1.0
      // Unequal superposition: c0 = sqrt(0.75), c1 = sqrt(0.25)
      // ⟨n + 0.5⟩ = 0.75 * 0.5 + 0.25 * 1.5 = 0.375 + 0.375 = 0.75
      // A = sqrt(2 * 0.75) = sqrt(1.5)
      const a = classicalAmplitude(
        [0, 1],
        [
          [Math.sqrt(0.75), 0],
          [Math.sqrt(0.25), 0],
        ],
        omega
      )
      expect(a).toBeCloseTo(Math.sqrt(1.5), 8)
    })
  })

  describe('lissajousPosition', () => {
    it('starts at maximum displacement (t=0)', () => {
      const amplitudes = [2.0, 3.0, 1.0]
      const omegas = [1.0, 1.0, 1.0]
      const pos = lissajousPosition(0, amplitudes, omegas)
      expect(pos[0]).toBeCloseTo(2.0, 8)
      expect(pos[1]).toBeCloseTo(3.0, 8)
      expect(pos[2]).toBeCloseTo(1.0, 8)
    })

    it('returns to origin at quarter period for equal omegas', () => {
      const amplitudes = [1.0, 1.0]
      const omegas = [1.0, 1.0]
      const pos = lissajousPosition(Math.PI / 2, amplitudes, omegas)
      expect(pos[0]).toBeCloseTo(0.0, 8)
      expect(pos[1]).toBeCloseTo(0.0, 8)
    })

    it('traces figure-8 for 2:1 frequency ratio', () => {
      const amplitudes = [1.0, 1.0]
      const omegas = [1.0, 2.0]
      // At t=0: (1, 1)
      const p0 = lissajousPosition(0, amplitudes, omegas)
      expect(p0[0]).toBeCloseTo(1.0, 8)
      expect(p0[1]).toBeCloseTo(1.0, 8)

      // At t=pi/2: (0, -1)
      const p1 = lissajousPosition(Math.PI / 2, amplitudes, omegas)
      expect(p1[0]).toBeCloseTo(0.0, 8)
      expect(p1[1]).toBeCloseTo(-1.0, 8)
    })

    it('is periodic with period 2*pi/min(omega)', () => {
      const amplitudes = [1.0, 1.0, 1.0]
      const omegas = [1.0, 2.0, 3.0]
      const period = (2 * Math.PI) / Math.min(...omegas)
      const p0 = lissajousPosition(0, amplitudes, omegas)
      const pT = lissajousPosition(period, amplitudes, omegas)
      for (let i = 0; i < 3; i++) {
        expect(pT[i]).toBeCloseTo(p0[i]!, 6)
      }
    })
  })

  describe('energy conservation', () => {
    it('classical orbit energy matches quantum expectation value', () => {
      // For HO: E_classical = 0.5 * omega^2 * A^2 = omega * ⟨n + 0.5⟩
      const omega = 1.5
      const quantumNumbers = [2, 4]
      const c = 1 / Math.sqrt(2)
      const coefficients: [number, number][] = [
        [c, 0],
        [c, 0],
      ]

      const a = classicalAmplitude(quantumNumbers, coefficients, omega)
      const classicalEnergy = 0.5 * omega * omega * a * a

      // Expected: omega * ⟨n + 0.5⟩ = 1.5 * (0.5 * (2.5 + 4.5)) = 1.5 * 3.5 = 5.25
      const quantumEnergy =
        omega *
        quantumNumbers.reduce(
          (sum, n, k) => sum + (coefficients[k]![0] ** 2 + coefficients[k]![1] ** 2) * (n + 0.5),
          0
        )

      expect(classicalEnergy).toBeCloseTo(quantumEnergy, 8)
    })
  })
})
