/**
 * Color Palette Module
 *
 * Unified color palette system for quantum visualization rendering.
 * Provides TypeScript color evaluation functions for UI preview and
 * CPU-side palette computation.
 *
 * @example
 * ```typescript
 * // In a component:
 * import { COLOR_ALGORITHM_OPTIONS, COSINE_PRESET_OPTIONS } from '@/rendering/shaders/palette';
 *
 * // For UI preview:
 * import { getCosinePaletteColorTS } from '@/rendering/shaders/palette';
 * const color = getCosinePaletteColorTS(0.5, a, b, c, d, 1.0, 1.0, 0.0);
 * ```
 *
 */

// Cosine palette evaluation functions (CPU-side)
export { applyDistributionTS, calculateCosineColor, getCosinePaletteColorTS } from './cosine'

// Types
export {
  COLOR_ALGORITHM_OPTIONS,
  COLOR_ALGORITHM_TO_INT,
  // Color algorithm types
  type ColorAlgorithm,
  // Cosine palette types
  type CosineCoefficients,
  DEFAULT_COLOR_ALGORITHM,
  DEFAULT_COSINE_COEFFICIENTS,
  DEFAULT_DISTRIBUTION,
  DEFAULT_DIVERGING_PSI_SETTINGS,
  DEFAULT_DOMAIN_COLORING_SETTINGS,
  DEFAULT_MULTI_SOURCE_WEIGHTS,
  DEFAULT_PHASE_DIVERGING_SETTINGS,
  // Distribution types
  type DistributionSettings,
  type DivergingPsiSettings,
  type DomainColoringModulusMode,
  type DomainColoringSettings,
  getAvailableColorAlgorithms,
  LCH_PRESET_OPTIONS,
  // LCH preset types
  type LchPreset,
  // Multi-source types
  type MultiSourceWeights,
  type PhaseDivergingSettings,
} from './types'

// Presets
export {
  BUILT_IN_PRESETS,
  type ColorPreset,
  COSINE_PRESET_OPTIONS,
  COSINE_PRESETS,
  getDefaultPresetForAlgorithm,
  getPresetById,
  type PresetOption,
} from './presets'
