/**
 * Physics-based bounding radius computation for quantum wavefunctions.
 *
 * Computes the minimum sphere radius that contains all visually significant
 * probability density. Called once per quantum state change (not per frame).
 *
 * Position space:
 *   HO: R = classical turning point + Gaussian margin = (sqrt(2n+1) + margin) / sqrt(ω)
 *   Hydrogen: R = n² · a₀ · safety factor
 *
 * Momentum space (Fourier dual):
 *   HO: R_k = (sqrt(2n+1) + margin) · sqrt(ω)   (reciprocal of position)
 *   Hydrogen: R_k ∝ 1/(n · a₀)   (concentrated near origin for large n)
 *
 * The momentumScale parameter zooms k-space coordinates (k → k·scale),
 * so the required bounding radius in coordinate space is R_k / momentumScale.
 */

import type { QuantumPreset } from './presets'

/**
 * Number of Gaussian decay lengths beyond the classical turning point.
 * Controls how much of the evanescent tail is visible.
 * 2.5 captures density down to ~exp(-6.25) ≈ 2e-3 of peak — sufficient for
 * volumetric rendering where the tail is invisible after Beer-Lambert absorption.
 * A tighter bound concentrates ray samples on visible structure, improving
 * spatial resolution for complex states with fine nodal features.
 */
const GAUSSIAN_MARGIN = 2.5

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
 * Compute bounding radius for an HO state in momentum (k-) space.
 *
 * The HO eigenfunctions are self-dual under Fourier transform: the momentum-
 * space eigenfunction has the same Hermite × Gaussian form but with the
 * reciprocal frequency.  Position-space turning point is sqrt(2n+1)/sqrt(ω);
 * momentum-space turning point is sqrt(2n+1)·sqrt(ω).
 *
 * @param dimension - Number of spatial dimensions (3-11)
 * @param quantumNumbers - n[k][j] for each term k and dimension j
 * @param omegas - Per-dimension angular frequencies
 * @param momentumScale - Reciprocal-space zoom factor (k → k·scale); default 1.0
 * @returns Bounding radius in coordinate-space units (pre-scale)
 */
export function computeHOMomentumBoundingRadius(
  dimension: number,
  quantumNumbers: number[][],
  omegas: number[],
  momentumScale: number = 1.0
): number {
  const kScale = Math.max(momentumScale, 0.01)
  let maxR = MIN_BOUND_R
  for (let j = 0; j < dimension; j++) {
    const maxN = Math.max(...quantumNumbers.map((term) => term[j] ?? 0))
    const alpha = Math.sqrt(Math.max(omegas[j] ?? 1.0, 0.01))
    // Momentum-space turning point: sqrt(2n+1) · sqrt(ω)
    // Momentum-space margin: GAUSSIAN_MARGIN · sqrt(ω)
    // Divide by kScale because shader samples at kCoord = xND * kScale
    const k_extent = (Math.sqrt(2 * maxN + 1) + GAUSSIAN_MARGIN) * alpha
    const R_j = k_extent / kScale
    maxR = Math.max(maxR, R_j)
  }
  return maxR
}

/**
 * Compute bounding radius for a hydrogen orbital in momentum (k-) space.
 *
 * The Fock momentum-space radial wavefunction decays as
 *   R̃_nl(k) ∝ (na₀k)^l / (1+(na₀k)²)^{l+2}
 * which has effective support up to k ≈ few / (n·a₀).
 *
 * Safety factor 6.0 keeps the sharp peak and first few oscillations visible
 * (the algebraic tail falls off fast as 1/k^{2l+4}).
 *
 * Extra dimensions (4D+) use HO momentum-space bounds.
 *
 * @param principalN - Principal quantum number n (1-7)
 * @param bohrRadius - Bohr radius scale factor
 * @param momentumScale - Reciprocal-space zoom factor; default 1.0
 * @param extraDimN - Quantum numbers for extra dimensions (4D-11D)
 * @param extraDimOmega - Frequencies for extra dimensions
 * @returns Bounding radius in coordinate-space units (pre-scale)
 */
export function computeHydrogenMomentumBoundingRadius(
  principalN: number,
  bohrRadius: number,
  momentumScale: number = 1.0,
  extraDimN?: number[],
  extraDimOmega?: number[]
): number {
  const kScale = Math.max(momentumScale, 0.01)
  const na0 = Math.max(principalN * bohrRadius, 0.01)
  // Momentum-space extent: peak at k~1/(n·a₀), significant out to ~6/(n·a₀)
  const hydrogenK = 6.0 / na0
  let maxR = Math.max(MIN_BOUND_R, hydrogenK / kScale)

  // Extra dimensions use HO momentum formula
  if (extraDimN && extraDimOmega) {
    for (let j = 0; j < extraDimN.length; j++) {
      const n = extraDimN[j] ?? 0
      const alpha = Math.sqrt(Math.max(extraDimOmega[j] ?? 1.0, 0.01))
      const k_extent = (Math.sqrt(2 * n + 1) + GAUSSIAN_MARGIN) * alpha
      const R_j = k_extent / kScale
      maxR = Math.max(maxR, R_j)
    }
  }
  return maxR
}

/**
 * Compute bounding radius for the current quantum state.
 * Dispatches to the appropriate function based on quantum mode and representation.
 *
 * @param quantumMode - 'harmonicOscillator' or 'hydrogenND'
 * @param preset - Current quantum preset (for HO mode)
 * @param dimension - Number of dimensions
 * @param principalN - Principal quantum number (hydrogen mode)
 * @param bohrRadius - Bohr radius scale (hydrogen mode)
 * @param extraDimN - Extra dimension quantum numbers (hydrogen ND mode)
 * @param extraDimOmega - Extra dimension frequencies (hydrogen ND mode)
 * @param representation - 'position' (default) or 'momentum'
 * @param momentumScale - Reciprocal-space zoom factor (only for momentum); default 1.0
 * @returns Bounding radius in object-space units
 */
export function computeBoundingRadius(
  quantumMode: string,
  preset: QuantumPreset | null,
  dimension: number,
  principalN: number = 2,
  bohrRadius: number = 1.0,
  extraDimN?: number[],
  extraDimOmega?: number[],
  representation: 'position' | 'momentum' = 'position',
  momentumScale: number = 1.0
): number {
  if (representation === 'momentum') {
    if (quantumMode === 'hydrogenND') {
      return computeHydrogenMomentumBoundingRadius(
        principalN,
        bohrRadius,
        momentumScale,
        extraDimN,
        extraDimOmega
      )
    }
    // Harmonic oscillator momentum space
    if (preset) {
      return computeHOMomentumBoundingRadius(
        dimension,
        preset.quantumNumbers,
        preset.omega,
        momentumScale
      )
    }
    return MIN_BOUND_R
  }

  // Position space (default)
  if (quantumMode === 'hydrogenND') {
    return computeHydrogenBoundingRadius(principalN, bohrRadius, extraDimN, extraDimOmega)
  }

  if (preset) {
    return computeHOBoundingRadius(dimension, preset.quantumNumbers, preset.omega)
  }

  return MIN_BOUND_R
}
