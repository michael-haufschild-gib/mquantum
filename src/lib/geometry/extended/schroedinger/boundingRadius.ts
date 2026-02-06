/**
 * Physics-based bounding radius computation for quantum wavefunctions.
 *
 * Computes the minimum sphere radius that contains all visually significant
 * probability density. Called once per quantum state change (not per frame).
 *
 * For harmonic oscillators: R = classical turning point + Gaussian margin
 * For hydrogen orbitals: R = n^2 * a0 * safety factor
 */

import type { QuantumPreset } from './presets'

/**
 * Number of Gaussian decay lengths beyond the classical turning point.
 * Controls how much of the evanescent tail is visible.
 * 4.0 captures density down to ~exp(-16) ≈ 1e-7 of peak.
 */
const GAUSSIAN_MARGIN = 4.0

/** Minimum bounding radius (matches previous fixed BOUND_R) */
const MIN_BOUND_R = 2.0

/**
 * Compute bounding radius for a harmonic oscillator state.
 *
 * For each dimension j, the classical turning point is at:
 *   x_j = sqrt(2*n_j + 1) / alpha_j
 * where alpha_j = sqrt(omega_j).
 *
 * The Gaussian envelope decays as exp(-alpha^2 * x^2), so we add
 * GAUSSIAN_MARGIN / alpha_j beyond the turning point.
 *
 * @param dimension - Number of spatial dimensions (3-11)
 * @param quantumNumbers - n[k][j] for each term k and dimension j
 * @param omegas - Per-dimension angular frequencies
 * @returns Bounding radius in object-space units
 */
export function computeHOBoundingRadius(
  dimension: number,
  quantumNumbers: number[][],
  omegas: number[]
): number {
  let maxR = MIN_BOUND_R
  for (let j = 0; j < dimension; j++) {
    const maxN = Math.max(...quantumNumbers.map((term) => term[j] ?? 0))
    const alpha = Math.sqrt(Math.max(omegas[j] ?? 1.0, 0.01))
    const classicalTurningPoint = Math.sqrt(2 * maxN + 1) / alpha
    const R_j = classicalTurningPoint + GAUSSIAN_MARGIN / alpha
    maxR = Math.max(maxR, R_j)
  }
  return maxR
}

/**
 * Compute bounding radius for a hydrogen orbital (3D or N-D).
 *
 * For the 3D hydrogen radial part, the peak probability is at r ~ n^2 * a0,
 * and the tail extends ~3x beyond that.
 *
 * For extra dimensions (4D+), each uses harmonic oscillator bounds.
 *
 * @param principalN - Principal quantum number n (1-7)
 * @param bohrRadius - Bohr radius scale factor
 * @param extraDimN - Quantum numbers for extra dimensions (4D-11D)
 * @param extraDimOmega - Frequencies for extra dimensions
 * @returns Bounding radius in object-space units
 */
export function computeHydrogenBoundingRadius(
  principalN: number,
  bohrRadius: number,
  extraDimN?: number[],
  extraDimOmega?: number[]
): number {
  // Hydrogen radial extent: peak at n^2 * a0, tail extends ~3x beyond
  const hydrogenR = principalN * principalN * bohrRadius * 3.0
  let maxR = Math.max(MIN_BOUND_R, hydrogenR)

  // Extra dimensions use HO formula
  if (extraDimN && extraDimOmega) {
    for (let j = 0; j < extraDimN.length; j++) {
      const n = extraDimN[j] ?? 0
      const alpha = Math.sqrt(Math.max(extraDimOmega[j] ?? 1.0, 0.01))
      const R_j = (Math.sqrt(2 * n + 1) + GAUSSIAN_MARGIN) / alpha
      maxR = Math.max(maxR, R_j)
    }
  }
  return maxR
}

/**
 * Compute bounding radius for the current quantum state.
 * Dispatches to the appropriate function based on quantum mode.
 *
 * @param quantumMode - 'harmonicOscillator' or 'hydrogenND'
 * @param preset - Current quantum preset (for HO mode)
 * @param dimension - Number of dimensions
 * @param principalN - Principal quantum number (hydrogen mode)
 * @param bohrRadius - Bohr radius scale (hydrogen mode)
 * @param extraDimN - Extra dimension quantum numbers (hydrogen ND mode)
 * @param extraDimOmega - Extra dimension frequencies (hydrogen ND mode)
 * @returns Bounding radius in object-space units
 */
export function computeBoundingRadius(
  quantumMode: string,
  preset: QuantumPreset | null,
  dimension: number,
  principalN: number = 2,
  bohrRadius: number = 1.0,
  extraDimN?: number[],
  extraDimOmega?: number[]
): number {
  if (quantumMode === 'hydrogenND') {
    return computeHydrogenBoundingRadius(principalN, bohrRadius, extraDimN, extraDimOmega)
  }

  // Default: harmonic oscillator
  if (preset) {
    return computeHOBoundingRadius(dimension, preset.quantumNumbers, preset.omega)
  }

  return MIN_BOUND_R
}
