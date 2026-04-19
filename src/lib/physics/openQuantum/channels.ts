/**
 * Open Quantum Systems — Lindblad channel construction
 *
 * Builds sparse rank-1 Lindblad operators from physical decoherence parameters.
 *
 * Channels:
 *  - **Dephasing**: L_k = √γ_φ |k⟩⟨k|  — destroys off-diagonal coherences
 *  - **Relaxation**: L_{k→0} = √γ_down |0⟩⟨k|  — decays population to ground state
 *  - **Thermal**: L_{0→k} = √γ_up |k⟩⟨0|  — excites population from ground state
 */

import type { LindbladChannel, OpenQuantumConfig } from './types'

/** Helper: reject non-finite or non-positive rates at the API boundary. */
const isPositiveFiniteRate = (x: number): boolean => Number.isFinite(x) && x > 0

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
 * @returns Array of sparse rank-1 Lindblad operators
 */
export function buildLindbladChannels(config: OpenQuantumConfig, K: number): LindbladChannel[] {
  const channels: LindbladChannel[] = []

  // Dephasing: L_k = √γ_φ |k⟩⟨k| for each k
  // Each projector |k⟩⟨k| causes pure dephasing of off-diagonal elements
  if (config.dephasingEnabled && isPositiveFiniteRate(config.dephasingRate)) {
    const amp = Math.sqrt(config.dephasingRate)
    for (let k = 0; k < K; k++) {
      channels.push({ row: k, col: k, amplitudeRe: amp, amplitudeIm: 0 })
    }
  }

  // Relaxation: L_{k→0} = √γ_down |0⟩⟨k| for each k>0
  // Causes spontaneous decay from excited states to ground state
  if (config.relaxationEnabled && isPositiveFiniteRate(config.relaxationRate)) {
    const amp = Math.sqrt(config.relaxationRate)
    for (let k = 1; k < K; k++) {
      channels.push({ row: 0, col: k, amplitudeRe: amp, amplitudeIm: 0 })
    }
  }

  // Thermal excitation: L_{0→k} = √γ_up |k⟩⟨0| for each k>0
  // Causes thermal excitation from ground state to excited states
  if (config.thermalEnabled && isPositiveFiniteRate(config.thermalUpRate)) {
    const amp = Math.sqrt(config.thermalUpRate)
    for (let k = 1; k < K; k++) {
      channels.push({ row: k, col: 0, amplitudeRe: amp, amplitudeIm: 0 })
    }
  }

  return channels
}
