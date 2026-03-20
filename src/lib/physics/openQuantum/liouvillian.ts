/**
 * Liouvillian Superoperator
 *
 * Constructs the K²×K² Liouvillian matrix L such that:
 *   d(vec(ρ))/dt = L · vec(ρ)
 *
 * where vec(ρ) stacks rows of ρ into a vector (row-major vectorization: vec(ρ)[k*K + l] = ρ_{kl}).
 *
 * The Liouvillian has two parts:
 *   L = L_H + L_D
 *
 * Hamiltonian part (diagonal H in energy eigenbasis):
 *   L_H = -i(H ⊗ I - I ⊗ H^T)
 *   In energy eigenbasis: L_H[kl, mn] = -i(E_k - E_l) δ_{km} δ_{ln}
 *
 * Dissipative part (sum over Lindblad operators):
 *   L_D = Σ_r (L_r ⊗ L_r* - 0.5(L_r†L_r ⊗ I + I ⊗ L_r^T L_r*))
 *
 * @module lib/physics/openQuantum/liouvillian
 */

import type { ComplexMatrix } from './complexMatrix'
import { complexMatZero } from './complexMatrix'
import type { LindbladChannel } from './types'

/**
 * Build the Liouvillian superoperator from energies and Lindblad channels.
 *
 * The density matrix ρ (K×K) is vectorized as vec(ρ) of length K² using
 * row-major ordering: vec(ρ)[k*K + l] = ρ_{kl}.
 *
 * The Liouvillian L is a K²×K² complex matrix such that:
 *   d(vec(ρ))/dt = L · vec(ρ)
 *
 * @param energies - Energy eigenvalues (length K)
 * @param channels - Lindblad operators (rank-1: L_r = amp_r |row_r⟩⟨col_r|)
 * @param K - Basis dimension
 * @returns K²×K² Liouvillian as ComplexMatrix
 */
export function buildLiouvillian(
  energies: Float64Array,
  channels: readonly LindbladChannel[],
  K: number
): ComplexMatrix {
  const N = K * K
  const L = complexMatZero(N)

  // --- Hamiltonian part ---
  // For diagonal H, the unitary generator is:
  // L_H[kl, mn] = -i(E_k - E_l) · δ_{km} · δ_{ln}
  // This means: d(ρ_{kl})/dt |_H = -i(E_k - E_l) ρ_{kl}
  // In vec(ρ) indexing with row-major: index = k*K + l
  // L_H is diagonal: L_H[k*K+l, k*K+l] = -i(E_k - E_l)
  for (let k = 0; k < K; k++) {
    for (let l = 0; l < K; l++) {
      const idx = k * K + l
      // -i(E_k - E_l) → real part = 0, imag part = -(E_k - E_l)
      L.imag[idx * N + idx] = -(energies[k]! - energies[l]!)
    }
  }

  // --- Dissipative part ---
  // Each rank-1 Lindblad operator L = α|a⟩⟨b| yields:
  //
  //   L ρ L†  = |α|² ρ_{bb} |a⟩⟨a|
  //   L†L     = |α|² |b⟩⟨b|
  //
  // Lindblad dissipator D[L](ρ) = L ρ L† − ½{L†L, ρ} in components:
  //
  //   D[L](ρ)_{kl} = |α|² [ δ_{ka} δ_{la} ρ_{bb}
  //                        − ½ δ_{kb} ρ_{bl}
  //                        − ½ ρ_{kb} δ_{bl} ]
  //
  // Superoperator L_D[kl, mn] = coefficient of ρ_{mn} in dρ_{kl}/dt:
  //
  //   Term 1: δ_{ka}δ_{la}ρ_{bb}  →  L[a*K+a, b*K+b] += |α|²
  //   Term 2: −½ δ_{kb} ρ_{bl}    →  L[b*K+l, b*K+l] -= ½|α|²  ∀l
  //   Term 3: −½ ρ_{kb} δ_{bl}    →  L[k*K+b, k*K+b] -= ½|α|²  ∀k
  //
  // Phase of α cancels — all terms depend only on |α|².

  for (const ch of channels) {
    const a = ch.row
    const b = ch.col
    const ampSq = ch.amplitudeRe * ch.amplitudeRe + ch.amplitudeIm * ch.amplitudeIm

    // Term 1: L[a*K+a, b*K+b] += |α|²  (real part only)
    const row1 = a * K + a
    const col1 = b * K + b
    L.real[row1 * N + col1] = L.real[row1 * N + col1]! + ampSq

    // Term 2: L[b*K+l, b*K+l] -= 0.5|α|² for all l
    for (let l = 0; l < K; l++) {
      const idx2 = b * K + l
      L.real[idx2 * N + idx2] = L.real[idx2 * N + idx2]! - 0.5 * ampSq
    }

    // Term 3: L[k*K+b, k*K+b] -= 0.5|α|² for all k
    for (let k = 0; k < K; k++) {
      const idx3 = k * K + b
      L.real[idx3 * N + idx3] = L.real[idx3 * N + idx3]! - 0.5 * ampSq
    }
  }

  return L
}
