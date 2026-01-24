/**
 * Color Palette Module
 *
 * Unified color palette system for surface rendering.
 * Provides both GLSL functions (for shaders) and TypeScript types (for UI/store).
 *
 * @example
 * ```typescript
 * // In a shader file:
 * import { GLSL_ALL_PALETTE_FUNCTIONS } from '@/rendering/shaders/palette';
 * const fragmentShader = GLSL_ALL_PALETTE_FUNCTIONS + myShaderCode;
 *
 * // In a component:
 * import { COLOR_ALGORITHM_OPTIONS, COSINE_PRESET_OPTIONS } from '@/rendering/shaders/palette';
 *
 * // For UI preview:
 * import { getCosinePaletteColorTS } from '@/rendering/shaders/palette';
 * const color = getCosinePaletteColorTS(0.5, a, b, c, d, 1.0, 1.0, 0.0);
 * ```
 *
 * @see docs/prd/advanced-color-system.md
 */

// Legacy palette functions (still used for 'legacy' algorithm)
export { GLSL_PALETTE_FUNCTIONS } from './palette.glsl'

// New cosine palette functions
export {
  applyDistributionTS,
  calculateCosineColor,
  getCosinePaletteColorTS,
  GLSL_COSINE_PALETTE,
} from './cosine.glsl'

// Combined GLSL for shaders that need everything
import { GLSL_COSINE_PALETTE } from './cosine.glsl'
import { GLSL_PALETTE_FUNCTIONS } from './palette.glsl'

/**
 * All palette GLSL functions combined.
 * Use this when you need both legacy and new algorithms.
 */
export const GLSL_ALL_PALETTE_FUNCTIONS = /* glsl */ `
${GLSL_COSINE_PALETTE}
${GLSL_PALETTE_FUNCTIONS}
`

// Types
export {
  BLACKHOLE_ONLY_ALGORITHMS,
  COLOR_ALGORITHM_OPTIONS,
  COLOR_ALGORITHM_TO_INT,
  DEFAULT_COLOR_ALGORITHM,
  DEFAULT_COSINE_COEFFICIENTS,
  DEFAULT_DISTRIBUTION,
  DEFAULT_MULTI_SOURCE_WEIGHTS,
  GEOMETRIC_PHASE_ALGORITHMS,
  isBlackHoleOnlyAlgorithm,
  isColorAlgorithmAvailable,
  isGeometricPhaseAlgorithm,
  isQuantumOnlyAlgorithm,
  LCH_PRESET_OPTIONS,
  QUANTUM_ONLY_ALGORITHMS,
  // Color algorithm types
  type ColorAlgorithm,
  // Cosine palette types
  type CosineCoefficients,
  // Distribution types
  type DistributionSettings,
  // LCH preset types
  type LchPreset,
  // Multi-source types
  type MultiSourceWeights,
} from './types'

// Presets
export {
  BUILT_IN_PRESETS,
  COSINE_PRESET_OPTIONS,
  COSINE_PRESETS,
  getDefaultPresetForAlgorithm,
  getPresetById,
  type ColorPreset,
  type PresetOption,
} from './presets'
