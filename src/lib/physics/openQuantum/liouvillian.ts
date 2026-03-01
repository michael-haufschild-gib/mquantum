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
  K: number,
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
  // For each rank-1 Lindblad operator L_r = amp_r |a⟩⟨b| where a=row, b=col:
  //
  // D[L_r](ρ)_{kl} = amp_r amp_r* (δ_{ka} δ_{la} ρ_{bb}
  //                  - 0.5 δ_{kb} ρ_{al} - 0.5 ρ_{ka} δ_{bl})  ... simplified wrong
  //
  // Actually the full dissipator is:
  // D[L](ρ) = L ρ L† - 0.5{L†L, ρ}
  //
  // For L = α|a⟩⟨b|:
  //   L ρ L† = |α|² |a⟩⟨b|ρ|b⟩⟨a| = |α|² ρ_{bb} |a⟩⟨a|
  //   L†L = |α|² |b⟩⟨b|
  //   {L†L, ρ} = |α|² (|b⟩⟨b|ρ + ρ|b⟩⟨b|)
  //
  // So D[L](ρ)_{kl} = |α|² [δ_{ka} δ_{la} ρ_{bb}
  //                    - 0.5 δ_{kb} ρ_{bl} - 0.5 ρ_{kb} δ_{lb}]
  //
  // Wait, let me be more careful:
  // (L ρ L†)_{kl} = |α|² ⟨k|a⟩⟨b|ρ|b⟩⟨a|l⟩ = |α|² δ_{ka} δ_{la} ρ_{bb}
  // (L†L ρ)_{kl} = |α|² ⟨k|b⟩⟨b|ρ|·⟩ → |α|² δ_{kb} ρ_{bl}
  // (ρ L†L)_{kl} = |α|² ⟨·|ρ|b⟩⟨b|l⟩ → |α|² ρ_{kb} δ_{bl}
  //
  // D[L](ρ)_{kl} = |α|² [δ_{ka} δ_{la} ρ_{bb}
  //                 - 0.5 δ_{kb} ρ_{bl} - 0.5 ρ_{kb} δ_{bl}]
  //
  // In the vectorized form L · vec(ρ):
  // The superoperator element L[kl, mn] gives the coefficient of ρ_{mn} in dρ_{kl}/dt.
  //
  // Term 1: δ_{ka} δ_{la} ρ_{bb} → contributes to L[a*K+a, b*K+b] += |α|²
  // Term 2: -0.5 δ_{kb} ρ_{bl} → contributes to L[k*K+l, b*K+l] -= 0.5|α|² for k=b
  //         i.e., L[b*K+l, b*K+l] -= 0.5|α|² for all l
  // Term 3: -0.5 ρ_{kb} δ_{bl} → contributes to L[k*K+l, k*K+b] -= 0.5|α|² for l=b
  //         i.e., L[k*K+b, k*K+b] -= 0.5|α|² for all k

  // Wait, I need to reconsider. Let me use the correct (but general) amplitude.
  // Actually, for complex amplitude: L = (αr + i·αi)|a⟩⟨b|
  // |α|² = αr² + αi²
  // All the dissipator terms only depend on |α|², not on the phase of α.

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
