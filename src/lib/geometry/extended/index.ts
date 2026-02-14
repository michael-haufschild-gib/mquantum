/**
 * Extended N-Dimensional Objects Library
 *
 * Provides the Schrödinger quantum visualization generator,
 * a volumetric wavefunction renderer supporting harmonic oscillator
 * and hydrogen ND modes in N dimensions.
 *
 * @see docs/prd/extended-objects.md
 * @see docs/research/nd-extended-objects-guide.md
 */

// Type exports
export type {
  ExtendedObjectParams,
  SchroedingerColorMode,
  SchroedingerConfig,
  SchroedingerPalette,
  SchroedingerQualityPreset,
  SchroedingerRenderStyle,
} from './types'

// Default configs
export {
  DEFAULT_EXTENDED_OBJECT_PARAMS,
  DEFAULT_SCHROEDINGER_CONFIG,
  SCHROEDINGER_QUALITY_PRESETS,
} from './types'

// Schroedinger generator
export { generateSchroedinger } from './schroedinger'
