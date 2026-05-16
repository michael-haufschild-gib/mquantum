/**
 * Barrel re-export for extended n-dimensional quantum object types.
 *
 * All per-mode types are defined in their own files.
 * Import from this module to access any quantum mode type.
 */

export * from './antiDeSitter'
export * from './bec'
export * from './bellPair'
export * from './common'
export * from './crossMode'
export * from './dirac'
export * from './freeScalar'
export * from './pauli'
export * from './schroedinger'
export * from './tdse'
export * from './wheelerDeWitt'

// ============================================================================
// Combined Object Parameters
// ============================================================================

import type { BellPairConfig } from './bellPair'
import { DEFAULT_BELL_PAIR_CONFIG } from './bellPair'
import type { PauliConfig } from './pauli'
import { DEFAULT_PAULI_CONFIG } from './pauli'
import type { SchroedingerConfig } from './schroedinger'
import { DEFAULT_SCHROEDINGER_CONFIG } from './schroedinger'

/**
 * Combined parameters for extended object types.
 * Used by the unified geometry generator for consistent configuration.
 */
export interface ExtendedObjectParams {
  /** Configuration for Schroedinger quantum visualization */
  schroedinger: SchroedingerConfig
  /** Configuration for Pauli spinor simulation */
  pauliSpinor: PauliConfig
  /** Configuration for Bell-pair / CHSH experiment */
  bellPair: BellPairConfig
}

/**
 * Default parameters for all object types
 */
export const DEFAULT_EXTENDED_OBJECT_PARAMS: ExtendedObjectParams = {
  schroedinger: DEFAULT_SCHROEDINGER_CONFIG,
  pauliSpinor: DEFAULT_PAULI_CONFIG,
  bellPair: DEFAULT_BELL_PAIR_CONFIG,
}
