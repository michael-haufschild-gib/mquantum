/**
 * Shared type for quantum mode scenario presets.
 *
 * All quantum modes define scenario presets with the same base shape:
 * a machine-readable id, display name, description, and config overrides.
 * This generic interface eliminates 7 identical interface definitions.
 *
 * @module lib/physics/presetTypes
 */

/**
 * A named scenario preset for a quantum mode.
 *
 * @typeParam T - The overrides type (typically `Partial<SomeConfig>` or a dedicated override type)
 */
export interface ScenarioPreset<T> {
  /** Machine-readable key (unique within the mode). */
  id: string
  /** Display name in the UI. */
  name: string
  /** One-line description of the physics. */
  description: string
  /** Config overrides to apply on top of the mode's default config. */
  overrides: T
}
