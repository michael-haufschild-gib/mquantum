/**
 * Hydrogen-Specific Lindblad Channels
 *
 * Constructs physics-based Lindblad operators for hydrogen orbital
 * transitions using E1 selection rules and dipole-derived rates.
 *
 * For each allowed transition (i→j with E_i > E_j):
 *   L_down = √γ_down |j⟩⟨i| (spontaneous + stimulated emission)
 *   L_up   = √γ_up   |i⟩⟨j| (thermal absorption)
 *
 * Optional pure dephasing:
 *   L_k = √γ_φ |k⟩⟨k| (uniform dephasing on each basis state)
 *
 * @module lib/physics/openQuantum/hydrogenChannels
 */

import type { HydrogenBasisState } from './hydrogenBasis'
import type { TransitionRate } from './hydrogenRates'
import type { LindbladChannel } from './types'

/**
 * Build Lindblad channels for hydrogen open quantum dynamics.
 *
 * @param basis - Hydrogen basis states
 * @param rates - Physics-derived transition rates
 * @param dephasingRate - Pure dephasing rate γ_φ (≥ 0)
 * @param dephasingEnabled - Whether to include dephasing channels
 * @returns Array of Lindblad channels ready for the master equation
 */
export function buildHydrogenChannels(
  basis: readonly HydrogenBasisState[],
  rates: readonly TransitionRate[],
  dephasingRate: number,
  dephasingEnabled: boolean,
): LindbladChannel[] {
  const channels: LindbladChannel[] = []
  const K = basis.length

  // Emission and absorption channels from physics-derived rates
  for (const rate of rates) {
    // Downward (emission): L = √γ_down |to⟩⟨from|
    if (rate.gammaDown > 0) {
      channels.push({
        row: rate.to,
        col: rate.from,
        amplitudeRe: Math.sqrt(rate.gammaDown),
        amplitudeIm: 0,
      })
    }

    // Upward (absorption): L = √γ_up |from⟩⟨to|
    if (rate.gammaUp > 0) {
      channels.push({
        row: rate.from,
        col: rate.to,
        amplitudeRe: Math.sqrt(rate.gammaUp),
        amplitudeIm: 0,
      })
    }
  }

  // Pure dephasing: L_k = √γ_φ |k⟩⟨k| for each k
  if (dephasingEnabled && dephasingRate > 0) {
    const amp = Math.sqrt(dephasingRate)
    for (let k = 0; k < K; k++) {
      channels.push({
        row: k,
        col: k,
        amplitudeRe: amp,
        amplitudeIm: 0,
      })
    }
  }

  return channels
}
