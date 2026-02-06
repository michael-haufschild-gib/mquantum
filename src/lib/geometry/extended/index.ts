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

// Utility exports
export { buildKnnEdges } from './utils/knn-edges'
export { buildShortEdges } from './utils/short-edges'

// Re-import for unified generator
import type { NdGeometry, ObjectType } from '../types'
import { generateSchroedinger } from './schroedinger'
import type { ExtendedObjectParams } from './types'
import { DEFAULT_EXTENDED_OBJECT_PARAMS } from './types'

/**
 * Generates geometry for an extended object type
 *
 * Currently only supports the Schrödinger quantum visualization.
 *
 * @param type - Extended object type
 * @param dimension - Dimensionality of the ambient space
 * @param params - Extended object parameters (optional, uses defaults if not provided)
 * @returns NdGeometry representing the object
 * @throws {Error} If type is not a recognized extended object type
 */
export function generateExtendedObject(
  type: ObjectType,
  dimension: number,
  params: ExtendedObjectParams = DEFAULT_EXTENDED_OBJECT_PARAMS
): NdGeometry {
  if (type === 'schroedinger') {
    return generateSchroedinger(
      dimension,
      params.schroedinger ?? DEFAULT_EXTENDED_OBJECT_PARAMS.schroedinger
    )
  }
  throw new Error(`Unknown extended object type: ${type}`)
}
