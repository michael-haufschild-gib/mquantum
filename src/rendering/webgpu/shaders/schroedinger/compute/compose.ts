/**
 * Density Grid Compute Shader Composer
 *
 * Assembles the compute shader for pre-computing a 3D density texture.
 * This is a simplified version of the fragment shader compose - it only
 * includes the quantum math modules needed for density evaluation.
 *
 * @module rendering/webgpu/shaders/schroedinger/compute/compose
 */

import { assembleShaderBlocks } from '../../shared/compose-helpers'

// Core blocks
import { constantsBlock } from '../../shared/core/constants.wgsl'

// Schroedinger-specific blocks
import { schroedingerUniformsBlock } from '../uniforms.wgsl'

// Quantum math blocks
import { complexMathBlock } from '../quantum/complex.wgsl'
import { hermiteBlock } from '../quantum/hermite.wgsl'
import { ho1dBlock } from '../quantum/ho1d.wgsl'
import {
  hoND3dBlock,
  hoND4dBlock,
  hoND5dBlock,
  hoND6dBlock,
  hoND7dBlock,
  hoND8dBlock,
  hoND9dBlock,
  hoND10dBlock,
  hoND11dBlock,
  generateHoNDDispatchBlock,
} from '../quantum/hoNDVariants.wgsl'
import {
  getHOUnrolledBlocks,
  generateHODispatchBlock,
} from '../quantum/hoSuperpositionVariants.wgsl'
import {
  psiBlockDynamicHarmonic,
  psiBlockHarmonic,
  psiBlockHydrogenND,
} from '../quantum/psi.wgsl'
import { densityPreMapBlock, generateMapPosToND, densityPostMapBlock } from '../quantum/density.wgsl'

// Hydrogen blocks (shared by hydrogen ND mode)
import { laguerreBlock } from '../quantum/laguerre.wgsl'
import { legendreBlock } from '../quantum/legendre.wgsl'
import { sphericalHarmonicsBlock } from '../quantum/sphericalHarmonics.wgsl'
import { hydrogenRadialBlock } from '../quantum/hydrogenRadial.wgsl'
import { hydrogenNDCommonBlock } from '../quantum/hydrogenNDCommon.wgsl'
import {
  hydrogenNDGen3dBlock,
  hydrogenNDGen4dBlock,
  hydrogenNDGen5dBlock,
  hydrogenNDGen6dBlock,
  hydrogenNDGen7dBlock,
  hydrogenNDGen8dBlock,
  hydrogenNDGen9dBlock,
  hydrogenNDGen10dBlock,
  hydrogenNDGen11dBlock,
  generateHydrogenNDDispatchBlock,
} from '../quantum/hydrogenNDVariants.wgsl'

// Single basis evaluation for density matrix mode
import { generateSingleBasisBlock } from '../quantum/singleBasis.wgsl'

// Open quantum uniforms and hydrogen basis uniforms
import { openQuantumUniformsBlock, hydrogenBasisUniformsBlock } from '../uniforms.wgsl'

// Compute-specific blocks
import {
  gridParamsBlock,
  generateDensityGridBindingsBlock,
  generateDensityGridBindingsWithOpenQuantumBlock,
  generateDensityGridBindingsWithHydrogenBasisBlock,
  densityGridComputeBlock,
  densityGridWithPhaseComputeBlock,
  densityMatrixComputeBlock,
} from './densityGrid.wgsl'

/** Quantum mode for compute shader */
export type ComputeQuantumMode = 'harmonicOscillator' | 'hydrogenND' | 'freeScalarField'

/**
 * Configuration for density grid compute shader
 */
export interface DensityGridComputeConfig {
  /** Number of dimensions (3-11) */
  dimension: number
  /** Quantum mode */
  quantumMode?: ComputeQuantumMode
  /** Number of HO superposition terms (1-8) - enables compile-time optimization */
  termCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  /** Storage texture format for the grid payload */
  storageFormat?: 'r16float' | 'rgba16float'
  /** Use density matrix evaluation (open quantum system mode) */
  useDensityMatrix?: boolean
}

/**
 * Compose the density grid compute shader.
 *
 * This assembles all quantum math modules needed for density evaluation
 * into a compute shader that fills a 3D texture.
 *
 * @param config - Shader configuration
 * @returns Composed WGSL code and metadata
 */
export function composeDensityGridComputeShader(config: DensityGridComputeConfig): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const {
    dimension,
    quantumMode = 'harmonicOscillator',
    termCount,
    storageFormat = 'r16float',
    useDensityMatrix = false,
  } = config

  const defines: string[] = []
  const features: string[] = []

  // Compile-time dimension
  const actualDim = Math.min(Math.max(dimension, 3), 11)

  // Add dimension defines
  defines.push(`const DIMENSION: i32 = ${dimension};`)
  defines.push(`const ACTUAL_DIM: i32 = ${actualDim};`)
  features.push(`${dimension}D Quantum`)

  const isHydrogenFamily = quantumMode === 'hydrogenND'
  const includeHydrogen = isHydrogenFamily
  const includeHydrogenND = isHydrogenFamily
  const includeHarmonic = !isHydrogenFamily
  const hydrogenNDDimension = includeHydrogenND ? actualDim : 0

  defines.push(`const HYDROGEN_MODE_ENABLED: bool = ${includeHydrogen};`)
  defines.push(`const HYDROGEN_ND_MODE_ENABLED: bool = ${includeHydrogenND};`)
  if (includeHydrogenND) {
    defines.push(`const HYDROGEN_ND_DIMENSION: i32 = ${hydrogenNDDimension};`)
  }

  // HO unrolled optimization when term count is known at compile time
  const useUnrolledHO = includeHarmonic && termCount !== undefined

  if (useUnrolledHO && termCount) {
    defines.push('const HO_UNROLLED: bool = true;')
    defines.push(`const HO_TERM_COUNT: i32 = ${termCount};`)
    features.push(`HO ${termCount}-term unrolled`)
  } else {
    defines.push('const HO_UNROLLED: bool = false;')
  }

  // Quantum mode constant for runtime dispatch
  if (quantumMode === 'hydrogenND') {
    defines.push('const QUANTUM_MODE_DEFAULT: i32 = 1;')
    features.push('Hydrogen ND')
  } else {
    defines.push('const QUANTUM_MODE_DEFAULT: i32 = 0;')
    features.push('Harmonic Oscillator')
  }

  // Temporal disabled for compute (not needed)
  defines.push('const TEMPORAL_ENABLED: bool = false;')
  // Compute shaders include shared density helpers that reference COLOR_ALGORITHM.
  // Grid baking is algorithm-agnostic, so keep the default mixed mode value.
  defines.push('const COLOR_ALGORITHM: i32 = 4;')
  // Density modules reference FEATURE_INTERFERENCE; keep it defined in compute shaders.
  // Set to true so runtime uniform toggles still control the effect in compute mode.
  defines.push('const FEATURE_INTERFERENCE: bool = true;')
  // Density modules reference FEATURE_UNCERTAINTY_BOUNDARY; keep it defined in compute shaders.
  // Set to false — compute stores raw density; fragment shader applies emphasis per-pixel.
  defines.push('const FEATURE_UNCERTAINTY_BOUNDARY: bool = false;')
  // Skip uncertainty boundary emphasis in compute: store raw density in the grid so
  // the fragment shader can apply emphasis per-pixel (preserves sharp band at 64³).
  defines.push('const SKIP_DENSITY_EMPHASIS: bool = true;')

  features.push('Density Grid Compute')
  features.push(`Grid Format: ${storageFormat}`)
  if (useDensityMatrix) {
    features.push('Density Matrix (Open Quantum)')
    defines.push('const USE_DENSITY_MATRIX: bool = true;')
  } else {
    defines.push('const USE_DENSITY_MATRIX: bool = false;')
  }

  // Get dimension-specific blocks
  const hoNDBlockMap: Record<number, string> = {
    3: hoND3dBlock,
    4: hoND4dBlock,
    5: hoND5dBlock,
    6: hoND6dBlock,
    7: hoND7dBlock,
    8: hoND8dBlock,
    9: hoND9dBlock,
    10: hoND10dBlock,
    11: hoND11dBlock,
  }
  const hoNDBlock = hoNDBlockMap[actualDim] || hoND3dBlock

  const hydrogenNDBlockMap: Record<number, string> = {
    3: hydrogenNDGen3dBlock,
    4: hydrogenNDGen4dBlock,
    5: hydrogenNDGen5dBlock,
    6: hydrogenNDGen6dBlock,
    7: hydrogenNDGen7dBlock,
    8: hydrogenNDGen8dBlock,
    9: hydrogenNDGen9dBlock,
    10: hydrogenNDGen10dBlock,
    11: hydrogenNDGen11dBlock,
  }
  const hydrogenNDBlock = hydrogenNDBlockMap[hydrogenNDDimension] || ''

  const selectedPsiBlock = isHydrogenFamily
    ? psiBlockHydrogenND
    : useUnrolledHO
      ? psiBlockDynamicHarmonic
      : psiBlockHarmonic

  // Build blocks array in dependency order
  const blocks = [
    // Defines - must come first
    { name: 'Defines', content: defines.join('\n') },

    // Core constants (BOUND_R kept as fallback; Schroedinger uses dynamic boundingRadius)
    { name: 'Constants', content: constantsBlock },

    // Uniform structs (SchroedingerUniforms, BasisVectors)
    { name: 'Schrödinger Uniforms', content: schroedingerUniformsBlock },

    // Open quantum uniforms struct (always include struct definition for type completeness)
    { name: 'Open Quantum Uniforms', content: openQuantumUniformsBlock, condition: useDensityMatrix },

    // Hydrogen basis uniforms struct (density matrix + hydrogen mode)
    { name: 'Hydrogen Basis Uniforms', content: hydrogenBasisUniformsBlock,
      condition: useDensityMatrix && isHydrogenFamily },

    // Grid params struct
    { name: 'Grid Params', content: gridParamsBlock },

    // Compute shader bindings
    { name: 'Compute Bindings', content: useDensityMatrix
        ? (isHydrogenFamily
            ? generateDensityGridBindingsWithHydrogenBasisBlock(storageFormat)
            : generateDensityGridBindingsWithOpenQuantumBlock(storageFormat))
        : generateDensityGridBindingsBlock(storageFormat) },

    // ===== QUANTUM MATH MODULES (order matters!) =====

    // Complex math (required by all quantum modes)
    { name: 'Complex Math', content: complexMathBlock },

    // Harmonic oscillator basis functions
    { name: 'Hermite Polynomials', content: hermiteBlock },
    { name: 'HO 1D Eigenfunction', content: ho1dBlock },

    // HO ND dimension-specific variant
    { name: `HO ND ${actualDim}D`, content: hoNDBlock, condition: includeHarmonic },
    { name: 'HO ND Dispatch', content: generateHoNDDispatchBlock(actualDim), condition: includeHarmonic },

    // Hydrogen orbital basis functions
    { name: 'Laguerre Polynomials', content: laguerreBlock, condition: includeHydrogen },
    { name: 'Legendre Polynomials', content: legendreBlock, condition: includeHydrogen },
    { name: 'Spherical Harmonics', content: sphericalHarmonicsBlock, condition: includeHydrogen },
    { name: 'Hydrogen Radial', content: hydrogenRadialBlock, condition: includeHydrogen },

    // Hydrogen ND modules
    { name: 'Hydrogen ND Common', content: hydrogenNDCommonBlock, condition: includeHydrogenND },
    {
      name: `Hydrogen ND ${hydrogenNDDimension}D`,
      content: hydrogenNDBlock,
      condition: includeHydrogenND && hydrogenNDBlock.length > 0,
    },
    {
      name: 'Hydrogen ND Dispatch',
      content: generateHydrogenNDDispatchBlock(hydrogenNDDimension),
      condition: includeHydrogenND,
    },

    // HO Superposition - unrolled variants when termCount is known
    ...(useUnrolledHO && termCount
      ? [
          {
            name: `HO Superposition (${termCount} term${termCount > 1 ? 's' : ''})`,
            content: getHOUnrolledBlocks(termCount).superposition,
          },
          {
            name: `HO Spatial (${termCount} term${termCount > 1 ? 's' : ''})`,
            content: getHOUnrolledBlocks(termCount).spatial,
          },
          {
            name: `HO Combined (${termCount} term${termCount > 1 ? 's' : ''})`,
            content: getHOUnrolledBlocks(termCount).combined,
          },
          {
            name: 'HO Dispatch (Unrolled)',
            content: generateHODispatchBlock(termCount),
          },
        ]
      : []),

    // Unified wavefunction evaluation
    { name: 'Wavefunction (Psi)', content: selectedPsiBlock },

    // Density field blocks
    { name: 'Density Pre-Map', content: densityPreMapBlock },
    { name: `Density mapPosToND (${actualDim}D)`, content: generateMapPosToND(actualDim) },
    { name: 'Density Post-Map', content: densityPostMapBlock },

    // Single basis function evaluation (density matrix mode only)
    { name: 'Single Basis', content: generateSingleBasisBlock(
      quantumMode as 'harmonicOscillator' | 'hydrogenND',
      actualDim,
    ), condition: useDensityMatrix },

    // ===== COMPUTE SHADER ENTRY POINT =====
    { name: 'Compute Main', content: useDensityMatrix
        ? densityMatrixComputeBlock
        : (storageFormat === 'rgba16float' ? densityGridWithPhaseComputeBlock : densityGridComputeBlock) },
  ]

  // Assemble shader
  const { wgsl, modules } = assembleShaderBlocks(blocks, [])

  return { wgsl, modules, features }
}
