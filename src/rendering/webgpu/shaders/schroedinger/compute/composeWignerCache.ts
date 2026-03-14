/**
 * Wigner Cache Compute Shader Composer
 *
 * Assembles the compute shader for pre-computing a 2D Wigner
 * quasi-probability texture. This is a simplified version of the
 * fragment shader compose — it only includes the quantum math
 * modules needed for Wigner evaluation (no color, no lighting,
 * no volume rendering).
 *
 * @module rendering/webgpu/shaders/schroedinger/compute/composeWignerCache
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

// Wigner-specific blocks
import { laguerreBlock } from '../quantum/laguerre.wgsl'
import { wignerHOBlock } from '../quantum/wignerHO.wgsl'
import { wignerHydrogenBlock } from '../quantum/wignerHydrogen.wgsl'

// Hydrogen radial for numerical quadrature
import { legendreBlock } from '../quantum/legendre.wgsl'
import { sphericalHarmonicsBlock } from '../quantum/sphericalHarmonics.wgsl'
import { hydrogenRadialBlock } from '../quantum/hydrogenRadial.wgsl'

// Compute-specific blocks
import {
  wignerGridParamsBlock,
  generateWignerCacheBindingsBlock,
  wignerCacheComputeBlock,
} from './wignerCache.wgsl'

import type { ComputeQuantumMode } from './compose'

/**
 * Configuration for the Wigner cache compute shader
 */
export interface WignerCacheComputeConfig {
  /** Number of dimensions (3-11) */
  dimension: number
  /** Quantum mode */
  quantumMode?: ComputeQuantumMode
  /** Number of HO superposition terms (1-8) */
  termCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
}

/**
 * Compose the Wigner cache compute shader.
 *
 * Assembles all quantum math modules needed for Wigner evaluation
 * into a compute shader that fills a 2D texture.
 *
 * @param config - Shader configuration
 * @returns Composed WGSL code and metadata
 */
export function composeWignerCacheComputeShader(config: WignerCacheComputeConfig): {
  wgsl: string
  modules: string[]
  features: string[]
} {
  const {
    dimension,
    quantumMode = 'harmonicOscillator',
  } = config

  const defines: string[] = []
  const features: string[] = []

  // Compile-time dimension (Wigner is always ND, min 3)
  const actualDim = Math.min(Math.max(dimension, 3), 11)

  defines.push(`const DIMENSION: i32 = ${dimension};`)
  defines.push(`const ACTUAL_DIM: i32 = ${actualDim};`)
  features.push(`${dimension}D Wigner Cache`)

  const isHydrogenFamily = quantumMode === 'hydrogenND'
  const includeHydrogen = isHydrogenFamily

  defines.push(`const HYDROGEN_MODE_ENABLED: bool = ${includeHydrogen};`)
  defines.push(`const HYDROGEN_ND_MODE_ENABLED: bool = ${isHydrogenFamily};`)
  if (isHydrogenFamily) {
    defines.push(`const HYDROGEN_ND_DIMENSION: i32 = ${actualDim};`)
  }

  // Quantum mode constant for runtime dispatch
  if (quantumMode === 'hydrogenND') {
    defines.push('const QUANTUM_MODE_DEFAULT: i32 = 1;')
    features.push('Hydrogen ND')
  } else {
    defines.push('const QUANTUM_MODE_DEFAULT: i32 = 0;')
    features.push('Harmonic Oscillator')
  }

  // Compile-time constants required by shared modules
  defines.push('const TEMPORAL_ENABLED: bool = false;')
  defines.push('const COLOR_ALGORITHM: i32 = 4;')
  defines.push('const IS_DUAL_CHANNEL: bool = false;')
  defines.push('const FEATURE_INTERFERENCE: bool = false;')
  defines.push('const FEATURE_UNCERTAINTY_BOUNDARY: bool = false;')
  defines.push('const SKIP_DENSITY_EMPHASIS: bool = true;')
  // Wigner IS_WIGNER flag for any conditional behavior
  defines.push('const IS_WIGNER: bool = true;')

  // HO unrolled optimization not needed for Wigner compute —
  // the Wigner evaluation uses its own loop over terms.
  defines.push('const HO_UNROLLED: bool = false;')

  features.push('Wigner Cache Compute')

  // Build blocks array in dependency order
  const blocks = [
    // Defines - must come first
    { name: 'Defines', content: defines.join('\n') },

    // Core constants
    { name: 'Constants', content: constantsBlock },

    // Uniform structs (SchroedingerUniforms, BasisVectors)
    { name: 'Schrödinger Uniforms', content: schroedingerUniformsBlock },

    // Wigner grid params struct
    { name: 'Wigner Grid Params', content: wignerGridParamsBlock },

    // Compute shader bindings
    { name: 'Compute Bindings', content: generateWignerCacheBindingsBlock() },

    // ===== QUANTUM MATH MODULES (order matters!) =====

    // Complex math (required by Wigner cross terms)
    { name: 'Complex Math', content: complexMathBlock },

    // Hermite polynomials (required by ho1d)
    { name: 'Hermite Polynomials', content: hermiteBlock },

    // HO 1D eigenfunction (required by hoND/Wigner diagonal helper)
    { name: 'HO 1D Eigenfunction', content: ho1dBlock },

    // Laguerre polynomials (required by BOTH Wigner HO and hydrogen radial)
    { name: 'Laguerre Polynomials', content: laguerreBlock },

    // Hydrogen orbital basis functions (for numerical quadrature)
    { name: 'Legendre Polynomials', content: legendreBlock, condition: includeHydrogen },
    { name: 'Spherical Harmonics', content: sphericalHarmonicsBlock, condition: includeHydrogen },
    { name: 'Hydrogen Radial', content: hydrogenRadialBlock, condition: includeHydrogen },

    // Wigner HO functions (diagonal + cross + marginal)
    { name: 'Wigner HO', content: wignerHOBlock },

    // Wigner hydrogen (numerical radial quadrature) or stub
    {
      name: 'Wigner Hydrogen',
      content: wignerHydrogenBlock,
      condition: includeHydrogen,
    },
    {
      name: 'Wigner Hydrogen Stub',
      content: '// Stub: hydrogen Wigner unavailable in HO mode\nfn wignerHydrogenRadial(r: f32, pr: f32, n: i32, l: i32, a0: f32, nPts: i32) -> f32 { return 0.0; }',
      condition: !includeHydrogen,
    },

    // ===== COMPUTE SHADER ENTRY POINT =====
    { name: 'Compute Main', content: wignerCacheComputeBlock },
  ]

  // Assemble shader
  const { wgsl, modules } = assembleShaderBlocks(blocks, [])

  return { wgsl, modules, features }
}
