/**
 * Hydrogen Transition Rates
 *
 * Computes Einstein A coefficients, thermal occupation numbers, and
 * detailed-balance transition rates for hydrogen orbital transitions.
 *
 * Uses atomic units (ℏ = 1, e = 1, mₑ = 1, a₀ = 1) with:
 *   - Fine structure constant α ≈ 1/137
 *   - Energy unit E_h = 27.2 eV
 *   - Time unit ℏ/E_h ≈ 2.42 × 10⁻¹⁷ s
 *
 * @module lib/physics/openQuantum/hydrogenRates
 */

import { dipoleMatrixElementSquared } from './dipoleElements'
import type { HydrogenBasisState } from './hydrogenBasis'
import { isAllowedE1 } from './selectionRules'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Transition rate between two basis states */
export interface TransitionRate {
  /** Index of the higher-energy state */
  from: number
  /** Index of the lower-energy state */
  to: number
  /** Spontaneous + stimulated emission rate (downward) */
  gammaDown: number
  /** Thermal absorption rate (upward) */
  gammaUp: number
  /** Transition frequency |ΔE| (in natural units) */
  omega: number
  /** Dipole matrix element squared |⟨j|r|i⟩|² */
  dipoleSq: number
}

// ---------------------------------------------------------------------------
// Physical constants in atomic units
// ---------------------------------------------------------------------------

/** Fine structure constant */
const ALPHA = 1 / 137.035999084

/** Boltzmann constant in atomic units (E_h / K). */
export const KB_ATOMIC = 3.1668115634556e-6

// ---------------------------------------------------------------------------
// Rate functions
// ---------------------------------------------------------------------------

/**
 * Einstein A coefficient for spontaneous emission.
 *
 * A_{i→j} = (4 α³ ω³ / 3) · |⟨j|r|i⟩|²
 *
 * where ω = E_i - E_j > 0 and the matrix element is in atomic units.
 *
 * @param omega - Transition frequency (> 0)
 * @param dipoleSq - |⟨j|r|i⟩|² in atomic units (a₀²)
 * @returns Spontaneous emission rate in atomic time units
 */
export function einsteinA(omega: number, dipoleSq: number): number {
  if (!Number.isFinite(omega) || !Number.isFinite(dipoleSq) || omega <= 0 || dipoleSq <= 0) {
    return 0
  }
  return (4 * ALPHA * ALPHA * ALPHA * omega * omega * omega * dipoleSq) / 3
}

/**
 * Bose-Einstein thermal occupation number.
 *
 * n̄(ω, T) = 1 / (exp(ω / (k_B T)) - 1)
 *
 * @param omega - Transition frequency (> 0, atomic units)
 * @param temperature - Temperature in Kelvin
 * @returns Mean photon number
 */
export function thermalOccupation(omega: number, temperature: number): number {
  if (!Number.isFinite(temperature) || !Number.isFinite(omega) || temperature <= 0 || omega <= 0) {
    return 0
  }
  const x = omega / (KB_ATOMIC * temperature)
  if (x > 500) return 0 // negligible thermal population
  return 1 / (Math.exp(x) - 1)
}

/**
 * Build transition rates for all allowed E1 transitions in the hydrogen basis.
 *
 * For each allowed pair (i, j) with E_i > E_j:
 *   - γ_down = A_ij · (1 + n̄) = spontaneous + stimulated emission
 *   - γ_up = A_ij · n̄ = thermal absorption
 *   - Detailed balance: γ_up / γ_down = n̄ / (1 + n̄) = exp(-ω/kT)
 *
 * When dimension ≠ 3, dipole matrix elements use D-dimensional radial
 * wavefunctions for self-consistency with ND energy levels.
 *
 * @param basis - Hydrogen basis states (sorted by energy)
 * @param temperature - Bath temperature in Kelvin
 * @param couplingScale - Overall coupling multiplier (default 1.0)
 * @param dimension - Spatial dimension D (default 3)
 * @returns Array of transition rates for all allowed pairs
 */
export function buildTransitionRates(
  basis: readonly HydrogenBasisState[],
  temperature: number,
  couplingScale: number = 1.0,
  dimension: number = 3
): TransitionRate[] {
  const rates: TransitionRate[] = []
  const K = basis.length
  const safeTemperature = Number.isFinite(temperature) && temperature > 0 ? temperature : 0
  const safeCouplingScale =
    Number.isFinite(couplingScale) && couplingScale > 0 ? couplingScale : 1.0
  const safeDimension = Number.isFinite(dimension) ? dimension : 3

  for (let i = 0; i < K; i++) {
    for (let j = i + 1; j < K; j++) {
      const stateI = basis[i]!
      const stateJ = basis[j]!

      if (!isAllowedE1(stateI, stateJ)) continue

      // Energy ordering: states are sorted by energy (ascending),
      // so stateJ has higher or equal energy
      const omega = Math.abs(stateJ.energy - stateI.energy)
      if (omega < 1e-15) continue // degenerate — no transition

      const dipoleSq = dipoleMatrixElementSquared(stateI, stateJ, safeDimension)
      if (dipoleSq < 1e-30) continue

      const A = einsteinA(omega, dipoleSq)
      const nBar = thermalOccupation(omega, safeTemperature)

      // Higher-energy state is stateJ (larger index in energy-sorted basis)
      // γ_down: j → i (emission), γ_up: i → j (absorption)
      const gammaDown = safeCouplingScale * A * (1 + nBar)
      const gammaUp = safeCouplingScale * A * nBar

      rates.push({
        from: j, // higher energy
        to: i, // lower energy
        gammaDown,
        gammaUp,
        omega,
        dipoleSq,
      })
    }
  }

  return rates
}
