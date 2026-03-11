/**
 * Hydrogen Basis Construction
 *
 * Enumerates hydrogen orbital states {n, l, m} up to a maximum principal
 * quantum number, computes energies, and sorts by energy for use as the
 * density-matrix basis in open quantum dynamics.
 *
 * For N-dimensional hydrogen, extra dimensions use independent harmonic
 * oscillator quantum numbers with configurable frequencies.
 *
 * @module lib/physics/openQuantum/hydrogenBasis
 */

import { MAX_K } from './integrator'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Single hydrogen basis state with quantum numbers and energy */
export interface HydrogenBasisState {
  /** Index in the basis (0-based, assigned after sorting) */
  index: number
  /** Principal quantum number (1, 2, 3, ...) */
  n: number
  /** Azimuthal quantum number (0 to n-1) */
  l: number
  /** Magnetic quantum number (-l to +l) */
  m: number
  /** HO quantum numbers for extra dimensions 4-11 (empty for 3D) */
  extraDimN: number[]
  /** Total energy: E_3D + Σ ω_j(n_j + 0.5) */
  energy: number
}

// ---------------------------------------------------------------------------
// Energy functions
// ---------------------------------------------------------------------------

/**
 * 3D hydrogen energy in atomic units (Hartree).
 *
 * E_n = -0.5 / n²
 *
 * Consistent with the shader time evolution in hydrogenNDCommon.wgsl.ts
 * and the atomic-unit rates in hydrogenRates.ts.
 *
 * @param n - Principal quantum number (≥ 1)
 * @returns Energy in Hartree atomic units
 */
export function hydrogenEnergy(n: number): number {
  return -0.5 / (n * n)
}

/**
 * Harmonic oscillator energy contribution for extra dimensions.
 *
 * E = Σ_j ω_j · (n_j + 0.5)
 *
 * @param extraDimN - Quantum numbers for each extra dimension
 * @param extraDimOmega - Angular frequencies for each extra dimension
 * @returns Total extra-dimension energy
 */
export function extraDimEnergy(
  extraDimN: readonly number[],
  extraDimOmega: readonly number[],
): number {
  let sum = 0
  for (let i = 0; i < extraDimN.length; i++) {
    sum += (extraDimOmega[i] ?? 1) * (extraDimN[i]! + 0.5)
  }
  return sum
}

// ---------------------------------------------------------------------------
// Basis construction
// ---------------------------------------------------------------------------

/**
 * Build the hydrogen orbital basis for open quantum dynamics.
 *
 * Enumerates all states {n, l, m} for 1 ≤ n ≤ maxN with proper quantum
 * number constraints (0 ≤ l < n, -l ≤ m ≤ l). States are sorted by energy
 * (n ascending, then l, then m) and truncated to MAX_K.
 *
 * State counts by maxN:
 *   - maxN=1: 1 state  (1s)
 *   - maxN=2: 5 states (1s, 2s, 2p₋₁, 2p₀, 2p₊₁)
 *   - maxN=3: 14 states (all n=1,2,3 orbitals)
 *
 * @param maxN - Maximum principal quantum number (1-3)
 * @param dimension - Spatial dimension (3-11)
 * @param extraDimOmega - Angular frequencies for dimensions 4+ (length dimension-3)
 * @returns Sorted array of basis states, truncated to MAX_K
 */
export function buildHydrogenBasis(
  maxN: number,
  dimension: number,
  extraDimOmega: readonly number[] = [],
): HydrogenBasisState[] {
  const states: HydrogenBasisState[] = []

  // Extra-dimension quantum numbers are ground-state (all zeros) in the
  // truncated OQ basis. Enumerating excited extra-dim states would be
  // combinatorially explosive (8 extra dims × multiple excitation levels).
  // The OQ dynamics therefore model decoherence/transitions within the 3D
  // hydrogen subspace only. Users with excited extra-dim states will see
  // the 3D (n,l,m) part of their orbital in the density matrix path.
  const numExtra = Math.max(0, dimension - 3)
  const extraN = new Array<number>(numExtra).fill(0)

  for (let n = 1; n <= maxN; n++) {
    for (let l = 0; l < n; l++) {
      for (let m = -l; m <= l; m++) {
        const e3D = hydrogenEnergy(n)
        const eExtra = numExtra > 0 ? extraDimEnergy(extraN, extraDimOmega) : 0
        states.push({
          index: 0, // assigned after sorting
          n,
          l,
          m,
          extraDimN: [...extraN],
          energy: e3D + eExtra,
        })
      }
    }
  }

  // Sort by energy (ascending), then by n, l, m for deterministic ordering
  states.sort((a, b) => {
    if (a.energy !== b.energy) return a.energy - b.energy
    if (a.n !== b.n) return a.n - b.n
    if (a.l !== b.l) return a.l - b.l
    return a.m - b.m
  })

  // Truncate to MAX_K
  const truncated = states.slice(0, MAX_K)

  // Assign indices
  for (let i = 0; i < truncated.length; i++) {
    truncated[i]!.index = i
  }

  return truncated
}

/**
 * Generate human-readable labels for hydrogen basis states.
 *
 * Uses spectroscopic notation: 1s, 2s, 2p₋₁, 2p₀, 2p₊₁, 3d₋₂, etc.
 *
 * @param basis - Array of hydrogen basis states
 * @returns Array of string labels
 */
export function basisLabels(basis: readonly HydrogenBasisState[]): string[] {
  const orbitalLetters = ['s', 'p', 'd', 'f', 'g', 'h', 'i']
  const subscriptDigits = ['₀', '₁', '₂', '₃', '₄', '₅', '₆']

  return basis.map((state) => {
    const letter = orbitalLetters[state.l] ?? `l${state.l}`
    if (state.l === 0) {
      return `${state.n}${letter}`
    }
    // Format m as subscript
    const sign = state.m < 0 ? '₋' : state.m > 0 ? '₊' : ''
    const absM = Math.abs(state.m)
    const mStr = subscriptDigits[absM] ?? `${absM}`
    return `${state.n}${letter}${sign}${mStr}`
  })
}

/**
 * Extract energy array from basis for use with the integrator.
 *
 * @param basis - Array of hydrogen basis states
 * @returns Float64Array of energies, length basis.length
 */
export function basisEnergies(basis: readonly HydrogenBasisState[]): Float64Array {
  const energies = new Float64Array(basis.length)
  for (let i = 0; i < basis.length; i++) {
    energies[i] = basis[i]!.energy
  }
  return energies
}
