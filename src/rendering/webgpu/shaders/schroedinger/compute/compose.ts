/**
 * Density Grid Compute Shader Composer
 *
 * Assembles the compute shader for pre-computing a 3D density texture.
 * This is a simplified version of the fragment shader compose - it only
 * includes the quantum math modules needed for density evaluation.
 *
 * @module rendering/webgpu/shaders/schroedinger/compute/compose
 */

import {
  assembleShaderBlocks,
  sanitizeDensityGridStorageFormat,
  sanitizeShaderDimension,
  sanitizeShaderTermCount,
} from '../../shared/compose-helpers'
// Core blocks
import { constantsBlock } from '../../shared/core/constants.wgsl'
// Quantum math blocks
import { complexMathBlock } from '../quantum/complex.wgsl'
import {
  densityPostMapBlock,
  densityPreMapBlock,
  generateMapPosToND,
} from '../quantum/density.wgsl'
import { hermiteBlock } from '../quantum/hermite.wgsl'
import { ho1dBlock } from '../quantum/ho1d.wgsl'
import {
  generateHoNDDispatchBlock,
  hoND3dBlock,
  hoND4dBlock,
  hoND5dBlock,
  hoND6dBlock,
  hoND7dBlock,
  hoND8dBlock,
  hoND9dBlock,
  hoND10dBlock,
  hoND11dBlock,
} from '../quantum/hoNDVariants.wgsl'
import {
  generateHODispatchBlock,
  getHOUnrolledBlocks,
} from '../quantum/hoSuperpositionVariants.wgsl'
import { hydrogenNDCommonBlock } from '../quantum/hydrogenNDCommon.wgsl'
import {
  generateHydrogenNDDispatchBlock,
  hydrogenNDGen3dBlock,
  hydrogenNDGen4dBlock,
  hydrogenNDGen5dBlock,
  hydrogenNDGen6dBlock,
  hydrogenNDGen7dBlock,
  hydrogenNDGen8dBlock,
  hydrogenNDGen9dBlock,
  hydrogenNDGen10dBlock,
  hydrogenNDGen11dBlock,
} from '../quantum/hydrogenNDVariants.wgsl'
import { hydrogenRadialBlock } from '../quantum/hydrogenRadial.wgsl'
import {
  getHydrogenNDCoupledBlocks,
  hypersphericalCoordsBlock,
  hypersphericalNormBlock,
  LN_GAMMA_HALF_INT_LUT_WGSL,
} from '../quantum/hypersphericalHarmonics.wgsl'
// Hydrogen blocks (shared by hydrogen ND mode)
import { laguerreBlock } from '../quantum/laguerre.wgsl'
import { legendreBlock } from '../quantum/legendre.wgsl'
import {
  psiBlockDynamicHarmonic,
  psiBlockHarmonic,
  psiBlockHydrogenND,
  psiBlockHydrogenNDCoupled,
} from '../quantum/psi.wgsl'
// Single basis evaluation for density matrix mode
import { generateSingleBasisBlock } from '../quantum/singleBasis.wgsl'
import { sphericalHarmonicsBlock } from '../quantum/sphericalHarmonics.wgsl'
// Schroedinger-specific blocks
import { schroedingerUniformsBlock } from '../uniforms.wgsl'
// Open quantum uniforms and hydrogen basis uniforms
import { hydrogenBasisUniformsBlock, openQuantumUniformsBlock } from '../uniforms.wgsl'
// Compute-specific blocks
import {
  densityGridComputeBlock,
  densityGridWithPhaseComputeBlock,
  densityMatrixComputeBlock,
  generateDensityGridBindingsBlock,
  gridParamsBlock,
} from './densityGrid.wgsl'

/** Quantum mode for density grid compute shader (analytical modes only). */
export type ComputeQuantumMode = 'harmonicOscillator' | 'hydrogenND' | 'hydrogenNDCoupled'

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

/** Derived flags and compile-time constants for the density grid compute shader. */
interface ComputeShaderFlags {
  defines: string[]
  features: string[]
  actualDim: number
  isHydrogenFamily: boolean
  isHydrogenCoupled: boolean
  includeHydrogen: boolean
  includeHydrogenND: boolean
  includeHarmonic: boolean
  hydrogenNDDimension: number
  useUnrolledHO: boolean
  termCount: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | undefined
  storageFormat: 'r16float' | 'rgba16float'
}

/** Generate WGSL compile-time defines and feature tags for the compute shader. */
function generateComputeDefines(config: DensityGridComputeConfig): ComputeShaderFlags {
  const {
    dimension,
    quantumMode = 'harmonicOscillator',
    termCount: rawTermCount,
    storageFormat: rawStorageFormat = 'r16float',
    useDensityMatrix = false,
  } = config

  const defines: string[] = []
  const features: string[] = []
  // Only ACTUAL_DIM (clamped) is emitted — see composeWignerCache.ts for
  // the rationale. The previously emitted un-clamped `const DIMENSION`
  // was never read by any WGSL shader.
  const actualDim = sanitizeShaderDimension(dimension, { min: 3, fallback: 3 })
  const termCount = sanitizeShaderTermCount(rawTermCount)
  const storageFormat = sanitizeDensityGridStorageFormat(rawStorageFormat)

  defines.push(`const ACTUAL_DIM: i32 = ${actualDim};`)
  features.push(`${actualDim}D Quantum`)

  const isHydrogenFamily = quantumMode === 'hydrogenND' || quantumMode === 'hydrogenNDCoupled'
  const isHydrogenCoupled = quantumMode === 'hydrogenNDCoupled'
  const includeHydrogen = isHydrogenFamily
  const includeHydrogenND = isHydrogenFamily
  const includeHarmonic = !isHydrogenFamily
  const hydrogenNDDimension = includeHydrogenND ? actualDim : 0

  defines.push(`const HYDROGEN_MODE_ENABLED: bool = ${includeHydrogen};`)
  defines.push(`const HYDROGEN_ND_MODE_ENABLED: bool = ${includeHydrogenND};`)
  if (includeHydrogenND) {
    defines.push(`const HYDROGEN_ND_DIMENSION: i32 = ${hydrogenNDDimension};`)
  }

  const useUnrolledHO = includeHarmonic && termCount !== undefined
  if (useUnrolledHO && termCount) {
    defines.push('const HO_UNROLLED: bool = true;')
    defines.push(`const HO_TERM_COUNT: i32 = ${termCount};`)
    features.push(`HO ${termCount}-term unrolled`)
  } else {
    defines.push('const HO_UNROLLED: bool = false;')
  }

  if (quantumMode === 'hydrogenNDCoupled') {
    defines.push('const QUANTUM_MODE_DEFAULT: i32 = 2;')
    features.push('Hydrogen ND Coupled (hyperspherical)')
  } else if (quantumMode === 'hydrogenND') {
    defines.push('const QUANTUM_MODE_DEFAULT: i32 = 1;')
    features.push('Hydrogen ND')
  } else {
    defines.push('const QUANTUM_MODE_DEFAULT: i32 = 0;')
    features.push('Harmonic Oscillator')
  }

  defines.push('const TEMPORAL_ENABLED: bool = false;')
  defines.push('const COLOR_ALGORITHM: i32 = 4;')
  defines.push('const IS_DUAL_CHANNEL: bool = false;')
  defines.push('const FEATURE_INTERFERENCE: bool = true;')
  defines.push('const FEATURE_UNCERTAINTY_BOUNDARY: bool = false;')
  defines.push('const SKIP_DENSITY_EMPHASIS: bool = true;')

  features.push('Density Grid Compute')
  features.push(`Grid Format: ${storageFormat}`)
  if (useDensityMatrix) {
    features.push('Density Matrix (Open Quantum)')
    defines.push('const USE_DENSITY_MATRIX: bool = true;')
  } else {
    defines.push('const USE_DENSITY_MATRIX: bool = false;')
  }

  return {
    defines,
    features,
    actualDim,
    isHydrogenFamily,
    isHydrogenCoupled,
    includeHydrogen,
    includeHydrogenND,
    includeHarmonic,
    hydrogenNDDimension,
    useUnrolledHO,
    termCount,
    storageFormat,
  }
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
  const { quantumMode = 'harmonicOscillator', useDensityMatrix = false } = config

  const {
    defines,
    features,
    actualDim,
    isHydrogenFamily,
    isHydrogenCoupled,
    includeHydrogen,
    includeHydrogenND,
    includeHarmonic,
    hydrogenNDDimension,
    useUnrolledHO,
    termCount,
    storageFormat,
  } = generateComputeDefines(config)

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

  // Select the psi block based on quantum mode.
  // Coupled mode uses the full hyperspherical harmonics evaluation.
  // The basis vectors rotate the 3D viewing slice through D-dimensional space,
  // so the grid is correctly populated for non-degenerate orientations.
  // An automatic extra-dimension rotation offset ensures the initial slice
  // avoids Gegenbauer nodal planes (cos θ_k = 0 for odd-degree layers).
  const selectedPsiBlock = isHydrogenCoupled
    ? psiBlockHydrogenNDCoupled
    : isHydrogenFamily
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
    {
      name: 'Open Quantum Uniforms',
      content: openQuantumUniformsBlock,
      condition: useDensityMatrix,
    },

    // Hydrogen basis uniforms struct (density matrix + hydrogen mode)
    {
      name: 'Hydrogen Basis Uniforms',
      content: hydrogenBasisUniformsBlock,
      condition: useDensityMatrix && isHydrogenFamily,
    },

    // Grid params struct
    { name: 'Grid Params', content: gridParamsBlock },

    // Compute shader bindings
    {
      name: 'Compute Bindings',
      content: generateDensityGridBindingsBlock({
        storageFormat,
        includeOpenQuantum: useDensityMatrix,
        includeHydrogenBasis: useDensityMatrix && isHydrogenFamily,
      }),
    },

    // ===== QUANTUM MATH MODULES (order matters!) =====

    // Complex math (required by all quantum modes)
    { name: 'Complex Math', content: complexMathBlock },

    // Harmonic oscillator basis functions
    { name: 'Hermite Polynomials', content: hermiteBlock },
    { name: 'HO 1D Eigenfunction', content: ho1dBlock },

    // HO ND dimension-specific variant
    { name: `HO ND ${actualDim}D`, content: hoNDBlock, condition: includeHarmonic },
    {
      name: 'HO ND Dispatch',
      content: generateHoNDDispatchBlock(actualDim),
      condition: includeHarmonic,
    },

    // Hydrogen orbital basis functions
    { name: 'Laguerre Polynomials', content: laguerreBlock, condition: includeHydrogen },
    { name: 'Legendre Polynomials', content: legendreBlock, condition: includeHydrogen },
    { name: 'Spherical Harmonics', content: sphericalHarmonicsBlock, condition: includeHydrogen },
    { name: 'Hydrogen Radial', content: hydrogenRadialBlock, condition: includeHydrogen },

    // Hydrogen ND modules (uncoupled variant for decoupled mode)
    { name: 'Hydrogen ND Common', content: hydrogenNDCommonBlock, condition: includeHydrogenND },
    {
      name: `Hydrogen ND ${hydrogenNDDimension}D`,
      content: hydrogenNDBlock,
      condition: includeHydrogenND && !isHydrogenCoupled && hydrogenNDBlock.length > 0,
    },
    {
      name: 'Hydrogen ND Dispatch',
      content: generateHydrogenNDDispatchBlock(hydrogenNDDimension),
      condition: includeHydrogenND && !isHydrogenCoupled,
    },

    // Coupled hydrogen ND: hyperspherical harmonics + Gegenbauer chain
    ...(isHydrogenCoupled && hydrogenNDDimension >= 3
      ? (() => {
          const coupled = getHydrogenNDCoupledBlocks(hydrogenNDDimension)
          return [
            { name: 'Ln Gamma Half-Int LUT', content: LN_GAMMA_HALF_INT_LUT_WGSL },
            { name: 'Hyperspherical Coords Struct', content: hypersphericalCoordsBlock },
            { name: 'Hyperspherical Norm', content: hypersphericalNormBlock },
            {
              name: `Hyperspherical Conversion ${hydrogenNDDimension}D`,
              content: coupled.conversion,
            },
            {
              name: `Hyperspherical Harmonic ${hydrogenNDDimension}D`,
              content: coupled.harmonic,
            },
            { name: `Hydrogen ND Coupled ${hydrogenNDDimension}D`, content: coupled.coupled },
            { name: 'Hydrogen ND Coupled Dispatch', content: coupled.dispatch },
          ]
        })()
      : []),

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
    {
      name: `Density mapPosToND (${actualDim}D)`,
      content: generateMapPosToND(actualDim, {
        coupledNodalOffset: isHydrogenCoupled && actualDim > 3,
      }),
    },
    { name: 'Density Post-Map', content: densityPostMapBlock },

    // Single basis function evaluation (density matrix mode only)
    {
      name: 'Single Basis',
      content: generateSingleBasisBlock(
        quantumMode as 'harmonicOscillator' | 'hydrogenND',
        actualDim
      ),
      condition: useDensityMatrix,
    },

    // ===== COMPUTE SHADER ENTRY POINT =====
    {
      name: 'Compute Main',
      content: useDensityMatrix
        ? densityMatrixComputeBlock
        : storageFormat === 'rgba16float'
          ? densityGridWithPhaseComputeBlock
          : densityGridComputeBlock,
    },
  ]

  // Assemble shader
  const { wgsl, modules } = assembleShaderBlocks(blocks, [])

  return { wgsl, modules, features }
}
