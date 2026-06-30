/**
 * Shared scaffolding for the WDW ⊗ ζ visualization-suite mode configs.
 *
 * The ten suite modes (`constraintSeam`, `moebiusNoBoundary`, `forcedCell`,
 * `turningSurface`, `primonMultiverse`, `frobeniusWheel`, `dewittCone`,
 * `selbergSpectrum`, `adelicWavefunction`, `weilPositivity`) each own a lean
 * config (most render knobs — emission, rotation — are shared and live in the
 * Advanced ▸ "Emission & Rim" control and the animation turntable, NOT here).
 * This module holds the small types every mode reuses.
 *
 * @module lib/geometry/extended/wdwZeta/shared
 */

/** The eleven quantum-mode keys of the WDW ⊗ ζ suite. */
export type WdwZetaModeKey =
  | 'constraintSeam'
  | 'moebiusNoBoundary'
  | 'forcedCell'
  | 'turningSurface'
  | 'primonMultiverse'
  | 'frobeniusWheel'
  | 'dewittCone'
  | 'selbergSpectrum'
  | 'adelicWavefunction'
  | 'weilPositivity'
  | 'fieldOneElement'

/** The set of suite mode keys (for cross-cutting gating: color/iso/analysis). */
export const WDW_ZETA_MODES: ReadonlySet<WdwZetaModeKey> = new Set([
  'constraintSeam',
  'moebiusNoBoundary',
  'forcedCell',
  'turningSurface',
  'primonMultiverse',
  'frobeniusWheel',
  'dewittCone',
  'selbergSpectrum',
  'adelicWavefunction',
  'weilPositivity',
  'fieldOneElement',
])

/** True when `mode` is one of the WDW ⊗ ζ suite modes. */
export function isWdwZetaMode(mode: string | undefined): mode is WdwZetaModeKey {
  return mode !== undefined && WDW_ZETA_MODES.has(mode as WdwZetaModeKey)
}

/** One scenario preset shown in the shared ScenarioSelector dropdown. */
export interface WdwZetaScenario<Id extends string = string> {
  /** Preset id (matches a key in the mode's PRESETS map). */
  id: Id
  /** Human-readable label. */
  label: string
  /** One-paragraph description shown beneath the dropdown. */
  description: string
  /**
   * Target spatial dimension this scenario is authored for. Applying the
   * scenario sets the global dimension to this value (clamped to the mode's
   * registry bounds), so every preset is dimension-guarded: 3D scenarios snap
   * back to 3D and 4D scenarios open the 4th axis. Omitted ⇒ 3 (the canonical
   * 3D form). The 4th-axis structure only renders at dimension ≥ 4.
   */
  dimension?: number
  /**
   * Initial N-D rotation (plane → radians) applied with the scenario so a 4D
   * scenario tilts the visible slice into the 4th dimension at rest — otherwise
   * the default w = 0 slice would look identical to 3D until the user rotates.
   * Planes only valid at the target dimension are applied (e.g. `XW`, `ZW`).
   */
  rotation?: Readonly<Record<string, number>>
}
