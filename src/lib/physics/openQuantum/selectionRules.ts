/**
 * Electric Dipole (E1) Selection Rules
 *
 * Determines which hydrogen orbital transitions are allowed under
 * the electric dipole approximation. The selection rules are:
 *   - Δl = ±1 (parity change required)
 *   - |Δm| ≤ 1 (angular momentum projection constraint)
 *   - Δn is unrestricted
 *   - For ND extra dimensions: Δn_extra = 0 (no dipole coupling)
 *
 * @module lib/physics/openQuantum/selectionRules
 */

import type { HydrogenBasisState } from './hydrogenBasis'

/**
 * Check whether an electric dipole (E1) transition between two hydrogen
 * basis states is allowed.
 *
 * @param stateI - Initial state
 * @param stateJ - Final state
 * @returns true if the transition is dipole-allowed
 */
export function isAllowedE1(
  stateI: HydrogenBasisState,
  stateJ: HydrogenBasisState,
): boolean {
  // Δl = ±1
  if (Math.abs(stateI.l - stateJ.l) !== 1) return false

  // |Δm| ≤ 1
  if (Math.abs(stateI.m - stateJ.m) > 1) return false

  // Extra dimensions: no coupling (Δn_extra = 0 for all extra dims)
  const extraI = stateI.extraDimN
  const extraJ = stateJ.extraDimN
  const numExtra = Math.min(extraI.length, extraJ.length)
  for (let d = 0; d < numExtra; d++) {
    if (extraI[d] !== extraJ[d]) return false
  }

  return true
}

/**
 * Compute the spherical component q of the dipole transition.
 *
 * q = m_final - m_initial, must be in {-1, 0, +1} for E1.
 *
 * @param mI - Magnetic quantum number of initial state
 * @param mJ - Magnetic quantum number of final state
 * @returns Spherical component q, or null if |Δm| > 1
 */
export function dipoleComponent(mI: number, mJ: number): number | null {
  const q = mJ - mI
  if (Math.abs(q) > 1) return null
  return q
}
