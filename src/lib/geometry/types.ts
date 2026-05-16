/**
 * Type definitions for n-dimensional geometry
 *
 * Supports three quantum object families rendered via WebGPU:
 *  - 'schroedinger': single-particle wavefunctions (HO, hydrogen, TDSE, BEC,
 *    free scalar field, Dirac, quantum walk, Wheeler–DeWitt, anti-de Sitter)
 *  - 'pauliSpinor': single-particle 2-component spinor in an external field
 *  - 'bellPair': two-particle spin-1/2 entangled state used to simulate Bell
 *    / CHSH experiments. Spin state is propagated analytically in ℂ²⊗ℂ²;
 *    optional per-particle spatial wavepackets live on a shared lattice.
 */

/**
 * All supported object types.
 *
 * 'bellPair' was added to host the Bell / CHSH experiment, which is
 * inherently a two-particle quantum system and does not fit cleanly into
 * either the single-particle Schrödinger or single-particle Pauli families.
 */
export type ObjectType = 'schroedinger' | 'pauliSpinor' | 'bellPair'

/**
 * Type guard for extended object types
 * @param type - String to check
 * @returns True if type is an extended object type
 */
export function isExtendedObjectType(type: string): type is ObjectType {
  return type === 'schroedinger' || type === 'pauliSpinor' || type === 'bellPair'
}
