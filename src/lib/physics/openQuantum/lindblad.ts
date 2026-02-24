/**
 * Open Quantum Systems — Lindblad dissipator
 *
 * Implements the dissipative part of the GKLS master equation:
 *   D[L](ρ) = L ρ L† − ½ {L†L, ρ}
 *
 * Exploits rank-1 structure of our operators (L = a|row⟩⟨col|) for O(K²) per channel.
 */

import type { DensityMatrix, LindbladChannel } from './types'

/**
 * Apply the Lindblad dissipator D[L](ρ) for a single rank-1 channel L = a|r⟩⟨c|
 * and accumulate into the output matrix `dRho`.
 *
 * For L = a|r⟩⟨c|:
 *   L ρ L† = |a|² ρ_{cc} |r⟩⟨r|
 *   L†L = |a|² |c⟩⟨c|
 *   {L†L, ρ}_{kl} = |a|² (δ_{kc} ρ_{cl} + ρ_{kc} δ_{cl})
 *
 * So: D[L](ρ)_{kl} = |a|² ρ_{cc} δ_{kr} δ_{lr}
 *                    − ½ |a|² (δ_{kc} ρ_{cl} + ρ_{kc} δ_{cl})
 *
 * @param ch - Rank-1 Lindblad channel L = a|row⟩⟨col|
 * @param rho - Current density matrix (read-only)
 * @param dRho - Accumulator for dρ/dt (mutated in place)
 */
export function applyDissipator(
  ch: LindbladChannel,
  rho: DensityMatrix,
  dRho: DensityMatrix,
): void {
  const { row: r, col: c, amplitudeRe: aRe, amplitudeIm: aIm } = ch
  const K = rho.K
  const rhoEl = rho.elements
  const dEl = dRho.elements

  // |a|² = aRe² + aIm² (real scalar)
  const aSq = aRe * aRe + aIm * aIm

  // ρ_{cc} (diagonal element, always real for Hermitian ρ but we keep Re part)
  const rho_cc_re = rhoEl[2 * (c * K + c)]!

  // Term 1: L ρ L† = |a|² ρ_{cc} |r⟩⟨r|
  // Only contributes to (r, r) element
  dEl[2 * (r * K + r)] = dEl[2 * (r * K + r)]! + aSq * rho_cc_re

  // Term 2: −½ {L†L, ρ} where L†L = |a|² |c⟩⟨c|
  // −½ |a|² (δ_{kc} ρ_{cl} + ρ_{kc} δ_{cl})
  //
  // Row c: −½ |a|² ρ_{cl} for all l
  // Col c: −½ |a|² ρ_{kc} for all k
  const halfASq = 0.5 * aSq

  for (let l = 0; l < K; l++) {
    const idxCL = 2 * (c * K + l)
    // −½ |a|² ρ_{cl}  →  applied to row c
    dEl[idxCL] = dEl[idxCL]! - halfASq * rhoEl[idxCL]!
    dEl[idxCL + 1] = dEl[idxCL + 1]! - halfASq * rhoEl[idxCL + 1]!
  }

  for (let k = 0; k < K; k++) {
    const idxKC = 2 * (k * K + c)
    // −½ |a|² ρ_{kc}  →  applied to col c
    dEl[idxKC] = dEl[idxKC]! - halfASq * rhoEl[idxKC]!
    dEl[idxKC + 1] = dEl[idxKC + 1]! - halfASq * rhoEl[idxKC + 1]!
  }

  // Note: row c, col c gets subtracted twice (once from each loop), total −|a|² ρ_{cc}
  // Combined with Term 1, the net (r,r) contribution when r≠c is +|a|² ρ_{cc}
  // and the net (c,c) contribution is −|a|² ρ_{cc}, conserving trace.
}

/**
 * Compute the total dissipative contribution dρ/dt = Σ_j D[L_j](ρ)
 * from all Lindblad channels.
 *
 * @param channels - Array of rank-1 Lindblad channels
 * @param rho - Current density matrix
 * @param dRho - Output accumulator (must be pre-zeroed)
 */
export function computeDissipator(
  channels: readonly LindbladChannel[],
  rho: DensityMatrix,
  dRho: DensityMatrix,
): void {
  for (let j = 0; j < channels.length; j++) {
    applyDissipator(channels[j]!, rho, dRho)
  }
}
