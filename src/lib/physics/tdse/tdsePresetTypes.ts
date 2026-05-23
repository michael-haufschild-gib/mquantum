/**
 * Type-only module for TDSE preset shapes.
 *
 * Lives in its own file so child preset modules (curvedMetricPresets,
 * decoherencePresets) can reference the preset shape without importing the
 * value-export hub `presets.ts` — that hub imports them back, which would
 * form a structural cycle even when the back-edges are `import type`.
 *
 * @module lib/physics/tdse/tdsePresetTypes
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import type { ScenarioPreset } from '@/lib/physics/presetTypes'

/** Subset of TdseConfig fields that a scenario preset can override. */
export type TdsePresetOverride = Partial<Omit<TdseConfig, 'needsReset' | 'slicePositions'>>

/** Parent-level SchroedingerConfig rendering fields that a TDSE preset can override. */
export interface TdseRenderingOverrides {
  densityGain?: number
  densityContrast?: number
  autoScaleMaxGain?: number
}

/** A named TDSE scenario preset with config overrides applied on selection. */
export interface TdseScenarioPreset extends ScenarioPreset<TdsePresetOverride> {
  /**
   * Highest global scene dimension this preset can be applied to without
   * changing the physics described by its name/description.
   */
  maxDim?: number
  /** Parent-level rendering overrides applied alongside TdseConfig overrides. */
  renderingOverrides?: TdseRenderingOverrides
}
