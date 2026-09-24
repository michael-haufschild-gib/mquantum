/**
 * Open Quantum Systems — Lindblad channel construction
 *
 * Builds sparse rank-1 Lindblad operators from physical decoherence parameters.
 *
 * Channels:
 *  - **Dephasing**: L_k = √γ_φ |k⟩⟨k|  — destroys off-diagonal coherences
 *  - **Relaxation**: L_{k→g} = √γ_down |g⟩⟨k|  — decays population to ground state g
 *  - **Thermal**: L_{g→k} = √γ_up |k⟩⟨g|  — excites population from ground state g
 *
 * g is the lowest-energy basis state. Energy-sorted bases (hydrogen) have
 * g = 0; the HO basis follows the preset's term order, so its caller passes
 * {@link lowestEnergyIndex}.
 */

import type { LindbladChannel, OpenQuantumConfig } from './types'

/** Helper: reject non-finite or non-positive rates at the API boundary. */
const isPositiveFiniteRate = (x: number): boolean => Number.isFinite(x) && x > 0

/**
 * Index of the lowest-energy basis state (first one on ties).
 *
 * @param energies - Per-basis-state energies
 * @returns Ground-state index (0 when no energy is finite)
 */
export function lowestEnergyIndex(energies: ArrayLike<number>): number {
  let ground = 0
  let groundEnergy = Number.POSITIVE_INFINITY
  for (let k = 0; k < energies.length; k++) {
    const e = energies[k]!
    if (Number.isFinite(e) && e < groundEnergy) {
      groundEnergy = e
      ground = k
    }
  }
  return ground
}

/**
 * Build the complete set of Lindblad channels from the open quantum configuration.
 *
 * ## Rate gating
 * Each block is gated by the paired `<channel>Enabled` flag AND an
 * `isFinite(rate) && rate > 0` check. Non-finite or non-positive rates
 * are rejected here so they cannot cascade to NaN amplitudes downstream.
 *   - Zero rate ⇒ silently skipped (equivalent to `Enabled: false`).
 *   - Negative rate ⇒ silently skipped (physically meaningless).
 *   - `NaN`/`Infinity` rate ⇒ silently skipped.
 *
 * @param config - Open quantum system configuration
 * @param K - Number of basis states (term count)
 * @param groundIndex - Lowest-energy basis state (relaxation target, thermal source)
 * @returns Array of sparse rank-1 Lindblad operators
 */
export function buildLindbladChannels(
  config: OpenQuantumConfig,
  K: number,
  groundIndex: number = 0
): LindbladChannel[] {
  const channels: LindbladChannel[] = []
  const g = Number.isInteger(groundIndex) && groundIndex >= 0 && groundIndex < K ? groundIndex : 0

  // Dephasing: L_k = √γ_φ |k⟩⟨k| for each k
  // Each projector |k⟩⟨k| causes pure dephasing of off-diagonal elements
  if (config.dephasingEnabled && isPositiveFiniteRate(config.dephasingRate)) {
    const amp = Math.sqrt(config.dephasingRate)
    for (let k = 0; k < K; k++) {
      channels.push({ row: k, col: k, amplitudeRe: amp, amplitudeIm: 0 })
    }
  }

  // Relaxation: L_{k→g} = √γ_down |g⟩⟨k| for each k≠g
  // Causes spontaneous decay from excited states to ground state
  if (config.relaxationEnabled && isPositiveFiniteRate(config.relaxationRate)) {
    const amp = Math.sqrt(config.relaxationRate)
    for (let k = 0; k < K; k++) {
      if (k === g) continue
      channels.push({ row: g, col: k, amplitudeRe: amp, amplitudeIm: 0 })
    }
  }

  // Thermal excitation: L_{g→k} = √γ_up |k⟩⟨g| for each k≠g
  // Causes thermal excitation from ground state to excited states
  if (config.thermalEnabled && isPositiveFiniteRate(config.thermalUpRate)) {
    const amp = Math.sqrt(config.thermalUpRate)
    for (let k = 0; k < K; k++) {
      if (k === g) continue
      channels.push({ row: k, col: g, amplitudeRe: amp, amplitudeIm: 0 })
    }
  }

  return channels
}
