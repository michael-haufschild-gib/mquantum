/**
 * Tests for the Liouvillian superoperator construction.
 *
 * Verifies that the K²×K² Liouvillian L satisfies:
 *   d(vec(ρ))/dt = L · vec(ρ)
 * with correct Hamiltonian and dissipative parts.
 */

import { describe, expect, it } from 'vitest'

import { MAX_K } from '@/lib/physics/openQuantum/integrator'
import { buildLiouvillian } from '@/lib/physics/openQuantum/liouvillian'
import type { LindbladChannel } from '@/lib/physics/openQuantum/types'

/** Compute Tr(L) — sum of diagonal entries (real part only for quick trace check). */
function traceSuperop(L: { real: Float64Array; imag: Float64Array }, N: number): number {
  let tr = 0
  for (let i = 0; i < N; i++) {
    tr += L.real[i * N + i]!
  }
  return tr
}

describe('buildLiouvillian', () => {
  it('rejects invalid inputs before constructing a malformed superoperator', () => {
    expect(() => buildLiouvillian(new Float64Array([0]), [], 0)).toThrow(
      'K must be a positive integer'
    )
    expect(() => buildLiouvillian(new Float64Array(MAX_K + 1), [], MAX_K + 1)).toThrow(
      `K=${MAX_K + 1} exceeds MAX_K=${MAX_K}`
    )
    expect(() => buildLiouvillian(new Float64Array([0]), [], 2)).toThrow(
      'energies length must be >= K (2), got 1'
    )
    expect(() =>
      buildLiouvillian(
        new Float64Array([0, 1]),
        [{ row: 0, col: 2, amplitudeRe: 1, amplitudeIm: 0 }],
        2
      )
    ).toThrow('channel 0 index out of range for K=2')
  })

  describe('Hamiltonian part (no dissipation)', () => {
    it('produces purely imaginary diagonal for two-level system', () => {
      const energies = new Float64Array([0, 1.0])
      const L = buildLiouvillian(energies, [], 2)
      const N = 4

      // L_H is diagonal: L[kl,kl] = -i(E_k - E_l)
      // (0,0) → -i(0-0) = 0
      expect(L.real[0 * N + 0]).toBeCloseTo(0, 10)
      expect(L.imag[0 * N + 0]).toBeCloseTo(0, 10)

      // (0,1) → -i(0-1) = i → imag = 1
      expect(L.real[1 * N + 1]).toBeCloseTo(0, 10)
      expect(L.imag[1 * N + 1]).toBeCloseTo(1, 10)

      // (1,0) → -i(1-0) = -i → imag = -1
      expect(L.real[2 * N + 2]).toBeCloseTo(0, 10)
      expect(L.imag[2 * N + 2]).toBeCloseTo(-1, 10)

      // (1,1) → -i(1-1) = 0
      expect(L.real[3 * N + 3]).toBeCloseTo(0, 10)
      expect(L.imag[3 * N + 3]).toBeCloseTo(0, 10)
    })

    it('diagonal elements have zero real part (unitary evolution)', () => {
      const energies = new Float64Array([0.5, 1.5, 2.5])
      const L = buildLiouvillian(energies, [], 3)
      const N = 9

      for (let i = 0; i < N; i++) {
        expect(L.real[i * N + i]).toBe(0)
      }
    })

    it('off-diagonal elements are zero for diagonal Hamiltonian', () => {
      const energies = new Float64Array([0, 1, 2])
      const L = buildLiouvillian(energies, [], 3)
      const N = 9

      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          if (i !== j) {
            expect(L.real[i * N + j]).toBe(0)
            expect(L.imag[i * N + j]).toBe(0)
          }
        }
      }
    })
  })

  describe('Dissipative part', () => {
    it('adds real entries from Lindblad channels', () => {
      const energies = new Float64Array([0, 0]) // Degenerate (no Hamiltonian contribution)
      const channels: LindbladChannel[] = [{ row: 0, col: 1, amplitudeRe: 1.0, amplitudeIm: 0 }]
      const L = buildLiouvillian(energies, channels, 2)
      const N = 4

      // Term 1: L[a*K+a, b*K+b] += |α|² → L[0, 3] += 1
      expect(L.real[0 * N + 3]).toBeCloseTo(1.0, 10)
    })

    it('trace of real part of L is ≤ 0 (dissipation removes population)', () => {
      const energies = new Float64Array([0, 1])
      const channels: LindbladChannel[] = [
        { row: 0, col: 1, amplitudeRe: Math.sqrt(0.5), amplitudeIm: 0 },
      ]
      const L = buildLiouvillian(energies, channels, 2)

      const realTrace = traceSuperop(L, 4)
      expect(realTrace).toBeLessThanOrEqual(1e-10)
    })
  })

  describe('Combined Liouvillian', () => {
    it('K²×K² matrix has correct dimensions', () => {
      const K = 4
      const energies = new Float64Array(K).fill(0).map((_, i) => i * 0.5)
      const L = buildLiouvillian(energies, [], K)
      const N = K * K

      expect(L.real.length).toBe(N * N)
      expect(L.imag.length).toBe(N * N)
    })

    it('degenerate energies with no channels produces zero Liouvillian', () => {
      const energies = new Float64Array([1, 1, 1])
      const L = buildLiouvillian(energies, [], 3)
      const N = 9

      for (let i = 0; i < N * N; i++) {
        expect(L.real[i]).toBeCloseTo(0, 10)
        expect(L.imag[i]).toBeCloseTo(0, 10)
      }
    })
  })
})
